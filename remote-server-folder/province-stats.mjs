// API endpoint: /api/province-stats
// Espone tutti i dati della stored procedure Fastweb per il frontend
import express from 'express';
import sql from 'mssql';
import { authenticateToken } from './auth-middleware.mjs';

const router = express.Router();

router.get('/', authenticateToken, async (req, res) => {
  try {
    // Esegue la stored procedure Fastweb e restituisce tutti i dati
    const result = await sql.query(`EXEC [dbo].[sp_ReportProduzioneFastweb]`);
    res.json(result.recordset);
  } catch (err) {
    console.error('Errore SQL province-stats:', err);
    res.status(500).json({ error: 'Errore nel recupero dati province', details: err.message });
  }
});

export default router;
