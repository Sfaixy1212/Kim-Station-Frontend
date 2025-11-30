// Modulo dedicato alle API per i dealer
import express from 'express';
import sql from 'mssql';
import multer from 'multer';
import path from 'path';
import crypto from 'crypto';
import { uploadToS3, listS3Folder } from './s3-service.mjs';
import { getPool, getRequest } from './db-pool.mjs';

// Funzione helper per determinare il database corretto
function getDbName() {
  // Se DB_NAME è definito nel .env, usalo
  if (process.env.DB_NAME) {
    return process.env.DB_NAME;
  }
  
  // Fallback intelligente basato sulla porta o ambiente
  const port = process.env.PORT || '3001';
  if (port === '3002') {
    return 'KAM'; // Produzione
  } else {
    return 'KAM_2'; // Staging/Development
  }
}

// Factory function per creare il router con le dipendenze iniettate
const createDealerRouter = ({ authenticateToken, dbConfig }) => {
  const router = express.Router();

  // Cache semplice in memoria per endpoint pesanti (key: dealerId-year)
  // TTL 10 minuti
  const andamentoCache = new Map();

  // Middleware per verificare che l'utente sia un dealer o master
  function requireDealer(req, res, next) {
    console.log('[DEBUG][requireDealer] req.user:', req.user);
    
    if (!req.user || !req.user.ruoli) {
      console.log('[DEBUG][requireDealer] BLOCCATO: utente o ruoli mancanti');
      return res.status(403).json({ 
        error: 'Accesso non autorizzato',
        details: 'Utente o ruoli mancanti',
        user: req.user // Incluso per debug
      });
    }
    
    // Converti i ruoli in maiuscolo per il confronto case-insensitive
    const ruoliUtente = Array.isArray(req.user.ruoli) 
      ? req.user.ruoli.map(r => r.toString().toUpperCase())
      : [req.user.ruoli.toString().toUpperCase()];
    
    console.log('[DEBUG][requireDealer] Ruoli utente:', ruoliUtente);
    
    // Permetti accesso a dealer, master e masterprodotti
    const ruoliAmmessi = ['DEALER', 'MASTER', 'MASTERPRODOTTI', 'SUPERMASTER'];
    const hasAccess = ruoliUtente.some(r => ruoliAmmessi.includes(r));
    
    if (!hasAccess) {
      console.log('[DEBUG][requireDealer] BLOCCATO: ruolo non autorizzato');
      return res.status(403).json({ 
        error: 'Accesso riservato',
        details: `Ruoli presenti: ${ruoliUtente.join(', ')}`
      });
    }
    
    next();
  }

  // Whitelist operatori ammessi per Documentazione
  const OPERATOR_WHITELIST = [
    '1MOBILE',
    'ENI PLENITUDE',
    'FASTWEB',
    'FASTWEB ENERGIA',
    'ILIAD',
    'KENA MOBILE',
    'SKY',
    'WEEDOO'
  ];

  // Documentazione per operatore: lettura da DB (tbFiles) con link S3 già salvati
  router.get('/docs', authenticateToken, async (req, res) => {
    try {
      const raw = (req.query.operator || req.query.operatore || '').toString().trim();
      if (!raw) return res.status(400).json({ error: 'Parametro operator mancante' });
      const op = raw.toUpperCase();
      if (!OPERATOR_WHITELIST.includes(op)) {
        return res.status(400).json({ error: 'Operatore non supportato', operator: op, allowed: OPERATOR_WHITELIST });
      }

      // Query su dbo.tbFiles: recupera Titolo e Link per l'operatore
      await sql.connect(dbConfig);
      const result = await new sql.Request()
        .input('Operatore', sql.NVarChar, op)
        .query(`SELECT Titolo, Link FROM dbo.tbFiles WHERE Operatore = @Operatore ORDER BY Titolo`);

      const rows = result.recordset || [];
      const items = rows.map((r) => {
        const titolo = (r.Titolo || '').toString().trim();
        const link = (r.Link || '').toString().trim();
        // estensione dal link
        const ext = path.extname(link).replace(/^\./, '').toLowerCase() || undefined;
        return { titolo, link, extension: ext };
      }).filter((it) => it.link);

      return res.json({ operator: op, count: items.length, files: items });
    } catch (err) {
      console.error('[DEALER][GET /docs] Error:', err);
      return res.status(500).json({ error: 'Errore nel recupero documenti', details: err?.message });
    }
  });
 
  // === Upload file GENERICO per DEALER (stati 3 o 10) ===
  const uploadGeneric = multer({
    storage: multer.memoryStorage(),
    fileFilter: function (req, file, cb) {
      const allowed = ['application/pdf', 'image/jpeg', 'image/png'];
      if (!allowed.includes(file.mimetype)) {
        return cb(new Error('Formato file non consentito. Ammessi: PDF, JPEG, PNG'));
      }
      cb(null, true);
    },
    limits: { fileSize: 10 * 1024 * 1024 }
  });

  router.post('/ordine/:id/file', authenticateToken, requireDealer, uploadGeneric.single('file'), async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const dealerId = req.user.dealerId;
      if (isNaN(id) || !dealerId) return res.status(400).json({ success: false, error: 'ID o dealer non valido' });
      if (!req.file) return res.status(400).json({ success: false, error: 'File mancante' });

      await sql.connect(dbConfig);
      const statoRes = await new sql.Request()
        .input('id', sql.Int, id)
        .input('dealerId', sql.Int, dealerId)
        .query('SELECT Stato FROM dbo.tbOrdini WHERE IDOrdine = @id AND idDealer = @dealerId');
      if (!statoRes.recordset?.length) return res.status(404).json({ success: false, error: 'Ordine non trovato o non autorizzato' });
      const statoAttuale = statoRes.recordset[0].Stato;
      // L'upload GENERICO è consentito solo in stato 3
      // In stato 10 il dealer deve usare l'endpoint dedicato /attivazione/:id/upload-modulo
      if (statoAttuale === 10) {
        return res.status(403).json({ success: false, error: 'In stato 10 usare /dealer/attivazione/:id/upload-modulo (MODULO).', state: statoAttuale });
      }
      if (statoAttuale !== 3) {
        return res.status(403).json({ success: false, error: 'Upload generico consentito solo in stato 3.' });
      }

      const tipo = (req.body?.TipoFile || req.body?.tipo || 'ALLEGATO').toString().toUpperCase();
      const ext = path.extname(req.file.originalname).toLowerCase();
      const fileName = `${crypto.randomUUID()}${ext}`;
      const s3Key = `${tipo}/${fileName}`;

      const uploadResult = await uploadToS3(
        req.file,
        id,
        new Date().getMonth() + 1,
        new Date().getFullYear(),
        s3Key,
        'attivazionistation'
      );
      const payload = {
        s3Url: uploadResult.url,
        s3Key: uploadResult.key,
        originalName: uploadResult.originalName,
        bucket: 'attivazionistation'
      };

      await new sql.Request()
        .input('IDOrdine', sql.Int, id)
        .input('TipoFile', sql.NVarChar, tipo)
        .input('FileUID', sql.NVarChar, fileName)
        .input('NomeFile', sql.NVarChar, fileName)
        .input('Payload', sql.NVarChar, JSON.stringify(payload))
        .query(`INSERT INTO dbo.tbFileOrdine (IDOrdine, TipoFile, FileUID, NomeFile, Payload) VALUES (@IDOrdine, @TipoFile, @FileUID, @NomeFile, @Payload)`);

      await new sql.Request().input('id', sql.Int, id).query('UPDATE dbo.tbOrdini SET Stato = 0 WHERE IDOrdine = @id');
      try {
        await new sql.Request()
          .input('id', sql.Int, id)
          .input('utente', sql.NVarChar, `DEALER_${dealerId}`)
          .input('statoPrec', sql.Int, statoAttuale)
          .input('statoNuovo', sql.Int, 0)
          .input('nota', sql.NVarChar, `FILE CARICATO (${tipo}) DAL DEALER`)
          .query(`INSERT INTO dbo.tbStoricoOrdini (IDOrdine, DataOra, Utente, StatoPrecedente, StatoNuovo, Nota)
                  VALUES (@id, GETUTCDATE(), @utente, @statoPrec, @statoNuovo, @nota)`);
      } catch {}

      return res.json({ success: true, stato: 0, file: { name: fileName, url: uploadResult.url, originalName: uploadResult.originalName, tipo } });
    } catch (err) {
      console.error('[DEALER][POST /ordine/:id/file] Errore:', err);
      return res.status(500).json({ success: false, error: 'Errore upload file: ' + err.message });
    }
  });

  // === Upload PDA per DEALER (solo stato 28) ===
  const uploadPda = multer({
    storage: multer.memoryStorage(),
    fileFilter: function (req, file, cb) {
      if (file.mimetype !== 'application/pdf') {
        return cb(new Error('Solo PDF consentiti'));
      }
      cb(null, true);
    },
    limits: { fileSize: 10 * 1024 * 1024 }
  });

  // === Upload MODULO per DEALER (stato 10) - consente PDF e immagini (jpeg/jpg/png) ===
  const uploadModulo = multer({
    storage: multer.memoryStorage(),
    fileFilter: function (req, file, cb) {
      const allowed = ['application/pdf', 'image/jpeg', 'image/png'];
      if (!allowed.includes(file.mimetype)) {
        return cb(new Error('Formato non consentito. Ammessi: PDF, JPEG, PNG'));
      }
      cb(null, true);
    },
    limits: { fileSize: 10 * 1024 * 1024 }
  });

  router.post('/attivazione/:id/upload-pda', authenticateToken, requireDealer, uploadPda.single('file'), async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const dealerId = req.user.dealerId;
      if (isNaN(id) || !dealerId) return res.status(400).json({ error: 'ID o dealer non valido' });
      if (!req.file) return res.status(400).json({ error: 'File mancante' });

      // Verifica che l'ordine appartenga al dealer e sia in stato 28
      await sql.connect(dbConfig);
      const statoRes = await new sql.Request()
        .input('id', sql.Int, id)
        .input('dealerId', sql.Int, dealerId)
        .query('SELECT Stato FROM dbo.tbOrdini WHERE IDOrdine = @id AND idDealer = @dealerId');

      if (!statoRes.recordset?.length) {
        return res.status(404).json({ error: 'Ordine non trovato o non autorizzato' });
      }
      const statoAttuale = statoRes.recordset[0].Stato;
      if (statoAttuale !== 28 && statoAttuale !== 9) {
        return res.status(403).json({ error: 'Upload PDA consentito solo quando lo stato è 28 (PDA DA FIRMARE) o 9 (IN ATTESA FIRMA)' });
      }

      // Upload su S3 nello stesso bucket/chiave del master
      const ext = path.extname(req.file.originalname).toLowerCase();
      const fileName = `${crypto.randomUUID()}${ext}`;
      const s3Key = `PDA/${fileName}`;

      const uploadResult = await uploadToS3(
        req.file, // multer file
        id, // order number
        new Date().getMonth() + 1, // month
        new Date().getFullYear(), // year
        s3Key,
        'attivazionistation'
      );

      const payload = {
        s3Url: uploadResult.url,
        s3Key: uploadResult.key,
        originalName: uploadResult.originalName,
        bucket: 'attivazionistation'
      };

      // Salva file in tbFileOrdine
      await new sql.Request()
        .input('IDOrdine', sql.Int, id)
        .input('TipoFile', sql.NVarChar, 'PDA')
        .input('FileUID', sql.NVarChar, fileName)
        .input('NomeFile', sql.NVarChar, fileName)
        .input('Payload', sql.NVarChar, JSON.stringify(payload))
        .query(`INSERT INTO dbo.tbFileOrdine (IDOrdine, TipoFile, FileUID, NomeFile, Payload) VALUES (@IDOrdine, @TipoFile, @FileUID, @NomeFile, @Payload)`);

      // Aggiorna stato a 29 senza invio email (solo update diretto)
      await new sql.Request()
        .input('id', sql.Int, id)
        .query('UPDATE dbo.tbOrdini SET Stato = 29 WHERE IDOrdine = @id');

      return res.json({
        success: true,
        stato: 29,
        file: {
          name: fileName,
          url: uploadResult.url,
          originalName: uploadResult.originalName
        }
      });
    } catch (err) {
      console.error('[DEALER][upload-pda] Errore:', err);
      return res.status(500).json({ success: false, error: 'Errore upload PDA: ' + err.message });
    }
  });
 
  // === Upload MODULO per DEALER (solo stato 10 - ATTESA MODULO) ===
  router.post('/attivazione/:id/upload-modulo', authenticateToken, requireDealer, uploadModulo.single('file'), async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const dealerId = req.user.dealerId;
      if (isNaN(id) || !dealerId) return res.status(400).json({ error: 'ID o dealer non valido' });
      if (!req.file) return res.status(400).json({ error: 'File mancante' });

      // Verifica che l'ordine appartenga al dealer e sia in stato 10
      await sql.connect(dbConfig);
      const statoRes = await new sql.Request()
        .input('id', sql.Int, id)
        .input('dealerId', sql.Int, dealerId)
        .query('SELECT Stato FROM dbo.tbOrdini WHERE IDOrdine = @id AND idDealer = @dealerId');

      if (!statoRes.recordset?.length) {
        return res.status(404).json({ error: 'Ordine non trovato o non autorizzato' });
      }
      const statoAttuale = statoRes.recordset[0].Stato;
      if (statoAttuale !== 10) {
        return res.status(403).json({ error: 'Upload MODULO consentito solo quando lo stato è 10 (ATTESA MODULO)' });
      }

      // Upload su S3 in cartella PDA (richiesta: MODULO salvato sotto PDA)
      const ext = path.extname(req.file.originalname).toLowerCase();
      const fileName = `${crypto.randomUUID()}${ext}`;
      const s3Key = `PDA/${fileName}`;

      const uploadResult = await uploadToS3(
        req.file,
        id,
        new Date().getMonth() + 1,
        new Date().getFullYear(),
        s3Key,
        'attivazionistation'
      );

      const payload = {
        s3Url: uploadResult.url,
        s3Key: uploadResult.key,
        originalName: uploadResult.originalName,
        bucket: 'attivazionistation'
      };

      // Registra il file in tbFileOrdine
      await new sql.Request()
        .input('IDOrdine', sql.Int, id)
        .input('TipoFile', sql.NVarChar, 'MODULO')
        .input('FileUID', sql.NVarChar, fileName)
        .input('NomeFile', sql.NVarChar, fileName)
        .input('Payload', sql.NVarChar, JSON.stringify(payload))
        .query(`INSERT INTO dbo.tbFileOrdine (IDOrdine, TipoFile, FileUID, NomeFile, Payload) VALUES (@IDOrdine, @TipoFile, @FileUID, @NomeFile, @Payload)`);

      // Cambia stato a 30 (MODULO INVIATO) e registra storico in UTC
      const nuovoStato = 30; // MODULO INVIATO
      await new sql.Request()
        .input('id', sql.Int, id)
        .input('stato', sql.Int, nuovoStato)
        .query('UPDATE dbo.tbOrdini SET Stato = @stato WHERE IDOrdine = @id');

      await new sql.Request()
        .input('id', sql.Int, id)
        .input('utente', sql.NVarChar, `DEALER_${dealerId}`)
        .input('statoPrec', sql.Int, statoAttuale)
        .input('statoNuovo', sql.Int, nuovoStato)
        .input('nota', sql.NVarChar, 'MODULO CARICATO DAL DEALER')
        .query(`INSERT INTO dbo.tbStoricoOrdini (IDOrdine, DataOra, Utente, StatoPrecedente, StatoNuovo, Nota)
                VALUES (@id, GETUTCDATE(), @utente, @statoPrec, @statoNuovo, @nota)`);

      return res.json({
        success: true,
        stato: nuovoStato,
        file: {
          name: fileName,
          url: uploadResult.url,
          originalName: uploadResult.originalName
        }
      });
    } catch (err) {
      console.error('[DEALER][upload-modulo] Errore:', err);
      return res.status(500).json({ success: false, error: 'Errore upload MODULO: ' + err.message });
    }
  });
  // === Attivazioni Station per DEALER ===
  router.get('/attivazioni-station', authenticateToken, requireDealer, async (req, res) => {
    const dealerId = req.user.dealerId;
    try {
      await sql.connect(dbConfig);
      const result = await new sql.Request()
        .input('idDealer', sql.Int, dealerId)
        .query(`
          SELECT 
              o.IDOrdine AS IDOrdine,
              FORMAT(o.DataOra, 'dd.MM.yy') AS Data,
              ofr.Titolo AS TitoloOfferta,
              st.StatoEsteso,
              o.NoteDealer,
              -- Aggiungo campi necessari per il rendering
              CASE WHEN o.ASSISTENZA = 1 THEN 'ASSISTENZA' ELSE 'ATTIVAZIONE' END AS Tipo,
              CASE 
                WHEN ofr.Titolo LIKE '%CONSUMER%' THEN 'CONSUMER'
                WHEN ofr.Titolo LIKE '%BUSINESS%' THEN 'BUSINESS'
                ELSE 'CONSUMER' 
              END AS Segmento
          FROM dbo.tbOrdini o
          INNER JOIN dbo.tbOfferte ofr ON o.idOfferta = ofr.IDOfferta
          INNER JOIN dbo.tbStatiOrdini st ON o.Stato = st.IDStato
          WHERE o.idDealer = @idDealer
            AND ISNULL(CAST(ofr.idOperatore AS VARCHAR), '') NOT IN ('1','4','9','11')
            -- Rimosso '10' dalla lista degli operatori esclusi per mostrare anche le richieste di assistenza
        `);
      res.json({ success: true, data: result.recordset });
    } catch (err) {
      console.error('[DEALER][attivazioni-station] Errore:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // === Performance settimanale (ultimi 7 giorni) ===
  router.get('/performance-settimanale', authenticateToken, requireDealer, async (req, res) => {
    try {
      const dealerIdRaw = req.user?.dealerId ?? req.query?.dealerId ?? null;
      const dealerId = Number(dealerIdRaw);
      if (!Number.isFinite(dealerId)) {
        return res.status(400).json({ success: false, error: 'dealerId non disponibile per questo utente' });
      }

      await getPool();
      const request = await getRequest();
      request.input('dealerId', sql.Int, dealerId);
      const rs = await request.query(`
        DECLARE @Today date = CONVERT(date, GETDATE());
        SELECT CAST(o.DataOra AS date) AS Giorno, COUNT(*) AS Totale
        FROM dbo.tbOrdini o WITH (NOLOCK)
        LEFT JOIN dbo.tbOfferte offe WITH (NOLOCK) ON o.idOfferta = offe.IDOfferta
        WHERE o.idDealer = @dealerId
          AND o.DataOra >= DATEADD(day, -13, @Today)
          AND o.DataOra < DATEADD(day, 1, @Today)
          AND ISNULL(CAST(offe.idOperatore AS varchar(10)), '') NOT IN ('1','4','9','11')
        GROUP BY CAST(o.DataOra AS date);
      `);

      const pad2 = (n) => String(n).padStart(2, '0');
      const toKey = (date) => `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
      const countsMap = new Map();
      (rs.recordset || []).forEach(row => {
        const day = row.Giorno instanceof Date ? row.Giorno : new Date(row.Giorno);
        const key = toKey(day);
        countsMap.set(key, Number(row.Totale || 0));
      });

      const now = new Date();
      const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      const buildDay = (offset) => {
        const d = new Date(today);
        d.setUTCDate(d.getUTCDate() + offset);
        return d;
      };
      const weeklyData = [];
      const dayLabels = [];
      for (let i = -6; i <= 0; i += 1) {
        const day = buildDay(i);
        const key = toKey(day);
        dayLabels.push(key);
        weeklyData.push(countsMap.get(key) || 0);
      }

      const sumRange = (startOffset, endOffset) => {
        const start = buildDay(startOffset);
        const end = buildDay(endOffset);
        const cursor = new Date(start);
        let total = 0;
        while (cursor <= end) {
          total += countsMap.get(toKey(cursor)) || 0;
          cursor.setUTCDate(cursor.getUTCDate() + 1);
        }
        return total;
      };

      const totalWeek = weeklyData.reduce((acc, n) => acc + n, 0);
      const previousWeek = sumRange(-13, -7);
      const diff = totalWeek - previousWeek;
      const trend = diff > 0 ? 'up' : diff < 0 ? 'down' : 'stable';

      return res.json({
        success: true,
        dealerId,
        data: {
          weeklyData,
          totalWeek,
          previousWeek,
          trend,
          trendValue: diff,
          days: dayLabels,
          currentRange: { from: toKey(buildDay(-6)), to: toKey(today) },
          previousRange: { from: toKey(buildDay(-13)), to: toKey(buildDay(-7)) },
          lastUpdate: new Date().toISOString(),
        },
      });
    } catch (err) {
      console.error('[DEALER][performance-settimanale] Errore:', err);
      return res.status(500).json({ success: false, error: 'Errore nel calcolo performance settimanale', details: err?.message || String(err) });
    }
  });

  // === Modifica integrazione ordine per DEALER ===
  router.patch('/ordine/:id/modifica-integrazione', authenticateToken, requireDealer, express.json({ limit: '50mb' }), async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const dealerId = req.user.dealerId;
    const { payloadAggiornato, payload, resetState, nota } = req.body || {};
    const updatedPayload = (payloadAggiornato && typeof payloadAggiornato === 'object')
      ? payloadAggiornato
      : (payload && typeof payload === 'object' ? payload : null);
    
    // BUGFIX CRITICO: Se updatedPayload è vuoto {} e c'è solo una nota, NON aggiornare il payload
    const isEmptyPayload = updatedPayload && Object.keys(updatedPayload).length === 0;
    const hasOnlyNote = typeof nota === 'string' && nota.trim() !== '';
    
    if (!id) {
      return res.status(400).json({ success: false, error: 'ID non valido' });
    }
    
    // Se payload vuoto e solo nota, permetti l'operazione ma NON aggiornare il payload
    if (isEmptyPayload && hasOnlyNote) {
      console.log('[DEALER][MODIFICA-INTEGRAZIONE] Payload vuoto con nota - NON aggiorno payload per preservare dati esistenti');
    } else if (!updatedPayload) {
      return res.status(400).json({ success: false, error: 'payloadAggiornato/payload non valido' });
    }
    // Validazione NUMERO_DA_PASSARE (cellulare): accetta 9-10 cifre, con o senza spazio dopo 3 cifre; rifiuta sequenze tutte uguali/es. 000000000
    try {
      const rawNum = updatedPayload.NUMERO_DA_PASSARE || updatedPayload.NumeroDaPassare || null;
      if (rawNum != null && rawNum !== '') {
        const s = String(rawNum).trim();
        // Ammesse solo cifre e spazi
        if (!/^[0-9 ]+$/.test(s)) {
          return res.status(400).json({ success: false, error: 'Numero di cellulare non valido. Usa solo cifre ed eventualmente uno spazio.' });
        }
        // Normalizza rimuovendo spazi
        const digits = s.replace(/\s+/g, '');
        // Lunghezza 9 o 10, non iniziare con 0
        if (!(digits.length === 9 || digits.length === 10) || digits[0] === '0') {
          return res.status(400).json({ success: false, error: 'Numero di cellulare non valido. Esempi: 123 4567890 o 1234567890.' });
        }
        // Rifiuta tutte le cifre uguali (000000000, 111111111, ...)
        if (/^([0-9])\1+$/.test(digits)) {
          return res.status(400).json({ success: false, error: 'Numero di cellulare non valido.' });
        }
        // Se presente spazio, accetta solo formato 3 + spazio + 6/7
        if (s.includes(' ') && !/^\d{3}\s\d{6,7}$/.test(s)) {
          return res.status(400).json({ success: false, error: 'Formato non valido. Usa 123 4567890 oppure senza spazi.' });
        }
      }
    } catch (e) {
      return res.status(400).json({ success: false, error: 'Numero di cellulare non valido.' });
    }
    try {
      await sql.connect(dbConfig);
      // Verifica stato attuale e appartenenza dealer
      const statoRes = await new sql.Request()
        .input('id', sql.Int, id)
        .input('dealerId', sql.Int, dealerId)
        .query('SELECT Stato FROM dbo.tbOrdini WHERE IDOrdine = @id AND idDealer = @dealerId');
      if (!statoRes.recordset?.length) {
        return res.status(404).json({ success: false, error: 'Ordine non trovato o non autorizzato' });
      }
      const statoAttuale = statoRes.recordset[0]?.Stato;
      if (statoAttuale !== 3 && statoAttuale !== 10) {
        return res.status(403).json({ success: false, error: 'Modifica non consentita: stato attuale non ATTESA INTEGRAZIONE (3) o ATTESA MODULO (10)' });
      }
      
      // BUGFIX CRITICO: Aggiorna payload SOLO se non è vuoto
      // Se payload vuoto e c'è solo nota, NON sovrascrivere i dati esistenti
      if (!isEmptyPayload) {
        console.log('[DEALER][MODIFICA-INTEGRAZIONE] Aggiornamento payload con', Object.keys(updatedPayload).length, 'campi');
        await new sql.Request()
          .input('id', sql.Int, id)
          .input('payload', sql.NVarChar(sql.MAX), JSON.stringify(updatedPayload))
          .query('UPDATE dbo.tbDatiOrdine SET Payload = @payload WHERE IDOrdine = @id');
        await new sql.Request()
          .input('id', sql.Int, id)
          .input('payload', sql.NVarChar(sql.MAX), JSON.stringify(updatedPayload))
          .query('UPDATE dbo.tbDatiIntestario SET Payload = @payload WHERE IDOrdine = @id');
      } else {
        console.log('[DEALER][MODIFICA-INTEGRAZIONE] Payload vuoto - PRESERVO dati esistenti nel database');
      }

      // Se presente, aggiorna la nota del dealer
      if (typeof nota === 'string') {
        await new sql.Request()
          .input('id', sql.Int, id)
          .input('nota', sql.NVarChar(sql.MAX), nota)
          .query('UPDATE dbo.tbOrdini SET note_dealer = @nota WHERE IDOrdine = @id');
      }

      // Reset stato a 0 se richiesto (o sempre per la logica stabilita)
      const doReset = (resetState === true) || true; // per policy: ogni modifica in stato 3/10 resetta a 0
      let nuovoStato = statoAttuale;
      if (doReset) {
        await new sql.Request()
          .input('id', sql.Int, id)
          .query('UPDATE dbo.tbOrdini SET Stato = 0 WHERE IDOrdine = @id');
        nuovoStato = 0;
        // Storico
        try {
          await new sql.Request()
            .input('id', sql.Int, id)
            .input('utente', sql.NVarChar, `DEALER_${dealerId}`)
            .input('statoPrec', sql.Int, statoAttuale)
            .input('statoNuovo', sql.Int, nuovoStato)
            .input('nota', sql.NVarChar, (typeof nota === 'string' && nota) ? nota : 'MODIFICA INTEGRAZIONE DAL DEALER')
            .query(`INSERT INTO dbo.tbStoricoOrdini (IDOrdine, DataOra, Utente, StatoPrecedente, StatoNuovo, Nota)
                    VALUES (@id, GETUTCDATE(), @utente, @statoPrec, @statoNuovo, @nota)`);
        } catch {}
      }

      res.json({ success: true, stato: nuovoStato });
    } catch (err) {
      console.error('[DEALER][PATCH ordine/modifica-integrazione] Errore:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // === Dettaglio ordine/attivazione per DEALER ===
  router.get('/attivazione/:id', authenticateToken, requireDealer, async (req, res) => {
    const id = req.params.id;
    const dealerId = req.user.dealerId;
    try {
      await getPool();
      // Recupera ordine solo se appartiene al dealer
      const result = await (await getRequest())
        .input('id', sql.Int, id)
        .input('dealerId', sql.Int, dealerId)
        .query(`
          SELECT o.*, d.RagioneSociale AS Dealer, s.StatoEsteso, offe.Titolo AS Offerta,
            CONVERT(varchar, o.DataOra, 104) AS DataOrdine,
            offe.Crediti, offe.Segmento, offe.Tipo
          FROM dbo.tbOrdini o
          LEFT JOIN dbo.tbDealers d ON o.idDealer = d.IDDealer
          LEFT JOIN dbo.tbStatiOrdini s ON o.Stato = s.IDStato
          LEFT JOIN dbo.tbOfferte offe ON o.idOfferta = offe.IDOfferta
          WHERE o.IDOrdine = @id AND o.idDealer = @dealerId
        `);
      
      if (!result.recordset || result.recordset.length === 0) {
        return res.status(404).json({ error: 'Ordine non trovato' });
      }
      
      const ordine = result.recordset[0];
      // Esponi nota dealer se presente
      if (ordine && Object.prototype.hasOwnProperty.call(ordine, 'note_dealer')) {
        ordine.note_dealer = ordine.note_dealer; // già presente dal SELECT o.*
      }
      
      // Documenti: SOLO tbFileOrdine (S3)
      let documenti = [];
      try {
        // File salvati in tbFileOrdine (contengono Payload JSON con s3Url/originalName)
        const fileOrdineRes = await (await getRequest())
          .input('id', sql.Int, id)
          .query(`
            SELECT 
              TipoFile, NomeFile, FileUID, Payload,
              -- colonne possibili come fallback
              FileUrl, Url, NomeOriginale
            FROM dbo.tbFileOrdine 
            WHERE IDOrdine = @id
          `);
        const fromFileOrdine = (fileOrdineRes.recordset || []).map(r => {
          let payload = {};
          try { payload = r.Payload ? JSON.parse(r.Payload) : {}; } catch {}
          // Normalizza possibili chiavi URL
          const payloadUrl = payload.s3Url || payload.url || payload.URL || payload.Location || payload.location || null;
          // Ricostruisci URL da key se manca URL diretto
          const payloadKey = payload.s3Key || payload.key || payload.Key || null;
          const payloadBucket = payload.bucket || payload.Bucket || 'attivazionistation';
          const rebuiltUrl = (!payloadUrl && payloadKey) ? `https://${payloadBucket}.s3.amazonaws.com/${payloadKey}` : null;
          const url = payloadUrl || r.FileUrl || r.Url || rebuiltUrl || null;
          // Normalizza nome file
          const nome = payload.originalName || payload.OriginalName || payload.name || payload.filename || r.NomeOriginale || r.NomeFile || r.FileUID || 'allegato';
          return { tipo: r.TipoFile, nome, url };
        }).filter(x => x.url || x.nome);
        documenti = fromFileOrdine;
      } catch (e) {
        documenti = [];
      }
      // Deduplica documenti per chiave (url||nome)
      const docSeen = new Set();
      const documentiUnici = [];
      for (const d of documenti) {
        const key = (d.url || '') + '|' + (d.nome || '');
        if (!docSeen.has(key)) {
          docSeen.add(key);
          documentiUnici.push(d);
        }
      }
      ordine.Documenti = documentiUnici;
      
      // Storico cambi stato con nomi estesi
      let storico = [];
      // Recupera dati principali ordine con template
      const result2 = await (await getRequest())
        .input('id', sql.Int, id)
        .input('dealerId', sql.Int, dealerId)
        .query(`
          SELECT TOP 1 
            o.*, 
            offe.Titolo, 
            offe.Tipo,
            offe.Segmento,
            offe.Descrizione,
            offe.TemplateDatiOfferta,
            st.StatoEsteso
          FROM [${dbConfig.database}].dbo.tbOrdini o
          LEFT JOIN [${dbConfig.database}].dbo.tbOfferte offe ON o.idOfferta = offe.idOfferta
          LEFT JOIN [${dbConfig.database}].dbo.tbStatiOrdini st ON o.Stato = st.IDStato
          WHERE o.IDOrdine = @id AND o.idDealer = @dealerId
        `);
      const ordineDettaglio = result2.recordset[0];
      if (ordineDettaglio) {
        ordine.TitoloOfferta = ordineDettaglio.Titolo;
        ordine.TipoOfferta = ordineDettaglio.Tipo;
        ordine.SegmentoOfferta = ordineDettaglio.Segmento;
        ordine.DescrizioneOfferta = ordineDettaglio.Descrizione;
        ordine.TemplateDatiOfferta = ordineDettaglio.TemplateDatiOfferta;
        ordine.StatoEsteso = ordineDettaglio.StatoEsteso;
      }

      // Carica template dinamico se disponibile
      if (ordineDettaglio && ordineDettaglio.TemplateDatiOfferta) {
        try {
          const fs = await import('fs');
          const path = await import('path');
          const { fileURLToPath } = await import('url');
          const __filename = fileURLToPath(import.meta.url);
          const __dirname = path.default.dirname(__filename);
          const templatesPath = path.default.join(__dirname, 'templates.json');
          const templatesData = JSON.parse(fs.default.readFileSync(templatesPath, 'utf8'));
          const template = templatesData.find(t => t.template === ordineDettaglio.TemplateDatiOfferta);
          ordine.Template = template || null;
        } catch (e) {
          console.error('Errore caricamento template:', e);
          ordine.Template = null;
        }
      }

      // Recupera documenti allegati dall'ordine
      try {
        const documentiRes = await (await getRequest())
          .input('idOrdine', sql.Int, id)
          .query(`
            SELECT 
              IDFileOrdine,
              TipoFile,
              NomeFile,
              Payload
            FROM [${dbConfig.database}].dbo.tbFileOrdine
            WHERE IDOrdine = @idOrdine
            ORDER BY TipoFile, NomeFile
          `);
        ordine.Documenti = documentiRes.recordset.map(doc => {
          let payload = {};
          try {
            payload = JSON.parse(doc.Payload || '{}');
          } catch (e) {
            console.error('Errore parsing payload documento:', e);
          }
          return {
            id: doc.IDFileOrdine,
            tipo: doc.TipoFile,
            nome: doc.NomeFile,
            url: payload.s3Url || null,
            nomeOriginale: payload.originalName || doc.NomeFile
          };
        });
      } catch (e) {
        console.error('Errore recupero documenti:', e);
        ordine.Documenti = [];
      }
      try {
        const storicoRes = await (await getRequest())
          .input('id', sql.Int, id)
          .query(`
            SELECT 
              s.DataOra, 
              s.Utente, 
              s.StatoPrecedente, 
              s.StatoNuovo, 
              sp.StatoEsteso AS StatoPrecedenteNome,
              sn.StatoEsteso AS StatoNuovoNome,
              s.Nota
            FROM dbo.tbStoricoOrdini s
            LEFT JOIN dbo.tbStatiOrdini sp ON s.StatoPrecedente = sp.IDStato
            LEFT JOIN dbo.tbStatiOrdini sn ON s.StatoNuovo = sn.IDStato
            WHERE s.IDOrdine = @id
            ORDER BY s.DataOra DESC
          `);
        storico = storicoRes.recordset || [];
      } catch (e) {
        storico = [];
      }
      ordine.Storico = storico;
      
      // Payload da tbDatiOrdine
      let payload = {};
      try {
        const dati = await (await getRequest())
          .input('id', sql.Int, id)
          .query(`SELECT TOP 1 Payload FROM dbo.tbDatiOrdine WHERE IDOrdine = @id`);
        payload = dati.recordset[0]?.Payload ? JSON.parse(dati.recordset[0].Payload) : {};
      } catch (e) {
        payload = {};
      }
      ordine.Payload = payload;
      
      // Payload intestatario - SOLO dal campo Payload di tbDatiIntestario
      let payloadInt = {};
      try {
        const datiInt = await (await getRequest())
          .input('id', sql.Int, id)
          .query(`SELECT TOP 1 Payload FROM dbo.tbDatiIntestario WHERE IDOrdine = @id`);
        const row = datiInt.recordset[0];
        payloadInt = row?.Payload ? JSON.parse(row.Payload) : {};
      } catch (e) {
        console.error(`[DEALER][GET /attivazione/${id}] Errore tbDatiIntestario:`, e.message);
        payloadInt = {};
      }
      ordine.PayloadIntestario = payloadInt;

      // Normalizza intestatario SOLO dal PayloadIntestario
      const pIntest = payloadInt || {};
      
      // Nome/Cognome: split del nome completo dal payload intestatario
      const nomeCompletoPI = pIntest.NOME_E_COGNOME_INTESTATARIO_CONTRATTO || '';
      const nomeFromSplit = nomeCompletoPI ? nomeCompletoPI.trim().split(/\s+/).slice(0, -1).join(' ') : null;
      const cognomeFromSplit = nomeCompletoPI ? nomeCompletoPI.trim().split(/\s+/).slice(-1).join(' ') : null;
      
      // Tutti i dati dal PayloadIntestario
      const codiceFiscale = pIntest.CODICE_FISCALE_INTESTATARIO || pIntest.CodiceFiscale || pIntest.CODICE_FISCALE || pIntest.CF || null;
      const emailInt = pIntest.EMAIL || pIntest.Email || pIntest.MAIL || null;
      const telefono = pIntest.RECAPITO_DI_RIFERIMENTO || pIntest.NUMERO_TELEFONO || pIntest.CELLULARE || pIntest.TELEFONO || null;
      const indirizzo = pIntest.INDIRIZZO_E_CIVICO_ATTIVAZIONE || pIntest.INDIRIZZO || null;
      const citta = pIntest.CITTA || null;
      const cap = pIntest.CAP || null;
      const provincia = pIntest.PROVINCIA || null;
      const ragioneSociale = pIntest.RAGIONE_SOCIALE || pIntest.RagioneSociale || null;
      const nome = pIntest.NOME || nomeFromSplit || null;
      const cognome = pIntest.COGNOME || cognomeFromSplit || null;
      const dataNascita = pIntest.DATA_DI_NASCITA || null;
      const luogoNascita = pIntest.LUOGO_DI_NASCITA || null;
      ordine.Intestatario = {
        Tipo: null, // Non usato dalle colonne
        Nome: nome || null,
        Cognome: cognome || null,
        RagioneSociale: ragioneSociale || null,
        CodiceFiscale: codiceFiscale || null,
        PIVA: pIntest.PIVA || null,
        Indirizzo: indirizzo || null,
        CAP: cap || null,
        Citta: citta || null,
        Provincia: provincia || null,
        Email: emailInt || null,
        Telefono: telefono || null,
        DataNascita: dataNascita || null,
        LuogoNascita: luogoNascita || null,
      };

      // Costruisci dati sintetici richiesti dal cliente da tbDatiOrdine/tbDatiIntestario
      const p = payload || {};
      const pInt = payloadInt || {};
      ordine.Dati = {
        TipoDocumento: p.TIPO_DI_DOCUMENTO || p.tipoDocumento || null,
        NumeroDocumento: p.NUMERO_DOCUMENTO || null,
        RilascioDocumento: p.DATA_E_LUOGO_RILASCIO_DOCUMENTO || null,
        EnteRilascioDocumento: p.ENTE_RILASCIO_DOCUMENTO || null,
        ScadenzaDocumento: p.SCADENZA_DOCUMENTO || null,
        NumeroDaPassare: p.NUMERO_DA_PASSARE || null,
        GestoreDiProvenienza: p.GESTORE_DI_PROVENIENZA || null,
        SerialeSimDaAttivare: p.SERIALE_SIM_DA_ATTIVARE || null,
        NumeroTelefono: pInt.NUMERO_TELEFONO || p.NUMERO_TELEFONO || null,
      };
      
      // File ordine
      let fileOrdine = [];
      try {
        const files = await new sql.Request()
          .input('id', sql.Int, id)
          .query(`SELECT * FROM dbo.tbFileOrdine WHERE IDOrdine = @id`);
        fileOrdine = files.recordset || [];
      } catch (e) {
        fileOrdine = [];
      }
      ordine.FileOrdine = fileOrdine;
      
      // LOG DIAGNOSTICO: riepilogo campi chiave prima della risposta
      try {
        // INFO DB e presenza dati per ID
        try {
          const dbg = await new sql.Request()
            .input('id', sql.Int, id)
            .query(`
              SELECT DB_NAME() as dbname;
              SELECT COUNT(*) as cntInt, MAX(LEN(ISNULL(Payload,''))) as payloadIntLen FROM dbo.tbDatiIntestario WHERE IDOrdine = @id;
              SELECT COUNT(*) as cntFile FROM dbo.tbFileOrdine WHERE IDOrdine = @id;
              SELECT TOP 5 TipoFile, NomeFile FROM dbo.tbFileOrdine WHERE IDOrdine = @id ORDER BY IDFileOrdine;
            `);
          const dbname = dbg.recordsets?.[0]?.[0]?.dbname;
          const cntInt = dbg.recordsets?.[1]?.[0]?.cntInt;
          const payloadIntLen = dbg.recordsets?.[1]?.[0]?.payloadIntLen;
          const cntFile = dbg.recordsets?.[2]?.[0]?.cntFile;
          const filesPeek = dbg.recordsets?.[3] || [];
          console.log(`[DEALER][GET /attivazione/${id}] DB: ${dbname} | tbDatiIntestario rows: ${cntInt} payloadLen: ${payloadIntLen} | tbFileOrdine rows: ${cntFile} peek:`, filesPeek);
        } catch (e) {
          console.warn(`[DEALER][GET /attivazione/${id}] Debug DB fallito:`, e?.message);
        }
        // Logga snippet payload grezzi per debug
        try {
          const rawInt = JSON.stringify(ordine.PayloadIntestario || {});
          const rawOrd = JSON.stringify(ordine.Payload || {});
          const rawFiles = (ordine.FileOrdine || []).slice(0,3).map(r => ({
            TipoFile: r.TipoFile,
            NomeFile: r.NomeFile,
            PayloadLen: r.Payload ? String(r.Payload).length : 0,
            PayloadSnippet: r.Payload ? String(r.Payload).substring(0, 200) : ''
          }));
          console.log(`[DEALER][GET /attivazione/${id}] Raw PayloadIntestario len: ${rawInt.length} snippet:`, rawInt.substring(0, 200));
          console.log(`[DEALER][GET /attivazione/${id}] Raw PayloadOrdine len: ${rawOrd.length} snippet:`, rawOrd.substring(0, 200));
          console.log(`[DEALER][GET /attivazione/${id}] Raw tbFileOrdine first3:`, rawFiles);
        } catch {}
        const docCount = Array.isArray(ordine.Documenti) ? ordine.Documenti.length : 0;
        const intestSummary = ordine.Intestatario ? {
          Nome: ordine.Intestatario.Nome,
          Cognome: ordine.Intestatario.Cognome,
          RagioneSociale: ordine.Intestatario.RagioneSociale,
          CodiceFiscale: ordine.Intestatario.CodiceFiscale,
          Email: ordine.Intestatario.Email,
          Telefono: ordine.Intestatario.Telefono,
        } : null;
        const pIntSize = Object.keys(ordine.PayloadIntestario || {}).length;
        const pSize = Object.keys(ordine.Payload || {}).length;
        console.log(`[DEALER][GET /attivazione/${id}] Intestatario presente:`, !!ordine.Intestatario, 'Dettagli:', intestSummary);
        console.log(`[DEALER][GET /attivazione/${id}] Documenti count:`, docCount);
        console.log(`[DEALER][GET /attivazione/${id}] Dati keys:`, Object.keys(ordine.Dati || {}));
        console.log(`[DEALER][GET /attivazione/${id}] PayloadIntestario keys:`, pIntSize, '| PayloadOrdine keys:', pSize);
      } catch (e) {
        console.warn('[DEALER][GET /attivazione] Log diagnostico non riuscito:', e?.message);
      }

      res.json(ordine);
    } catch (err) {
      console.error('[DEALER][DETTAGLIO ORDINE] Errore:', err);
      res.status(500).json({ error: 'Errore server' });
    }
  });

  // Endpoint per le ultime attivazioni del dealer
  router.get('/ultime-attivazioni', authenticateToken, requireDealer, async (req, res) => {
    console.log('[DEBUG][GET /api/dealer/ultime-attivazioni] URL:', req.originalUrl, '| Query:', req.query);
    console.log('[DEBUG] Dettagli utente:', {
      user: req.user,
      roles: req.user?.ruoli,
      dealerId: req.user?.dealerId
    });
    
    try {
      const dealerId = req.user.dealerId || req.user.idDealer || req.user.id;
      if (!dealerId) {
        console.error('[ERROR] ID dealer mancante nel token. Dettagli utente:', req.user);
        return res.status(400).json({ 
          error: 'ID dealer mancante nel token',
          details: 'Impossibile identificare il dealer associato a questo account',
          user: req.user // Incluso per debug
        });
      }

      const pool = await getPool();
      console.log(`[DEBUG] Esecuzione di tutte le query per dealerId: ${dealerId}`);
      
      // Array per raccogliere tutti i risultati
      let tuttiRisultati = [];
      
      // Crea UNA SOLA Request dal pool
      const request = pool.request();
      
      // Query riutilizzabile per controllo dealer
      const checkDealerQuery = `
        SELECT IDDealer, COMSY1, COMSY2 
        FROM [${dbConfig.database}].[dbo].[tbDealers] 
        WHERE IDDealer = @idDealer`;
        
      // Verifica esistenza dealer
      request.input('idDealer', sql.Int, dealerId);
      const dealerResult = await request.query(checkDealerQuery);
      
      if (!dealerResult.recordset?.length) {
        console.error('[ERROR] Dealer non trovato con ID:', dealerId);
        return res.json({ success: true, data: [] });
      }
      
      const dealer = dealerResult.recordset[0];

      // QUERY 1: FASTWEB (dbo.InseritoFW)
      console.log('[DEBUG] Esecuzione query FASTWEB (InseritoFW)');
      try {
        const fastwebQuery = `
          WITH CodiciDealer AS (
              SELECT COMSY1, COMSY2
              FROM [${dbConfig.database}].[dbo].[tbDealers]
              WHERE IDDealer = @idDealer
          ),
          BatchPerMese AS (
              SELECT 
                  CAST([Batch] AS datetime) AS DataBatch,
                  FORMAT(CAST([Batch] AS datetime), 'yyyy-MM') AS MeseRiferimento
              FROM [${dbConfig.database}].[dbo].[InseritoFW]
          ),
          UltimiBatchMensili AS (
              SELECT 
                  MeseRiferimento,
                  MAX(DataBatch) AS UltimoBatchMese
              FROM BatchPerMese
              GROUP BY MeseRiferimento
          ),
          AttivazioniUltimiBatchMensili AS (
              SELECT I.*
              FROM [${dbConfig.database}].[dbo].[InseritoFW] I
              INNER JOIN UltimiBatchMensili U
                  ON CAST(I.[Batch] AS datetime) = U.UltimoBatchMese
          )
          SELECT DISTINCT
              FORMAT(CAST(AF.[Batch] AS datetime), 'dd.MM.yyyy') AS Data,
              AF.[Cliente],
              AF.[Valore] AS Titolo,
              AF.[Segmento],
              AF.[Tipo Ordine] AS Tipo,
              'Completato' AS Stato,
              CAST(AF.[Batch] AS datetime) AS DataOrdinamento
          FROM AttivazioniUltimiBatchMensili AF
          JOIN CodiciDealer D
              ON AF.[Codice Comsy Tecnico Attuale] IN (D.COMSY1, D.COMSY2)
          ORDER BY CAST(AF.[Batch] AS datetime) DESC`;
        
        // Riusa la stessa request
        const fastwebResult = await request.query(fastwebQuery);
        
        const fastwebMapped = (fastwebResult.recordset || []).map(row => ({
          Data: row.Data,
          Titolo: row.Titolo,
          Tipo: row.Tipo,
          Segmento: row.Segmento,
          Stato: row.Stato,
          DataOrdinamento: row.DataOrdinamento
        }));
        
        tuttiRisultati = tuttiRisultati.concat(fastwebMapped);
        console.log(`[DEBUG] FASTWEB: ${fastwebMapped.length} risultati`);
      } catch (err) {
        console.error('[ERROR] Query FASTWEB fallita:', err);
      }

      // QUERY 2: FASTWEB ENERGIA (dbo.FWEnergiaImporter)
      console.log('[DEBUG] Esecuzione query FASTWEB ENERGIA (FWEnergiaImporter)');
      try {
        const energiaQuery = `
          WITH CodiciDealer AS (
              SELECT COMSY1, COMSY2
              FROM [${dbConfig.database}].[dbo].[tbDealers]
              WHERE IDDealer = @idDealer
          ),
          BatchPerMese AS (
              SELECT 
                  CAST([Batch] AS datetime) AS DataBatch,
                  FORMAT(CAST([Batch] AS datetime), 'yyyy-MM') AS MeseRiferimento
              FROM [${dbConfig.database}].[dbo].[FWEnergiaImporter]
          ),
          UltimiBatchMensili AS (
              SELECT 
                  MeseRiferimento,
                  MAX(DataBatch) AS UltimoBatchMese
              FROM BatchPerMese
              GROUP BY MeseRiferimento
          ),
          AttivazioniUltimiBatchMensili AS (
              SELECT E.*
              FROM [${dbConfig.database}].[dbo].[FWEnergiaImporter] E
              INNER JOIN UltimiBatchMensili U
                  ON CAST(E.[Batch] AS datetime) = U.UltimoBatchMese
          )
          SELECT DISTINCT
              FORMAT(CAST(EF.[Batch] AS datetime), 'dd.MM.yyyy') AS Data,
              EF.[Codice Contratto] AS Cliente,
              EF.[Nome Offerta Vendita] AS Titolo,
              EF.[Segmento],
              EF.[Tipo Cliente] AS Tipo,
              'Completato' AS Stato,
              CAST(EF.[Batch] AS datetime) AS DataOrdinamento
          FROM AttivazioniUltimiBatchMensili EF
          JOIN CodiciDealer D
              ON EF.[Codice Comsy/Order Owner (Report!DBSELLER)] IN (D.COMSY1, D.COMSY2)
          ORDER BY CAST(EF.[Batch] AS datetime) DESC`;
        
        // Riusa la stessa request
        const energiaResult = await request.query(energiaQuery);
        
        const energiaMapped = (energiaResult.recordset || []).map(row => ({
          Data: row.Data,
          Titolo: row.Titolo,
          Tipo: row.Tipo,
          Segmento: row.Segmento,
          Stato: row.Stato,
          DataOrdinamento: row.DataOrdinamento
        }));
        
        tuttiRisultati = tuttiRisultati.concat(energiaMapped);
        console.log(`[DEBUG] FASTWEB ENERGIA: ${energiaMapped.length} risultati`);
      } catch (err) {
        console.error('[ERROR] Query FASTWEB ENERGIA fallita:', err);
      }

      // QUERY 3: ORDINI (dbo.tbOrdini)
      console.log('[DEBUG] Esecuzione query ORDINI (tbOrdini)');
      try {
        const ordiniQuery = `
          SELECT
            o.IDOrdine,
            CONVERT(VARCHAR(10), o.DataOra, 103) AS Data,
            offr.Titolo AS Titolo,
            offr.Tipo AS Tipo,
            offr.Segmento AS Segmento,
            so.StatoEsteso AS Stato,
            o.DataOra AS DataOrdinamento,
            i.Payload AS IntestatarioPayload
          FROM [${dbConfig.database}].[dbo].[tbOrdini] o
          LEFT JOIN [${dbConfig.database}].[dbo].[tbStatiOrdini] so ON o.Stato = so.IDStato
          LEFT JOIN [${dbConfig.database}].[dbo].[tbOfferte] offr ON o.idOfferta = offr.IDOfferta
          LEFT JOIN [${dbConfig.database}].[dbo].[tbDatiIntestario] i ON o.IDOrdine = i.IDOrdine
          WHERE o.idDealer = @idDealer
          ORDER BY o.DataOra DESC`;
        
        // Riusa la stessa request
        const ordiniResult = await request.query(ordiniQuery);
        
        const ordiniMapped = (ordiniResult.recordset || []).map(row => {
          // Estrai il nome cliente dal Payload JSON
          let cliente = '';
          if (row.IntestatarioPayload) {
            try {
              const payload = JSON.parse(row.IntestatarioPayload);
              cliente = payload.NOME_E_COGNOME || payload.NOME_E_COGNOME_INTESTATARIO_CONTRATTO || payload.NOME_E_COGNOME_INTESTATARIO || '';
            } catch {}
          }
          
          return {
            Data: row.Data,
            Titolo: `${row.Titolo || 'N/A'}${cliente ? ' - ' + cliente : ''}`,
            Tipo: row.Tipo || 'N/A',
            Segmento: row.Segmento || 'N/A',
            Stato: row.Stato || 'N/A',
            IDOrdine: row.IDOrdine,
            DataOrdinamento: row.DataOrdinamento
          };
        });
        
        tuttiRisultati = tuttiRisultati.concat(ordiniMapped);
        console.log(`[DEBUG] ORDINI PRODOTTI: ${ordiniMapped.length} risultati`);
      } catch (err) {
        console.error('[ERROR] Query ORDINI PRODOTTI fallita:', err);
      }

      // Combina tutti i risultati e ordina per data
      console.log(`[DEBUG] Totale risultati prima dell'ordinamento: ${tuttiRisultati.length}`);
      
      // Ordina per DataOrdinamento (più recente prima)
      tuttiRisultati.sort((a, b) => {
        const dateA = new Date(a.DataOrdinamento);
        const dateB = new Date(b.DataOrdinamento);
        return dateB - dateA; // Ordine decrescente (più recente prima)
      });
      
      // Rimuovi DataOrdinamento da tutti i risultati
      const risultatiFinali = tuttiRisultati.map(item => {
        const { DataOrdinamento, ...resto } = item;
        return resto;
      });
      
      console.log(`[DEBUG] Risultati finali restituiti: ${risultatiFinali.length}`);
      return res.json({ success: true, data: risultatiFinali });

    } catch (err) {
      console.error('[DEALER][ultime-attivazioni] Errore generale:', err);
      res.status(500).json({ success: false, error: 'Errore del server', details: err.message });
    }
  });

// Endpoint per gli ultimi 5 ordini del dealer
router.get('/ultimi-ordini', authenticateToken, requireDealer, async (req, res) => {
  try {
    const dealerId = req.user.dealerId;
    if (!dealerId) {
      return res.status(400).json({ success: false, error: 'ID dealer mancante nel token' });
    }
    await sql.connect(dbConfig);
    const request = new sql.Request();
    request.input('idDealer', sql.Int, dealerId);
    const dbName = getDbName();
    const query = `
      SELECT TOP 5
        o.IDOrdineProdotto AS IDOrdine,      
        CONVERT(VARCHAR(10), o.DataOra, 120) AS Data,
        CASE 
          WHEN COUNT(dop.IDOfferta) > 1 THEN CONCAT(COUNT(dop.IDOfferta), ' prodotti')
          WHEN COUNT(dop.IDOfferta) = 1 THEN MAX(offr.Titolo)
          ELSE 'Nessun prodotto'
        END AS Prodotto,
        CASE 
          WHEN COUNT(dop.IDOfferta) > 1 THEN 'MULTIPLI'
          WHEN COUNT(dop.IDOfferta) = 1 THEN MAX(offr.Tipo)
          ELSE 'N/A'
        END AS Tipo,
        -- Importo totale ordine: prima del 16/08/2025 TotaleOrdine includeva già la spedizione.
        -- Dal 16/08/2025 in poi: TotaleOrdine esclude spedizione, quindi si somma SpeseSpedizione.
        CAST(
          CASE 
            WHEN o.DataOra < '2025-08-16' THEN o.TotaleOrdine
            ELSE o.TotaleOrdine + ISNULL(o.SpeseSpedizione, 0)
          END AS DECIMAL(10,2)
        ) AS Importo,
        CASE 
          WHEN o.Payload LIKE '%"payment_method":%' AND o.Payload LIKE '%"card"%' THEN 'PAGATO CON CC'
          WHEN o.idStatoOrdineProdotto = 2 THEN 'PAGATO'
          WHEN o.idStatoOrdineProdotto = 1 THEN 'IN ATTESA'
          ELSE ISNULL(so.StatoEsteso, 'SCONOSCIUTO')
        END AS Stato
      FROM [${dbName}].dbo.tbOrdiniProdotti o
      LEFT JOIN [${dbName}].dbo.tbStatiOrdiniProdotti so ON o.idStatoOrdineProdotto = so.IDStato
      LEFT JOIN [${dbName}].dbo.tbDettagliOrdiniProdotti dop ON o.IDOrdineProdotto = dop.IDOrdineProdotto
      LEFT JOIN [${dbName}].dbo.tbOfferte offr ON dop.IDOfferta = offr.IDOfferta
      WHERE o.idDealer = @idDealer
      GROUP BY o.IDOrdineProdotto, o.DataOra, o.TotaleOrdine, o.SpeseSpedizione, o.idStatoOrdineProdotto, o.Payload, so.StatoEsteso
      ORDER BY o.DataOra DESC`;
    const result = await request.query(query);
    res.json({ success: true, data: result.recordset || [] });
  } catch (err) {
    console.error('[DEALER][ultimi-ordini] Errore:', err);
    res.status(500).json({ success: false, error: 'Errore del server', details: err.message });
  }
});

// Endpoint per il dettaglio ordine prodotto
  router.get('/ordine-prodotto/:id', authenticateToken, requireDealer, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const dealerId = req.user.dealerId;
    if (!id || !dealerId) {
      return res.status(400).json({ success: false, error: 'ID ordine o dealer mancante' });
    }
    try {
      await sql.connect(dbConfig);
      // Recupera dati principali ordine prodotto
      const dbName = getDbName();
      const result = await new sql.Request()
        .input('id', sql.Int, id)
        .input('dealerId', sql.Int, dealerId)
        .query(`
          SELECT 
            o.*, 
            so.StatoEsteso, 
            -- Importo totale ordine con correzione per ordini antecedenti al 16/08/2025
            CAST(
              CASE 
                WHEN o.DataOra < '2025-08-16' THEN o.TotaleOrdine
                ELSE o.TotaleOrdine + ISNULL(o.SpeseSpedizione, 0)
              END AS DECIMAL(10,2)
            ) AS ImportoTotale, 
            o.OrdineDaAgente,
            -- Determina metodo di pagamento: se c'è Payload Stripe = CC, altrimenti = Bonifico
            CASE 
              WHEN o.Payload IS NOT NULL AND o.Payload != '' THEN 'Carta di credito'
              ELSE 'Bonifico SEPA'
            END AS MetodoPagamento
          FROM [${dbName}].dbo.tbOrdiniProdotti o
          LEFT JOIN [${dbName}].dbo.tbStatiOrdiniProdotti so ON o.idStatoOrdineProdotto = so.IDStato
          WHERE o.IDOrdineProdotto = @id AND o.idDealer = @dealerId
        `);
      if (!result.recordset || result.recordset.length === 0) {
        return res.status(404).json({ success: false, error: 'Ordine prodotto non trovato o non autorizzato' });
      }
      const ordine = result.recordset[0];
      // Recupera dettagli prodotti
      const dettagliRes = await new sql.Request()
        .input('id', sql.Int, id)
        .query(`
          SELECT 
            dop.IDDettagliOrdiniProdotti,
            dop.IDOrdineProdotto,
            dop.IDOfferta,
            dop.Quantita,
            dop.CostoUnitario,
            dop.SIMTYPE,
            dop.SIMCOUNT,
            offr.Titolo, 
            offr.Tipo,
            -- Prezzo unitario dal database (già in euro)
            CAST(dop.CostoUnitario AS DECIMAL(10,2)) AS PrezzoUnitario
          FROM [${dbName}].dbo.tbDettagliOrdiniProdotti dop
          LEFT JOIN [${dbName}].dbo.tbOfferte offr ON dop.IDOfferta = offr.IDOfferta
          LEFT JOIN [${dbName}].dbo.tbOrdiniProdotti o ON dop.IDOrdineProdotto = o.IDOrdineProdotto
          WHERE dop.IDOrdineProdotto = @id
        `);
      ordine.Dettagli = dettagliRes.recordset || [];
      ordine.Prodotti = ordine.Dettagli;
      // Assicurati che ogni prodotto abbia un prezzo valido (converte centesimi in euro se necessario)
      ordine.Prodotti.forEach(p => {
        // Se PrezzoUnitario non è stato calcolato dalla query, usa CostoUnitario direttamente
        if (!p.PrezzoUnitario && p.CostoUnitario) {
          p.PrezzoUnitario = p.CostoUnitario;
        }
        p.PrezzoUnitario = p.PrezzoUnitario || 0;
        p.Quantita = p.Quantita || 1;
      });
      if (!ordine.ImportoTotale && ordine.Dettagli.length > 0) {
        ordine.ImportoTotale = ordine.Dettagli.reduce((tot, p) => tot + (p.PrezzoUnitario || 0) * (p.Quantita || 1), 0);
      }
      res.json(ordine);
    } catch (err) {
      console.error('[DEALER][ordine-prodotto/:id] Errore:', err);
      res.status(500).json({ success: false, error: 'Errore del server', details: err.message });
    }
  });

