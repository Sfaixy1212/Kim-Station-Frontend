import express from 'express';
import sql from 'mssql';
import { authenticateToken } from './auth-middleware.mjs';
import { withCache } from './redis-client.mjs';

const router = express.Router();

function onlySupermaster(req, res, next) {
  const roles = (req.user?.ruoli || []).map(r => String(r).toUpperCase());
  if (roles.includes('SUPERMASTER') || roles.includes('MASTER')) return next();
  return res.status(403).json({ error: 'Accesso riservato ai SUPERMASTER' });
}

async function getDynamicReports(pool) {
  const r = await pool.request()
    .input('ruolo', sql.NVarChar, 'AD')
    .query(`SELECT ID, Titolo, Descrizione FROM dbo.tbDynamicReports WHERE Ruolo LIKE @ruolo`);
  return r.recordset || [];
}

async function execReportById(pool, id, params = {}) {
  const qRes = await pool.request()
    .input('id', sql.Int, id)
    .query(`SELECT TOP 1 ID, Titolo, Query FROM dbo.tbDynamicReports WHERE ID=@id AND Ruolo LIKE 'AD'`);
  const row = qRes.recordset?.[0];
  if (!row) return null;
  const rawQuery = String(row.Query || '').trim();
  if (!rawQuery) return null;
  const request = pool.request();
  const U = rawQuery.toLowerCase();
  const setIf = (needle, value, type) => { if (U.includes(`@${needle}`)) request.input(needle, type, value); };
  if (params.year != null) setIf('year', Number(params.year), sql.Int);
  if (params.month != null) setIf('month', Number(params.month), sql.Int);
  if (params.from) setIf('from', params.from, sql.Date);
  if (params.to) setIf('to', params.to, sql.Date);
  if (params.agente) setIf('agente', String(params.agente).toUpperCase(), sql.NVarChar);
  if (params.provincia) setIf('provincia', String(params.provincia).toUpperCase(), sql.NVarChar);
  if (params.point) setIf('point', String(params.point), sql.NVarChar);
  const execRes = await request.query(rawQuery);
  const recordsets = execRes.recordsets?.length ? execRes.recordsets : [execRes.recordset || []];
  return { titolo: row.Titolo, recordsets };
}

// Helper: parse latest month total from SKY report tables
function parseSkyTotal(recordsets) {
  const table = recordsets?.[0] || [];
  // Support patterns:
  // - columns per Sky categories (WIFI, ONLY TV, 3P, GLASS, ...)
  // - OR aggregated columns MOBILE/WIFI/etc. We sum all columns except metadata
  let bestRow = null;
  // choose latest by label
  const sorted = [...table].sort((a,b) => String(a.AnnoMese || a["Anno/Mese"] || a.PERIODO || '').localeCompare(String(b.AnnoMese || b["Anno/Mese"] || b.PERIODO || '')));
  if (sorted.length) bestRow = sorted[sorted.length - 1];
  if (!bestRow) return 0;
  const keys = Object.keys(bestRow);
  const skip = new Set(['Anno','Mese','AnnoMese','Anno/Mese','PERIODO','Agente','AGENTE','Point','POINT','CITTA','Provincia','PROVINCIA','ORDINAMENTO','ORDINAMENTO_DETTAGLI','DataAggiornamento']);
  let tot = 0;
  for (const k of keys) {
    if (skip.has(k)) continue;
    const v = Number(bestRow[k]);
    if (Number.isFinite(v)) tot += v;
  }
  return tot;
}

// Helper: parse latest month ILIAD from ALTRI OPERATORI report (columns KENA, 1MOBILE, ILIAD, WEEDOO)
function parseIliadTotal(recordsets) {
  const table = recordsets?.[0] || [];
  if (!table.length) return 0;
  const sorted = [...table].sort((a,b) => String(a['Anno/Mese'] || a.AnnoMese || '').localeCompare(String(b['Anno/Mese'] || b.AnnoMese || '')));
  const row = sorted[sorted.length - 1];
  const val = Number(row?.ILIAD || row?.Iliad || 0);
  return Number.isFinite(val) ? val : 0;
}

