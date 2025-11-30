import express from 'express';
import sql from 'mssql';
import { authenticateToken } from './auth-middleware.mjs';

const router = express.Router();

function onlySupermaster(req, res, next) {
  const roles = (req.user?.ruoli || []).map((r) => String(r).toUpperCase());
  if (roles.includes('SUPERMASTER') || roles.includes('MASTER')) return next();
  return res.status(403).json({ error: 'Accesso riservato ai SUPERMASTER' });
}

const RANGE_MONTHS = {
  '3m': 3,
  '6m': 6,
  '12m': 12,
};

function computeRange(period, range) {
  const today = new Date();
  const validPeriod = /^\d{4}-\d{2}$/.test(period || '') ? period : null;
  const base = validPeriod
    ? new Date(Number(period.slice(0, 4)), Number(period.slice(5, 7)) - 1, 1)
    : new Date(today.getFullYear(), today.getMonth(), 1);
  const monthsBack = RANGE_MONTHS[range] || RANGE_MONTHS['6m'];
  const fromDate = new Date(base.getFullYear(), base.getMonth() - (monthsBack - 1), 1);
  return {
    from: `${fromDate.getFullYear()}-${String(fromDate.getMonth() + 1).padStart(2, '0')}-01`,
    to: `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, '0')}-01`,
    monthsBack,
  };
}

function normalizeFilters(query) {
  return {
    period: query.period || null,
    range: query.range || '6m',
    operator: query.operator || 'all',
    segment: query.segment || 'all',
    province: query.province || 'all',
    page: Math.max(1, parseInt(query.page, 10) || 1),
    pageSize: Math.min(50, Math.max(5, parseInt(query.pageSize, 10) || 15)),
  };
}

function applyCommonFilters(request, filters, rangeInfo) {
  request.input('from', sql.Date, rangeInfo.from);
  request.input('to', sql.Date, rangeInfo.to);
  request.input('operator', sql.NVarChar, filters.operator === 'all' ? null : filters.operator.toUpperCase());
  request.input('segment', sql.NVarChar, filters.segment === 'all' ? null : filters.segment.toUpperCase());
  request.input('province', sql.NVarChar, filters.province === 'all' ? null : filters.province.toUpperCase());
}

async function getOverview(pool, filters) {
  const rangeInfo = computeRange(filters.period, filters.range);
  const request = pool.request();
  applyCommonFilters(request, filters, rangeInfo);
  const result = await request.execute('dbo.sp_supermaster_dealer_dashboard_overview');
  const recordsets = result.recordsets || [];
  return {
    summary: recordsets[0]?.[0] || {},
    topDealers: recordsets[1] || [],
    bottomDealers: recordsets[2] || [],
    alerts: recordsets[3] || [],
  };
}

async function getRanking(pool, filters) {
  const rangeInfo = computeRange(filters.period, filters.range);
  const offset = (filters.page - 1) * filters.pageSize;
  const request = pool.request();
  applyCommonFilters(request, filters, rangeInfo);
  request.input('offset', sql.Int, offset);
  request.input('limit', sql.Int, filters.pageSize);
  request.output('TotalCount', sql.Int);
  const result = await request.execute('dbo.sp_supermaster_dealer_dashboard_ranking');
  return {
    rows: result.recordset || [],
    total: result.output.TotalCount ?? (result.recordset?.length || 0),
    page: filters.page,
    pageSize: filters.pageSize,
  };
}

async function getTrend(pool, filters) {
  const rangeInfo = computeRange(filters.period, filters.range);
  const request = pool.request();
  applyCommonFilters(request, filters, rangeInfo);
  const result = await request.execute('dbo.sp_supermaster_dealer_dashboard_trend');
  const recordsets = result.recordsets || [];
  return {
    series: recordsets[0] || [],
    distribution: recordsets[1] || [],
    monthsBack: rangeInfo.monthsBack,
  };
}

async function getDealerDetail(pool, dealerId, filters) {
  const rangeInfo = computeRange(filters.period, filters.range);
  const request = pool.request();
  request.input('dealerId', sql.Int, dealerId);
  applyCommonFilters(request, filters, rangeInfo);
  const result = await request.execute('dbo.sp_supermaster_dealer_dashboard_detail');
  const recordsets = result.recordsets || [];
  return {
    kpi: recordsets[0]?.[0] || {},
    trend: recordsets[1] || [],
    mix: recordsets[2] || [],
  };
}

router.use(authenticateToken, onlySupermaster);

router.get('/overview', async (req, res) => {
  try {
    const filters = normalizeFilters(req.query);
    const pool = await sql.connect();
    const payload = await getOverview(pool, filters);
    res.json(payload);
  } catch (err) {
    console.error('[SM][DealerDashboard][overview] Error:', err);
    res.status(500).json({ error: 'Errore nel recupero dell\'overview dealer' });
  }
});

router.get('/ranking', async (req, res) => {
  try {
    const filters = normalizeFilters(req.query);
    const pool = await sql.connect();
    const payload = await getRanking(pool, filters);
    res.json(payload);
  } catch (err) {
    console.error('[SM][DealerDashboard][ranking] Error:', err);
    res.status(500).json({ error: 'Errore nel recupero della classifica dealer' });
  }
});

router.get('/trend', async (req, res) => {
  try {
    const filters = normalizeFilters(req.query);
    const pool = await sql.connect();
    const payload = await getTrend(pool, filters);
    res.json(payload);
  } catch (err) {
    console.error('[SM][DealerDashboard][trend] Error:', err);
    res.status(500).json({ error: 'Errore nel recupero del trend dealer' });
  }
});

router.get('/dealer/:id', async (req, res) => {
  try {
    const dealerId = parseInt(req.params.id, 10);
    if (!Number.isFinite(dealerId)) {
      return res.status(400).json({ error: 'ID dealer non valido' });
    }
    const filters = normalizeFilters(req.query);
    const pool = await sql.connect();
    const payload = await getDealerDetail(pool, dealerId, filters);
    res.json(payload);
  } catch (err) {
    console.error('[SM][DealerDashboard][detail] Error:', err);
    res.status(500).json({ error: 'Errore nel recupero del dettaglio dealer' });
  }
});

router.get('/export', async (req, res) => {
  try {
    const filters = normalizeFilters(req.query);
    const pool = await sql.connect();
    const rangeInfo = computeRange(filters.period, filters.range);
    const request = pool.request();
    applyCommonFilters(request, filters, rangeInfo);
    const result = await request.execute('dbo.sp_supermaster_dealer_dashboard_export');
    const rows = result.recordset || [];

    const header = Object.keys(rows[0] || {});
    const csvRows = [header.join(';')];
    for (const row of rows) {
      const line = header.map((key) => {
        const value = row[key];
        if (value == null) return '';
        if (typeof value === 'number') return String(value).replace('.', ',');
        return String(value).replace(/"/g, '""');
      }).join(';');
      csvRows.push(line);
    }

    const csv = csvRows.join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="dealer_dashboard.csv"');
    res.send(`\uFEFF${csv}`);
  } catch (err) {
    console.error('[SM][DealerDashboard][export] Error:', err);
    res.status(500).json({ error: 'Errore nell\'export dealer' });
  }
});

export default router;