// Endpoint per gli obiettivi del dealer
  router.get('/obiettivi', authenticateToken, requireDealer, async (req, res) => {
    try {
      const dealerId = req.user.dealerId || req.user.idDealer || req.user.id;
      if (!dealerId) {
        return res.status(400).json({ error: 'ID dealer mancante nel token' });
      }

      const now = new Date();
      const anno = now.getFullYear();
      const mese = now.getMonth() + 1;
      
      console.log(`[DEBUG] Calcolo obiettivi per dealer ${dealerId} - ${anno}/${mese}`);
      
      await sql.connect(dbConfig);
      
      // 1. RECUPERA LE SOGLIE PER IL MESE CORRENTE
      const soglieRequest = new sql.Request();
      soglieRequest.input('anno', sql.Int, anno);
      soglieRequest.input('mese', sql.Int, mese);
      
      const soglieQuery = `
        SELECT 
          operatore, categoria, segmento,
          soglia_1_min, soglia_1_max,
          soglia_2_min, soglia_2_max, 
          soglia_3_min, soglia_3_max,
          soglia_4_min, soglia_4_max
        FROM [${dbConfig.database}].[dbo].[soglie_report]
        WHERE anno = @anno AND mese = @mese
        ORDER BY operatore, categoria, segmento`;
      
      const soglieResult = await soglieRequest.query(soglieQuery);
      const soglie = soglieResult.recordset;
      
      console.log(`[DEBUG] Trovate ${soglie.length} soglie per ${anno}/${mese}`);
      
      // 2. FUNZIONI HELPER PER CALCOLARE PROGRESSI
      const calcolaProgressi = (attuale, sogliaRow) => {
        const soglieLivelli = [
          { min: sogliaRow.soglia_1_min, max: sogliaRow.soglia_1_max, livello: 1 },
          { min: sogliaRow.soglia_2_min, max: sogliaRow.soglia_2_max, livello: 2 },
          { min: sogliaRow.soglia_3_min, max: sogliaRow.soglia_3_max, livello: 3 },
          { min: sogliaRow.soglia_4_min, max: sogliaRow.soglia_4_max, livello: 4 }
        ].filter(s => s.min !== null && s.max !== null);
        
        // Safety check: se non ci sono soglie configurate, ritorna valori di default
        if (soglieLivelli.length === 0) {
          return {
            livelloRaggiunto: 0,
            prossimoTarget: 0,
            mancano: 0,
            percentuale: 0
          };
        }
        
        let livelloRaggiunto = 0;
        let prossimoTarget = null;
        let mancano = 0;
        let percentuale = 0;
        
        // Trova il livello raggiunto
        for (const soglia of soglieLivelli) {
          if (attuale >= soglia.min && attuale <= soglia.max) {
            livelloRaggiunto = soglia.livello;
            break;
          }
        }
        
        // Se non ha trovato un livello esatto, controlla se ha superato tutti i livelli
        if (livelloRaggiunto === 0 && soglieLivelli.length > 0) {
          const ultimoLivello = soglieLivelli[soglieLivelli.length - 1];
          if (attuale > ultimoLivello.max) {
            // Ha superato tutti i livelli - è al livello massimo
            livelloRaggiunto = ultimoLivello.livello;
            prossimoTarget = ultimoLivello.max;
            mancano = 0;
            percentuale = 100;
          } else {
            // Non ha raggiunto nessun livello, punta al primo
            prossimoTarget = soglieLivelli[0].max;
            mancano = Math.max(0, prossimoTarget - attuale);
            percentuale = Math.min(100, (attuale / prossimoTarget) * 100);
          }
        } else {
          // Ha raggiunto un livello specifico
          const prossimoLivello = soglieLivelli.find(s => s.livello > livelloRaggiunto);
          if (prossimoLivello) {
            // C'è un livello successivo
            prossimoTarget = prossimoLivello.max;
            mancano = Math.max(0, prossimoTarget - attuale);
            const livelloCorrente = soglieLivelli.find(s => s.livello === livelloRaggiunto);
            if (livelloCorrente) {
              const progressoLivello = attuale - livelloCorrente.min;
              const rangeLivello = livelloCorrente.max - livelloCorrente.min;
              percentuale = Math.min(100, (progressoLivello / rangeLivello) * 100);
            }
          } else {
            // È già al livello massimo
            const ultimoLivello = soglieLivelli[soglieLivelli.length - 1];
            prossimoTarget = ultimoLivello.max;
            mancano = 0;
            percentuale = 100;
          }
        }
        
        return {
          livelloRaggiunto,
          prossimoTarget,
          mancano,
          percentuale: Math.round(percentuale)
        };
      };

      // 3. CALCOLA ATTIVAZIONI EFFETTIVE DEL DEALER CON QUERY UNIFICATA (SKY + FASTWEB TELCO + FASTWEB ENERGY)
      const dealerRequest = new sql.Request();
      dealerRequest.input('dealerId', sql.Int, parseInt(dealerId));
      dealerRequest.input('anno', sql.Int, anno);
      dealerRequest.input('mese', sql.Int, mese);

      const actualsQuery = `
        ;WITH CTE_DealerComsy AS (
            SELECT d.idDealer, d.COMSY1, d.COMSY2
            FROM [${dbConfig.database}].dbo.tbDealers d
            WHERE d.idDealer = @dealerId
        ),

        /* SKY */
        CTE_SKY AS (
            SELECT
                o.idOrdine,
                o.DataOra,
                f.Tipo AS segmento
            FROM [${dbConfig.database}].dbo.tbOrdini AS o
            INNER JOIN [${dbConfig.database}].dbo.tbOfferte AS f
                ON o.idOfferta = f.idOfferta
            INNER JOIN CTE_DealerComsy AS dc
                ON o.idDealer = dc.idDealer
            WHERE YEAR(o.DataOra) = @anno
              AND MONTH(o.DataOra) = @mese
        ),
        CTE_SKY_Distinct AS (
            SELECT s.idOrdine, s.segmento
            FROM CTE_SKY AS s
            GROUP BY s.idOrdine, s.segmento
        ),

        /* FASTWEB TELCO */
        CTE_MaxBatchPerMese AS (
            SELECT Year, Month, MAX(Batch) AS MaxBatch
            FROM [${dbConfig.database}].dbo.viewLastStatoOrdiniNoUnion
            GROUP BY Year, Month
        ),
        CTE_FastwebTelco AS (
            SELECT 
                ins.[Codice Ordine],
                tf.TIPO_Fastweb,
                ins.[Tipo Ordine],
                CASE 
                    WHEN ins.[Codice Comsy Tecnico Attuale] = dc.COMSY1 THEN 'RES'
                    WHEN ins.[Codice Comsy Tecnico Attuale] = dc.COMSY2 THEN 'SHP'
                END AS Ramo
            FROM [${dbConfig.database}].dbo.viewLastStatoOrdiniNoUnion AS ins
            INNER JOIN CTE_MaxBatchPerMese AS mx
                ON mx.Year  = ins.Year 
               AND mx.Month = ins.Month 
               AND mx.MaxBatch = ins.Batch
            LEFT JOIN [${dbConfig.database}].dbo.tbPianiFastweb AS tf
                ON ins.Valore = tf.VALORE
            INNER JOIN CTE_DealerComsy AS dc
                ON ins.[Codice Comsy Tecnico Attuale] = dc.COMSY1
                OR ins.[Codice Comsy Tecnico Attuale] = dc.COMSY2
            WHERE ins.Year = @anno
              AND ins.Month = @mese
        ),
        CTE_FastwebTelco_Distinct AS (
            SELECT 
                t.[Codice Ordine], 
                t.TIPO_Fastweb, 
                t.[Tipo Ordine], 
                t.Ramo
            FROM CTE_FastwebTelco AS t
            GROUP BY t.[Codice Ordine], t.TIPO_Fastweb, t.[Tipo Ordine], t.Ramo
        ),

        /* FASTWEB ENERGY */
        CTE_FastwebEnergia AS (
            SELECT
                e.[Codice Contratto],
                CASE 
                    WHEN e.[Codice Comsy/Order Owner (Report!DBSELLER)] = dc.COMSY1 THEN 'RES'
                    WHEN e.[Codice Comsy/Order Owner (Report!DBSELLER)] = dc.COMSY2 THEN 'SHP'
                END AS Ramo
            FROM [${dbConfig.database}].dbo.FWEnergiaImporter AS e
            INNER JOIN CTE_DealerComsy AS dc
                ON e.[Codice Comsy/Order Owner (Report!DBSELLER)] = dc.COMSY1
                OR e.[Codice Comsy/Order Owner (Report!DBSELLER)] = dc.COMSY2
            INNER JOIN [${dbConfig.database}].dbo.viewTopMonthBatchDate AS T
                ON T.FormattedDate = CAST(e.Batch AS date)
            WHERE T.Year  = @anno
              AND T.Month = @mese
        ),
        CTE_FastwebEnergia_Distinct AS (
            SELECT fe.[Codice Contratto], fe.Ramo
            FROM CTE_FastwebEnergia AS fe
            GROUP BY fe.[Codice Contratto], fe.Ramo
        )

        -- RISULTATO UNIFICATO
        SELECT
            'SKY' AS operatore,
            'SKY' AS categoria,
            s.segmento,
            COUNT(*) AS actual
        FROM CTE_SKY_Distinct AS s
        GROUP BY s.segmento

        UNION ALL

        SELECT
            'FASTWEB' AS operatore,
            CASE WHEN ft.TIPO_Fastweb = 'MOBILE' THEN 'MOBILE' ELSE 'FISSO' END AS categoria,
            CASE 
                WHEN ft.TIPO_Fastweb = 'MOBILE' AND ft.Ramo = 'RES' AND ft.[Tipo Ordine] = 'FISSO E MOBILE' THEN 'RESIDENZIALE_AUTO'
                WHEN ft.TIPO_Fastweb = 'MOBILE' AND ft.Ramo = 'RES' THEN 'RESIDENZIALE_PURA'
                WHEN ft.TIPO_Fastweb = 'MOBILE' AND ft.Ramo = 'SHP' THEN 'BUSINESS_AUTO'
                WHEN ft.TIPO_Fastweb = 'FISSO'  AND ft.Ramo = 'RES' THEN 'RESIDENZIALE'
                WHEN ft.TIPO_Fastweb = 'FISSO'  AND ft.Ramo = 'SHP' THEN 'BUSINESS'
            END AS segmento,
            COUNT(*) AS actual
        FROM CTE_FastwebTelco_Distinct AS ft
        WHERE ft.TIPO_Fastweb IN ('MOBILE','FISSO')
        GROUP BY 
            CASE WHEN ft.TIPO_Fastweb = 'MOBILE' THEN 'MOBILE' ELSE 'FISSO' END,
            CASE 
                WHEN ft.TIPO_Fastweb = 'MOBILE' AND ft.Ramo = 'RES' AND ft.[Tipo Ordine] = 'FISSO E MOBILE' THEN 'RESIDENZIALE_AUTO'
                WHEN ft.TIPO_Fastweb = 'MOBILE' AND ft.Ramo = 'RES' THEN 'RESIDENZIALE_PURA'
                WHEN ft.TIPO_Fastweb = 'MOBILE' AND ft.Ramo = 'SHP' THEN 'BUSINESS_AUTO'
                WHEN ft.TIPO_Fastweb = 'FISSO'  AND ft.Ramo = 'RES' THEN 'RESIDENZIALE'
                WHEN ft.TIPO_Fastweb = 'FISSO'  AND ft.Ramo = 'SHP' THEN 'BUSINESS'
            END

        UNION ALL

        SELECT
            'FASTWEB' AS operatore,
            'ENERGY'  AS categoria,
            CASE WHEN fe.Ramo = 'RES' THEN 'RESIDENZIALE' ELSE 'BUSINESS' END AS segmento,
            COUNT(*) AS actual
        FROM CTE_FastwebEnergia_Distinct AS fe
        GROUP BY CASE WHEN fe.Ramo = 'RES' THEN 'RESIDENZIALE' ELSE 'BUSINESS' END
        ORDER BY operatore, categoria, segmento;
      `;

      // DEBUG: stampa l'inizio della query per verificare assenza di DECLARE
      console.log('[DEBUG] actualsQuery preview:', actualsQuery.split('\n').slice(0, 6).join('\n'));
      const actualsResult = await dealerRequest.query(actualsQuery);
      const actualsRows = actualsResult.recordset || [];

      // Mappa actuals per chiave normalizzata OPERATORE|CATEGORIA|SEGMENTO in UPPERCASE
      const actualsMap = {};
      for (const r of actualsRows) {
        const key = [r.operatore, r.categoria, r.segmento].map(x => (x || '').toString().toUpperCase()).join('|');
        actualsMap[key] = (r.actual || 0);
      }
      console.log('[DEBUG] Actuals calcolati:', actualsMap);

      // 4. ELABORA RISULTATI PER OGNI CATEGORIA/SEGMENTO BASATI SU SOGLIE
      const risultatiFinali = [];

      // Raggruppa soglie per operatore (normalizza operatore a UPPERCASE per matching)
      const sogliePerOperatore = soglie.reduce((acc, s) => {
        const opKey = (s.operatore || '').toString().toUpperCase();
        if (!acc[opKey]) acc[opKey] = [];
        acc[opKey].push(s);
        return acc;
      }, {});

      for (const [operatoreUC, soglieLista] of Object.entries(sogliePerOperatore)) {
        const categorieOperatore = [];
        for (const s of soglieLista) {
          const catUC = (s.categoria || '').toString().toUpperCase();
          const segUC = (s.segmento || '').toString().toUpperCase();
          const key = [operatoreUC, catUC, segUC].join('|');
          const attuale = actualsMap[key] || 0;

          const progressi = calcolaProgressi(attuale, s);
          categorieOperatore.push({
            nome: `${s.categoria} ${s.segmento}`,
            attuale,
            livelloRaggiunto: progressi.livelloRaggiunto,
            prossimoTarget: progressi.prossimoTarget,
            mancano: progressi.mancano,
            percentuale: progressi.percentuale
          });
        }
        if (categorieOperatore.length) {
          // Usa la forma originale dell'operatore (mixed-case) se disponibile dalla prima soglia
          const opNameOriginal = soglieLista[0].operatore || operatoreUC;
          risultatiFinali.push({ operatore: opNameOriginal, categorie: categorieOperatore });
        }
      }

      console.log('[DEBUG] Risultati finali:', JSON.stringify(risultatiFinali, null, 2));

      res.json({
        success: true,
        data: risultatiFinali,
        debug: { anno, mese, dealerId, soglieCount: soglie.length }
      });
  } catch (err) {
    console.error('Errore in /api/dealer/obiettivi:', err);
    res.status(500).json({ error: 'Errore nel recupero degli obiettivi', details: err.message });
  }
});

