import express from 'express';
import sql from 'mssql';
import { DateTime } from 'luxon';
import { authenticateToken } from './auth-middleware.mjs';

const router = express.Router();

// Endpoint per recuperare obiettivi e compensi dell'agente loggato
router.get('/agente/obiettivi-compensi-v2', authenticateToken, async (req, res) => {
  try {
    // Verifica che l'utente sia un agente
    const { ruoli, agenteNome, userId } = req.user || {};
    
    console.log(`[OBIETTIVI-COMPENSI] Richiesta per agente: ${agenteNome} userId: ${userId}`);
    console.log(`[OBIETTIVI-COMPENSI] Ruoli utente:`, ruoli);
    
    if (!ruoli || !ruoli.some(r => r.toUpperCase() === 'AGENTE')) {
      console.log(`[OBIETTIVI-COMPENSI] Accesso negato per ruoli:`, ruoli);
      return res.status(403).json({ error: 'Accesso negato. Solo gli agenti possono accedere a questa risorsa.' });
    }
    
    console.log(`[OBIETTIVI-COMPENSI] Verifica ruolo OK, inizio elaborazione...`);

    // Dati temporali
    const now = DateTime.now().setZone('Europe/Rome');
    const currentYear = now.year;
    const requestedYear = Number.parseInt(req.query.year, 10);
    const requestedMonth = Number.parseInt(req.query.month, 10);
    const year = Number.isFinite(requestedYear) ? requestedYear : currentYear;
    const month = Number.isFinite(requestedMonth) && requestedMonth >= 1 && requestedMonth <= 12 ? requestedMonth : now.month;

    const rawAgenteNome = (agenteNome
      || req.user?.displayName
      || req.user?.name
      || req.user?.username
      || req.user?.UserName
      || '').trim();
    const fallbackAgenteNome = req.user?.email ? req.user.email.split('@')[0] : '';
    const agenteNomeQuery = rawAgenteNome || fallbackAgenteNome;

    console.log(`[OBIETTIVI-COMPENSI] Periodo richiesto -> anno: ${year}, mese: ${month}`);
    console.log(`[OBIETTIVI-COMPENSI] Agente da token: '${agenteNome}', normalizzato: '${agenteNomeQuery}'`);

    // Query per recuperare dati dell'agente
    console.log(`[OBIETTIVI-COMPENSI] Tentativo connessione database...`);
    const pool = await sql.connect();
    console.log(`[OBIETTIVI-COMPENSI] Connessione database OK`);
    
    // 1. Debug: verifica se l'utente esiste
    console.log(`[OBIETTIVI-COMPENSI] Debug - Cerco utente con email: ${req.user.email}`);
    
    const userCheckQuery = `SELECT Id, UserName FROM AspNetUsers WHERE UserName = @email`;
    const userCheck = await pool.request()
      .input('email', sql.NVarChar, req.user.email)
      .query(userCheckQuery);
    
    console.log(`[OBIETTIVI-COMPENSI] Debug - Utenti trovati: ${userCheck.recordset.length}`);
    if (userCheck.recordset.length > 0) {
      console.log(`[OBIETTIVI-COMPENSI] Debug - Utente trovato:`, userCheck.recordset[0]);
      
      // Verifica ruoli
      const roleCheckQuery = `
        SELECT r.Name 
        FROM AspNetUserRoles ur 
        JOIN AspNetRoles r ON ur.RoleId = r.Id 
        WHERE ur.UserId = @userId
      `;
      const roleCheck = await pool.request()
        .input('userId', sql.UniqueIdentifier, userCheck.recordset[0].Id)
        .query(roleCheckQuery);
      
      console.log(`[OBIETTIVI-COMPENSI] Debug - Ruoli nel DB:`, roleCheck.recordset.map(r => r.Name));
    }
    
    // Query originale con ruolo corretto
    console.log(`[OBIETTIVI-COMPENSI] Esecuzione query agente con ruolo 'Agente'...`);
    const agenteQuery = `
      SELECT 
        Id,
        UserName as Email,
        'premi' as TipoProfilo
      FROM AspNetUsers u
      WHERE u.UserName = @email
        AND EXISTS (SELECT 1 FROM AspNetUserRoles ur 
                   JOIN AspNetRoles r ON ur.RoleId = r.Id 
                   WHERE ur.UserId = u.Id AND r.Name = 'Agente')
    `;

    const agenteResult = await pool.request()
      .input('email', sql.NVarChar, req.user.email)
      .query(agenteQuery);

    console.log(`[OBIETTIVI-COMPENSI] Query agente completata, record trovati: ${agenteResult.recordset.length}`);

    if (!agenteResult.recordset.length) {
      console.log(`[OBIETTIVI-COMPENSI] Agente non trovato per email: ${req.user.email}`);
      return res.status(404).json({ error: 'Agente non trovato' });
    }

    const agente = agenteResult.recordset[0];
    const agenteId = agente.Id;
    const tipoProfilo = agente.TipoProfilo;

    console.log(`[OBIETTIVI-COMPENSI] Agente trovato: ${agenteNome} ID: ${agenteId}`);

    // 2. Recupera obiettivi reali dalla tabella ObiettiviAgenti
    const obiettiviQuery = `
      SELECT 
        ObiettivoPDAFisso,
        ObiettivoPDAMobileRA,
        ObiettivoPDAEnergy,
        FissoTotale,
        MobileTotale,
        EnergyTotale,
        FissoStart,
        FissoPro,
        FissoUltra,
        MobileStart,
        MobilePro,
        MobileUltra,
        MobilePercentRA,
        MobileConvergenze,
        EnergyCore,
        EnergyFlex,
        EnergyFix,
        EnergyEni,
        EnergyPercentFastweb,
        Note,
        DataUltimaModifica
      FROM dbo.ObiettiviAgenti 
      WHERE UPPER(LTRIM(RTRIM(Agente))) = UPPER(LTRIM(RTRIM(@agenteNome)))
        AND Anno = @anno 
        AND Mese = @mese
    `;

    const obiettiviResult = await pool.request()
      .input('agenteNome', sql.NVarChar, agenteNomeQuery)
      .input('anno', sql.Int, year)
      .input('mese', sql.Int, month)
      .query(obiettiviQuery);

    console.log(`[OBIETTIVI-COMPENSI] Query obiettivi completata, record trovati: ${obiettiviResult.recordset.length}`);

    // Usa obiettivi reali se disponibili, altrimenti defaults
    let targets;
    let targetsDetailed = null;
    let targetsUpdatedAt = null;
    if (obiettiviResult.recordset.length > 0) {
      const obiettivi = obiettiviResult.recordset[0];
      targets = {
        TargetEnergy: obiettivi.ObiettivoPDAEnergy || 0,
        TargetFissi: obiettivi.ObiettivoPDAFisso || 0,
        TargetRA: obiettivi.ObiettivoPDAMobileRA || 0,
        PremioEnergy: 10,
        PremioFissi: 8,
        TargetCore: 100,
      };
      console.log(`[OBIETTIVI-COMPENSI] Obiettivi da DB:`, targets);

      targetsDetailed = {
        note: obiettivi.Note,
        lastUpdate: obiettivi.DataUltimaModifica,
        fissi: {
          totale: obiettivi.FissoTotale ?? targets.TargetFissi,
          start: obiettivi.FissoStart ?? 0,
          pro: obiettivi.FissoPro ?? 0,
          ultra: obiettivi.FissoUltra ?? 0,
        },
        mobili: {
          totale: obiettivi.MobileTotale ?? targets.TargetRA,
          start: obiettivi.MobileStart ?? 0,
          pro: obiettivi.MobilePro ?? 0,
          ultra: obiettivi.MobileUltra ?? 0,
          percentRA: obiettivi.MobilePercentRA ?? 0,
          convergenze: obiettivi.MobileConvergenze ?? 0,
        },
        energy: {
          totale: obiettivi.EnergyTotale ?? targets.TargetEnergy,
          core: obiettivi.EnergyCore ?? 0,
          flex: obiettivi.EnergyFlex ?? 0,
          fix: obiettivi.EnergyFix ?? 0,
          eni: obiettivi.EnergyEni ?? 0,
          percentFastweb: obiettivi.EnergyPercentFastweb ?? 0,
        },
      };
      targetsUpdatedAt = obiettivi.DataUltimaModifica;
    } else {
      // Fallback ai defaults se non ci sono obiettivi configurati per il mese
      const nomeAgenteLower = agenteNome.toLowerCase();
      if (nomeAgenteLower.includes('giacomo')) {
        targets = { TargetEnergy: 110, TargetFissi: 120, TargetRA: 100, PremioEnergy: 10, PremioFissi: 8, TargetCore: 100 };
      } else if (nomeAgenteLower.includes('gigi') || nomeAgenteLower.includes('luigi')) {
        targets = { TargetEnergy: 70, TargetFissi: 80, TargetRA: 60, PremioEnergy: 10, PremioFissi: 8, TargetCore: 100 };
      } else {
        targets = { TargetEnergy: 0, TargetFissi: 0, TargetRA: 0, PremioEnergy: 10, PremioFissi: 8, TargetCore: 100 };
      }
      console.log(`[OBIETTIVI-COMPENSI] Obiettivi default per ${agenteNome}:`, targets);
    }

    // 3. Recupera progressi reali - LOGICA SPECIALE PER GABRIELE
    let totaleRow = null;
    const ym = `${year}/${String(month).padStart(2, '0')}`;
    
    if (agenteNomeQuery.toUpperCase() === 'GABRIELE') {
      console.log(`[OBIETTIVI-COMPENSI][GABRIELE] Usando stored procedure sp_report_agente_fastweb_mese...`);
      try {
        const gabrieleRequest = pool.request();
        gabrieleRequest.input('agente', sql.NVarChar, 'GABRIELE');
        gabrieleRequest.input('year', sql.Int, year);
        gabrieleRequest.input('month', sql.Int, month);
        
        const gabrieleResult = await gabrieleRequest.execute('dbo.sp_report_agente_fastweb_mese');
        const kpiData = gabrieleResult.recordsets?.[0]; // Primo recordset contiene i dealer
        
        // Leggi anche dati manuali da tbGabrieleIntegrazione
        const manualRequest = pool.request();
        manualRequest.input('anno', sql.Int, year);
        manualRequest.input('mese', sql.Int, month);
        
        const manualQuery = `
          SELECT 
            Fisso,
            Mobile,
            Energia
          FROM dbo.tbGabrieleIntegrazione
          WHERE Anno = @anno AND Mese = @mese
        `;
        
        const manualResult = await manualRequest.query(manualQuery);
        const manualData = manualResult.recordset || [];
        
        console.log(`[OBIETTIVI-COMPENSI][GABRIELE] Dati manuali trovati: ${manualData.length}`);
        
        if (kpiData && kpiData.length > 0) {
          console.log(`[OBIETTIVI-COMPENSI][GABRIELE] Dati trovati da SP, dealers: ${kpiData.length}`);
          
          // Debug: mostra TUTTI i dealer con Energia o ENI
          const dealersConEnergia = kpiData.filter(d => (d.ENERGIA || 0) > 0 || (d.ENI || 0) > 0);
          console.log(`[OBIETTIVI-COMPENSI][GABRIELE] Dealer con Energia/ENI (${dealersConEnergia.length}):`, dealersConEnergia.map(d => ({
            dealer: d.RagioneSociale,
            fisso: d.FISSO,
            mobile: d.MOBILE,
            energia: d.ENERGIA,
            eni: d.ENI,
            ingaggiato: d.Ingaggiato
          })));
          
          // Somma i totali da tutti i dealer (stored procedure)
          let totFisso = kpiData.reduce((sum, d) => sum + Number(d.FISSO || 0), 0);
          let totMobile = kpiData.reduce((sum, d) => sum + Number(d.MOBILE || 0), 0);
          let totEnergia = kpiData.reduce((sum, d) => sum + Number(d.ENERGIA || 0), 0);
          const totEni = kpiData.reduce((sum, d) => sum + Number(d.ENI || 0), 0);
          
          // Aggiungi dati manuali
          manualData.forEach(m => {
            totFisso += Number(m.Fisso || 0);
            totMobile += Number(m.Mobile || 0);
            totEnergia += Number(m.Energia || 0);
          });
          
          console.log(`[OBIETTIVI-COMPENSI][GABRIELE] Totali SP: Fisso=${kpiData.reduce((sum, d) => sum + Number(d.FISSO || 0), 0)}, Mobile=${kpiData.reduce((sum, d) => sum + Number(d.MOBILE || 0), 0)}, Energia=${kpiData.reduce((sum, d) => sum + Number(d.ENERGIA || 0), 0)}, ENI=${totEni}`);
          console.log(`[OBIETTIVI-COMPENSI][GABRIELE] Totali Manuali: Fisso=${manualData.reduce((sum, m) => sum + Number(m.Fisso || 0), 0)}, Mobile=${manualData.reduce((sum, m) => sum + Number(m.Mobile || 0), 0)}, Energia=${manualData.reduce((sum, m) => sum + Number(m.Energia || 0), 0)}`);
          console.log(`[OBIETTIVI-COMPENSI][GABRIELE] Totali Finali: Fisso=${totFisso}, Mobile=${totMobile}, Energia=${totEnergia}, ENI=${totEni}`);
          console.log(`[OBIETTIVI-COMPENSI][GABRIELE] Totale Energy per dashboard: ${totEnergia + totEni}`);
          
          // Simula la struttura di totaleRow per compatibilità
          totaleRow = {
            FISSI: totFisso,
            MOBILI: totMobile,
            ENERGY: totEnergia + totEni, // Somma Energia FW + ENI
            FissoStart: 0,
            FissoPro: 0,
            FissoUltra: 0,
            MobileStart: 0,
            MobilePro: 0,
            MobileUltra: 0,
            MobilePercentRA: 0,
            'di cui CONV_RES': 0,
            'di cui CONV_BUS': 0,
            EnergyCore: 0,
            EnergyFlex: totEnergia, // Fastweb Energia
            EnergyFix: 0,
            ENI: totEni, // ENI Plenitude separato
            EnergyPercentFastweb: 0
          };
        }
      } catch (gabrieleError) {
        console.error(`[OBIETTIVI-COMPENSI][GABRIELE] Errore:`, gabrieleError.message);
      }
    } else {
      // LOGICA STANDARD PER ALTRI AGENTI
      console.log(`[OBIETTIVI-COMPENSI] Chiamata stored procedure GetOrderStatisticsByAgent_V3...`);
      console.log(`[OBIETTIVI-COMPENSI] Parametri: agente='${agenteNomeQuery}', year=${year}`);
      
      let spResult;
      try {
        const spRequest = pool.request();
        spRequest.input('agente', sql.NVarChar, agenteNomeQuery);
        spRequest.input('year', sql.Int, year);
        spResult = await spRequest.execute('GetOrderStatisticsByAgent_V3');
        console.log(`[OBIETTIVI-COMPENSI] SP completata con successo, recordset length: ${spResult.recordset?.length || 0}`);
      } catch (spError) {
        console.error(`[OBIETTIVI-COMPENSI] ERRORE nella SP:`, spError.message);
        console.error(`[OBIETTIVI-COMPENSI] Stack:`, spError.stack);
        // Continua con dati vuoti
        spResult = { recordset: [] };
      }
      
      // Trova la riga TOTALE per il mese richiesto
      totaleRow = spResult.recordset?.find(r => r.AnnoMese === ym && r.Point?.startsWith('TOTALE'));
    }
    
    console.log(`[OBIETTIVI-COMPENSI] Riga totale trovata per ${ym}:`, totaleRow ? 'SI' : 'NO');
    if (totaleRow) {
      console.log(`[OBIETTIVI-COMPENSI] Dati totale:`, {
        FISSI: totaleRow.FISSI,
        MOBILI: totaleRow.MOBILI,
        ENERGY: totaleRow.ENERGY,
        FissoStart: totaleRow.FissoStart,
        MobilePercentRA: totaleRow.MobilePercentRA
      });
    }
    
    // Estrai progressi reali o usa 0 se non disponibili
    const pdaData = {
      PdaEnergy: totaleRow?.ENERGY || 0,
      PdaFissi: totaleRow?.FISSI || 0,
      PdaRA: totaleRow?.MOBILI || 0,
      TotalePda: (totaleRow?.FISSI || 0) + (totaleRow?.ENERGY || 0)
    };
    
    console.log(`[OBIETTIVI-COMPENSI] Dati PDA reali estratti:`, pdaData);
    
    // Costruisci oggetto progressi dettagliati per le card
    const progressi = {
      fissiAttuali: totaleRow?.FISSI || 0,
      fissiStart: totaleRow?.FissoStart || 0,
      fissiPro: totaleRow?.FissoPro || 0,
      fissiUltra: totaleRow?.FissoUltra || 0,
      mobileAttuali: totaleRow?.MOBILI || 0,
      mobileStart: totaleRow?.MobileStart || 0,
      mobilePro: totaleRow?.MobilePro || 0,
      mobileUltra: totaleRow?.MobileUltra || 0,
      mobilePercentRA: totaleRow?.MobilePercentRA || 0,
      convergenzaRES: totaleRow?.['di cui CONV_RES'] || 0,
      convergenzaSHP: totaleRow?.['di cui CONV_BUS'] || 0,
      energyCore: totaleRow?.EnergyCore || 0,
      energyFlex: totaleRow?.EnergyFlex || 0,
      energyFix: totaleRow?.EnergyFix || 0,
      energyEni: totaleRow?.ENI || 0,
      energyPercentFastweb: totaleRow?.EnergyPercentFastweb || 0,
    };
    
    // Calcola energyAttuali come somma di Core + Flex + Fix + Eni
    progressi.energyAttuali = (progressi.energyCore || 0) + (progressi.energyFlex || 0) + (progressi.energyFix || 0) + (progressi.energyEni || 0);
    
    console.log(`[OBIETTIVI-COMPENSI] Progressi dettagliati:`, progressi);

    // 4. Genera dati SIM proporzionali ai PDA reali
    let simData = [];
    const totalSim = pdaData.TotalePda * 2; // Stima: ogni PDA genera ~2 SIM
    
    if (totalSim > 0) {
      simData = [
        { bucket: 'FW Mobile - Only mobile', total: Math.round(totalSim * 0.36), raCert: Math.round(totalSim * 0.15), estRate: 0.58, bonus: 3 },
        { bucket: 'FW Mobile - Convergenza', total: Math.round(totalSim * 0.18), raCert: Math.round(totalSim * 0.09), estRate: 0.62, bonus: 5 },
        { bucket: 'FW Full & Maxi - Only mobile', total: Math.round(totalSim * 0.16), raCert: Math.round(totalSim * 0.06), estRate: 0.55, bonus: 4 },
        { bucket: 'FW Full & Maxi - Convergenza', total: Math.round(totalSim * 0.14), raCert: Math.round(totalSim * 0.08), estRate: 0.60, bonus: 7 },
        { bucket: 'Business - Only mobile', total: Math.round(totalSim * 0.09), raCert: Math.round(totalSim * 0.04), estRate: 0.50, bonus: 5 },
        { bucket: 'Business - Convergenza', total: Math.round(totalSim * 0.07), raCert: Math.round(totalSim * 0.02), estRate: 0.52, bonus: 8 }
      ];
    }

    // 5. Costruisci risposta
    const response = {
      agente: {
        nome: agenteNome,
        email: agente.Email,
        tipoProfilo: tipoProfilo
      },
      periodo: {
        mese: now.toFormat('MMMM yyyy', { locale: 'it' }),
        anno: currentYear
      },
      targets: {
        energy: { goal: targets.TargetEnergy, prize: targets.PremioEnergy },
        fissi: { goal: targets.TargetFissi, prize: targets.PremioFissi },
        core: { goal: targets.TargetCore },
        ra: { goal: targets.TargetRA }
      },
      targetsDetailed,
      targetsLastUpdate: targetsUpdatedAt,
      progressi,
      vendite: {
        pdaEnergy: pdaData.PdaEnergy,
        pdaFissi: pdaData.PdaFissi,
        totalePda: pdaData.TotalePda,
        core: pdaData.PdaEnergy + pdaData.PdaFissi
      },
      sim: simData,
      timestamp: now.toISO()
    };

    console.log(`[OBIETTIVI-COMPENSI] Invio risposta per agente: ${agenteNome}`);
    res.json(response);

  } catch (error) {
    console.error('[OBIETTIVI-COMPENSI] Errore:', error);
    res.status(500).json({ 
      error: 'Errore nel recupero dati obiettivi e compensi',
      details: error.message 
    });
  }
});

export default router;
