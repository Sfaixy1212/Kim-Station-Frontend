import express from 'express';
import sql from 'mssql';
import { DateTime } from 'luxon';
import { authenticateToken } from './auth-middleware.mjs';

const router = express.Router();

// Endpoint per recuperare obiettivi e compensi dell'agente loggato
router.get('/agente/obiettivi-compensi', authenticateToken, async (req, res) => {
  try {
    // Verifica che l'utente sia un agente
    const { ruoli, agenteNome, userId } = req.user || {};
    
    console.log(`[OBIETTIVI-COMPENSI] Richiesta per agente: ${agenteNome} userId: ${userId}`);
    console.log(`[OBIETTIVI-COMPENSI] Ruoli utente:`, ruoli);
    
    if (!ruoli || !ruoli.includes('Agente')) {
      console.log(`[OBIETTIVI-COMPENSI] Accesso negato per ruoli:`, ruoli);
      return res.status(403).json({ error: 'Accesso negato. Solo gli agenti possono accedere a questa risorsa.' });
    }
    
    console.log(`[OBIETTIVI-COMPENSI] Verifica ruolo OK, inizio elaborazione...`);

    // Dati temporali
    const now = DateTime.now().setZone('Europe/Rome');
    const currentYear = now.year;

    // Query per recuperare dati dell'agente
    const pool = await sql.connect();
    
    // 1. Recupera informazioni base dell'agente
    const agenteQuery = `
      SELECT 
        Id,
        UserName as Email,
        'premi' as TipoProfilo
      FROM AspNetUsers u
      WHERE u.UserName = @email
        AND EXISTS (SELECT 1 FROM AspNetUserRoles ur 
                   JOIN AspNetRoles r ON ur.RoleId = r.Id 
                   WHERE ur.UserId = u.Id AND r.Name = 'agenti')
    `;

    const agenteResult = await pool.request()
      .input('email', sql.NVarChar, req.user.email)
      .query(agenteQuery);

    if (!agenteResult.recordset.length) {
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
        ObiettivoPDAEnergy
      FROM dbo.ObiettiviAgenti 
      WHERE Agente = @agenteNome 
        AND Anno = @anno 
        AND Mese = @mese
    `;

    const obiettiviResult = await pool.request()
      .input('agenteNome', sql.NVarChar, agenteNome)
      .input('anno', sql.Int, currentYear)
      .input('mese', sql.Int, now.month)
      .query(obiettiviQuery);

    console.log(`[OBIETTIVI-COMPENSI] Query obiettivi completata, record trovati: ${obiettiviResult.recordset.length}`);

    // Usa obiettivi reali se disponibili, altrimenti defaults
    let targets;
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

    // 3. Recupera vendite PDA del mese corrente
    const pdaQuery = `
      SELECT 
        COUNT(CASE WHEN op.Nome IN ('TIM', 'Vodafone', 'WindTre') THEN 1 END) as PdaEnergy,
        COUNT(CASE WHEN op.Nome IN ('Fastweb', 'Iliad', 'Altri') THEN 1 END) as PdaFissi,
        COUNT(*) as TotalePda
      FROM tbAttivazioni a
      JOIN tbOfferte o ON a.IdOfferta = o.Id
      LEFT JOIN tbOperatori op ON o.IdOperatore = op.Id
      WHERE a.AgenteId = @agenteId 
        AND YEAR(a.DataInserimento) = @anno
        AND MONTH(a.DataInserimento) = @mese
        AND a.Stato NOT IN ('Annullato', 'Rifiutato')
    `;

    const pdaResult = await pool.request()
      .input('agenteId', sql.UniqueIdentifier, agenteId)
      .input('anno', sql.Int, currentYear)
      .input('mese', sql.Int, now.month)
      .query(pdaQuery);

    const pdaData = pdaResult.recordset[0] || { PdaEnergy: 0, PdaFissi: 0, TotalePda: 0 };
    console.log(`[OBIETTIVI-COMPENSI] Dati PDA:`, pdaData);

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
    res.json({ success: true, data: response });

  } catch (error) {
    console.error('[OBIETTIVI-COMPENSI] Errore:', error);
    res.status(500).json({ 
      error: 'Errore nel recupero dati obiettivi e compensi',
      details: error.message 
    });
  }
});

export default router;