// === Andamento Mensile SOLO DEALER ===
router.get('/andamento', authenticateToken, requireDealer, async (req, res) => {
  try {
    // dealerId dal token con normalizzazione + override opzionale da query per debug
    const dealerFromToken = (req.user?.dealerId ?? req.user?.idDealer ?? req.user?.IdDealer);
    const dealerOverride = req.query.dealerId ? parseInt(req.query.dealerId, 10) : null;
    const dealerId = Number(dealerOverride || dealerFromToken);
    const year = parseInt(req.query.year, 10) || new Date().getFullYear();

    if (!dealerId) {
      return res.status(400).json({ success: false, error: 'dealerId mancante nel token' });
    }

    console.log('[DEALER][andamento] dealerId:', dealerId, 'year:', year);

    // Cache (TTL 10 minuti)
    const cacheKey = `${dealerId}-${year}`;
    const cached = andamentoCache.get(cacheKey);
    if (cached && Date.now() < cached.expireAt) {
      console.log('[DEALER][andamento][cache] hit for', cacheKey);
      return res.json({ success: true, data: cached.data });
    }

    // Usa un pool DEDICATO con timeout 60s per evitare il riuso del pool globale (15s)
    const pool = new sql.ConnectionPool({
      ...dbConfig,
      requestTimeout: 60000,
      options: { ...(dbConfig?.options || {}), requestTimeout: 60000 },
    });
    await pool.connect();
    const request = new sql.Request(pool);
    // Aumenta il timeout solo per questa richiesta (evita ETIMEOUT a 15s su funzioni complesse)
    request.timeout = 60000; // 60s
    request.input('DealerId', sql.Int, dealerId);
    request.input('Year', sql.Int, year);

    // Usa la funzione SQL dedicata che restituisce le colonne richieste (AnnoMese, SKY, ILIAD, UNO_MOBILE, WEEDOO, FW_FISSO, FW_MOBILE, ENERGIA)
    // Esegui in READ UNCOMMITTED per ridurre contese/lock su tabelle grandi
    const query = `
      SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;
      SET DEADLOCK_PRIORITY LOW;
      -- Esecuzione funzione andamento
      SELECT * FROM dbo.ufnGetAndamentoMensileDealer(@DealerId, @Year);
    `;
    console.time('[DEALER][andamento][query]');
    const result = await request.query(query);
    console.timeEnd('[DEALER][andamento][query]');

    const rows = result?.recordset || [];
    console.log('[DEALER][andamento] rows:', rows.length);
    // Memorizza in cache
    andamentoCache.set(cacheKey, { data: rows, expireAt: Date.now() + 10 * 60 * 1000 });
    return res.json({ success: true, data: rows });
  } catch (err) {
    console.error('Errore in /api/dealer/andamento:', err);
    // Fallback: in caso di ETIMEOUT ritorna dati vuoti per non bloccare la dashboard
    if (String(err?.code).toUpperCase() === 'ETIMEOUT' || /Timeout/i.test(err?.message || '')) {
      try {
        const months = Array.from({ length: 12 }, (_, i) => ({ AnnoMese: `${new Date().getFullYear()}-${String(i+1).padStart(2,'0')}`, SKY: 0, ILIAD: 0, UNO_MOBILE: 0, WEEDOO: 0, FW_FISSO: 0, FW_MOBILE: 0, ENERGIA: 0 }));
        return res.json({ success: true, data: months, degraded: true });
      } catch {}
    }
    res.status(500).json({ success: false, error: 'Errore nel recupero andamento mensile', details: err.message });
  } finally {
    try {
      // Chiudi pool dedicato se presente
      const active = sql?.connected && sql?.globalConnection ? sql.globalConnection : null;
      // Se abbiamo creato un pool locale (variabile 'pool'), chiudilo
      if (typeof pool !== 'undefined' && pool?.close) {
        await pool.close();
      }
    } catch (e) {
      console.warn('[DEALER][andamento] errore in chiusura pool:', e?.message);
    }
  }
});

