import express from 'express';
import sql from 'mssql';
import { authenticateToken } from './auth-middleware.mjs';

const router = express.Router();

// Middleware: solo MASTERPRODOTTI
function onlyMasterProdotti(req, res, next) {
  const roles = (req.user?.ruoli || []).map(r => String(r).toUpperCase());
  if (roles.includes('MASTERPRODOTTI') || roles.includes('SUPERMASTER') || roles.includes('MASTER')) {
    return next();
  }
  return res.status(403).json({ error: 'Accesso riservato ai MasterProdotti' });
}

// GET /api/masterprodotti/plafond/:dealerId
// Recupera il credito plafond per un dealer specifico
router.get('/:dealerId', authenticateToken, onlyMasterProdotti, async (req, res) => {
  try {
    const dealerId = parseInt(req.params.dealerId, 10);
    
    if (!dealerId || isNaN(dealerId)) {
      return res.status(400).json({ error: 'dealerId non valido' });
    }

    console.log(`[MASTERPRODOTTI PLAFOND] Richiesta plafond per dealer: ${dealerId}`);

    // Query per calcolare il plafond (somma di tutte le transazioni)
    const result = await new sql.Request()
      .input('DealerId', sql.Int, dealerId)
      .query(`
        SELECT 
          ISNULL(SUM(t.crediti), 0) AS credito,
          @DealerId AS dealerId
        FROM dbo.tbtransazioni t
        WHERE t.iddealer = @DealerId
      `);

    const data = result.recordset?.[0];
    
    if (!data) {
      return res.status(404).json({ error: 'Dealer non trovato' });
    }

    const credito = Number(data.credito) || 0;

    console.log(`[MASTERPRODOTTI PLAFOND] Credito per dealer ${dealerId}: €${credito}`);

    res.json({
      dealerId: dealerId,
      credito: credito
    });

  } catch (err) {
    console.error('[MASTERPRODOTTI PLAFOND] Errore:', err);
    res.status(500).json({ 
      error: 'Errore nel recupero del plafond', 
      details: err.message 
    });
  }
});

export default router;
