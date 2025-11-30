import sql from 'mssql';

// Funzione helper per determinare il database corretto
export function getDbName() {
  // Se DB_NAME è definito nel .env, usalo (priorità massima)
  if (process.env.DB_NAME && process.env.DB_NAME.trim() !== '') {
    return process.env.DB_NAME.trim();
  }
  
  // Fallback intelligente basato sulla porta o ambiente
  const port = process.env.PORT || '3001';
  if (port === '3002') {
    return 'KAM'; // Produzione
  } else {
    return 'KAM_2'; // Staging/Development
  }
}

// Funzione per creare dbConfig dinamicamente (lazy loading)
function createDbConfig() {
  return {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    port: parseInt(process.env.DB_PORT || '1433', 10),
    database: getDbName(),
    options: {
      encrypt: true,
      trustServerCertificate: true,
      enableArithAbort: true,
      connectTimeout: 15000,
      requestTimeout: 120000,
      validateBulkLoadParameters: false,
      useUTC: false,
      abortTransactionOnError: false,
      enableAnsiNullDefault: true,
      appName: 'kim-backend',
      cryptoCredentialsDetails: {
        minVersion: 'TLSv1.2'
      }
    },
    pool: {
      max: 10,
      min: 2,
      idleTimeoutMillis: 30000,
    },
  };
}

// Export dbConfig come getter per lazy loading
export const dbConfig = new Proxy({}, {
  get(target, prop) {
    if (!target._initialized) {
      Object.assign(target, createDbConfig());
      target._initialized = true;
    }
    return target[prop];
  }
});

let globalPool = null;
let isConnecting = false;

/**
 * Ottiene il pool di connessione globale.
 * Se non esiste o è chiuso, lo ricrea automaticamente.
 * @returns {Promise<sql.ConnectionPool>}
 */
export async function getPool() {
  // Se il pool esiste ed è connesso, restituiscilo
  if (globalPool && globalPool.connected) {
    return globalPool;
  }

  // Se stiamo già connettendo, aspetta
  if (isConnecting) {
    await new Promise(resolve => setTimeout(resolve, 100));
    return getPool(); // Riprova
  }

  // Crea nuova connessione
  isConnecting = true;
  try {
    console.log('[DB-POOL] Creazione nuovo pool di connessione...');
    console.log('[DB-POOL] Config:', {
      server: dbConfig.server,
      database: dbConfig.database,
      user: dbConfig.user ? 'SET' : 'NOT SET'
    });
    globalPool = await sql.connect(dbConfig);
    
    // Gestione eventi del pool
    globalPool.on('error', err => {
      console.error('[DB-POOL] Errore pool:', err);
      globalPool = null; // Forza riconnessione al prossimo utilizzo
    });

    console.log('[DB-POOL] Pool connesso con successo');
    return globalPool;
  } catch (err) {
    console.error('[DB-POOL] Errore connessione:', err);
    globalPool = null;
    throw err;
  } finally {
    isConnecting = false;
  }
}

/**
 * Crea una nuova Request usando il pool globale.
 * Gestisce automaticamente la riconnessione se necessario.
 * @returns {Promise<sql.Request>}
 */
export async function getRequest() {
  const pool = await getPool();
  return pool.request();
}

/**
 * Chiude il pool globale (solo per shutdown applicazione).
 */
export async function closePool() {
  if (globalPool) {
    try {
      await globalPool.close();
      console.log('[DB-POOL] Pool chiuso');
    } catch (err) {
      console.error('[DB-POOL] Errore chiusura pool:', err);
    } finally {
      globalPool = null;
    }
  }
}

// Export sql per compatibilità (dbConfig già esportato sopra)
export { sql };
