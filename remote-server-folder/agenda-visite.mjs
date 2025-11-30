import express from 'express';
import sql from 'mssql';
import { authenticateToken } from './auth-middleware.mjs';
import { notificaNuovaVisita, verificaConfigurazioneWhatsApp } from './whatsapp-service.mjs';

const router = express.Router();

// Calcola percorso stradale usando OSRM
async function calcolaPercorsoStradale(coordinates) {
  // coordinates è un array di [lon, lat] (OSRM usa lon,lat non lat,lon!)
  const coordsString = coordinates.map(c => `${c[0]},${c[1]}`).join(';');
  const url = `https://router.project-osrm.org/route/v1/driving/${coordsString}?overview=full&geometries=geojson`;
  
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error('[OSRM] Errore routing:', response.status);
      return null;
    }
    
    const data = await response.json();
    if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
      const route = data.routes[0];
      return {
        distance: route.distance / 1000, // metri -> km
        duration: route.duration / 60, // secondi -> minuti
        geometry: route.geometry.coordinates // array di [lon, lat]
      };
    }
    
    return null;
  } catch (err) {
    console.error('[OSRM] Errore chiamata:', err.message);
    return null;
  }
}

// Calcola distanza tra due punti geografici (formula di Haversine)
function calcolaDistanzaKm(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return 0;
  
  const R = 6371; // Raggio della Terra in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Middleware: solo agenti
function onlyAgent(req, res, next) {
  const roles = (req.user?.ruoli || []).map(r => String(r).toUpperCase());
  if (roles.includes('AGENTE') || roles.includes('AGENT')) return next();
  return res.status(403).json({ error: 'Accesso riservato agli agenti' });
}

// Middleware: solo supermaster
function onlySupermaster(req, res, next) {
  const roles = (req.user?.ruoli || []).map(r => String(r).toUpperCase());
  if (roles.includes('SUPERMASTER')) return next();
  return res.status(403).json({ error: 'Accesso riservato ai supermaster' });
}

// ========================================
// ENDPOINTS AGENTE
// ========================================

// GET /api/agente/agenda/dealers - Lista dealer della scuderia
router.get('/dealers', authenticateToken, onlyAgent, async (req, res) => {
  try {
    console.log('[AGENDA][DEALERS] User:', req.user);
    const idAgente = req.user?.idAgente || req.user?.IDAgente;
    console.log('[AGENDA][DEALERS] ID Agente:', idAgente);
    
    if (!idAgente) {
      console.log('[AGENDA][DEALERS] ID Agente mancante!');
      return res.status(400).json({ error: 'ID Agente mancante' });
    }

    // Se è un dealer affiliato, sovrascrivi sempre le coordinate con quelle censite
    if (!isNuovoPoint && finalIdDealer) {
      const dealerInfo = await pool.request()
        .input('idDealer', sql.Int, finalIdDealer)
        .query(`
          SELECT TOP 1
            RagioneSociale,
            Latitudine,
            Longitudine
          FROM dbo.tbDealers
          WHERE IDDealer = @idDealer
        `);

      if (dealerInfo.recordset.length) {
        const dealer = dealerInfo.recordset[0];
        finalLatitudine = dealer.Latitudine ?? finalLatitudine;
        finalLongitudine = dealer.Longitudine ?? finalLongitudine;
        if (!finalRagioneSociale) {
          finalRagioneSociale = dealer.RagioneSociale;
        }
      }
    }

    // Se è un point non affiliato appena creato, usa le sue coordinate (non quelle del dispositivo)
    if (isNuovoPoint && idPointNonAffiliato && latitudine && longitudine) {
      finalLatitudine = latitudine;
      finalLongitudine = longitudine;
    }

    // Come ultima ancora, usa la posizione del dispositivo se mancano coordinate puntuali
    if (!finalLatitudine && !finalLongitudine && finalLatitudineDispositivo && finalLongitudineDispositivo) {
      finalLatitudine = finalLatitudineDispositivo;
      finalLongitudine = finalLongitudineDispositivo;
    }

    const pool = await sql.connect();

    if (!idAgente) {
      const email = req.user?.email;
      if (!email) {
        return res.status(401).json({ error: 'Email agente mancante' });
      }
      const agentResult = await pool.request()
        .input('email', sql.NVarChar, email)
        .query('SELECT IdAgente FROM dbo.tbAgenti WHERE RecapitoEmail = @email');
      if (!agentResult.recordset.length) {
        return res.status(404).json({ error: 'Agente non trovato' });
      }
      idAgente = agentResult.recordset[0].IdAgente;
    }
    const result = await pool.request()
      .input('idAgente', sql.Int, idAgente)
      .query(`
        SELECT 
          IDDealer,
          RagioneSociale,
          Citta,
          Provincia,
          Indirizzo
        FROM dbo.tbDealers
        WHERE IDAgente = @idAgente
          AND Attivo = 1
        ORDER BY RagioneSociale
      `);

    console.log('[AGENDA][DEALERS] Dealer trovati:', result.recordset?.length);
    res.json(result.recordset || []);
  } catch (err) {
    console.error('[AGENDA][DEALERS] Errore:', err);
    res.status(500).json({ error: 'Errore nel recupero dealer' });
  }
});

// GET /api/agente/agenda/visite - Lista visite agente
router.get('/visite', authenticateToken, onlyAgent, async (req, res) => {
  try {
    const agentEmail = req.user?.email;
    const { month, year, idDealer, stato } = req.query;

    if (!agentEmail) {
      return res.status(401).json({ error: 'Email agente mancante nel token' });
    }

    // Recupera IDAgente dalla tabella tbAgenti
    const pool = await sql.connect();
    const agentResult = await pool.request()
      .input('email', sql.NVarChar, agentEmail)
      .query('SELECT IdAgente FROM dbo.tbAgenti WHERE RecapitoEmail = @email');

    if (!agentResult.recordset.length) {
      return res.status(404).json({ error: 'Agente non trovato' });
    }

    const idAgente = agentResult.recordset[0].IdAgente;

    let query = `
      SELECT 
        v.ID,
        v.IDAgente,
        v.NomeAgente,
        v.IDDealer,
        v.IDPointNonAffiliato,
        v.RagioneSocialeDealer,
        CONVERT(VARCHAR(10), v.DataVisita, 120) as DataVisita,
        v.OraInizio,
        v.OraFine,
        v.DurataMinuti,
        v.Referente,
        v.Argomento,
        v.Note,
        v.Latitudine,
        v.Longitudine,
        v.StatoVisita,
        v.CreatoIl,
        v.ModificatoIl,
        (SELECT COUNT(*) FROM dbo.tbAgendaVisiteCommenti WHERE IDVisita = v.ID) as NumCommenti
      FROM dbo.tbAgendaVisite v
      WHERE v.IDAgente = @idAgente
    `;

    const request = pool.request().input('idAgente', sql.Int, idAgente);

    if (month && year) {
      query += ` AND YEAR(v.DataVisita) = @year AND MONTH(v.DataVisita) = @month`;
      request.input('year', sql.Int, parseInt(year));
      request.input('month', sql.Int, parseInt(month));
    }

    if (idDealer) {
      query += ` AND v.IDDealer = @idDealer`;
      request.input('idDealer', sql.Int, parseInt(idDealer));
    }

    if (stato) {
      query += ` AND v.StatoVisita = @stato`;
      request.input('stato', sql.NVarChar, stato);
    }

    query += ` ORDER BY v.DataVisita DESC, v.OraInizio DESC`;

    const result = await request.query(query);
    res.json(result.recordset || []);
  } catch (err) {
    console.error('[AGENDA][VISITE] Errore:', err);
    res.status(500).json({ error: 'Errore nel recupero visite' });
  }
});

// POST /api/agente/agenda/visite - Crea nuova visita
router.post('/visite', authenticateToken, onlyAgent, async (req, res) => {
  try {
    console.log('[AGENDA][CREATE] Richiesta ricevuta');
    console.log('[AGENDA][CREATE] User:', req.user);
    console.log('[AGENDA][CREATE] Body:', req.body);
    
    const agentEmail = req.user?.email;
    if (!agentEmail) {
      return res.status(401).json({ error: 'Email agente mancante nel token' });
    }

    // Recupera IDAgente e Nome dalla tabella tbAgenti
    const pool = await sql.connect();
    const agentResult = await pool.request()
      .input('email', sql.NVarChar, agentEmail)
      .query('SELECT IdAgente, Nome FROM dbo.tbAgenti WHERE RecapitoEmail = @email');

    if (!agentResult.recordset.length) {
      return res.status(404).json({ error: 'Agente non trovato' });
    }

    const { IdAgente: idAgente, Nome: nomeAgente } = agentResult.recordset[0];
    console.log('[AGENDA][CREATE] Agente trovato:', { idAgente, nomeAgente });
    
    const {
      idDealer,
      ragioneSocialeDealer,
      // Campi per point non affiliato
      isNuovoPoint,
      nuovoPoint,
      dataVisita,
      oraInizio,
      oraFine,
      durataMinuti,
      referente,
      argomento,
      note,
      latitudine,
      longitudine,
      latitudineDispositivo,
      longitudineDispositivo,
      statoVisita
    } = req.body;

    // Validazione campi base
    if (!dataVisita || !oraInizio || !durataMinuti) {
      return res.status(400).json({ error: 'Campi obbligatori mancanti: data, ora, durata' });
    }

    // Validazione: o dealer affiliato o nuovo point
    if (!isNuovoPoint && !idDealer) {
      return res.status(400).json({ error: 'Seleziona un point affiliato o crea un nuovo point' });
    }

    if (isNuovoPoint && (!nuovoPoint?.ragioneSociale || !nuovoPoint?.citta || !nuovoPoint?.provincia)) {
      return res.status(400).json({ error: 'Campi obbligatori nuovo point: ragione sociale, città, provincia' });
    }

    // Converti ora da HH:mm a oggetto Date per SQL Server
    const [oreInizio, minutiInizio] = oraInizio.split(':').map(Number);
    const oraInizioDate = new Date();
    oraInizioDate.setHours(oreInizio, minutiInizio, 0, 0);
    
    let oraFineDate = null;
    if (oraFine) {
      const [oreFine, minutiFine] = oraFine.split(':').map(Number);
      oraFineDate = new Date();
      oraFineDate.setHours(oreFine, minutiFine, 0, 0);
    }

    let finalIdDealer = idDealer;
    let finalRagioneSociale = ragioneSocialeDealer;
    let finalCitta = null;
    let idPointNonAffiliato = null;
    let finalLatitudine = latitudine || null;
    let finalLongitudine = longitudine || null;
    const finalLatitudineDispositivo = latitudineDispositivo || null;
    const finalLongitudineDispositivo = longitudineDispositivo || null;

    // Se è un nuovo point, prima lo inseriamo nella tabella apposita
    if (isNuovoPoint && nuovoPoint) {
      console.log('[AGENDA][CREATE] Creazione nuovo point non affiliato:', nuovoPoint);
      
      const pointResult = await pool.request()
        .input('idAgente', sql.Int, idAgente)
        .input('nomeAgente', sql.NVarChar, nomeAgente)
        .input('ragioneSociale', sql.NVarChar, nuovoPoint.ragioneSociale)
        .input('indirizzoCompleto', sql.NVarChar, nuovoPoint.indirizzoCompleto || '')
        .input('cap', sql.NVarChar, nuovoPoint.cap || null)
        .input('citta', sql.NVarChar, nuovoPoint.citta)
        .input('provincia', sql.NVarChar, nuovoPoint.provincia)
        .input('latitudine', sql.Decimal(10, 8), latitudine || null)
        .input('longitudine', sql.Decimal(11, 8), longitudine || null)
        .input('note', sql.NVarChar, nuovoPoint.note || null)
        .query(`
          INSERT INTO dbo.tbAgendaPointNonAffiliati (
            IDAgente, NomeAgente, RagioneSociale, IndirizzoCompleto,
            CAP, Citta, Provincia, Latitudine, Longitudine, Note
          )
          OUTPUT INSERTED.ID
          VALUES (
            @idAgente, @nomeAgente, @ragioneSociale, @indirizzoCompleto,
            @cap, @citta, @provincia, @latitudine, @longitudine, @note
          )
        `);

      idPointNonAffiliato = pointResult.recordset[0]?.ID;
      finalIdDealer = null; // Non è un dealer affiliato
      finalRagioneSociale = nuovoPoint.ragioneSociale;
      finalCitta = nuovoPoint.citta || null;
      
      console.log('[AGENDA][CREATE] Nuovo point creato con ID:', idPointNonAffiliato);
    }

    // Se è un dealer affiliato, recupera eventuali dati mancanti (città/coordinate)
    if (!isNuovoPoint && finalIdDealer) {
      const dealerInfo = await pool.request()
        .input('idDealer', sql.Int, finalIdDealer)
        .query(`
          SELECT TOP 1
            RagioneSociale,
            Citta,
            Latitudine,
            Longitudine
          FROM dbo.tbDealers
          WHERE IDDealer = @idDealer
        `);

      if (dealerInfo.recordset.length) {
        const dealer = dealerInfo.recordset[0];
        finalRagioneSociale = finalRagioneSociale || dealer.RagioneSociale;
        finalCitta = dealer.Citta || finalCitta;
        finalLatitudine = dealer.Latitudine ?? finalLatitudine;
        finalLongitudine = dealer.Longitudine ?? finalLongitudine;
      }
    }

    // Inserisci la visita
    const result = await pool.request()
      .input('idAgente', sql.Int, idAgente)
      .input('nomeAgente', sql.NVarChar, nomeAgente)
      .input('idDealer', sql.Int, finalIdDealer)
      .input('idPointNonAffiliato', sql.Int, idPointNonAffiliato)
      .input('ragioneSocialeDealer', sql.NVarChar, finalRagioneSociale)
      .input('dataVisita', sql.Date, dataVisita)
      .input('oraInizio', sql.Time, oraInizioDate)
      .input('oraFine', sql.Time, oraFineDate)
      .input('durataMinuti', sql.Int, durataMinuti)
      .input('referente', sql.NVarChar, referente || null)
      .input('argomento', sql.NVarChar, argomento || null)
      .input('note', sql.NVarChar, note || null)
      .input('latitudine', sql.Decimal(10, 8), finalLatitudine)
      .input('longitudine', sql.Decimal(11, 8), finalLongitudine)
      .input('latitudineDispositivo', sql.Decimal(10, 8), finalLatitudineDispositivo)
      .input('longitudineDispositivo', sql.Decimal(11, 8), finalLongitudineDispositivo)
      .input('statoVisita', sql.NVarChar, statoVisita || 'PROGRAMMATA')
      .query(`
        INSERT INTO dbo.tbAgendaVisite (
          IDAgente, NomeAgente, IDDealer, IDPointNonAffiliato, RagioneSocialeDealer,
          DataVisita, OraInizio, OraFine, DurataMinuti,
          Referente, Argomento, Note,
          Latitudine, Longitudine, LatitudineDispositivo, LongitudineDispositivo, StatoVisita
        )
        OUTPUT INSERTED.ID
        VALUES (
          @idAgente, @nomeAgente, @idDealer, @idPointNonAffiliato, @ragioneSocialeDealer,
          @dataVisita, @oraInizio, @oraFine, @durataMinuti,
          @referente, @argomento, @note,
          @latitudine, @longitudine, @latitudineDispositivo, @longitudineDispositivo, @statoVisita
        )
      `);

    const newId = result.recordset[0]?.ID;
    
    // Invia notifica WhatsApp al SuperMaster (non bloccante)
    notificaNuovaVisita({
      nomeAgente,
      ragioneSocialeDealer: finalRagioneSociale,
      dataVisita,
      oraInizio,
      durataMinuti,
      referente,
      argomento,
      note,
      citta: finalCitta,
      latitudine,
      longitudine,
      latitudineDispositivo: finalLatitudineDispositivo,
      longitudineDispositivo: finalLongitudineDispositivo
    }).then(result => {
      if (result.success) {
        console.log('[AGENDA][CREATE] Notifica WhatsApp inviata:', result.messageSid);
      } else {
        console.log('[AGENDA][CREATE] Notifica WhatsApp non inviata:', result.reason || result.error);
      }
    }).catch(err => {
      console.error('[AGENDA][CREATE] Errore notifica WhatsApp:', err);
    });
    
    res.json({ success: true, id: newId });
  } catch (err) {
    console.error('[AGENDA][CREATE] Errore:', err);
    res.status(500).json({ error: 'Errore nella creazione visita' });
  }
});

// PUT /api/agente/agenda/visite/:id - Aggiorna visita
router.put('/visite/:id', authenticateToken, onlyAgent, async (req, res) => {
  try {
    let idAgente = req.user?.idAgente;
    const { id } = req.params;
    
    const {
      dataVisita,
      oraInizio,
      oraFine,
      durataMinuti,
      referente,
      argomento,
      note,
      latitudine,
      longitudine,
      latitudineDispositivo,
      longitudineDispositivo,
      statoVisita
    } = req.body;

    const pool = await sql.connect();

    if (!idAgente) {
      const email = req.user?.email;
      if (!email) {
        return res.status(401).json({ error: 'Email agente mancante' });
      }
      const agentResult = await pool.request()
        .input('email', sql.NVarChar, email)
        .query('SELECT IdAgente FROM dbo.tbAgenti WHERE RecapitoEmail = @email');
      if (!agentResult.recordset.length) {
        return res.status(404).json({ error: 'Agente non trovato' });
      }
      idAgente = agentResult.recordset[0].IdAgente;
    }

    // Verifica che la visita appartenga all'agente
    const check = await pool.request()
      .input('id', sql.Int, id)
      .input('idAgente', sql.Int, idAgente)
      .query('SELECT ID FROM dbo.tbAgendaVisite WHERE ID = @id AND IDAgente = @idAgente');

    if (!check.recordset.length) {
      return res.status(404).json({ error: 'Visita non trovata o non autorizzata' });
    }

    const oraInizioDate = (() => {
      if (!oraInizio) return null;
      const [ore, minuti] = oraInizio.split(':').map(Number);
      const d = new Date();
      d.setHours(ore || 0, minuti || 0, 0, 0);
      return d;
    })();

    const oraFineDate = (() => {
      if (!oraFine) return null;
      const [ore, minuti] = oraFine.split(':').map(Number);
      const d = new Date();
      d.setHours(ore || 0, minuti || 0, 0, 0);
      return d;
    })();

    const toDecimal = (value) => {
      if (value === undefined || value === null || value === '') return null;
      const num = Number(value);
      return Number.isNaN(num) ? null : num;
    };

    await pool.request()
      .input('id', sql.Int, id)
      .input('dataVisita', sql.Date, dataVisita)
      .input('oraInizio', sql.Time, oraInizioDate)
      .input('oraFine', sql.Time, oraFineDate)
      .input('durataMinuti', sql.Int, durataMinuti)
      .input('referente', sql.NVarChar, referente || null)
      .input('argomento', sql.NVarChar, argomento || null)
      .input('note', sql.NVarChar, note || null)
      .input('latitudine', sql.Decimal(10, 8), toDecimal(latitudine))
      .input('longitudine', sql.Decimal(11, 8), toDecimal(longitudine))
      .input('latitudineDispositivo', sql.Decimal(10, 8), toDecimal(latitudineDispositivo))
      .input('longitudineDispositivo', sql.Decimal(11, 8), toDecimal(longitudineDispositivo))
      .input('statoVisita', sql.NVarChar, statoVisita)
      .query(`
        UPDATE dbo.tbAgendaVisite
        SET 
          DataVisita = @dataVisita,
          OraInizio = @oraInizio,
          OraFine = @oraFine,
          DurataMinuti = @durataMinuti,
          Referente = @referente,
          Argomento = @argomento,
          Note = @note,
          Latitudine = @latitudine,
          Longitudine = @longitudine,
          LatitudineDispositivo = @latitudineDispositivo,
          LongitudineDispositivo = @longitudineDispositivo,
          StatoVisita = @statoVisita,
          ModificatoIl = GETDATE()
        WHERE ID = @id
      `);

    res.json({ success: true });
  } catch (err) {
    console.error('[AGENDA][UPDATE] Errore:', err);
    res.status(500).json({ error: 'Errore nell\'aggiornamento visita' });
  }
});

// DELETE /api/agente/agenda/visite/:id - Elimina visita
router.delete('/visite/:id', authenticateToken, onlyAgent, async (req, res) => {
  try {
    let idAgente = req.user?.idAgente;
    const { id } = req.params;

    const pool = await sql.connect();

    if (!idAgente) {
      const email = req.user?.email;
      if (!email) {
        return res.status(401).json({ error: 'Email agente mancante' });
      }
      const agentResult = await pool.request()
        .input('email', sql.NVarChar, email)
        .query('SELECT IdAgente FROM dbo.tbAgenti WHERE RecapitoEmail = @email');
      if (!agentResult.recordset.length) {
        return res.status(404).json({ error: 'Agente non trovato' });
      }
      idAgente = agentResult.recordset[0].IdAgente;
    }
    
    const result = await pool.request()
      .input('id', sql.Int, id)
      .input('idAgente', sql.Int, idAgente)
      .query('DELETE FROM dbo.tbAgendaVisite WHERE ID = @id AND IDAgente = @idAgente');

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ error: 'Visita non trovata o non autorizzata' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('[AGENDA][DELETE] Errore:', err);
    res.status(500).json({ error: 'Errore nell\'eliminazione visita' });
  }
});

// GET /api/agente/agenda/statistiche - Statistiche personali
router.get('/statistiche', authenticateToken, onlyAgent, async (req, res) => {
  try {
    const agentEmail = req.user?.email;
    const { month, year } = req.query;

    if (!agentEmail) {
      return res.status(401).json({ error: 'Email agente mancante nel token' });
    }

    // Recupera IDAgente dalla tabella tbAgenti
    const pool = await sql.connect();
    const agentResult = await pool.request()
      .input('email', sql.NVarChar, agentEmail)
      .query('SELECT IdAgente FROM dbo.tbAgenti WHERE RecapitoEmail = @email');

    if (!agentResult.recordset.length) {
      return res.status(404).json({ error: 'Agente non trovato' });
    }

    const idAgente = agentResult.recordset[0].IdAgente;

    const request = pool.request().input('idAgente', sql.Int, idAgente);

    let whereClause = 'WHERE IDAgente = @idAgente';
    if (month && year) {
      whereClause += ' AND YEAR(DataVisita) = @year AND MONTH(DataVisita) = @month';
      request.input('year', sql.Int, parseInt(year));
      request.input('month', sql.Int, parseInt(month));
    }

    const result = await request.query(`
      SELECT 
        COUNT(*) as TotaleVisite,
        SUM(CASE WHEN StatoVisita = 'COMPLETATA' THEN 1 ELSE 0 END) as VisiteCompletate,
        SUM(CASE WHEN StatoVisita = 'PROGRAMMATA' THEN 1 ELSE 0 END) as VisiteProgrammate,
        SUM(DurataMinuti) as MinutiTotali,
        COUNT(DISTINCT IDDealer) as DealerVisitati
      FROM dbo.tbAgendaVisite
      ${whereClause}
    `);

    const topDealers = await request.query(`
      SELECT TOP 5
        IDDealer,
        RagioneSocialeDealer,
        COUNT(*) as NumVisite,
        SUM(DurataMinuti) as MinutiTotali
      FROM dbo.tbAgendaVisite
      ${whereClause}
      GROUP BY IDDealer, RagioneSocialeDealer
      ORDER BY COUNT(*) DESC
    `);

    const topArgomenti = await request.query(`
      SELECT TOP 5
        Argomento,
        COUNT(*) as NumVisite
      FROM dbo.tbAgendaVisite
      ${whereClause}
        AND Argomento IS NOT NULL
      GROUP BY Argomento
      ORDER BY COUNT(*) DESC
    `);

    res.json({
      statistiche: result.recordset[0],
      topDealers: topDealers.recordset,
      topArgomenti: topArgomenti.recordset
    });
  } catch (err) {
    console.error('[AGENDA][STATS] Errore:', err);
    res.status(500).json({ error: 'Errore nel recupero statistiche' });
  }
});

// ========================================
// ENDPOINTS SUPERMASTER
// ========================================

// GET /api/supermaster/crm-visite - Tutte le visite (con filtri)
router.get('/crm-visite', authenticateToken, onlySupermaster, async (req, res) => {
  try {
    const { idAgente, idDealer, month, year, stato, argomento } = req.query;

    const pool = await sql.connect();
    let query = `
      SELECT 
        v.ID,
        v.IDAgente,
        v.NomeAgente,
        v.IDDealer,
        v.RagioneSocialeDealer,
        CONVERT(VARCHAR(10), v.DataVisita, 23) as DataVisita,
        CONVERT(VARCHAR(5), v.OraInizio, 108) as OraInizio,
        CONVERT(VARCHAR(5), v.OraFine, 108) as OraFine,
        v.DurataMinuti,
        v.Referente,
        v.Argomento,
        v.Note,
        v.Latitudine,
        v.Longitudine,
        v.StatoVisita,
        v.CreatoIl,
        v.ModificatoIl,
        COALESCE(d.Citta, p.Citta) AS CittaPoint,
        COALESCE(d.Provincia, p.Provincia) AS ProvinciaPoint,
        COALESCE(d.Indirizzo, p.IndirizzoCompleto) AS IndirizzoPoint,
        COALESCE(d.CAP, p.CAP) AS CapPoint,
        (SELECT COUNT(*) FROM dbo.tbAgendaVisiteCommenti WHERE IDVisita = v.ID) as NumCommenti
      FROM dbo.tbAgendaVisite v
      LEFT JOIN dbo.tbDealers d ON v.IDDealer = d.IDDealer
      LEFT JOIN dbo.tbAgendaPointNonAffiliati p ON v.IDPointNonAffiliato = p.ID
      WHERE 1=1
    `;

    const request = pool.request();

    if (idAgente) {
      query += ` AND v.IDAgente = @idAgente`;
      request.input('idAgente', sql.Int, parseInt(idAgente));
    }

    if (idDealer) {
      query += ` AND v.IDDealer = @idDealer`;
      request.input('idDealer', sql.Int, parseInt(idDealer));
    }

    if (month && year) {
      query += ` AND YEAR(v.DataVisita) = @year AND MONTH(v.DataVisita) = @month`;
      request.input('year', sql.Int, parseInt(year));
      request.input('month', sql.Int, parseInt(month));
    }

    if (stato) {
      query += ` AND v.StatoVisita = @stato`;
      request.input('stato', sql.NVarChar, stato);
    }

    if (argomento) {
      query += ` AND v.Argomento LIKE @argomento`;
      request.input('argomento', sql.NVarChar, `%${argomento}%`);
    }

    query += ` ORDER BY v.DataVisita DESC, v.OraInizio DESC`;

    const result = await request.query(query);
    res.json(result.recordset || []);
  } catch (err) {
    console.error('[CRM][VISITE] Errore:', err);
    res.status(500).json({ error: 'Errore nel recupero visite' });
  }
});

// GET /api/supermaster/crm-visite/:id - Dettaglio visita con commenti
router.get('/crm-visite/:id', authenticateToken, onlySupermaster, async (req, res) => {
  try {
    const { id } = req.params;

    const pool = await sql.connect();
    
    const visita = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT 
          v.ID,
          v.IDAgente,
          v.NomeAgente,
          v.IDDealer,
          v.RagioneSocialeDealer,
          CONVERT(VARCHAR(10), v.DataVisita, 23) as DataVisita,
          CONVERT(VARCHAR(5), v.OraInizio, 108) as OraInizio,
          CONVERT(VARCHAR(5), v.OraFine, 108) as OraFine,
          v.DurataMinuti,
          v.Referente,
          v.Argomento,
          v.Note,
          v.Latitudine,
          v.Longitudine,
          v.LatitudineDispositivo,
          v.LongitudineDispositivo,
          v.StatoVisita,
          v.CreatoIl,
          v.ModificatoIl,
          d.Citta,
          d.Provincia,
          d.Indirizzo
        FROM dbo.tbAgendaVisite v
        LEFT JOIN dbo.tbDealers d ON v.IDDealer = d.IDDealer
        WHERE v.ID = @id
      `);

    if (!visita.recordset.length) {
      return res.status(404).json({ error: 'Visita non trovata' });
    }

    const commenti = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT *
        FROM dbo.tbAgendaVisiteCommenti
        WHERE IDVisita = @id
        ORDER BY CreatoIl DESC
      `);

    res.json({
      visita: visita.recordset[0],
      commenti: commenti.recordset || []
    });
  } catch (err) {
    console.error('[CRM][DETTAGLIO] Errore:', err);
    res.status(500).json({ error: 'Errore nel recupero dettaglio' });
  }
});

