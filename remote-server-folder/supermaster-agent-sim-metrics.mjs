import express from 'express';
import sql from 'mssql';
import { authenticateToken } from './auth-middleware.mjs';

const router = express.Router();

// Middleware: solo SUPERMASTER/MASTER
function onlySupermaster(req, res, next) {
  const roles = (req.user?.ruoli || []).map(r => String(r).toUpperCase());
  if (roles.includes('SUPERMASTER')) return next();
  return res.status(403).json({ error: 'Accesso riservato ai SUPERMASTER' });
}

// GET /api/supermaster/agent-sim-metrics?year=YYYY&month=MM
router.get('/', authenticateToken, onlySupermaster, async (req, res) => {
  try {
    const year = parseInt(req.query.year, 10);
    const month = parseInt(req.query.month, 10);

    if (!year || !month || isNaN(year) || isNaN(month)) {
      return res.status(400).json({ error: 'Parametri mancanti o non validi', details: 'year e month sono obbligatori' });
    }

    // Connessione
    const pool = await sql.connect();
    const request = pool.request();
    request.input('year', sql.Int, year);
    request.input('month', sql.Int, month);

    // Esegue la SP mensile multi-agente
    const result = await request.execute('dbo.sp_report_fastweb_mese_multi');

    // La SP può restituire uno o più recordset. Prendiamo il principale.
    const rows = (result.recordset && result.recordset.length ? result.recordset : (result.recordsets && result.recordsets[0]) || []) || [];

    // Mappatura sicura dei campi richiesti
    const data = rows.map(r => {
      // Nome agente: prova varie colonne comuni, fallback stringa vuota
      const agente = (
        r.agente || r.Agente || r.NomeAgente || r.Nome || r.nome || r.AGENTE || ''
      );
      const ra = Number(r.tlc_mobile_ra_inseriti ?? r.TLC_MOBILE_RA_INSERITI ?? r.RA ?? 0) || 0;
      const rp = Number(r.tlc_mobile_rp_inseriti ?? r.TLC_MOBILE_RP_INSERITI ?? r.RP ?? 0) || 0;

      return {
        agente: String(agente).toString().trim(),
        year,
        month,
        tlc_mobile_ra_inseriti: ra,
        tlc_mobile_rp_inseriti: rp,
        // Manteniamo anche la riga grezza per eventuali estensioni frontend
        _raw: r
      };
    });

    return res.json({ success: true, year, month, count: data.length, data });
  } catch (err) {
    console.error('[SUPERMASTER SIM METRICS] Errore:', err);
    return res.status(500).json({ success: false, error: 'Errore recupero SIM metrics', details: err.message });
  }
});

export default router;
