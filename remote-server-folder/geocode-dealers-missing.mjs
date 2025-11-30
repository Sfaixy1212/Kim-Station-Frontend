// Script per geocodificare dealer senza coordinate usando città
import sql from 'mssql';
import 'dotenv/config';

const dbConfig = {
  server: process.env.DB_SERVER,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  options: {
    encrypt: true,
    trustServerCertificate: true,
    enableArithAbort: true
  }
};

// Geocode usando Nominatim (OpenStreetMap)
async function geocodeCity(city, provincia) {
  const query = `${city}, ${provincia}, Italy`;
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`;
  
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'KIM-Station/1.0'
      }
    });
    
    if (!response.ok) {
      console.error(`Geocoding failed for "${query}": ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    
    if (data && data.length > 0) {
      return {
        lat: parseFloat(data[0].lat),
        lon: parseFloat(data[0].lon)
      };
    }
    
    return null;
  } catch (err) {
    console.error(`Error geocoding "${query}":`, err.message);
    return null;
  }
}

async function geocodeDealers() {
  try {
    console.log('🔌 Connessione al database...');
    await sql.connect(dbConfig);
    
    // Recupera tutti i dealer senza coordinate ma con città
    const result = await sql.query`
      SELECT 
        IDDealer,
        RagioneSociale,
        Indirizzo,
        Citta,
        Provincia,
        Latitudine,
        Longitudine
      FROM dbo.tbDealers
      WHERE Citta IS NOT NULL
        AND (Latitudine IS NULL OR Longitudine IS NULL OR Latitudine = 0 OR Longitudine = 0)
      ORDER BY IDDealer
    `;
    
    const dealers = result.recordset;
    console.log(`📍 Trovati ${dealers.length} dealer da geocodificare\n`);
    
    if (dealers.length === 0) {
      console.log('✅ Nessun dealer da geocodificare');
      return;
    }
    
    let updated = 0;
    let failed = 0;
    
    for (const dealer of dealers) {
      const city = dealer.Citta || '';
      const provincia = dealer.Provincia || '';
      
      console.log(`🔍 Geocoding: ${dealer.RagioneSociale} - ${city}`);
      
      if (!city) {
        console.log(`   ⚠️  Città mancante, skip\n`);
        failed++;
        continue;
      }
      
      const coords = await geocodeCity(city, provincia);
      
      if (coords) {
        // Aggiorna coordinate
        await sql.query`
          UPDATE dbo.tbDealers
          SET Latitudine = ${coords.lat},
              Longitudine = ${coords.lon}
          WHERE IDDealer = ${dealer.IDDealer}
        `;
        
        console.log(`   ✅ Aggiornato: ${coords.lat}, ${coords.lon}\n`);
        updated++;
      } else {
        console.log(`   ❌ Geocoding fallito\n`);
        failed++;
      }
      
      // Rate limiting: 1 richiesta al secondo per rispettare i limiti di Nominatim
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log('\n📊 Riepilogo:');
    console.log(`   ✅ Aggiornati: ${updated}`);
    console.log(`   ❌ Falliti: ${failed}`);
    
  } catch (err) {
    console.error('❌ Errore:', err);
  } finally {
    await sql.close();
  }
}

// Esegui
geocodeDealers();