// GET /api/dealer/andamento-mensile - Andamento mensile dealer
router.get('/andamento-mensile', authenticateToken, requireDealer, async (req, res) => {
  let pool;
  try {
    console.log(`[DEALER][andamento-mensile] req.user:`, JSON.stringify(req.user, null, 2));
    
    let dealerId = req.user?.dealerId || req.user?.idDealer || req.user?.DealerKey;
    
    console.log(`[DEALER][andamento-mensile] dealerId estratto: ${dealerId} (tipo: ${typeof dealerId})`);
    
    // Se dealerId non è presente, prova a recuperarlo dal database usando l'email
    if (!dealerId || dealerId === 'undefined' || dealerId === 'null') {
      console.log(`[DEALER][andamento-mensile] dealerId mancante, provo lookup per email: ${req.user?.email}`);
      
      if (req.user?.email) {
        try {
          const tempPool = await sql.connect({
            ...dbConfig,
            database: getDbName(),
            options: {
              ...dbConfig.options,
              trustServerCertificate: true
            }
          });
          
          const lookupResult = await tempPool.request()
            .input('email', sql.NVarChar, req.user.email)
            .query(`
              SELECT TOP 1 d.IDDealer, d.RagioneSociale
              FROM dbo.tbDealers d
              INNER JOIN dbo.AspNetUsers u ON d.IDDealer = u.DealerId
              WHERE u.Email = @email AND d.Attivo = 1
            `);
          
          if (lookupResult.recordset && lookupResult.recordset.length > 0) {
            dealerId = lookupResult.recordset[0].IDDealer;
            console.log(`[DEALER][andamento-mensile] dealerId trovato via lookup: ${dealerId} (${lookupResult.recordset[0].RagioneSociale})`);
          }
          
          await tempPool.close();
        } catch (lookupErr) {
          console.error(`[DEALER][andamento-mensile] Errore lookup dealerId:`, lookupErr);
        }
      }
    }
    
    if (!dealerId || dealerId === 'undefined' || dealerId === 'null') {
      console.log(`[DEALER][andamento-mensile] ERRORE: dealerId non valido anche dopo lookup:`, dealerId);
      return res.status(400).json({ 
        error: 'DealerId mancante', 
        details: 'Impossibile identificare il dealer',
        user: req.user
      });
    }

    console.log(`[DEALER][andamento-mensile] Richiesta per dealerId: ${dealerId}`);

    await getPool();

    // Prova diversi formati per DealerKey
    const dealerKeyFormats = [
      String(dealerId).padStart(4, '0'),         // "0426"
      String(dealerId).trim(),                   // "426"
      String(dealerId).padStart(3, '0')          // "426" 
    ];
    
    console.log(`[DEALER][andamento-mensile] Provo formati DealerKey per ${dealerId}:`, dealerKeyFormats);
    
    let result = null;
    let usedFormat = null;
    
    // Prova ogni formato finché non trova dati
    for (const format of dealerKeyFormats) {
      console.log(`[DEALER][andamento-mensile] Provo formato: "${format}"`);
      
      const tempResult = await (await getRequest())
        .input('dealerKey', sql.NVarChar, format)
        .query(`
          SELECT TOP 12
            MonthStart,
            DealerKey,
            RagioneSociale,
            FISSO,
            [FISSO SHP],
            [FISSO RES], 
            MOBILE,
            [MOBILE SHP],
            [MOBILE RES],
            [Mobile RA],
            ENERGIA
          FROM dbo.vw_dealer_totali_mensili
          WHERE DealerKey = @dealerKey
          ORDER BY MonthStart DESC
        `);
      
      console.log(`[DEALER][andamento-mensile] Formato "${format}" - Righe trovate: ${tempResult.recordset?.length || 0}`);
      
      if (tempResult.recordset && tempResult.recordset.length > 0) {
        result = tempResult;
        usedFormat = format;
        console.log(`[DEALER][andamento-mensile] SUCCESSO con formato: "${format}"`);
        console.log(`[DEALER][andamento-mensile] Prima riga:`, tempResult.recordset[0]);
        break;
      }
    }
    
    // Se non trova dati per il dealer corrente, prova con "0216" (Login Solution)
    if (!result || !result.recordset || result.recordset.length === 0) {
      console.log(`[DEALER][andamento-mensile] NESSUN DATO per dealerId ${dealerId}, provo con "0216" (Login Solution)`);
      
      result = await (await getRequest())
        .input('dealerKey', sql.NVarChar, '0216')
        .query(`
          SELECT TOP 12
            MonthStart,
            DealerKey,
            RagioneSociale,
            FISSO,
            [FISSO SHP],
            [FISSO RES], 
            MOBILE,
            [MOBILE SHP],
            [MOBILE RES],
            [Mobile RA],
            ENERGIA
          FROM dbo.vw_dealer_totali_mensili
          WHERE DealerKey = @dealerKey
          ORDER BY MonthStart DESC
        `);
      
      usedFormat = '0216 (Login Solution)';
      console.log(`[DEALER][andamento-mensile] Uso dati Login Solution - Righe: ${result.recordset?.length || 0}`);
    }

    const data = result.recordset || [];
    
    console.log(`[DEALER][andamento-mensile] Righe trovate: ${data.length}`);
    
    // Se non trova dati, fai debug
    if (data.length === 0) {
      console.log(`[DEALER][andamento-mensile] NESSUN DATO per dealerId ${dealerId}, faccio debug...`);
      
      const debugResult = await pool.request()
        .query(`
          SELECT DISTINCT TOP 20 DealerKey, RagioneSociale, COUNT(*) as Records
          FROM dbo.vw_dealer_totali_mensili 
          GROUP BY DealerKey, RagioneSociale
          ORDER BY DealerKey
        `);
      
      console.log(`[DEALER][andamento-mensile] DEBUG - DealerKey disponibili:`, debugResult.recordset);
    } else {
      console.log(`[DEALER][andamento-mensile] Prima riga trovata:`, data[0]);
    }
    
    // Trasforma i dati per il frontend
    const monthlyData = data.map(row => ({
      month: row.MonthStart,
      fisso: Number(row.FISSO || 0),
      fissoShp: Number(row['FISSO SHP'] || 0),
      fissoRes: Number(row['FISSO RES'] || 0),
      mobile: Number(row.MOBILE || 0),
      mobileShp: Number(row['MOBILE SHP'] || 0),
      mobileRes: Number(row['MOBILE RES'] || 0),
      mobileRa: Number(row['Mobile RA'] || 0),
      energia: Number(row.ENERGIA || 0),
      totale: Number(row.FISSO || 0) + Number(row.MOBILE || 0) + Number(row.ENERGIA || 0)
    }));

    // Calcola statistiche
    const currentMonth = monthlyData[0] || {};
    const previousMonth = monthlyData[1] || {};
    
    const currentTotal = currentMonth.totale || 0;
    const previousTotal = previousMonth.totale || 0;
    const variation = previousTotal > 0 ? ((currentTotal - previousTotal) / previousTotal) * 100 : 0;

    console.log(`[DEALER][andamento-mensile] Trovati ${data.length} mesi per dealer ${dealerId}`);

    res.json({
      success: true,
      dealerId,
      current: {
        month: currentMonth.month,
        attivazioni: currentTotal,
        fisso: currentMonth.fisso || 0,
        mobile: currentMonth.mobile || 0,
        energia: currentMonth.energia || 0,
        mobileRa: currentMonth.mobileRa || 0
      },
      variation: {
        percentage: Math.round(variation * 100) / 100,
        trend: variation > 0 ? 'up' : variation < 0 ? 'down' : 'stable'
      },
      monthlyData: monthlyData.slice(0, 6) // Ultimi 6 mesi per il grafico
    });

  } catch (err) {
    console.error('[DEALER][andamento-mensile] Errore:', err);
    res.status(500).json({ 
      error: 'Errore nel recupero andamento mensile', 
      details: err.message 
    });
  } finally {
    try {
      if (typeof pool !== 'undefined' && pool?.close) {
        await pool.close();
      }
    } catch (e) {
      console.warn('[DEALER][andamento-mensile] errore in chiusura pool:', e?.message);
    }
  }
});

