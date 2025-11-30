// Script per geocodificare automaticamente i point non affiliati usando Nominatim
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
async function geocodeAddress(address, city, provincia) {
  const query = `${address}, ${city}, ${provincia}, Italy`;
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

async function geocodePointsNonAffiliati() {
  try {
    console.log('🔌 Connessione al database...');
    await sql.connect(dbConfig);
    
    // Recupera tutti i point non affiliati con indirizzo (forza re-geocoding di tutti)
    const result = await sql.query`
      SELECT 
        ID,
        RagioneSociale,
        IndirizzoCompleto,
        Citta,
        Provincia,
        Latitudine,
        Longitudine
      FROM dbo.tbAgendaPointNonAffiliati
      WHERE Citta IS NOT NULL
      ORDER BY ID
    `;
    
    const points = result.recordset;
    console.log(`📍 Trovati ${points.length} point da geocodificare\n`);
    
    if (points.length === 0) {
      console.log('✅ Nessun point da geocodificare');
      return;
    }
    
    let updated = 0;
    let failed = 0;
    
    for (const point of points) {
      const address = point.IndirizzoCompleto || '';
      const city = point.Citta || '';
      const provincia = point.Provincia || '';
      
      console.log(`🔍 Geocoding: ${point.RagioneSociale} - ${city}`);
      
      if (!city) {
        console.log(`   ⚠️  Città mancante, skip\n`);
        failed++;
        continue;
      }
      
      const coords = await geocodeAddress(address, city, provincia);
      
      if (coords) {
        // Aggiorna coordinate
        await sql.query`
          UPDATE dbo.tbAgendaPointNonAffiliati
          SET Latitudine = ${coords.lat},
              Longitudine = ${coords.lon}
          WHERE ID = ${point.ID}
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
geocodePointsNonAffiliati();