// GET /api/supermaster/kpi/sky
router.get('/sky', authenticateToken, onlySupermaster, async (req, res) => {
  try {
    // Cache key basata sui parametri query
    const cacheKey = `kpi:sky:${JSON.stringify(req.query)}`;
    
    const result = await withCache(cacheKey, 900, async () => {
      // 900 secondi = 15 minuti
      const pool = await sql.connect();
      const list = await getDynamicReports(pool);
      // Prefer dedicated title; else fallback to a known SKY annual/mensile report
      const skyCandidates = [
        /KPI\s*SKY\s*-\s*Totali\s*mese\s*per\s*mese/i,
        /SKY\s*-\s*Totali\s*Mese\s*per\s*Mese\s*ANNO/i,
        /SKY\s*-\s*Analisi\s*Andamento\s*Mese\s*per\s*Mese/i
      ];
      const found = list.find(r => skyCandidates.some(rx => rx.test(r.Titolo || '')));
      if (!found) return { sky: 0 };
      const data = await execReportById(pool, found.ID, req.query);
      const sky = parseSkyTotal(data?.recordsets);
      return { sky };
    });
    
    return res.json(result);
  } catch (err) {
    console.error('[KPI SKY] Errore:', err);
    return res.json({ sky: 0 });
  }
});

// GET /api/supermaster/kpi/sky-hoover
// Ritorna righe da dbo.sky_hoover per mese/anno (opzionali). Usato per tooltip SKY nel Mix Prodotti.
router.get('/sky-hoover', authenticateToken, onlySupermaster, async (req, res) => {
  try {
    const pool = await sql.connect();
    const month = req.query.month ? parseInt(String(req.query.month), 10) : null; // 1-12
    const year = req.query.year ? parseInt(String(req.query.year), 10) : null;
    const request = pool.request();
    request.input('Mese', sql.Int, Number.isFinite(month) ? month : null);
    request.input('Anno', sql.Int, Number.isFinite(year) ? year : null);
    const q = `
      DECLARE @sql nvarchar(max) = N'SELECT * FROM dbo.sky_hoover WHERE 1=1';
      IF COL_LENGTH('dbo.sky_hoover','Mese') IS NOT NULL SET @sql += N' AND (@Mese IS NULL OR Mese = @Mese)';
      IF COL_LENGTH('dbo.sky_hoover','Anno') IS NOT NULL SET @sql += N' AND (@Anno IS NULL OR Anno = @Anno)';
      EXEC sp_executesql @sql, N'@Mese int, @Anno int', @Mese=@Mese, @Anno=@Anno;
    `;
    const rs = await request.query(q);
    return res.json({ rows: rs.recordset || [] });
  } catch (err) {
    console.error('[KPI SKY HOOVER] Error:', err);
    return res.status(500).json({ error: 'Errore sky_hoover' });
  }
});

// GET /api/supermaster/riepilogo-fw-per-mese
// Esegue la stored: EXEC dbo.sp_RiepilogoFWPerMese @Agente = <AGENTE|null>
router.get('/riepilogo-fw-per-mese', authenticateToken, onlySupermaster, async (req, res) => {
  try {
    const pool = await sql.connect();
    const agente = req.query.agente ? String(req.query.agente).trim() : null;
    const request = pool.request();
    // Param opzionale: se non fornito o vuoto, passa NULL alla stored
    request.input('Agente', sql.NVarChar, agente && agente.length ? agente.toUpperCase() : null);
    const q = `EXEC dbo.sp_RiepilogoFWPerMese @Agente = @Agente`;
    const rs = await request.query(q);
    const rows = rs?.recordset || [];
    return res.json({ rows });
  } catch (err) {
    console.error('[SM][sp_RiepilogoFWPerMese] Error:', err);
    return res.status(500).json({ error: 'Errore riepilogo FW per mese' });
  }
});

