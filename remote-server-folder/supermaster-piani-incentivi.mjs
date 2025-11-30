import express from 'express';
import multer from 'multer';
import sql from 'mssql';
import { uploadToS3 } from './s3-service.mjs';
import { authenticateToken } from './auth-middleware.mjs';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } }); // 25MB

function onlySupermaster(req, res, next) {
  try {
    const roles = (req.user?.ruoli || []).map(r => String(r).toUpperCase());
    if (roles.includes('SUPERMASTER') || roles.includes('ADMIN')) return next();
    return res.status(403).json({ error: 'Accesso riservato ai SUPERMASTER' });
  } catch {
    return res.status(403).json({ error: 'Accesso riservato ai SUPERMASTER' });
  }
}

// ===== Helpers: IncentiviPlan CRUD (config JSON per periodo) =====
async function getIncentiviPlan(planKey, period) {
  const request = new sql.Request();
  request.input('plan_key', sql.NVarChar, planKey);
  request.input('period', sql.Char(7), period);
  const q = `SELECT TOP 1 * FROM dbo.IncentiviPlan
             WHERE plan_key = @plan_key AND period = @period
             ORDER BY CASE WHEN status = 'pubblicato' THEN 0 ELSE 1 END, updated_at DESC`;
  const r = await request.query(q);
  return r.recordset?.[0] || null;
}

async function upsertIncentiviPlan({ plan_key, period, status, data_json, valid_from, valid_to, user }) {
  const request = new sql.Request();
  request.input('plan_key', sql.NVarChar, plan_key);
  request.input('period', sql.Char(7), period);
  request.input('status', sql.NVarChar, status || 'bozza');
  request.input('data_json', sql.NVarChar(sql.MAX), typeof data_json === 'string' ? data_json : JSON.stringify(data_json || {}));
  request.input('valid_from', sql.DateTime2, valid_from || null);
  request.input('valid_to', sql.DateTime2, valid_to || null);
  request.input('user', sql.NVarChar, user || null);
  const q = `IF EXISTS (SELECT 1 FROM dbo.IncentiviPlan WHERE plan_key=@plan_key AND period=@period)
              UPDATE dbo.IncentiviPlan
              SET status=@status, data_json=@data_json, valid_from=@valid_from, valid_to=@valid_to, updated_by=@user, updated_at=SYSDATETIME(),
                  published_at = CASE WHEN @status='pubblicato' THEN ISNULL(published_at, SYSDATETIME()) ELSE published_at END
              WHERE plan_key=@plan_key AND period=@period;
            ELSE
              INSERT INTO dbo.IncentiviPlan(plan_key, period, status, data_json, valid_from, valid_to, created_by, updated_by)
              VALUES(@plan_key, @period, @status, @data_json, @valid_from, @valid_to, @user, @user);`;
  await request.query(q);
  return await getIncentiviPlan(plan_key, period);
}

function safeParseJSON(str) {
  try { return JSON.parse(str); } catch { return null; }
}

// GET elenco piani
router.get('/', authenticateToken, onlySupermaster, async (req, res) => {
  try {
    const r = await sql.query`SELECT TOP 200 * FROM dbo.piani_incentivi ORDER BY created_at DESC`;
    res.json(r.recordset || []);
  } catch (err) {
    console.error('[PianiIncentivi][GET] Error:', err);
    res.status(500).json({ error: 'Errore lettura piani_incentivi', details: err.message });
  }
});

// POST upload + insert
router.post('/upload', authenticateToken, onlySupermaster, upload.single('file'), async (req, res) => {
  try {
    const { mese, anno, operatore, validita_dal, validita_al } = req.body;
    if (!req.file) return res.status(400).json({ error: 'File mancante' });

    const m = Number(mese);
    const y = Number(anno);
    if (!m || !y) return res.status(400).json({ error: 'Mese/Anno non validi' });

    const mm = String(m).padStart(2, '0');
    const periodo_label = `${mm}/${y}`;
    const periodo_primo_giorno = `${y}-${mm}-01`;

    const nome_file = req.file.originalname;
    const ts = Date.now();
    const safeOperatore = String(operatore || 'GENERIC').toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    const key = `PIANI/${y}/${mm}/${safeOperatore}/${ts}_${nome_file}`;

    // Upload su bucket 'contrattistation' come da esempio URL fornito
    const uploadRes = await uploadToS3(req.file, 'PIANI', mm, String(y), key, 'contrattistation');
    const url_s3 = uploadRes.url;
    const s3_key = uploadRes.key;

    const request = new sql.Request();
    request.input('periodo_label', sql.NVarChar, periodo_label);
    request.input('mese', sql.Int, m);
    request.input('anno', sql.Int, y);
    request.input('validita_dal', sql.Date, validita_dal || periodo_primo_giorno);
    request.input('validita_al', sql.Date, validita_al || null);
    request.input('operatore', sql.NVarChar, safeOperatore);
    request.input('nome_file', sql.NVarChar, nome_file);
    request.input('url_s3', sql.NVarChar, url_s3);
    request.input('periodo_primo_giorno', sql.Date, periodo_primo_giorno);
    request.input('s3_key', sql.NVarChar, s3_key);

    const insertSql = `INSERT INTO dbo.piani_incentivi
      (periodo_label, mese, anno, validita_dal, validita_al, operatore, nome_file, url_s3, periodo_primo_giorno, s3_key)
      OUTPUT INSERTED.*
      VALUES (@periodo_label, @mese, @anno, @validita_dal, @validita_al, @operatore, @nome_file, @url_s3, @periodo_primo_giorno, @s3_key)`;
    const ins = await request.query(insertSql);
    const row = ins.recordset?.[0] || null;

    return res.json({ success: true, row });
  } catch (err) {
    console.error('[PianiIncentivi][UPLOAD] Error:', err);
    return res.status(500).json({ error: 'Errore inserimento piano incentivi', details: err.message });
  }
});