// POST /api/supermaster/crm-visite/:id/commenti - Aggiungi commento
router.post('/crm-visite/:id/commenti', authenticateToken, onlySupermaster, async (req, res) => {
  try {
    const { id } = req.params;
    const { commento, tipoCommento } = req.body;
    const nomeUtente = req.user?.name || req.user?.email || 'SuperMaster';

    if (!commento) {
      return res.status(400).json({ error: 'Commento obbligatorio' });
    }

    const pool = await sql.connect();
    await pool.request()
      .input('idVisita', sql.Int, id)
      .input('nomeUtente', sql.NVarChar, nomeUtente)
      .input('commento', sql.NVarChar, commento)
      .input('tipoCommento', sql.NVarChar, tipoCommento || 'NOTA')
      .query(`
        INSERT INTO dbo.tbAgendaVisiteCommenti (IDVisita, NomeUtente, Commento, TipoCommento)
        VALUES (@idVisita, @nomeUtente, @commento, @tipoCommento)
      `);

    res.json({ success: true });
  } catch (err) {
    console.error('[CRM][COMMENTO] Errore:', err);
    res.status(500).json({ error: 'Errore nell\'aggiunta commento' });
  }
});

// GET /api/supermaster/crm-visite/statistiche - Statistiche globali
router.get('/crm-visite/statistiche', authenticateToken, onlySupermaster, async (req, res) => {
  try {
    const { month, year } = req.query;

    const pool = await sql.connect();
    const request = pool.request();

    let whereClause = 'WHERE 1=1';
    if (month && year) {
      whereClause += ' AND YEAR(DataVisita) = @year AND MONTH(DataVisita) = @month';
      request.input('year', sql.Int, parseInt(year));
      request.input('month', sql.Int, parseInt(month));
    }

    const globali = await request.query(`
      SELECT 
        COUNT(*) as TotaleVisite,
        SUM(CASE WHEN StatoVisita = 'COMPLETATA' THEN 1 ELSE 0 END) as VisiteCompletate,
        SUM(DurataMinuti) as MinutiTotali,
        COUNT(DISTINCT IDAgente) as AgentiAttivi,
        COUNT(DISTINCT IDDealer) as DealerVisitati
      FROM dbo.tbAgendaVisite
      ${whereClause}
    `);

    const perAgente = await request.query(`
      SELECT 
        IDAgente,
        NomeAgente,
        COUNT(*) as NumVisite,
        SUM(DurataMinuti) as MinutiTotali,
        COUNT(DISTINCT IDDealer) as DealerVisitati
      FROM dbo.tbAgendaVisite
      ${whereClause}
      GROUP BY IDAgente, NomeAgente
      ORDER BY COUNT(*) DESC
    `);

    const topDealers = await request.query(`
      SELECT TOP 10
        IDDealer,
        RagioneSocialeDealer,
        COUNT(*) as NumVisite,
        COUNT(DISTINCT IDAgente) as NumAgenti
      FROM dbo.tbAgendaVisite
      ${whereClause}
      GROUP BY IDDealer, RagioneSocialeDealer
      ORDER BY COUNT(*) DESC
    `);

    const topArgomenti = await request.query(`
      SELECT TOP 10
        Argomento,
        COUNT(*) as NumVisite
      FROM dbo.tbAgendaVisite
      ${whereClause}
        AND Argomento IS NOT NULL
      GROUP BY Argomento
      ORDER BY COUNT(*) DESC
    `);

    res.json({
      globali: globali.recordset[0],
      perAgente: perAgente.recordset,
      topDealers: topDealers.recordset,
      topArgomenti: topArgomenti.recordset
    });
  } catch (err) {
    console.error('[CRM][STATS] Errore:', err);
    res.status(500).json({ error: 'Errore nel recupero statistiche' });
  }
});