// GET /api/supermaster/kpi/iliad
router.get('/iliad', authenticateToken, onlySupermaster, async (req, res) => {
  try {
    const cacheKey = `kpi:iliad:${JSON.stringify(req.query)}`;
    
    const result = await withCache(cacheKey, 900, async () => {
      const pool = await sql.connect();
      const list = await getDynamicReports(pool);
      // Prefer dedicated title; else fallback a "ALTRI OPERATORI - Totali Mese per Mese"
      const iliadCandidates = [
        /ILIAD\s*-\s*Totali\s*Mese\s*per\s*Mese/i,
        /KPI\s*ILIAD\s*-\s*Totali\s*mese\s*per\s*mese/i,
        /ALTRI\s*OPERATORI\s*-\s*Totali\s*Mese\s*per\s*Mese/i
      ];
      const found = list.find(r => iliadCandidates.some(rx => rx.test(r.Titolo || '')));
      if (!found) return { iliad: 0 };
      const data = await execReportById(pool, found.ID, req.query);
      const iliad = parseIliadTotal(data?.recordsets);
      return { iliad };
    });
    
    return res.json(result);
  } catch (err) {
    console.error('[KPI ILIAD] Errore:', err);
    return res.json({ iliad: 0 });
  }
});

// GET /api/supermaster/kpi
// Restituisce KPI base con filtri year/month o from/to, e opzionali provincia/agente
const USE_LEGACY = false; // Forza uso nuova versione con ENERGY fix

router.get('/', authenticateToken, onlySupermaster, async (req, res, next) => {
  if (USE_LEGACY) {
    // Delega all'handler legacy definito in index.mjs (salta questo route e passa al prossimo)
    return next('route');
  }
  try {
    // Cache key basata sui parametri query
    const cacheKey = `kpi:main:${JSON.stringify(req.query)}`;
    
    const result = await withCache(cacheKey, 900, async () => {
      // 900 secondi = 15 minuti
      return await getKPIData(req.query);
    });
    
    return res.json(result);
  } catch (err) {
    console.error('[KPI BASE] Errore:', err);
    return res.status(500).json({ error: 'Errore KPI', details: err.message });
  }
});

