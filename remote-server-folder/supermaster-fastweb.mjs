import express from 'express';
import sql from 'mssql';
import { authenticateToken } from './auth-middleware.mjs';

const router = express.Router();

// Solo SUPERMASTER (o MASTER)
function onlySupermaster(req, res, next) {
  const roles = (req.user?.ruoli || []).map(r => String(r).toUpperCase());
  if (roles.includes('SUPERMASTER') || roles.includes('MASTER')) return next();
  return res.status(403).json({ error: 'Accesso riservato ai SUPERMASTER' });
}

// GET /api/supermaster/fastweb/agente-mensile
// Query:
//  - year, month     (numeri)
//  - from=YYYY-MM, to=YYYY-MM (prioritari se presenti)
//  - agente = lettera iniziale (es. 'G')
router.get('/agente-mensile', authenticateToken, onlySupermaster, async (req, res) => {
  try {
    const year = Number(req.query.year);
    const month = Number(req.query.month);
    const from = (req.query.from || '').toString(); // YYYY-MM
    const to = (req.query.to || '').toString();     // YYYY-MM
    const agente = (req.query.agente || '').toString().trim().toUpperCase() || null; // es. 'G'

    const pool = await sql.connect();
    const request = pool.request();

    // Parametri periodo
    let useRange = false;
    let fromDate = null, toDate = null;
    if (from && to && /^\d{4}-\d{2}$/.test(from) && /^\d{4}-\d{2}$/.test(to)) {
      useRange = true;
      fromDate = `${from}-01`;
      // EOMONTH in SQL, ma qui passo una data del mese successivo - 1 giorno è complicato: uso EOMONTH lato SQL.
      toDate = `${to}-28`; // placeholder, EOMONTH gestisce fine mese
    }

    request.input('year', sql.Int, Number.isFinite(year) ? year : null);
    request.input('month', sql.Int, Number.isFinite(month) ? month : null);
    request.input('from', sql.Date, useRange ? fromDate : null);
    request.input('to', sql.Date, useRange ? toDate : null);
    request.input('agente', sql.NVarChar, agente);

    const query = `
;WITH CTE_MaxBatchPerMese AS (
  SELECT [Year], [Month], MAX([Batch]) AS MaxBatch
  FROM dbo.viewLastStatoOrdiniNoUnion
  GROUP BY [Year], [Month]
),
CTE_FilteredOrdini AS (
  SELECT
    ins.Valore,
    ins.[Codice Comsy Tecnico Attuale],
    ins.[Month],
    ins.[Year],
    ins.[Batch],
    tf.TIPO_Fastweb
  FROM dbo.viewLastStatoOrdiniNoUnion AS ins
  LEFT OUTER JOIN dbo.tbPianiFastweb AS tf ON ins.Valore = tf.VALORE
  INNER JOIN CTE_MaxBatchPerMese AS maxBatch
    ON ins.[Year] = maxBatch.[Year]
   AND ins.[Month] = maxBatch.[Month]
   AND ins.[Batch] = maxBatch.MaxBatch
  WHERE
    (
      (@from IS NOT NULL AND @to IS NOT NULL AND
        TRY_CONVERT(date, CONCAT(ins.[Year], '-', RIGHT('00'+CAST(ins.[Month] AS varchar(2)),2), '-01'))
          BETWEEN @from AND EOMONTH(@to)
      )
    ) OR (
      (@from IS NULL OR @to IS NULL) AND
      (@year IS NULL OR ins.[Year] = @year) AND
      (@month IS NULL OR ins.[Month] = @month)
    )
)
SELECT
  LEFT(d.AGENTE, 1) AS Agente,
  fo.[Year] AS Anno,
  fo.[Month] AS Mese,
  CAST(fo.[Year] AS VARCHAR(4)) + '/' + RIGHT('00' + CAST(fo.[Month] AS VARCHAR(2)), 2) AS AnnoMese,
  SUM(CASE WHEN fo.TIPO_Fastweb = 'MOBILE' THEN 1 ELSE 0 END) AS Mobile_FW,
  SUM(CASE WHEN fo.TIPO_Fastweb = 'FISSO' THEN 1 ELSE 0 END) AS Fissi_FW,
  CONVERT(date, MAX(fo.[Batch]), 120) AS DataAggiornamento
FROM CTE_FilteredOrdini AS fo
LEFT JOIN dbo.tbDealers AS d
  ON (fo.[Codice Comsy Tecnico Attuale] = d.COMSY1 AND d.COMSY1 LIKE 'NR.1217%')
  OR (fo.[Codice Comsy Tecnico Attuale] = d.COMSY2 AND d.COMSY2 LIKE 'NS.1638%')
WHERE
  (@agente IS NULL OR LEFT(d.AGENTE, 1) = @agente)
GROUP BY LEFT(d.AGENTE, 1), fo.[Year], fo.[Month]
ORDER BY fo.[Year] DESC, fo.[Month] DESC, Agente ASC;
`;

    const result = await request.query(query);
    const rows = result.recordset || [];
    const summary = rows.reduce((acc, r) => {
      acc.Mobile_FW += Number(r.Mobile_FW || 0);
      acc.Fissi_FW += Number(r.Fissi_FW || 0);
      return acc;
    }, { Mobile_FW: 0, Fissi_FW: 0 });
    summary.Totale = summary.Mobile_FW + summary.Fissi_FW;

    return res.json({ success: true, filters: { year, month, from, to, agente }, rows, summary });
  } catch (err) {
    console.error('[SUPERMASTER FASTWEB][agente-mensile] Errore:', err);
    return res.status(500).json({ error: 'Errore nel recupero dati', details: err.message });
  }
});

// GET /api/supermaster/fastweb/quality-ranking
// Query params:
//  - scope: DEALER | AGENTE (default DEALER)
//  - year, month: numeri opzionali
router.get('/quality-ranking', authenticateToken, onlySupermaster, async (req, res) => {
  try {
    const scopeParam = (req.query.scope || 'DEALER').toString().trim().toUpperCase();
    const scope = ['DEALER', 'AGENTE'].includes(scopeParam) ? scopeParam : 'DEALER';
    const year = Number(req.query.year);
    const month = Number(req.query.month);

    const pool = await sql.connect();
    const request = pool.request();
    request.input('Scope', sql.NVarChar, scope);
    request.input('Year', sql.Int, Number.isFinite(year) ? year : null);
    request.input('Month', sql.Int, Number.isFinite(month) ? month : null);

    const result = await request.execute('dbo.sp_fastweb_quality_ranking');
    const rows = result.recordset || [];

    return res.json({ success: true, scope, year: Number.isFinite(year) ? year : null, month: Number.isFinite(month) ? month : null, rows });
  } catch (err) {
    console.error('[SUPERMASTER FASTWEB][quality-ranking] Errore:', err);
    return res.status(500).json({ error: 'Errore nel recupero ranking qualità', details: err.message });
  }
});

export default router;