// GET /api/supermaster/crm-visite/percorso/:idAgente - Calcola percorso giornaliero con km
router.get('/crm-visite/percorso/:idAgente', authenticateToken, onlySupermaster, async (req, res) => {
  try {
    const { idAgente } = req.params;
    const { data } = req.query; // Formato: YYYY-MM-DD

    if (!data) {
      return res.status(400).json({ error: 'Parametro data obbligatorio (YYYY-MM-DD)' });
    }

    const pool = await sql.connect();

    // Recupera posizione di partenza agente
    const partenza = await pool.request()
      .input('idAgente', sql.Int, idAgente)
      .query(`
        SELECT TOP 1 
          LatitudinePartenza,
          LongitudinePartenza,
          CittaPartenza,
          IndirizzoPartenza
        FROM dbo.tbAgentiPosizionePartenza
        WHERE IDAgente = @idAgente
      `);

    if (!partenza.recordset.length) {
      return res.status(404).json({ error: 'Posizione di partenza agente non configurata' });
    }

    const posizionePartenza = partenza.recordset[0];

    // Recupera visite del giorno ordinate per ora
    // Usa coordinate visita se disponibili, altrimenti coordinate dealer come fallback
    const visite = await pool.request()
      .input('idAgente', sql.Int, idAgente)
      .input('data', sql.Date, data)
      .query(`
        SELECT 
          v.ID,
          v.IDDealer,
          v.IDPointNonAffiliato,
          v.RagioneSocialeDealer,
          CONVERT(VARCHAR(10), v.DataVisita, 23) as DataVisita,
          CONVERT(VARCHAR(5), v.OraInizio, 108) as OraInizio,
          v.DurataMinuti,
          COALESCE(v.Latitudine, d.Latitudine, p.Latitudine) as Latitudine,
          COALESCE(v.Longitudine, d.Longitudine, p.Longitudine) as Longitudine,
          COALESCE(d.Citta, p.Citta) as Citta,
          COALESCE(d.Provincia, p.Provincia) as Provincia,
          COALESCE(d.Indirizzo, p.IndirizzoCompleto) as Indirizzo,
          v.Referente,
          v.Argomento,
          CASE 
            WHEN v.Latitudine IS NULL AND d.Latitudine IS NOT NULL THEN 1 
            WHEN v.Latitudine IS NULL AND p.Latitudine IS NOT NULL THEN 1 
            ELSE 0 
          END as UsaCoordinateDealer
        FROM dbo.tbAgendaVisite v
        LEFT JOIN dbo.tbDealers d ON v.IDDealer = d.IDDealer
        LEFT JOIN dbo.tbAgendaPointNonAffiliati p ON v.IDPointNonAffiliato = p.ID
        WHERE v.IDAgente = @idAgente
          AND CAST(v.DataVisita AS DATE) = @data
          AND (v.Latitudine IS NOT NULL OR d.Latitudine IS NOT NULL OR p.Latitudine IS NOT NULL)
        ORDER BY v.OraInizio
      `);

    if (!visite.recordset.length) {
      return res.json({
        data,
        partenza: posizionePartenza,
        visite: [],
        kmTotali: 0,
        percorso: []
      });
    }

    // Prepara coordinate per OSRM (tutte le tappe in ordine)
    const allCoordinates = [
      [posizionePartenza.LongitudinePartenza, posizionePartenza.LatitudinePartenza],
      ...visite.recordset.map(v => [v.Longitudine, v.Latitudine]),
      [posizionePartenza.LongitudinePartenza, posizionePartenza.LatitudinePartenza] // ritorno
    ];

    // Calcola percorso stradale completo
    const routeData = await calcolaPercorsoStradale(allCoordinates);
    
    let routeGeometry = [];
    let kmTotali = 0;
    
    if (routeData) {
      // Usa distanza stradale da OSRM
      kmTotali = routeData.distance;
      routeGeometry = routeData.geometry; // geometria completa del percorso stradale
      console.log(`[PERCORSO] Calcolato percorso stradale: ${kmTotali.toFixed(1)} km, ${routeData.duration.toFixed(0)} min`);
    } else {
      console.warn('[PERCORSO] OSRM fallito, uso calcolo linea d\'aria');
    }

    // Calcola distanze progressive per ogni tappa
    const percorso = [];
    let kmProgressivi = 0;
    let latPrecedente = posizionePartenza.LatitudinePartenza;
    let lonPrecedente = posizionePartenza.LongitudinePartenza;

    percorso.push({
      tipo: 'PARTENZA',
      descrizione: `Partenza da ${posizionePartenza.CittaPartenza}`,
      indirizzo: posizionePartenza.IndirizzoPartenza,
      latitudine: latPrecedente,
      longitudine: lonPrecedente,
      kmDaPrecedente: 0,
      kmProgressivi: 0
    });

    // Aggiungi tutte le visite con distanze
    for (let index = 0; index < visite.recordset.length; index++) {
      const visita = visite.recordset[index];
      
      // Calcola distanza stradale per questo segmento
      const segmentCoords = [
        [lonPrecedente, latPrecedente],
        [visita.Longitudine, visita.Latitudine]
      ];
      
      const segmentRoute = await calcolaPercorsoStradale(segmentCoords);
      let distanza;
      
      if (segmentRoute) {
        distanza = segmentRoute.distance;
      } else {
        // Fallback a linea d'aria
        distanza = calcolaDistanzaKm(
          latPrecedente,
          lonPrecedente,
          visita.Latitudine,
          visita.Longitudine
        );
      }

      kmProgressivi += distanza;

      percorso.push({
        tipo: 'VISITA',
        visitaId: visita.ID,
        descrizione: visita.Citta || visita.RagioneSocialeDealer,
        ragioneSociale: visita.RagioneSocialeDealer,
        citta: visita.Citta,
        provincia: visita.Provincia,
        indirizzo: visita.Indirizzo,
        ora: visita.OraInizio,
        durata: visita.DurataMinuti,
        referente: visita.Referente,
        argomento: visita.Argomento,
        latitudine: visita.Latitudine,
        longitudine: visita.Longitudine,
        kmDaPrecedente: Math.round(distanza * 10) / 10,
        kmProgressivi: Math.round(kmProgressivi * 10) / 10,
        usaCoordinateDealer: visita.UsaCoordinateDealer === 1,
        warning: visita.UsaCoordinateDealer === 1 ? 'Coordinate approssimate (sede dealer)' : null
      });

      latPrecedente = visita.Latitudine;
      lonPrecedente = visita.Longitudine;
    }

    // Ultimo tratto: ultima visita -> casa
    const returnCoords = [
      [lonPrecedente, latPrecedente],
      [posizionePartenza.LongitudinePartenza, posizionePartenza.LatitudinePartenza]
    ];
    
    const returnRoute = await calcolaPercorsoStradale(returnCoords);
    let distanzaRitorno;
    
    if (returnRoute) {
      distanzaRitorno = returnRoute.distance;
    } else {
      distanzaRitorno = calcolaDistanzaKm(
        latPrecedente,
        lonPrecedente,
        posizionePartenza.LatitudinePartenza,
        posizionePartenza.LongitudinePartenza
      );
    }
    
    kmProgressivi += distanzaRitorno;

    percorso.push({
      tipo: 'RITORNO',
      descrizione: `Ritorno a ${posizionePartenza.CittaPartenza}`,
      indirizzo: posizionePartenza.IndirizzoPartenza,
      latitudine: posizionePartenza.LatitudinePartenza,
      longitudine: posizionePartenza.LongitudinePartenza,
      kmDaPrecedente: Math.round(distanzaRitorno * 10) / 10,
      kmProgressivi: Math.round(kmProgressivi * 10) / 10
    });

    res.json({
      data,
      partenza: posizionePartenza,
      visite: visite.recordset,
      kmTotali: Math.round(kmProgressivi * 10) / 10,
      percorso,
      routeGeometry: routeGeometry.length > 0 ? routeGeometry : null // geometria percorso stradale per mappa
    });

  } catch (err) {
    console.error('[CRM][PERCORSO] Errore:', err);
    res.status(500).json({ error: 'Errore nel calcolo percorso' });
  }
});