// Funzione helper per calcolare KPI (estratta per cache)
async function getKPIData(queryParams) {
  try {
    const pool = await sql.connect();
    const dbName = (process.env.DB_NAME || '').trim() || 'KAM';

    // Finestra temporale come legacy: >= firstDay e < nextFirstDay
    const now = new Date();
    const y = queryParams.year != null ? parseInt(String(queryParams.year), 10) : null;
    const m = queryParams.month != null ? parseInt(String(queryParams.month), 10) : null;
    const fromQ = queryParams.from ? String(queryParams.from) : null;
    const toQ = queryParams.to ? String(queryParams.to) : null;
    const agente = queryParams.agente ? String(queryParams.agente).trim() : null;

    const parseDate = (s) => {
      if (!s) return null;
      if (/^\d{4}-\d{2}$/.test(s)) return new Date(s + '-01');
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(s);
      return null;
    };
    let firstDay = null, nextFirstDay = null;
    if (fromQ && toQ) {
      const f = parseDate(fromQ);
      const t = parseDate(toQ);
      firstDay = f || new Date(now.getFullYear(), now.getMonth(), 1);
      const end = t ? new Date(t.getFullYear(), t.getMonth(), 1) : new Date(now.getFullYear(), now.getMonth(), 1);
      nextFirstDay = new Date(end.getFullYear(), end.getMonth() + 1, 1);
    } else if (y && m) {
      firstDay = new Date(y, m - 1, 1);
      nextFirstDay = new Date(y, m, 1);
    } else if (y) {
      firstDay = new Date(y, 0, 1);
      nextFirstDay = new Date(y + 1, 0, 1);
    } else {
      firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      nextFirstDay = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    }

    // Attivazioni mese (DISTINCT fra le 3 fonti)
    const attivazioniQuery = `
      WITH AttivazioniOrdini AS (
        SELECT CAST(o.IDOrdine AS VARCHAR(50)) AS Ordine
        FROM dbo.tbOrdini o
        LEFT JOIN dbo.tbDealers d ON d.IDDealer = o.idDealer
        WHERE o.DataOra >= @firstDay AND o.DataOra < @nextFirstDay AND o.Stato = 1
          AND (@agente IS NULL OR LTRIM(RTRIM(ISNULL(d.Agente, N''))) = @agente)
        GROUP BY o.IDOrdine
      ),
      AttivazioniFW AS (
        SELECT f.[Codice Ordine] AS Ordine
        FROM [${dbName}].[dbo].[InseritoFW] f
        INNER JOIN dbo.tbDealers d ON f.[Codice Comsy Tecnico Attuale] = d.[COMSY1] OR f.[Codice Comsy Tecnico Attuale] = d.[COMSY2]
        WHERE f.[Data Inserimento Ordine] >= @firstDay AND f.[Data Inserimento Ordine] < @nextFirstDay
          AND (@agente IS NULL OR LTRIM(RTRIM(ISNULL(d.Agente, N''))) = @agente)
        GROUP BY f.[Codice Ordine]
      ),
      AttivazioniEnergy AS (
        SELECT UPPER(LTRIM(RTRIM(
          REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
            CAST(fwe.[Codice Contratto] AS nvarchar(255)),
            NCHAR(9), N''),   -- TAB
            NCHAR(13), N''),  -- CR
            NCHAR(10), N''),  -- LF
            NCHAR(160), N''), -- NBSP
            NCHAR(8239), N''),-- NARROW NBSP
            NCHAR(8203), N''),-- ZERO WIDTH SPACE
            NCHAR(65279), N'' -- BOM
          )
        ))) AS Ordine
        FROM [${dbName}].[dbo].[FWEnergiaImporter] fwe
        INNER JOIN dbo.tbDealers d ON fwe.[Codice Comsy/Order Owner (Report!DBSELLER)] = d.[COMSY1] OR fwe.[Codice Comsy/Order Owner (Report!DBSELLER)] = d.[COMSY2]
        WHERE fwe.[DataBatch] >= @firstDay AND fwe.[DataBatch] < @nextFirstDay
          AND (@agente IS NULL OR LTRIM(RTRIM(ISNULL(d.Agente, N''))) = @agente)
        GROUP BY UPPER(LTRIM(RTRIM(
          REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
            CAST(fwe.[Codice Contratto] AS nvarchar(255)),
            NCHAR(9), N''), NCHAR(13), N''), NCHAR(10), N''), NCHAR(160), N''), NCHAR(8239), N''), NCHAR(8203), N''), NCHAR(65279), N'')
        )))
      )
      SELECT COUNT(DISTINCT Ordine) as totale
      FROM (
        SELECT Ordine FROM AttivazioniOrdini
        UNION
        SELECT Ordine FROM AttivazioniFW
        UNION
        SELECT Ordine FROM AttivazioniEnergy
      ) AS AttivazioniUnione
    `;
    const attivazioniRes = await (new sql.Request())
      .input('firstDay', sql.DateTime, firstDay)
      .input('nextFirstDay', sql.DateTime, nextFirstDay)
      .input('agente', sql.NVarChar, agente || null)
      .query(attivazioniQuery);

    // Dealer attivi mese
    const dealerAttiviQuery = `
      WITH DealerOrdini AS (
        SELECT d.IDDealer
        FROM dbo.tbOrdini o
        INNER JOIN dbo.tbDealers d ON o.idDealer = d.IDDealer
        WHERE o.DataOra >= @firstDay AND o.DataOra < @nextFirstDay AND o.Stato = 1
        GROUP BY d.IDDealer
      ),
      DealerFW AS (
        SELECT d.IDDealer
        FROM [${dbName}].[dbo].[InseritoFW] f
        INNER JOIN dbo.tbDealers d ON f.[Codice Comsy Tecnico Attuale] = d.[COMSY1] OR f.[Codice Comsy Tecnico Attuale] = d.[COMSY2]
        WHERE f.[Data Inserimento Ordine] >= @firstDay AND f.[Data Inserimento Ordine] < @nextFirstDay
        GROUP BY d.IDDealer
      ),
      DealerEnergy AS (
        SELECT d.IDDealer
        FROM [${dbName}].[dbo].[FWEnergiaImporter] fwe
        INNER JOIN dbo.tbDealers d ON fwe.[Codice Comsy/Order Owner (Report!DBSELLER)] = d.[COMSY1] OR fwe.[Codice Comsy/Order Owner (Report!DBSELLER)] = d.[COMSY2]
        WHERE fwe.[DataBatch] >= @firstDay AND fwe.[DataBatch] < @nextFirstDay
        GROUP BY d.IDDealer
      )
      SELECT COUNT(DISTINCT IDDealer) as totale
      FROM (
        SELECT IDDealer FROM DealerOrdini
        UNION
        SELECT IDDealer FROM DealerFW
        UNION
        SELECT IDDealer FROM DealerEnergy
      ) AS DealerUnione
    `;
    const dealerAttiviRes = await (new sql.Request())
      .input('firstDay', sql.DateTime, firstDay)
      .input('nextFirstDay', sql.DateTime, nextFirstDay)
      .query(dealerAttiviQuery);

    // FASTWEB TLC (distinct Codice Ordine)
    const fastwebTlcQuery = `
      SELECT COUNT(DISTINCT f.[Codice Ordine]) AS totale
      FROM [${dbName}].[dbo].[InseritoFW] f
      INNER JOIN dbo.tbDealers d ON f.[Codice Comsy Tecnico Attuale] = d.[COMSY1] OR f.[Codice Comsy Tecnico Attuale] = d.[COMSY2]
      WHERE f.[Data Inserimento Ordine] >= @firstDay AND f.[Data Inserimento Ordine] < @nextFirstDay
        AND (@agente IS NULL OR LTRIM(RTRIM(ISNULL(d.Agente, N''))) = @agente)
    `;
    const fastwebTlcRes = await (new sql.Request())
      .input('firstDay', sql.DateTime, firstDay)
      .input('nextFirstDay', sql.DateTime, nextFirstDay)
      .input('agente', sql.NVarChar, agente || null)
      .query(fastwebTlcQuery);
    const fastwebTlc = fastwebTlcRes.recordset[0]?.totale || 0;

    // FASTWEB ENERGY (tutte le righe dell'ultimo batch disponibile per nome)
    const fastwebEnergyQuery = `
      WITH UltimoBatch AS (
        SELECT MAX(f.[Batch]) as ultimo_batch
        FROM [${dbName}].[dbo].[FWEnergiaImporter] f
        WHERE f.[Batch] LIKE @yearMonth + '%'
      )
      SELECT 
        COUNT(*) AS totale,
        ub.ultimo_batch,
        @firstDay as firstDay,
        @nextFirstDay as nextFirstDay
      FROM [${dbName}].[dbo].[FWEnergiaImporter] f
      CROSS JOIN UltimoBatch ub
      WHERE f.[Batch] = ub.ultimo_batch
      GROUP BY ub.ultimo_batch
    `;
    // Calcola yearMonth per il batch (es. "2025-09")
    const yearMonth = `${firstDay.getFullYear()}-${String(firstDay.getMonth() + 1).padStart(2, '0')}`;
    
    const fastwebEnergyRes = await (new sql.Request())
      .input('firstDay', sql.DateTime, firstDay)
      .input('nextFirstDay', sql.DateTime, nextFirstDay)
      .input('yearMonth', sql.NVarChar, yearMonth)
      .input('agente', sql.NVarChar, agente || null)
      .query(fastwebEnergyQuery);
    const fastwebEnergy = fastwebEnergyRes.recordset[0]?.totale || 0;
    
    // Debug logging semplificato
    console.log('=== FASTWEB ENERGY DEBUG ===');
    console.log('Periodo:', firstDay.toISOString().split('T')[0], 'to', nextFirstDay.toISOString().split('T')[0]);
    console.log('YearMonth pattern:', yearMonth);
    console.log('Ultimo batch trovato:', fastwebEnergyRes.recordset[0]?.ultimo_batch);
    console.log('Totale righe:', fastwebEnergy);
    console.log('Query result:', JSON.stringify(fastwebEnergyRes.recordset[0]));
    console.log('=== END DEBUG ===');

    // Split FASTWEB fissi/mobili e % Ric. Automatica dalla stessa fonte dell'Analisi (vw_agenti_province_mensile)
    const fwSplitQuery = `
      DECLARE @year int = COALESCE(@anno, YEAR(@firstDay));
      DECLARE @month int = COALESCE(@mese, MONTH(@firstDay));
      SELECT 
        SUM(tlc_fisso_inseriti)     AS Fissi_FW,
        SUM(tlc_mobile_inseriti)    AS Mobile_FW,
        SUM(tlc_mobile_ra_inseriti) AS Mobile_RA
      FROM dbo.vw_agenti_province_mensile
      WHERE Anno = @year AND Mese = @month;
    `;
    let fastwebFissi = 0, fastwebMobili = 0, fastwebMobileRA = 0;
    try {
      const fwSplitRes = await (new sql.Request())
        .input('firstDay', sql.DateTime, firstDay)
        .input('anno', sql.Int, Number.isFinite(y) ? y : null)
        .input('mese', sql.Int, Number.isFinite(m) ? m : null)
        .input('agente', sql.NVarChar, agente || null)
        .query(fwSplitQuery);
      fastwebFissi   = Number(fwSplitRes.recordset?.[0]?.Fissi_FW || 0);
      fastwebMobili  = Number(fwSplitRes.recordset?.[0]?.Mobile_FW || 0);
      fastwebMobileRA = Number(fwSplitRes.recordset?.[0]?.Mobile_RA || 0);
      
    } catch (e) {
      console.warn('[SUPERMASTER][KPI] FW split non disponibile (vw_agenti_province_mensile):', e.message);
    }

    // SKY e ILIAD come legacy (tbOrdini/tbOfferte)
    const skyQuery = `
      SELECT COUNT(*) AS totale
      FROM dbo.tbOrdini o
      INNER JOIN dbo.tbOfferte ofr ON o.idOfferta = ofr.IDOfferta
      LEFT JOIN dbo.tbDealers d ON d.IDDealer = o.idDealer
      WHERE o.Stato = 1
        AND COALESCE(o.DataStato, o.DataOra) >= @firstDay AND COALESCE(o.DataStato, o.DataOra) < @nextFirstDay
        AND ofr.idOperatore IN (3, 8, 12, 14)
        AND (@agente IS NULL OR LTRIM(RTRIM(ISNULL(d.Agente, N''))) = @agente)
    `;
    const skyRes = await (new sql.Request())
      .input('firstDay', sql.DateTime, firstDay)
      .input('nextFirstDay', sql.DateTime, nextFirstDay)
      .input('agente', sql.NVarChar, agente || null)
      .query(skyQuery);
    const sky = skyRes.recordset?.[0]?.totale || 0;

    const iliadQuery = `
      SELECT COUNT(*) AS totale
      FROM dbo.tbOrdini o
      INNER JOIN dbo.tbOfferte ofr ON o.idOfferta = ofr.IDOfferta
      LEFT JOIN dbo.tbDealers d ON d.IDDealer = o.idDealer
      WHERE o.Stato = 1
        AND o.DataOra >= @firstDay AND o.DataOra < @nextFirstDay
        AND ofr.idOperatore = 5
        AND (@agente IS NULL OR LTRIM(RTRIM(ISNULL(d.Agente, N''))) = @agente)
    `;
    const iliadRes = await (new sql.Request())
      .input('firstDay', sql.DateTime, firstDay)
      .input('nextFirstDay', sql.DateTime, nextFirstDay)
      .input('agente', sql.NVarChar, agente || null)
      .query(iliadQuery);
    const iliad = iliadRes.recordset?.[0]?.totale || 0;

    // ENI PLENITUDE (operatore 16, escludi Vulnerabilità IDOfferta 526)
    const eniQuery = `
      SELECT COUNT(*) AS totale
      FROM dbo.tbOrdini o
      INNER JOIN dbo.tbOfferte ofr ON o.idOfferta = ofr.IDOfferta
      LEFT JOIN dbo.tbDealers d ON d.IDDealer = o.idDealer
      WHERE o.MonthStart >= @firstDay AND o.MonthStart < @nextFirstDay
        AND ofr.idOperatore = 16
        AND ofr.IDOfferta <> 526
        AND (@agente IS NULL OR LTRIM(RTRIM(ISNULL(d.Agente, N''))) = @agente)
    `;
    const eniRes = await (new sql.Request())
      .input('firstDay', sql.DateTime, firstDay)
      .input('nextFirstDay', sql.DateTime, nextFirstDay)
      .input('agente', sql.NVarChar, agente || null)
      .query(eniQuery);
    const eniPlenitude = eniRes.recordset?.[0]?.totale || 0;

    // Ultimi batch (per badge aggiornamento): TLC da InseritoFW.Batch, ENERGY da FWEnergiaImporter.DataBatch
    const lastBatchTlcQuery = `
      SELECT MAX(TRY_CONVERT(date, f.[Batch])) AS LastBatchTlc
      FROM [${dbName}].[dbo].[InseritoFW] f
      WHERE f.[Data Inserimento Ordine] >= @firstDay AND f.[Data Inserimento Ordine] < @nextFirstDay
    `;
    const lastBatchEnergyQuery = `
      SELECT MAX(CONVERT(date, f.[DataBatch])) AS LastBatchEnergy
      FROM [${dbName}].[dbo].[FWEnergiaImporter] f
      WHERE f.[DataBatch] >= @firstDay AND f.[DataBatch] < @nextFirstDay
    `;
    const [lastTlcRes, lastEnergyRes] = await Promise.all([
      (new sql.Request()).input('firstDay', sql.DateTime, firstDay).input('nextFirstDay', sql.DateTime, nextFirstDay).query(lastBatchTlcQuery),
      (new sql.Request()).input('firstDay', sql.DateTime, firstDay).input('nextFirstDay', sql.DateTime, nextFirstDay).query(lastBatchEnergyQuery),
    ]);
    const lastBatchTlc = lastTlcRes.recordset?.[0]?.LastBatchTlc || null;
    const lastBatchEnergy = lastEnergyRes.recordset?.[0]?.LastBatchEnergy || null;

    // Andamento attivazioni mese vs mese precedente (come legacy, basato su tbOrdini + FW)
    const prevFirstDay = new Date(firstDay.getFullYear(), firstDay.getMonth() - 1, 1);
    const prevLastDay = new Date(firstDay.getFullYear(), firstDay.getMonth(), 0);
    const attivazioniPrevQuery = `
      WITH AttivazioniOrdini AS (
        SELECT CAST(o.IDOrdine AS VARCHAR(50)) AS Ordine
        FROM dbo.tbOrdini o
        WHERE o.DataOra >= @prevFirstDay AND o.DataOra <= @prevLastDay AND o.Stato = 1
        GROUP BY o.IDOrdine
      ),
      AttivazioniFW AS (
        SELECT f.[Codice Ordine] AS Ordine
        FROM [${dbName}].[dbo].[InseritoFW] f
        INNER JOIN dbo.tbDealers d ON f.[Codice Comsy Tecnico Attuale] = d.[COMSY1] OR f.[Codice Comsy Tecnico Attuale] = d.[COMSY2]
        WHERE f.[Data Inserimento Ordine] >= @prevFirstDay AND f.[Data Inserimento Ordine] <= @prevLastDay
        GROUP BY f.[Codice Ordine]
      )
      SELECT COUNT(DISTINCT Ordine) as totale
      FROM (
        SELECT Ordine FROM AttivazioniOrdini
        UNION
        SELECT Ordine FROM AttivazioniFW
      ) AS AttivazioniUnione
    `;
    const attPrevRes = await (new sql.Request())
      .input('prevFirstDay', sql.DateTime, prevFirstDay)
      .input('prevLastDay', sql.DateTime, prevLastDay)
      .query(attivazioniPrevQuery);

    const attivazioniMese = attivazioniRes.recordset[0]?.totale || 0;
    // % RIC.AUTOMATICA allineata all'Analisi: Mobile_RA / Mobile * 100
    const andamentoAttivazioniPercentuale = fastwebMobili > 0 ? Math.round((fastwebMobileRA / fastwebMobili) * 100) : 0;

    return {
      attivazioniMese,
      agentiAttiviMese: 0, // il modern non espone agentiAttiviMese nel legacy response base; opzionale se vuoi aggiungerlo dopo
      andamentoAttivazioniPercentuale,
      fastwebTlc,
      fastwebFissi,
      fastwebMobili,
      fastwebEnergy,
      sky,
      iliad,
      eniPlenitude,
      lastBatchTlc,
      lastBatchEnergy,
      generatedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.error('[KPI BASE getKPIData] Errore:', err);
    throw err;
  }
}

export default router;
