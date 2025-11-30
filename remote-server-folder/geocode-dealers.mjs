import sql from 'mssql';
import https from 'https';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Carica variabili d'ambiente
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '.env') });

// Configurazione database (stessa del backend)
const dbConfig = {
  server: process.env.DB_SERVER || 'localhost',
  database: process.env.DB_NAME || 'KAM_2',
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  options: {
    encrypt: true,
    trustServerCertificate: true,
    enableArithAbort: true,
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
};

console.log('[GEOCODE] Config:', {
  server: dbConfig.server,
  database: dbConfig.database,
  user: dbConfig.user ? '***' : 'undefined'
});

// Funzione per geocodificare un indirizzo usando Nominatim (OpenStreetMap)
async function geocodeAddress(indirizzo, cap, citta, provincia) {
  // Prova con fallback progressivi
  const attempts = [
    // 1. Indirizzo completo
    [indirizzo, cap, citta, provincia, 'Italia'].filter(Boolean),
    // 2. Solo città, provincia, Italia
    [citta, provincia, 'Italia'].filter(Boolean),
    // 3. Solo città, Italia
    [citta, 'Italia'].filter(Boolean)
  ];
  
  for (const parts of attempts) {
    if (parts.length === 0) continue;
    
    const query = encodeURIComponent(parts.join(', '));
    const url = `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1`;
    
    console.log(`[GEOCODE] Query: ${parts.join(', ')}`);
    
    const result = await new Promise((resolve) => {
      https.get(url, {
        headers: {
          'User-Agent': 'KimWeb-Station-CRM/1.0'
        }
      }, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          try {
            const results = JSON.parse(data);
            if (results && results.length > 0) {
              const lat = parseFloat(results[0].lat);
              const lon = parseFloat(results[0].lon);
              console.log(`[GEOCODE] ✓ Trovato: ${lat}, ${lon}`);
              resolve({ lat, lon });
            } else {
              resolve(null);
            }
          } catch (err) {
            console.error(`[GEOCODE] Errore parsing:`, err.message);
            resolve(null);
          }
        });
      }).on('error', (err) => {
        console.error(`[GEOCODE] Errore HTTP:`, err.message);
        resolve(null);
      });
    });
    
    if (result) return result;
  }
  
  console.log(`[GEOCODE] ✗ Nessun risultato dopo tutti i tentativi`);
  return null;
}

// Funzione per attendere (rate limiting)
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  try {
    console.log('[GEOCODE] Connessione al database...');
    await sql.connect(dbConfig);
    console.log('[GEOCODE] Connesso!');
    
    // Recupera tutti i dealer senza coordinate
    const result = await sql.query`
      SELECT 
        IDDealer,
        RagioneSociale,
        Indirizzo,
        CAP,
        Citta,
        Provincia,
        Latitudine,
        Longitudine
      FROM dbo.tbDealers
      WHERE (Latitudine IS NULL OR Longitudine IS NULL)
        AND Citta IS NOT NULL
      ORDER BY IDDealer
    `;
    
    const dealers = result.recordset;
    console.log(`[GEOCODE] Trovati ${dealers.length} dealer da geocodificare\n`);
    
    let success = 0;
    let failed = 0;
    
    for (let i = 0; i < dealers.length; i++) {
      const dealer = dealers[i];
      console.log(`\n[${i + 1}/${dealers.length}] ${dealer.RagioneSociale} (ID: ${dealer.IDDealer})`);
      
      // Geocodifica
      const coords = await geocodeAddress(
        dealer.Indirizzo,
        dealer.CAP,
        dealer.Citta,
        dealer.Provincia
      );
      
      if (coords) {
        // Aggiorna database
        await sql.query`
          UPDATE dbo.tbDealers
          SET Latitudine = ${coords.lat},
              Longitudine = ${coords.lon}
          WHERE IDDealer = ${dealer.IDDealer}
        `;
        console.log(`[GEOCODE] ✓ Aggiornato dealer ${dealer.IDDealer}`);
        success++;
      } else {
        console.log(`[GEOCODE] ✗ Impossibile geocodificare dealer ${dealer.IDDealer}`);
        failed++;
      }
      
      // Rate limiting: 1 richiesta al secondo (policy Nominatim)
      if (i < dealers.length - 1) {
        await sleep(1000);
      }
    }
    
    console.log(`\n[GEOCODE] Completato!`);
    console.log(`[GEOCODE] Successo: ${success}`);
    console.log(`[GEOCODE] Falliti: ${failed}`);
    
    await sql.close();
    process.exit(0);
    
  } catch (err) {
    console.error('[GEOCODE] Errore:', err);
    process.exit(1);
  }
}

main();