// GET /api/supermaster/agenti-posizioni - Lista posizioni partenza agenti
router.get('/agenti-posizioni', authenticateToken, onlySupermaster, async (req, res) => {
  try {
    const pool = await sql.connect();
    const result = await pool.request().query(`
      SELECT 
        p.*,
        a.Nome as NomeAgenteCompleto,
        a.RecapitoEmail
      FROM dbo.tbAgentiPosizionePartenza p
      LEFT JOIN dbo.tbAgenti a ON p.IDAgente = a.IdAgente
      ORDER BY p.NomeAgente
    `);

    res.json(result.recordset || []);
  } catch (err) {
    console.error('[CRM][POSIZIONI] Errore:', err);
    res.status(500).json({ error: 'Errore nel recupero posizioni' });
  }
});

// POST /api/supermaster/agenti-posizioni - Crea/aggiorna posizione partenza agente
router.post('/agenti-posizioni', authenticateToken, onlySupermaster, async (req, res) => {
  try {
    const { idAgente, nomeAgente, indirizzo, citta, provincia, latitudine, longitudine } = req.body;

    if (!idAgente || !citta || !latitudine || !longitudine) {
      return res.status(400).json({ error: 'Campi obbligatori: idAgente, citta, latitudine, longitudine' });
    }

    const pool = await sql.connect();

    // Verifica se esiste già
    const existing = await pool.request()
      .input('idAgente', sql.Int, idAgente)
      .query('SELECT ID FROM dbo.tbAgentiPosizionePartenza WHERE IDAgente = @idAgente');

    if (existing.recordset.length > 0) {
      // Aggiorna
      await pool.request()
        .input('id', sql.Int, existing.recordset[0].ID)
        .input('nomeAgente', sql.NVarChar, nomeAgente)
        .input('indirizzo', sql.NVarChar, indirizzo)
        .input('citta', sql.NVarChar, citta)
        .input('provincia', sql.NVarChar, provincia)
        .input('latitudine', sql.Decimal(10, 8), latitudine)
        .input('longitudine', sql.Decimal(11, 8), longitudine)
        .query(`
          UPDATE dbo.tbAgentiPosizionePartenza
          SET NomeAgente = @nomeAgente,
              IndirizzoPartenza = @indirizzo,
              CittaPartenza = @citta,
              ProvinciaPartenza = @provincia,
              LatitudinePartenza = @latitudine,
              LongitudinePartenza = @longitudine,
              ModificatoIl = GETDATE()
          WHERE ID = @id
        `);

      res.json({ success: true, action: 'updated', id: existing.recordset[0].ID });
    } else {
      // Crea nuovo
      const result = await pool.request()
        .input('idAgente', sql.Int, idAgente)
        .input('nomeAgente', sql.NVarChar, nomeAgente)
        .input('indirizzo', sql.NVarChar, indirizzo)
        .input('citta', sql.NVarChar, citta)
        .input('provincia', sql.NVarChar, provincia)
        .input('latitudine', sql.Decimal(10, 8), latitudine)
        .input('longitudine', sql.Decimal(11, 8), longitudine)
        .query(`
          INSERT INTO dbo.tbAgentiPosizionePartenza 
            (IDAgente, NomeAgente, IndirizzoPartenza, CittaPartenza, ProvinciaPartenza, LatitudinePartenza, LongitudinePartenza)
          OUTPUT INSERTED.ID
          VALUES 
            (@idAgente, @nomeAgente, @indirizzo, @citta, @provincia, @latitudine, @longitudine)
        `);

      res.json({ success: true, action: 'created', id: result.recordset[0].ID });
    }
  } catch (err) {
    console.error('[CRM][POSIZIONI] Errore:', err);
    res.status(500).json({ error: 'Errore nel salvataggio posizione' });
  }
});

