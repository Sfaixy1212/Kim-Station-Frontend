import express from 'express';
import supermasterKpiRouter from './supermaster-kpi.mjs';
import { authenticateToken } from './auth-middleware.mjs';

const router = express.Router();

router.get('/kpi', authenticateToken, (req, res, next) => {
  const roles = (req.user?.ruoli || []).map((r) => String(r).toUpperCase());
  const role = String(req.user?.role || req.user?.ruolo || '').toUpperCase();
  if (role !== 'AGENTE' && !roles.includes('AGENTE')) {
    return res.status(403).json({ error: 'Accesso riservato agli agenti' });
  }

  const agente = req.user?.agenteNome || req.user?.nome || req.user?.email;
  if (!agente) {
    return res.status(400).json({ error: 'Profilo agente incompleto: agenteNome mancante' });
  }

  req.query = {
    ...req.query,
    agente,
  };

  return supermasterKpiRouter.handle(req, res, next);
});

export default router;
