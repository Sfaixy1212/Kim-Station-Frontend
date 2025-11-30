import express from 'express';
import sql from 'mssql';
import { authenticateToken } from './auth-middleware.mjs';
import { withCache } from './redis-client.mjs';

const router = express.Router();

// Solo SUPERMASTER (o MASTER)
function onlySupermaster(req, res, next) {
  const roles = (req.user?.ruoli || []).map(r => String(r).toUpperCase());
  if (roles.includes('SUPERMASTER') || roles.includes('MASTER')) return next();
  return res.status(403).json({ error: 'Accesso riservato ai SUPERMASTER' });
}

// GET /api/supermaster/reports
// Lista dei report dinamici disponibili per ruolo 'AD'
router.get('/', authenticateToken, onlySupermaster, async (_req, res) => {
  try {
    const cacheKey = 'reports:list:AD';
    
    const result = await withCache(cacheKey, 1800, async () => {
      // 1800 secondi = 30 minuti
      const pool = await sql.connect();
      const dbResult = await pool.request()
        .input('ruolo', sql.NVarChar, 'AD')
        .query(`SELECT ID, Titolo, Descrizione, Ruolo, Ordine FROM dbo.tbDynamicReports WHERE Ruolo LIKE @ruolo ORDER BY Ordine, ID`);
      return { success: true, rows: dbResult.recordset || [] };
    });
    
    res.json(result);
  } catch (err) {
    console.error('[SUPERMASTER REPORTS][LIST] Errore:', err);
    res.status(500).json({ error: 'Errore nel recupero elenco report', details: err.message });
  }
});

// GET /api/supermaster/reports/:id
// Esegue la query associata al report (SOLO READ-ONLY)
router.get('/:id', authenticateToken, onlySupermaster, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'ID non valido' });

    // Cache key include ID report e parametri query
    const cacheKey = `reports:exec:${id}:${JSON.stringify(req.query)}`;
    
    const result = await withCache(cacheKey, 900, async () => {
      // 900 secondi = 15 minuti
      return await executeReport(id, req.query);
    });
    
    res.json(result);
  } catch (err) {
    console.error('[SUPERMASTER REPORTS][EXEC] Errore:', err);
    res.status(500).json({ error: 'Errore esecuzione report', details: err.message });
  }
});

// Funzione helper per eseguire report (estratta per cache)
async function executeReport(id, queryParams) {
  const pool = await sql.connect();
  const qRes = await pool.request()
    .input('id', sql.Int, id)
    .query(`SELECT TOP 1 ID, Titolo, Descrizione, Query, Ruolo FROM dbo.tbDynamicReports WHERE ID = @id AND Ruolo LIKE 'AD'`);
  const row = qRes.recordset?.[0];
  if (!row) throw new Error('Report non trovato o non autorizzato');

  const rawQuery = String(row.Query || '').trim();
  if (!rawQuery) throw new Error('Query vuota');

  // Safety minima: blocca DML/DDL
  const upper = rawQuery.toUpperCase();
  const forbidden = ['UPDATE ', 'DELETE ', 'INSERT ', 'MERGE ', 'DROP ', 'ALTER ', 'TRUNCATE ', 'CREATE '];
  if (forbidden.some(k => upper.includes(k))) {
    throw new Error('Query non consentita (solo lettura)');
  }

  // Esecuzione diretta in read-only
  const request = pool.request();
  const U = rawQuery.toLowerCase();
  // Mappa parametri standard se presenti nella query
  const q = queryParams || {};
  const setIf = (needle, name, type, transform) => {
    if (U.includes(`@${needle}`)) {
      const valRaw = q[name] ?? q[needle];
      const val = transform ? transform(valRaw) : valRaw;
      request.input(needle, type, val === '' || val == null ? null : val);
    }
  };
  // year/month
  setIf('year', 'year', sql.Int, v => v != null ? parseInt(v, 10) : null);
  setIf('month', 'month', sql.Int, v => v != null ? parseInt(v, 10) : null);
  // from/to come date; accettiamo YYYY-MM o YYYY-MM-DD
  const toDate = v => {
    if (!v) return null;
    const s = String(v);
    if (/^\d{4}-\d{2}$/.test(s)) return `${s}-01`;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    return null;
  };
  setIf('from', 'from', sql.Date, toDate);
  setIf('to', 'to', sql.Date, toDate);
  // others
  setIf('agente', 'agente', sql.NVarChar, v => (v || '').toString().toUpperCase());
  setIf('provincia', 'provincia', sql.NVarChar, v => (v || '').toString().toUpperCase());
  setIf('point', 'point', sql.NVarChar, v => (v || '').toString());
  setIf('stato', 'stato', sql.Int, v => v != null ? parseInt(v, 10) : null);

  const execRes = await request.query(rawQuery);

  // Supporta più recordset (EXEC può restituire più tabelle)
  const recordsets = execRes.recordsets?.length ? execRes.recordsets : [execRes.recordset || []];
  return { success: true, id, titolo: row.Titolo, descrizione: row.Descrizione, recordsets };
}

export default router;