// GET /api/test/whatsapp-config - Verifica configurazione WhatsApp
router.get('/test/whatsapp-config', authenticateToken, (req, res) => {
  const config = verificaConfigurazioneWhatsApp();
  res.json({
    ...config,
    message: config.configured && config.hasDestination 
      ? 'WhatsApp configurato correttamente' 
      : 'WhatsApp non completamente configurato'
  });
});

// POST /api/test/whatsapp - Test invio notifica WhatsApp
router.post('/test/whatsapp', authenticateToken, async (req, res) => {
  try {
    const result = await notificaNuovaVisita({
      nomeAgente: 'Test Agente',
      ragioneSocialeDealer: 'Test Dealer',
      dataVisita: new Date().toISOString(),
      oraInizio: '10:00',
      durataMinuti: 30,
      referente: 'Test Referente',
      argomento: 'Test Argomento',
      note: 'Questo è un messaggio di test'
    });
    
    res.json({
      success: result.success,
      ...result
    });
  } catch (err) {
    console.error('[TEST][WHATSAPP] Errore:', err);
    res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
});

// POST /api/test/reminder-mattutino - Test reminder mattutino manuale
router.post('/test/reminder-mattutino', authenticateToken, async (req, res) => {
  try {
    const reminderModule = await import('./whatsapp-reminder.mjs');
    await reminderModule.eseguiReminderMattutino();
    
    res.json({
      success: true,
      message: 'Reminder mattutino eseguito. Controlla i log del server per i dettagli.'
    });
  } catch (err) {
    console.error('[TEST][REMINDER] Errore:', err);
    res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
});

export default router;
