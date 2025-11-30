/**
 * ESEMPIO: Come usare Redis per cache compensi agenti
 * 
 * Questo file mostra come integrare Redis nel codice esistente
 * per cachare i compensi degli agenti
 */

import { withCache, invalidateCache } from './redis-client.mjs';
import { getRequest } from './db-pool.mjs';

/**
 * ESEMPIO 1: Cache compensi mensili aggregati
 * 
 * Endpoint: GET /api/supermaster/compensi-agenti
 */
async function getCompensiAgentiMese(agente, anno, mese) {
  const cacheKey = `compensi:${agente}:${anno}:${mese}`;
  const cacheTTL = 3600; // 1 ora

  return await withCache(cacheKey, cacheTTL, async () => {
    // Codice esistente - query al database
    const result = await (await getRequest()).query`
      EXEC sp_refresh_compensi_agenti_mese 
        @agente=${agente}, 
        @anno=${anno}, 
        @mese=${mese}
    `;
    
    return result.recordset;
  });
}

/**
 * ESEMPIO 2: Cache compensi dettaglio
 * 
 * Endpoint: GET /api/supermaster/compensi-agenti-dettaglio
 */
async function getCompensiAgentiDettaglio(agente, anno, mese) {
  const cacheKey = `compensi:dettaglio:${agente}:${anno}:${mese}`;
  const cacheTTL = 3600; // 1 ora

  return await withCache(cacheKey, cacheTTL, async () => {
    // Codice esistente - query al database
    const result = await (await getRequest()).query`
      EXEC sp_refresh_compensi_agenti_mese_dett 
        @agente=${agente}, 
        @anno=${anno}, 
        @mese=${mese}
    `;
    
    return result.recordset;
  });
}

/**
 * ESEMPIO 3: Invalidare cache quando cambiano i dati
 * 
 * Da chiamare quando:
 * - Viene inserita una nuova attivazione
 * - Viene modificato lo stato di un'attivazione
 * - Vengono aggiornati i compensi manualmente
 */
async function invalidateCompensiCache(agente = null, anno = null, mese = null) {
  if (agente && anno && mese) {
    // Invalida cache specifica
    await invalidateCache(`compensi:${agente}:${anno}:${mese}`);
    await invalidateCache(`compensi:dettaglio:${agente}:${anno}:${mese}`);
  } else if (agente) {
    // Invalida tutte le cache di un agente
    await invalidateCache(`compensi:${agente}:*`);
    await invalidateCache(`compensi:dettaglio:${agente}:*`);
  } else {
    // Invalida tutta la cache compensi
    await invalidateCache('compensi:*');
  }
}

/**
 * ESEMPIO 4: Come integrare in index.mjs
 * 
 * PRIMA (senza cache):
 * 
 * app.get('/api/supermaster/compensi-agenti', async (req, res) => {
 *   const { agente, anno, mese } = req.query;
 *   const result = await (await getRequest()).query`
 *     EXEC sp_refresh_compensi_agenti_mese @agente=${agente}...
 *   `;
 *   res.json(result.recordset);
 * });
 * 
 * DOPO (con cache):
 * 
 * app.get('/api/supermaster/compensi-agenti', async (req, res) => {
 *   const { agente, anno, mese } = req.query;
 *   const data = await getCompensiAgentiMese(agente, anno, mese);
 *   res.json(data);
 * });
 */

/**
 * ESEMPIO 5: Cache Dashboard KPI SuperMaster
 */
async function getDashboardKPI(filters) {
  const cacheKey = `dashboard:kpi:${JSON.stringify(filters)}`;
  const cacheTTL = 900; // 15 minuti

  return await withCache(cacheKey, cacheTTL, async () => {
    // Query pesante per KPI dashboard
    const result = await (await getRequest()).query`
      -- Query esistente per KPI
      SELECT * FROM vw_dashboard_kpi WHERE ...
    `;
    
    return result.recordset;
  });
}

/**
 * ESEMPIO 6: Rate Limiting per prevenire spam
 * 
 * Usa Redis per tracciare richieste e bloccare spam
 */
import { initRedis } from './redis-client.mjs';

async function rateLimitMiddleware(req, res, next) {
  const redis = await initRedis();
  if (!redis) {
    // Redis non disponibile, continua senza rate limiting
    return next();
  }

  const key = `ratelimit:${req.ip}:${req.path}`;
  const limit = 10; // Max 10 richieste
  const window = 60; // Per 60 secondi

  try {
    const current = await redis.incr(key);
    
    if (current === 1) {
      await redis.expire(key, window);
    }
    
    if (current > limit) {
      return res.status(429).json({ 
        error: 'Troppi tentativi. Riprova tra un minuto.' 
      });
    }
    
    next();
  } catch (err) {
    console.warn('Rate limit error:', err.message);
    next(); // Continua anche se Redis fallisce
  }
}

// Export per uso in altri file
export {
  getCompensiAgentiMese,
  getCompensiAgentiDettaglio,
  invalidateCompensiCache,
  getDashboardKPI,
  rateLimitMiddleware
};
