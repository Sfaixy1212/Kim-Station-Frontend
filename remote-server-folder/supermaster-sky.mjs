import express from 'express';
import sql from 'mssql';
import { authenticateToken } from './auth-middleware.mjs';

const router = express.Router();

function onlySupermaster(req, res, next) {
  const roles = (req.user?.ruoli || []).map(r => String(r).toUpperCase());
  if (roles.includes('SUPERMASTER') || roles.includes('MASTER')) return next();
  return res.status(403).json({ error: 'Accesso riservato ai SUPERMASTER' });
}

// GET /api/supermaster/sky/quality-ranking
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

    const result = await request.execute('dbo.sp_sky_quality_ranking');
    const rows = result.recordset || [];

    return res.json({
      success: true,
      scope,
      year: Number.isFinite(year) ? year : null,
      month: Number.isFinite(month) ? month : null,
      rows
    });
  } catch (err) {
    console.error('[SUPERMASTER SKY][quality-ranking] Errore:', err);
    return res.status(500).json({ error: 'Errore nel recupero ranking SKY', details: err.message });
  }
});

// GET /api/supermaster/sky/trend
// Query params:
//  - scope: DEALER | AGENTE (default DEALER)
//  - monthsBack: numero mesi da includere (default 6)
router.get('/trend', authenticateToken, onlySupermaster, async (req, res) => {
  try {
    const scopeParam = (req.query.scope || 'DEALER').toString().trim().toUpperCase();
    const scope = ['DEALER', 'AGENTE'].includes(scopeParam) ? scopeParam : 'DEALER';
    const monthsBackParam = Number(req.query.monthsBack);
    const monthsBack = Number.isFinite(monthsBackParam) && monthsBackParam > 0 ? monthsBackParam : 6;

    const pool = await sql.connect();
    const request = pool.request();
    request.input('Scope', sql.NVarChar, scope);
    request.input('MonthsBack', sql.Int, monthsBack);

    const result = await request.execute('dbo.sp_sky_quality_trend');
    const rows = result.recordset || [];

    return res.json({ success: true, scope, monthsBack, rows });
  } catch (err) {
    console.error('[SUPERMASTER SKY][trend] Errore:', err);
    return res.status(500).json({ error: 'Errore nel recupero trend SKY', details: err.message });
  }
});

export default router;
