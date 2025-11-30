/**
 * Redis Client Utility per Station
 * Con fallback automatico e gestione errori sicura
 */

import { createClient } from 'redis';

// Feature flag per attivare/disattivare Redis
const REDIS_ENABLED = process.env.REDIS_ENABLED !== 'false'; // Default: true

// Configurazione Redis
const REDIS_CONFIG = {
  socket: {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: process.env.REDIS_PORT || 6379,
  },
  // Timeout per evitare blocchi
  socket: {
    connectTimeout: 5000,
    reconnectStrategy: (retries) => {
      if (retries > 10) {
        console.error('Redis: troppi tentativi di riconnessione, disabilito cache');
        return false; // Stop reconnecting
      }
      return Math.min(retries * 100, 3000); // Exponential backoff
    }
  }
};

// Client Redis singleton
let redisClient = null;
let isRedisReady = false;

/**
 * Inizializza il client Redis
 */
async function initRedis() {
  if (!REDIS_ENABLED) {
    console.log('Redis: disabilitato via REDIS_ENABLED=false');
    return null;
  }

  if (redisClient) {
    return redisClient;
  }

  try {
    redisClient = createClient(REDIS_CONFIG);

    // Event handlers
    redisClient.on('error', (err) => {
      console.error('Redis Error:', err.message);
      isRedisReady = false;
    });

    redisClient.on('ready', () => {
      console.log('✓ Redis connesso e pronto');
      isRedisReady = true;
    });

    redisClient.on('reconnecting', () => {
      console.log('Redis: tentativo di riconnessione...');
      isRedisReady = false;
    });

    redisClient.on('end', () => {
      console.log('Redis: connessione chiusa');
      isRedisReady = false;
    });

    // Connessione
    await redisClient.connect();
    
    // Test ping
    await redisClient.ping();
    console.log('✓ Redis: PING OK');
    
    return redisClient;
  } catch (err) {
    console.error('Redis: errore inizializzazione:', err.message);
    console.log('Redis: continuo senza cache');
    redisClient = null;
    isRedisReady = false;
    return null;
  }
}

/**
 * Wrapper sicuro per operazioni Redis con fallback
 * @param {string} key - Chiave Redis
 * @param {number} ttl - Time to live in secondi
 * @param {Function} fetchFn - Funzione per recuperare dati dal DB
 * @returns {Promise<any>} - Dati dalla cache o dal DB
 */
async function withCache(key, ttl, fetchFn) {
  // Se Redis non è abilitato o non pronto, usa direttamente il DB
  if (!REDIS_ENABLED || !isRedisReady || !redisClient) {
    return await fetchFn();
  }

  try {
    // 1. Prova a leggere dalla cache
    const cached = await redisClient.get(key);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (err) {
    console.warn(`Redis GET error per ${key}:`, err.message);
    // Continua con il DB
  }

  // 2. Recupera dal DB
  const data = await fetchFn();

  // 3. Salva in cache (non bloccare la risposta se fallisce)
  if (isRedisReady && redisClient) {
    try {
      await redisClient.setEx(key, ttl, JSON.stringify(data));
    } catch (err) {
      console.warn(`Redis SET error per ${key}:`, err.message);
      // Non blocca la risposta
    }
  }

  return data;
}

/**
 * Invalida una chiave o pattern dalla cache
 * @param {string} keyOrPattern - Chiave o pattern (es: "compensi:*")
 */
async function invalidateCache(keyOrPattern) {
  if (!isRedisReady || !redisClient) {
    return;
  }

  try {
    if (keyOrPattern.includes('*')) {
      // Pattern: trova tutte le chiavi e cancellale
      const keys = await redisClient.keys(keyOrPattern);
      if (keys.length > 0) {
        await redisClient.del(keys);
        console.log(`Redis: invalidate ${keys.length} chiavi con pattern ${keyOrPattern}`);
      }
    } else {
      // Singola chiave
      await redisClient.del(keyOrPattern);
      console.log(`Redis: invalidata chiave ${keyOrPattern}`);
    }
  } catch (err) {
    console.warn(`Redis invalidate error:`, err.message);
  }
}

/**
 * Ottieni statistiche Redis
 */
async function getStats() {
  if (!isRedisReady || !redisClient) {
    return { enabled: false, ready: false };
  }

  try {
    const info = await redisClient.info('stats');
    const memory = await redisClient.info('memory');
    return {
      enabled: REDIS_ENABLED,
      ready: isRedisReady,
      info: info,
      memory: memory
    };
  } catch (err) {
    console.warn('Redis stats error:', err.message);
    return { enabled: REDIS_ENABLED, ready: false, error: err.message };
  }
}

/**
 * Chiudi connessione Redis (per graceful shutdown)
 */
async function closeRedis() {
  if (redisClient) {
    try {
      await redisClient.quit();
      console.log('Redis: connessione chiusa correttamente');
    } catch (err) {
      console.error('Redis: errore chiusura:', err.message);
    }
  }
}

// Esporta funzioni
export {
  initRedis,
  withCache,
  invalidateCache,
  getStats,
  closeRedis,
  isRedisReady
};

// Export default per compatibilità
export default {
  initRedis,
  withCache,
  invalidateCache,
  getStats,
  closeRedis
};