// ============================================================================
// ENDPOINT: Compensi in Tempo Reale
// ============================================================================
router.get('/compensi-realtime', authenticateToken, requireDealer, async (req, res) => {
  try {
    const dealerId = req.user.dealerId || req.user.idDealer;
    
    if (!dealerId) {
      return res.status(400).json({ error: 'Dealer ID mancante' });
    }

    console.log(`[DEALER][compensi-realtime] Richiesta per dealer ${dealerId}`);

    // TODO: Implementare logica reale con query al database
    // Per ora restituiamo dati MOCK per testare l'interfaccia
    
    const mockData = {
      maturato: {
        totale: 1245.50,
        breakdown: {
          tlc_fisso: { euro: 450.00, qty: 12, importoMedio: 37.50 },
          tlc_mobile: { euro: 520.00, qty: 15, importoMedio: 34.67 },
          energia: { euro: 180.50, qty: 6, importoMedio: 30.08 },
          mobile_ra: { euro: 95.00, qty: 5, importoMedio: 19.00 }
        }
      },
      proiezione: {
        fineMese: 1850.00,
        giorniRimanenti: 12,
        mediaGiornaliera: 41.50
      },
      opportunita: [
        {
          tipo: 'LIVELLO',
          categoria: 'FISSO',
          livelloAttuale: 1,
          livelloProssimo: 2,
          attualeQty: 12,
          targetQty: 20,
          mancano: 8,
          guadagnoExtra: 350.00,
          descrizione: 'Passa a Livello 2 FISSO',
          scadenza: '2025-10-31',
          urgenza: 'alta'
        },
        {
          tipo: 'BONUS',
          categoria: 'MOBILE',
          percentualeAttuale: 60,
          percentualeTarget: 100,
          attualeQty: 15,
          targetQty: 27,
          mancano: 12,
          guadagnoExtra: 200.00,
          descrizione: 'Bonus 100% Mobile',
          scadenza: '2025-10-31',
          urgenza: 'media'
        },
        {
          tipo: 'BONUS',
          categoria: 'RA',
          percentualeAttuale: 33,
          percentualeTarget: 50,
          attualeQty: 5,
          targetQty: 8,
          mancano: 3,
          guadagnoExtra: 145.00,
          descrizione: 'Bonus RA 15%',
          scadenza: '2025-10-31',
          urgenza: 'bassa'
        }
      ],
      potenzialeMassimo: {
        totale: 2890.00,
        incrementoPercentuale: 132,
        dettaglio: 'Con tutti i livelli e bonus raggiungibili questo mese'
      }
    };

    res.json(mockData);

  } catch (err) {
    console.error('[DEALER][compensi-realtime] Errore:', err);
    res.status(500).json({ 
      error: 'Errore nel recupero compensi', 
      details: err.message 
    });
  }
});

return router;
}

export default createDealerRouter;
