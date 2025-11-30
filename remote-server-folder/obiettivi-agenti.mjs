import sql from 'mssql';
import { authenticateToken } from './auth-middleware.mjs';

export default function(app) {
  // GET: Obiettivi & Compensi avanzati per l'agente (con periodo)
  app.get('/api/agente/obiettivi-compensi', authenticateToken, async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ error: 'Utente non autenticato' });
      const { agenteNome } = req.user;
      if (!agenteNome) {
        const example = buildExampleObiettiviCompensi();
        return res.json(example);
      }
      const now = new Date();
      const y = parseInt(req.query.year || now.getFullYear(), 10);
      const m = parseInt(req.query.month || (now.getMonth() + 1), 10);
      const ym = `${y}/${String(m).padStart(2, '0')}`;

      // Prova a usare la SP per dati reali mese corrente
      const spRequest = new sql.Request();
      spRequest.input('agente', sql.NVarChar, agenteNome);
      const spResult = await spRequest.execute('GetOrderStatisticsByAgent');
      const rec = spResult?.recordset?.find(r => r.AnnoMese === ym);

      const mobileAttuali = rec?.MOBILI ? Number(rec.MOBILI) : 0;
      const fissiAttuali = rec?.FISSI ? Number(rec.FISSI) : 0;
      // In assenza di mapping precisi, inizializziamo a 0 e li esporremo come in lavorazione
      const energyAttuali = 0;
      // Convergenze separate RES/SHP non disponibili: placeholder 0
      const convergenzaRES = 0;
      const convergenzaSHP = 0;

      const thresholds = {
        energy: { goal: 5, prize: 50 },
        fissi: { goal: 10, prize: 100 },
        core: { goal: 100 },
        ra: { goal: 150 },
      };

      const unitBonuses = { mobileRA: 3, fissoPDA: 10, energiaPDA: 10, convergenza: 1 };
      // Base fisse: lasciamo 0 finché non definite regole puntuali
      const basePDA = 0;
      const baseSIM = 0;
      const bonusRA_cert = mobileAttuali * unitBonuses.mobileRA;
      const bonusRA_est = bonusRA_cert; // senza split certified/estimated usiamo lo stesso valore

      let premi = 0;
      if (energyAttuali >= thresholds.energy.goal) premi += thresholds.energy.prize;
      if (fissiAttuali >= thresholds.fissi.goal) premi += thresholds.fissi.prize;

      const payload = {
        progressi: {
          mobileAttuali,
          fissiAttuali,
          energyAttuali,
          convergenzaRES,
          convergenzaSHP,
        },
        thresholds,
        compensi: {
          unitBonuses,
          basePDA,
          baseSIM,
          bonusRA_cert,
          bonusRA_est,
          premi,
        },
        dataInfo: {
          isCertified: Boolean(rec),
          source: rec ? 'stored_procedure' : 'fallback',
          lastUpdate: new Date().toISOString(),
        },
      };
      return res.json(payload);
    } catch (error) {
      console.error('[Obiettivi&Compensi][GET] Errore:', error);
      const example = buildExampleObiettiviCompensi(error?.message);
      return res.json(example);
    }
  });

  // GET: Obiettivi per l'agente corrente (basato sul token)
  app.get('/api/agente/obiettivi', authenticateToken, async (req, res) => {
    try {
      if (!req.user?.agenteNome) {
        return res.status(400).json({ esempioGenerato: true, message: 'Token senza agenteNome', obiettivi: [] });
      }

      const agenteNome = req.user.agenteNome;
      const nowRome = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Rome' }));
      const anno = nowRome.getFullYear();
      const mese = nowRome.getMonth() + 1;

      const targetReq = new sql.Request();
      targetReq.input('agente', sql.NVarChar, agenteNome);
      targetReq.input('anno', sql.Int, anno);
      targetReq.input('mese', sql.Int, mese);
      const targetRes = await targetReq.query(`
        SELECT TOP 1 ObiettivoPDAFisso, ObiettivoPDAMobileRA, ObiettivoPDAEnergy
        FROM ObiettiviAgenti
        WHERE Agente = @agente AND Anno = @anno AND Mese = @mese
      `);

      const targetRecord = targetRes.recordset?.[0] || {};

      const metricsReq = new sql.Request();
      metricsReq.input('Anno', sql.Int, anno);
      metricsReq.input('Mese', sql.Int, mese);
      metricsReq.input('Agente', sql.NVarChar, agenteNome);
      const metricsRes = await metricsReq.query(`
        SELECT 
          SUM(tlc_fisso_inseriti)      AS TotFisso,
          SUM(tlc_mobile_inseriti)     AS TotMobile,
          SUM(tlc_mobile_ra_inseriti)  AS TotMobileRA,
          SUM(energia_inseriti)        AS TotEnergia
        FROM dbo.vw_agenti_province_mensile
        WHERE Anno = @Anno AND Mese = @Mese
          AND LTRIM(RTRIM(UPPER(ISNULL(AGENTE, N'')))) = LTRIM(RTRIM(UPPER(@Agente)))
      `);
      const metricsRow = metricsRes.recordset?.[0] || {};

      const fissoAttuali = Number(metricsRow.TotFisso || 0);
      const mobileAttuali = Number(metricsRow.TotMobile || 0);
      const energiaAttuale = Number(metricsRow.TotEnergia || 0);
      const mobileRAAttuali = Number(metricsRow.TotMobileRA || 0);
      const mobileRAPercent = mobileAttuali > 0 ? Math.round((mobileRAAttuali / mobileAttuali) * 100) : 0;

      const obiettivi = [
        {
          categoria: 'MOBILE',
          attuale: mobileAttuali,
          target: Number(targetRecord.ObiettivoPDAMobileRA || targetRecord.ObiettivoPDAMobile || 0),
        },
        {
          categoria: 'FISSO',
          attuale: fissoAttuali,
          target: Number(targetRecord.ObiettivoPDAFisso || 0),
        },
        {
          categoria: 'ENERGIA',
          attuale: energiaAttuale,
          target: Number(targetRecord.ObiettivoPDAEnergy || 0),
        },
        {
          categoria: '% RIC. AUTOMATICA',
          attuale: mobileRAPercent,
          target: 100,
          valore: mobileRAAttuali,
        },
      ];

      res.json({
        esempioGenerato: false,
        obiettivi,
        data: [{ operatore: agenteNome, categorie: obiettivi }],
        message: 'Dati reali da database',
      });
      
    } catch (error) {
      console.error('[ObiettiviAgente][GET] Errore:', error);
      
      // In caso di errore, restituisci dati di esempio
      return res.status(500).json({ esempioGenerato: true, error: true, message: error.message, obiettivi: [] });
    }
  });
  // GET: Elenco obiettivi agenti (filtrabile per anno/mese)
  app.get('/api/supermaster/obiettivi-agenti', authenticateToken, async (req, res) => {
    try {
      const { anno, mese } = req.query;
      let query = `SELECT 
        OA.Id,
        OA.Agente,
        OA.Anno,
        OA.Mese,
        OA.Note,
        OA.FissoTotale,
        OA.MobileTotale,
        OA.EnergyTotale,
        OA.FissoStart,
        OA.FissoPro,
        OA.FissoUltra,
        OA.MobileStart,
        OA.MobilePro,
        OA.MobileUltra,
        OA.MobilePercentRA,
        OA.MobileConvergenze,
        OA.EnergyCore,
        OA.EnergyFlex,
        OA.EnergyFix,
        OA.EnergyEni,
        OA.EnergyPercentFastweb,
        OA.ObiettivoPDAFisso,
        OA.ObiettivoPDAMobileRA,
        OA.ObiettivoPDAEnergy,
        OA.DataUltimaModifica
      FROM [KAM].[dbo].[ObiettiviAgenti] AS OA`;
      const params = [];
      if (anno) {
        query += ' WHERE OA.Anno = @anno';
        params.push({ name: 'anno', type: sql.Int, value: parseInt(anno) });
        if (mese) {
          query += ' AND OA.Mese = @mese';
          params.push({ name: 'mese', type: sql.Int, value: parseInt(mese) });
        }
      } else if (mese) {
        query += ' WHERE OA.Mese = @mese';
        params.push({ name: 'mese', type: sql.Int, value: parseInt(mese) });
      }
      query += ' ORDER BY OA.Agente, OA.Anno DESC, OA.Mese DESC';
      const request = new sql.Request();
      for (const p of params) request.input(p.name, p.type, p.value);
      const result = await request.query(query);
      res.json(result.recordset || []);
    } catch (e) {
      console.error('[ObiettiviAgenti][GET] Errore:', e);
      res.status(500).json({ error: 'Errore lettura obiettivi', details: e.message });
    }
  });
  app.post('/api/supermaster/obiettivi-agenti', authenticateToken, async (req, res) => {
    try {
      const {
        Agente,
        Anno,
        Mese,
        Note,
        FissoTotale = 0,
        MobileTotale = 0,
        EnergyTotale = 0,
        FissoStart = 0,
        FissoPro = 0,
        FissoUltra = 0,
        MobileStart = 0,
        MobilePro = 0,
        MobileUltra = 0,
        MobilePercentRA = 0,
        MobileConvergenze = 0,
        EnergyCore = 0,
        EnergyFlex = 0,
        EnergyFix = 0,
        EnergyEni = 0,
        EnergyPercentFastweb = 0,
      } = req.body;

      if (!Agente || !Anno || !Mese) {
        return res.status(400).json({ error: 'Agente, Anno e Mese sono obbligatori' });
      }

      const legacyFisso = Number(FissoTotale) || 0;
      const legacyMobile = Number(MobileTotale) || 0;
      const legacyEnergy = Number(EnergyTotale) || 0;

      // Upsert: aggiorna se esiste, altrimenti inserisce
      const request = new sql.Request();
      request.input('Agente', sql.NVarChar, Agente);
      request.input('Anno', sql.Int, Number(Anno));
      request.input('Mese', sql.Int, Number(Mese));
      request.input('Note', sql.NVarChar, Note || null);

      request.input('FissoTotale', sql.Int, legacyFisso);
      request.input('MobileTotale', sql.Int, legacyMobile);
      request.input('EnergyTotale', sql.Int, legacyEnergy);
      request.input('FissoStart', sql.Int, Number(FissoStart) || 0);
      request.input('FissoPro', sql.Int, Number(FissoPro) || 0);
      request.input('FissoUltra', sql.Int, Number(FissoUltra) || 0);
      request.input('MobileStart', sql.Int, Number(MobileStart) || 0);
      request.input('MobilePro', sql.Int, Number(MobilePro) || 0);
      request.input('MobileUltra', sql.Int, Number(MobileUltra) || 0);
      request.input('MobilePercentRA', sql.Decimal(10, 2), Number(MobilePercentRA) || 0);
      request.input('MobileConvergenze', sql.Int, Number(MobileConvergenze) || 0);
      request.input('EnergyCore', sql.Int, Number(EnergyCore) || 0);
      request.input('EnergyFlex', sql.Int, Number(EnergyFlex) || 0);
      request.input('EnergyFix', sql.Int, Number(EnergyFix) || 0);
      request.input('EnergyEni', sql.Int, Number(EnergyEni) || 0);
      request.input('EnergyPercentFastweb', sql.Decimal(10, 2), Number(EnergyPercentFastweb) || 0);

      request.input('ObiettivoPDAFisso', sql.Int, legacyFisso);
      request.input('ObiettivoPDAMobileRA', sql.Int, legacyMobile);
      request.input('ObiettivoPDAEnergy', sql.Int, legacyEnergy);

      await request.query(`
        IF EXISTS (SELECT 1 FROM [KAM].[dbo].[ObiettiviAgenti] WHERE Agente = @Agente AND Anno = @Anno AND Mese = @Mese)
          UPDATE [KAM].[dbo].[ObiettiviAgenti]
          SET FissoTotale = @FissoTotale,
              MobileTotale = @MobileTotale,
              EnergyTotale = @EnergyTotale,
              FissoStart = @FissoStart,
              FissoPro = @FissoPro,
              FissoUltra = @FissoUltra,
              MobileStart = @MobileStart,
              MobilePro = @MobilePro,
              MobileUltra = @MobileUltra,
              MobilePercentRA = @MobilePercentRA,
              MobileConvergenze = @MobileConvergenze,
              EnergyCore = @EnergyCore,
              EnergyFlex = @EnergyFlex,
              EnergyFix = @EnergyFix,
              EnergyEni = @EnergyEni,
              EnergyPercentFastweb = @EnergyPercentFastweb,
              ObiettivoPDAFisso = @ObiettivoPDAFisso,
              ObiettivoPDAMobileRA = @ObiettivoPDAMobileRA,
              ObiettivoPDAEnergy = @ObiettivoPDAEnergy,
              Note = @Note,
              DataUltimaModifica = GETDATE()
          WHERE Agente = @Agente AND Anno = @Anno AND Mese = @Mese
        ELSE
          INSERT INTO [KAM].[dbo].[ObiettiviAgenti] (
            Agente,
            Anno,
            Mese,
            Note,
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
            ObiettivoPDAFisso,
            ObiettivoPDAMobileRA,
            ObiettivoPDAEnergy
          )
          VALUES (
            @Agente,
            @Anno,
            @Mese,
            @Note,
            @FissoTotale,
            @MobileTotale,
            @EnergyTotale,
            @FissoStart,
            @FissoPro,
            @FissoUltra,
            @MobileStart,
            @MobilePro,
            @MobileUltra,
            @MobilePercentRA,
            @MobileConvergenze,
            @EnergyCore,
            @EnergyFlex,
            @EnergyFix,
            @EnergyEni,
            @EnergyPercentFastweb,
            @ObiettivoPDAFisso,
            @ObiettivoPDAMobileRA,
            @ObiettivoPDAEnergy
          )
      `);
      res.json({ ok: true });
    } catch (e) {
      console.error('[ObiettiviAgenti][POST] Errore:', e);
      res.status(500).json({ error: 'Errore salvataggio obiettivo', details: e.message });
    }
  });
}