// ===== API: Config JSON IncentiviPlan (plan_key, period) =====
router.get('/config', authenticateToken, onlySupermaster, async (req, res) => {
  try {
    const plan = String(req.query.plan || '').trim();
    const period = String(req.query.period || '').trim();
    if (!plan || !/^\d{4}-\d{2}$/.test(period)) return res.status(400).json({ error: 'Parametri plan/period non validi' });
    const row = await getIncentiviPlan(plan, period);
    if (!row) return res.status(404).json({ error: 'Piano non trovato' });
    const data = typeof row.data_json === 'string' ? safeParseJSON(row.data_json) : row.data_json;
    return res.json({ ...row, data_json: data });
  } catch (err) {
    console.error('[IncentiviPlan][GET /config] Error:', err);
    return res.status(500).json({ error: 'Errore lettura IncentiviPlan', details: err.message });
  }
});

router.put('/config', authenticateToken, onlySupermaster, express.json({ limit: '2mb' }), async (req, res) => {
  try {
    const { plan_key, period, status, data_json, valid_from, valid_to } = req.body || {};
    if (!plan_key || !/^\d{4}-\d{2}$/.test(String(period || ''))) {
      return res.status(400).json({ error: 'plan_key/period mancanti o non validi' });
    }
    const user = req.user?.email || req.user?.nome || 'SuperMaster';
    const row = await upsertIncentiviPlan({ plan_key, period, status, data_json, valid_from, valid_to, user });
    const data = typeof row.data_json === 'string' ? safeParseJSON(row.data_json) : row.data_json;
    return res.json({ success: true, row: { ...row, data_json: data } });
  } catch (err) {
    console.error('[IncentiviPlan][PUT /config] Error:', err);
    return res.status(500).json({ error: 'Errore salvataggio IncentiviPlan', details: err.message });
  }
});

// ===== API: Overview Mobile RES – Ricarica Automatica (solo Set 2025 per ora, ma generico per periodo) =====
router.get('/overview/mobile-res-automatica', authenticateToken, onlySupermaster, async (req, res) => {
  try {
    const period = String(req.query.period || '').trim();
    if (!/^\d{4}-\d{2}$/.test(period)) return res.status(400).json({ error: 'Param period non valido (YYYY-MM)' });
    const request = new sql.Request();
    request.input('period', sql.Char(7), period);
    const query = `
      SELECT 
        v.MeseCompetenza,
        v.RagioneSociale,
        v.IDDealer,
        v.AGENTE,
        v.Portabilita,
        v.TipoRicarica,
        v.Offerta,
        COUNT(*) AS NumAttivazioni
      FROM dbo.vw_Incentivi_InseritoFW_TLC v
      WHERE v.MeseCompetenza = @period
        AND v.MacroProdotto = 'MOBILE'
        AND v.Segmento = 'RES'
        AND v.TipoRicarica = 'AUTOMATICA'
      GROUP BY v.MeseCompetenza, v.RagioneSociale, v.IDDealer, v.AGENTE, v.Portabilita, v.TipoRicarica, v.Offerta
      ORDER BY v.RagioneSociale, v.Portabilita DESC, v.TipoRicarica, v.Offerta`;
    const r = await request.query(query);
    return res.json(r.recordset || []);
  } catch (err) {
    console.error('[SM][GET overview/mobile-res-automatica] Error:', err);
    return res.status(500).json({ error: 'Errore overview', details: err.message });
  }
});

// ===== API: Recalc Mobile RES – Ricarica Automatica =====
router.post('/recalc/mobile-res-automatica', authenticateToken, onlySupermaster, express.json({ limit: '2mb' }), async (req, res) => {
  try {
    const plan_key = String(req.body?.plan || req.query?.plan || '').trim() || 'fastweb_tlc';
    const period = String(req.body?.period || req.query?.period || '').trim();
    if (!/^\d{4}-\d{2}$/.test(period)) return res.status(400).json({ error: 'Param period non valido (YYYY-MM)' });

    // 1) Carica piano pubblicato
    const planRow = await getIncentiviPlan(plan_key, period);
    if (!planRow) return res.status(404).json({ error: 'Piano non trovato' });
    const planJson = typeof planRow.data_json === 'string' ? safeParseJSON(planRow.data_json) : planRow.data_json;
    if (!planJson) return res.status(400).json({ error: 'data_json non valido' });

    // Trova sezione Mobile RES AUT
    const sections = Array.isArray(planJson.sections) ? planJson.sections : [];
    const section = sections.find(s => 
      s && s.match && String(s.match.segmento).toUpperCase() === 'RES' &&
      String(s.match.macrolob).toUpperCase() === 'MOBILE' &&
      String(s.match.tipoRicarica).toUpperCase() === 'AUTOMATICA'
    );
    if (!section) return res.status(400).json({ error: 'Sezione Mobile RES AUT mancante nel piano' });
    const mapping = section.bucket_mapping || {};
    const thresholds = Array.isArray(section.thresholds) ? section.thresholds : [];

    const offerToBucket = (off) => {
      const name = String(off || '').trim();
      if (!name) return null;
      for (const [bucket, list] of Object.entries(mapping)) {
        if (Array.isArray(list) && list.some(x => String(x).trim().toUpperCase() === name.toUpperCase())) return bucket;
      }
      return null; // non mappata → ignoriamo o segnaliamo
    };

    const rateForCount = (count, bucket) => {
      for (const t of thresholds) {
        const min = Number.isFinite(Number(t?.range?.min)) ? Number(t.range.min) : 0;
        const max = (t?.range?.max == null) ? null : Number(t.range.max);
        if ((count >= min) && (max == null ? true : count <= max)) {
          const r = t.rates?.[bucket];
          if (typeof r === 'number') return r;
        }
      }
      return 0;
    };

    // 2) Query dataset aggregato Dealer×Offerta
    const request = new sql.Request();
    request.input('period', sql.Char(7), period);
    const query = `
      SELECT 
        v.IDDealer,
        v.RagioneSociale,
        v.AGENTE,
        v.Offerta,
        COUNT(*) AS NumAttivazioni
      FROM dbo.vw_Incentivi_InseritoFW_TLC v
      WHERE v.MeseCompetenza = @period
        AND v.MacroProdotto = 'MOBILE'
        AND v.Segmento = 'RES'
        AND v.TipoRicarica = 'AUTOMATICA'
      GROUP BY v.IDDealer, v.RagioneSociale, v.AGENTE, v.Offerta`;
    const r = await request.query(query);
    const rows = r.recordset || [];

    // 3) Calcolo per dealer × offerta (TGT per offerta)
    const byDealer = new Map();
    for (const row of rows) {
      const dealerId = row.IDDealer ?? 0;
      if (!byDealer.has(dealerId)) byDealer.set(dealerId, { dealerId, ragioneSociale: row.RagioneSociale, agente: row.AGENTE, offers: [], total: 0 });
      const bucket = offerToBucket(row.Offerta);
      if (!bucket) {
        // Salta offerte non mappate ma traccia per debug
        byDealer.get(dealerId).offers.push({ offerta: row.Offerta, note: 'OFFERTA_NON_MAPPATA', num: row.NumAttivazioni, payout: 0, bucket: null, fascia: null, rate: 0 });
        continue;
      }
      const tgt = Number(row.NumAttivazioni) || 0;
      const rate = rateForCount(tgt, bucket);
      const payout = rate * tgt;
      const fascia = thresholds.find(t => {
        const min = Number.isFinite(Number(t?.range?.min)) ? Number(t.range.min) : 0;
        const max = (t?.range?.max == null) ? null : Number(t.range.max);
        return (tgt >= min) && (max == null ? true : tgt <= max);
      }) || null;
      byDealer.get(dealerId).offers.push({ offerta: row.Offerta, num: tgt, bucket, rate, payout, fascia });
      byDealer.get(dealerId).total += payout;
    }

    const result = Array.from(byDealer.values()).sort((a,b) => String(a.ragioneSociale||'').localeCompare(String(b.ragioneSociale||'')));
    return res.json({ plan_key, period, section_id: section.id || 'mobile_res_ricarica_automatica', dealers: result });
  } catch (err) {
    console.error('[SM][POST recalc/mobile-res-automatica] Error:', err);
    return res.status(500).json({ error: 'Errore recalc', details: err.message });
  }
});

export default router;
