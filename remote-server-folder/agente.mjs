// Modulo dedicato alle API per agenti
import express from 'express';
import sql from 'mssql';
import multer from 'multer';
import crypto from 'crypto';
import { uploadToS3 } from './s3-service.mjs';
import { getRequest, getPool } from './db-pool.mjs';

// Esporta una funzione factory che accetta le dipendenze
const createAgenteRouter = (deps = {}) => {
  const { authenticateToken, dbConfig, emailService } = deps;
  
  if (!authenticateToken || !dbConfig || !emailService) {
    throw new Error('authenticateToken, dbConfig e emailService sono richiesti');
  }
  
  const router = express.Router();

  const jsonParser = express.json();

  const agentOrderUpload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB per immagine
      files: 10
    },
    fileFilter: (req, file, cb) => {
      if (!file.mimetype || !file.mimetype.startsWith('image/')) {
        return cb(new Error('Sono consentite solo immagini per gli allegati.'));
      }
      cb(null, true);
    }
  });

  const extractAgentPhotos = (files) => {
    if (!files) return [];
    if (Array.isArray(files)) return files;
    const out = [];
    for (const key of Object.keys(files)) {
      const arr = files[key];
      if (Array.isArray(arr)) {
        out.push(...arr);
      } else if (arr) {
        out.push(arr);
      }
    }
    return out;
  };

  const sanitizeFileName = (name = '') => {
    return name.replace(/[^a-zA-Z0-9_.-]/g, '_');
  };

  // Cache per sapere se la colonna opzionale idStatoSpedizione esiste a DB
  let hasIdStatoSpedizione = null; // null = sconosciuto, true/false = noto
  async function ensureHasIdStatoSpedizione() {
    if (hasIdStatoSpedizione !== null) return hasIdStatoSpedizione;
    try {
      await sql.connect(dbConfig);
      const res = await new sql.Request().query(`
        SELECT 1 AS ok
        FROM sys.columns c
        INNER JOIN sys.objects o ON o.object_id = c.object_id
        WHERE o.name = 'tbOrdiniProdotti' AND c.name = 'idStatoSpedizione'
      `);
      hasIdStatoSpedizione = !!(res.recordset && res.recordset.length);
    } catch (e) {
      hasIdStatoSpedizione = false;
      console.warn('[AGENTE] check idStatoSpedizione fallito, procedo senza colonna:', e?.message || e);
    }
    return hasIdStatoSpedizione;
  }

  // Middleware opzionale: autenticazione e verifica ruolo agente
  function requireAgente(req, res, next) {
    console.log('[DEBUG][requireAgente] req.user:', req.user);
    if (!req.user || !req.user.ruoli) {
      console.log('[DEBUG][requireAgente] BLOCCATO: req.user o ruoli non validi');
      return res.status(403).json({ error: 'Accesso non autorizzato' });
    }
    
    // Controlla se l'utente ha il ruolo Agente (case insensitive)
    const hasRole = req.user.ruoli.some(ruolo => 
      typeof ruolo === 'string' && ruolo.toLowerCase() === 'agente'
    );
    
    if (!hasRole) {
      console.log('[DEBUG][requireAgente] BLOCCATO: ruolo non autorizzato');
      return res.status(403).json({ error: 'Accesso riservato agli agenti' });
    }
    
    next();
  }

  // Restituisce le ultime 5 attivazioni per tutti i dealer associati all'agente
  router.get('/ultime-attivazioni', authenticateToken, requireAgente, async (req, res) => {
    try {
      console.log('[DEBUG][ultime-attivazioni] req.user:', req.user);
      const agente = req.user.agenteNome;
      console.log('[DEBUG][ultime-attivazioni] agenteNome usato:', agente);
      if (!agente) {
        return res.status(400).json({ error: 'Nome agente mancante nel token' });
      }
      // Trova tutti i dealer associati all'agente
      
      const dealerQuery = await new sql.Request()
        .input('agente', sql.NVarChar, agente)
        .query('SELECT IDDealer FROM tbDealers WHERE AGENTE = @agente');
      const dealerIds = dealerQuery.recordset.map(r => r.IDDealer);
      console.log('[DEBUG][ultime-attivazioni] dealerIds trovati:', dealerIds);
      if (dealerIds.length === 0) {
        return res.json([]);
      }
      
      // Recupera tutte le attivazioni del mese corrente da tutte le fonti
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth() + 1;
      const startOfMonth = `${year}-${String(month).padStart(2, '0')}-01`;
      const startOfNextMonth = month === 12 
        ? `${year + 1}-01-01` 
        : `${year}-${String(month + 1).padStart(2, '0')}-01`;

      // Ottieni COMSY dei dealer
      const comsyQuery = await new sql.Request()
        .input('agente', sql.NVarChar, agente)
        .query('SELECT COMSY1, COMSY2 FROM tbDealers WHERE AGENTE = @agente');
      const comsyList = comsyQuery.recordset.flatMap(r => [r.COMSY1, r.COMSY2].filter(Boolean));
      const comsyNormalized = comsyList.map(c => 
        `UPPER(REPLACE(REPLACE(REPLACE(LTRIM(RTRIM('${c}')),' ',''),'.',''),'-',''))`
      ).join(',');

      const attivazioniQuery = `
        -- TLC da InseritoFW
        SELECT 
          CONVERT(date, i.Batch) AS Data,
          d.RagioneSociale,
          i.[Tipo Ordine] AS Titolo,
          '-' AS StatoEsteso
        FROM dbo.InseritoFW i
        INNER JOIN dbo.tbDealers d 
          ON UPPER(REPLACE(REPLACE(REPLACE(LTRIM(RTRIM(i.[Codice Comsy Tecnico Attuale])),' ',''),'.',''),'-',''))
             IN (${comsyNormalized})
          AND d.AGENTE = '${agente}'
        WHERE CONVERT(date, i.Batch) >= CONVERT(date, '${startOfMonth}') 
          AND CONVERT(date, i.Batch) < CONVERT(date, '${startOfNextMonth}')

        UNION ALL

        -- ENERGY da FWEnergiaImporter
        SELECT 
          CONVERT(date, e.Batch) AS Data,
          d.RagioneSociale,
          e.[Nome Offerta Vendita] AS Titolo,
          '-' AS StatoEsteso
        FROM dbo.FWEnergiaImporter e
        INNER JOIN dbo.tbDealers d 
          ON UPPER(REPLACE(REPLACE(REPLACE(LTRIM(RTRIM(e.[Codice Comsy/Order Owner (Report!DBSELLER)])),' ',''),'.',''),'-',''))
             IN (${comsyNormalized})
          AND d.AGENTE = '${agente}'
        WHERE CONVERT(date, e.Batch) >= CONVERT(date, '${startOfMonth}') 
          AND CONVERT(date, e.Batch) < CONVERT(date, '${startOfNextMonth}')

        UNION ALL

        -- ENI/SKY da tbOrdini
        SELECT 
          CONVERT(date, o.DataOra) AS Data,
          d.RagioneSociale,
          ofr.Titolo,
          CAST(o.Stato AS NVARCHAR(50)) AS StatoEsteso
        FROM dbo.tbOrdini o
        INNER JOIN dbo.tbDealers d ON o.idDealer = d.IDDealer
        INNER JOIN dbo.tbOfferte ofr ON o.idOfferta = ofr.IDOfferta
        WHERE o.idDealer IN (${dealerIds.join(',')})
          AND CONVERT(date, o.DataOra) >= CONVERT(date, '${startOfMonth}')
          AND CONVERT(date, o.DataOra) < CONVERT(date, '${startOfNextMonth}')

        ORDER BY Data DESC
      `;
      
      console.log('[DEBUG][ultime-attivazioni] attivazioniQuery:', attivazioniQuery);
      const attivazioniRes = await sql.query(attivazioniQuery);
      const attivazioni = attivazioniRes.recordset.map(row => ({
        Data: row.Data,
        Dealer: row.RagioneSociale,
        Titolo: row.Titolo,
        StatoEsteso: row.StatoEsteso || '-'
      }));
      
      console.log('[DEBUG][ultime-attivazioni] Attivazioni trovate:', attivazioni.length);
      res.json(attivazioni);
    } catch (error) {
      console.error('Errore in /api/agente/ultime-attivazioni:', error);
      res.status(500).json({ error: 'Errore del server', details: error.message });
    }
  });

  // Dettaglio ordine prodotti (read-only) per Agente
  router.get('/ordine-prodotto/:id', authenticateToken, requireAgente, async (req, res) => {
    try {
      const agente = req.user.agenteNome;
      const id = parseInt(req.params.id, 10);
      if (!agente) return res.status(400).json({ error: 'Nome agente mancante nel token' });
      if (isNaN(id)) return res.status(400).json({ error: 'ID non valido' });

      // Recupera testata ordine solo se appartiene a un dealer della scuderia dell'agente
      await sql.connect(dbConfig);
      const testataReq = new sql.Request();
      testataReq.input('id', sql.Int, id);
      testataReq.input('agente', sql.NVarChar, agente);
      const testataSql = `
        SELECT 
          op.IDOrdineProdotto AS IDOrdine,
          op.IDOrdineProdotto,
          op.DataOra,
          FORMAT(op.DataOra, 'dd.MM.yy') AS Data,
          d.RagioneSociale,
          op.idStatoOrdineProdotto AS IdStatoOrdineProdotto,
          CAST(op.TotaleOrdine AS DECIMAL(10,2)) AS TotaleOrdine,
          CAST(ISNULL(op.SpeseSpedizione, 0) AS DECIMAL(10,2)) AS SpeseSpedizione,
          CAST(op.TotaleOrdine + ISNULL(op.SpeseSpedizione, 0) AS DECIMAL(10,2)) AS ImportoTotale,
          op.NoteOrdine,
          op.Note4Dealer,
          op.NoteInterne,
          sop.StatoEsteso,
          op.OrdineDaAgente,
          op.OrdineDA,
          COALESCE(op.stato_spedizione, 'Non Spedito') AS StatoSpedizione,
          CASE 
            WHEN op.idStatoOrdineProdotto IN (20,22) THEN 'Pagato'
            WHEN op.idStatoOrdineProdotto = 21 THEN 'Bonifico (in attesa)'
            WHEN op.idStatoOrdineProdotto = 0 THEN 'In attesa pagamento'
            WHEN op.idStatoOrdineProdotto = 1 THEN 'Annullato'
            ELSE '-' 
          END AS StatoPagamento,
          CASE 
            WHEN op.idStatoOrdineProdotto = 20 THEN 'Carta di credito'
            WHEN op.idStatoOrdineProdotto = 21 THEN 'Bonifico SEPA'
            WHEN op.idStatoOrdineProdotto = 22 THEN 'Pagato (manuale)'
            ELSE 'Non specificato'
          END AS MetodoPagamento
        FROM dbo.tbOrdiniProdotti op
        INNER JOIN dbo.tbDealers d ON op.idDealer = d.IDDealer
        INNER JOIN dbo.tbStatiOrdiniProdotti sop ON op.idStatoOrdineProdotto = sop.IDStato
        WHERE op.IDOrdineProdotto = @id AND d.AGENTE = @agente
      `;
      const testataRes = await testataReq.query(testataSql);
      if (!testataRes.recordset?.length) {
        return res.status(404).json({ error: 'Ordine non trovato o non autorizzato' });
      }
      const testata = testataRes.recordset[0];

      // Recupera prodotti dell'ordine
      const prodottiReq = new sql.Request();
      prodottiReq.input('id', sql.Int, id);
      const prodottiSql = `
        SELECT 
          dop.IDDettagliOrdiniProdotti,
          dop.idOrdineProdotto,
          dop.idOfferta,
          offr.Titolo AS Titolo,
          offr.Tipo AS Tipo,
          dop.Quantita,
          CAST(dop.CostoUnitario AS DECIMAL(10,2)) AS PrezzoUnitario,
          dop.CostoUnitario
        FROM dbo.tbDettagliOrdiniProdotti dop
        LEFT JOIN dbo.tbOfferte offr ON dop.idOfferta = offr.IDOfferta
        WHERE dop.idOrdineProdotto = @id
        ORDER BY dop.IDDettagliOrdiniProdotti
      `;
      const prodottiRes = await prodottiReq.query(prodottiSql);
      const Prodotti = (prodottiRes.recordset || []).map(r => ({
        IDDettagliOrdiniProdotti: r.IDDettagliOrdiniProdotti,
        idOrdineProdotto: r.idOrdineProdotto,
        idOfferta: r.idOfferta,
        Titolo: r.Titolo,
        Tipo: r.Tipo,
        Quantita: r.Quantita,
        PrezzoUnitario: r.PrezzoUnitario,
        CostoUnitario: r.CostoUnitario
      }));

      return res.json({
        ...testata,
        // Alias per compatibilità frontend (il componente legge selectedOrder.stato_spedizione)
        stato_spedizione: testata.StatoSpedizione,
        Prodotti
      });
    } catch (err) {
      console.error('[AGENTE][GET /ordine-prodotto/:id] Errore:', err);
      return res.status(500).json({ error: 'Errore server', details: err.message });
    }
  });

  // Conteggio ordini in attesa di pagamento (idStatoOrdineProdotto = 0) per l'agente
  router.get('/ordini-attesa-pagamento-count', authenticateToken, requireAgente, async (req, res) => {
    try {
      const agente = req.user.agenteNome;
      if (!agente) return res.status(400).json({ error: 'Nome agente mancante nel token' });

      const countRes = await new sql.Request()
        .input('agente', sql.NVarChar, agente)
        .query(`
          SELECT COUNT(*) AS Cnt
          FROM dbo.tbOrdiniProdotti op
          INNER JOIN dbo.tbDealers d ON op.idDealer = d.IDDealer
          WHERE d.AGENTE = @agente AND op.idStatoOrdineProdotto = 0
        `);
      const totale = countRes.recordset?.[0]?.Cnt || 0;
      return res.json({ totale });
    } catch (err) {
      console.error('[AGENTE] /ordini-attesa-pagamento-count error:', err);
      return res.status(500).json({ error: 'Errore server', details: err.message });
    }
  });

  // Conteggio attivazioni di oggi (totale ordini) per l'agente (tutti i dealer collegati)
  router.get('/attivazioni-oggi', authenticateToken, requireAgente, async (req, res) => {
    try {
      const agente = req.user.agenteNome;
      if (!agente) return res.status(400).json({ error: 'Nome agente mancante nel token' });

      // Calcola oggi in timezone Europe/Rome
      const nowRome = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Rome' }));
      const y = nowRome.getFullYear();
      const m = nowRome.getMonth() + 1;
      const d = nowRome.getDate();

      // Contiamo ordini del giorno su tbOrdini (attivazioni) per i dealer dell'agente
      const reqSql = new sql.Request();
      reqSql.input('agente', sql.NVarChar, agente);
      reqSql.input('y', sql.Int, y);
      reqSql.input('m', sql.Int, m);
      reqSql.input('d', sql.Int, d);
      const q = `
        SELECT COUNT(*) AS Cnt
        FROM dbo.tbOrdini o
        INNER JOIN dbo.tbDealers d ON o.idDealer = d.IDDealer
        WHERE d.AGENTE = @agente
          AND YEAR(o.DataOra) = @y AND MONTH(o.DataOra) = @m AND DAY(o.DataOra) = @d
      `;
      const result = await reqSql.query(q);
      const totale = result.recordset?.[0]?.Cnt || 0;
      return res.json({ totale });
    } catch (err) {
      console.error('[AGENTE] /attivazioni-oggi error:', err);
      return res.status(500).json({ error: 'Errore server', details: err.message });
    }
  });

  // Alias /api/ultime-attivazioni-agente per retrocompatibilità frontend
  router.get('/api/ultime-attivazioni-agente', authenticateToken, requireAgente, async (req, res) => {
    // Riusa la stessa logica della route sopra
    req.url = '/ultime-attivazioni';
    return router.handle(req, res);
  });

  // Restituisce gli ultimi N ordini per tutti i dealer associati all'agente
  router.get('/ultimi-ordini-agente', authenticateToken, requireAgente, async (req, res) => {
    try {
      const agente = req.user.agenteNome;
      if (!agente) {
        return res.status(400).json({ error: 'Nome agente mancante nel token' });
      }
      
      // Parametri filtro
      const limit = parseInt(req.query.limit) || 100;
      const year = req.query.year ? parseInt(req.query.year) : null;
      const month = req.query.month ? parseInt(req.query.month) : null;
      
      // Trova tutti i dealer associati all'agente
      await getPool();
      const dealerQuery = await (await getRequest())
        .input('agente', sql.NVarChar, agente)
        .query('SELECT IDDealer FROM tbDealers WHERE AGENTE = @agente');
      
      const dealerIds = dealerQuery.recordset.map(r => r.IDDealer);
      console.log(`[ultimi-ordini-agente] Agente: ${agente}, Dealer: ${dealerIds.length}, Limit: ${limit}, Year: ${year}, Month: ${month}`);
      if (dealerIds.length === 0) {
        return res.json([]);
      }
      
      // Costruisci query con filtro opzionale per anno/mese
      let whereClause = 'd.AGENTE = @agente';
      if (year && month) {
        whereClause += ' AND YEAR(op.DataOra) = @year AND MONTH(op.DataOra) = @month';
      }

      const request = await getRequest();
      request.input('agente', sql.NVarChar, agente);
      request.input('limit', sql.Int, limit);
      if (year && month) {
        request.input('year', sql.Int, year);
        request.input('month', sql.Int, month);
      }

      const ordiniRes = await request.query(`
    SELECT TOP (@limit)
      op.IDOrdineProdotto AS IDOrdine,
      FORMAT(op.DataOra, 'dd.MM.yyyy') AS Data,
      op.DataOra,
      d.RagioneSociale AS Dealer,
      op.OrdineDaAgente,
      -- Importo totale = TotaleOrdine + SpeseSpedizione (euro)
      CAST(op.TotaleOrdine + ISNULL(op.SpeseSpedizione, 0) AS DECIMAL(10,2)) AS Importo,
      CAST(op.TotaleOrdine AS DECIMAL(10,2)) AS TotaleOrdine,
      CAST(ISNULL(op.SpeseSpedizione, 0) AS DECIMAL(10,2)) AS SpeseSpedizione,
      sop.StatoEsteso AS Stato,
      op.idStatoOrdineProdotto AS StatoID,
      'PRODOTTI' AS TipoProdotto
    FROM dbo.tbOrdiniProdotti op
    INNER JOIN dbo.tbDealers d ON op.idDealer = d.IDDealer
    INNER JOIN dbo.tbStatiOrdiniProdotti sop ON op.idStatoOrdineProdotto = sop.IDStato
    WHERE ${whereClause}
    ORDER BY op.DataOra DESC
  `);
const ordini = ordiniRes.recordset.map(row => ({
  IDOrdine: row.IDOrdine,
  Data: row.Data,
  Dealer: row.Dealer,
  Inserimento: Number(row.OrdineDaAgente) === 1 ? 'Agente' : 'Diretto',
  Importo: row.Importo,
  Stato: row.Stato,
  StatoID: row.StatoID,
  TipoProdotto: row.TipoProdotto,
  DataOraCompleta: row.DataOra
}));

// Log statistiche ordini
if (ordini.length > 0) {
  const dates = ordini.map(o => new Date(o.DataOraCompleta)).sort((a, b) => b - a);
  const minDate = dates[dates.length - 1];
  const maxDate = dates[0];
  console.log(`[ultimi-ordini-agente] Ordini trovati: ${ordini.length}, Date range: ${minDate.toISOString().split('T')[0]} - ${maxDate.toISOString().split('T')[0]}`);
} else {
  console.log('[ultimi-ordini-agente] Nessun ordine trovato');
}

res.json(ordini);
    } catch (error) {
      console.error('Errore in /api/agente/ultimi-ordini:', error);
      res.status(500).json({ error: 'Errore del server', details: error.message });
    }
  });
  
  // Restituisce l'andamento delle attivazioni per l'agente
  router.get('/andamento', authenticateToken, requireAgente, async (req, res) => {
    try {
      const agente = req.user.agenteNome;
      if (!agente) {
        return res.status(400).json({ error: 'Nome agente mancante nel token' });
      }
      
      
      
      // Trova tutti i dealer associati all'agente
      const dealerQuery = await new sql.Request()
        .input('agente', sql.NVarChar, agente)
        .query('SELECT IDDealer, RagioneSociale FROM tbDealers WHERE AGENTE = @agente');
      
      if (dealerQuery.recordset.length === 0) {
        return res.json([]);
      }
      
      const dealerIds = dealerQuery.recordset.map(d => d.IDDealer);
      const dealerNomi = dealerQuery.recordset.reduce((acc, curr) => {
        acc[curr.IDDealer] = curr.RagioneSociale;
        return acc;
      }, {});

      // Calcola le statistiche per ogni dealer
      const andamento = [];
      for (const dealerId of dealerIds) {
        const statsQuery = await new sql.Request()
          .input('dealerId', sql.Int, dealerId)
          .query(`
            SELECT 
              COUNT(DISTINCT o.IDOrdine) as totale_ordini,
              SUM(CASE WHEN o.Stato = 'Completato' THEN 1 ELSE 0 END) as ordini_completati,
              SUM(o.Totale) as fatturato_totale
            FROM dbo.tbOrdini o
            WHERE o.idDealer = @dealerId
              AND o.DataOra >= DATEADD(MONTH, -1, GETDATE())
          `);

        const stats = statsQuery.recordset[0];
        andamento.push({
          dealerId,
          dealerName: dealerNomi[dealerId],
          totaleOrdini: stats.totale_ordini || 0,
          ordiniCompletati: stats.ordini_completati || 0,
          fatturato: stats.fatturato_totale || 0,
          percentualeCompletamento: stats.totale_ordini > 0 
            ? Math.round((stats.ordini_completati / stats.totale_ordini) * 100)
            : 0
        });
      }

      res.json(andamento);
    } catch (error) {
      console.error('Errore in /api/agente/andamento:', error);
      res.status(500).json({ error: 'Errore del server', details: error.message });
    }
  });

  // Nuovo endpoint: andamento attivazioni aggregato per periodo
  router.get('/andamento-attivazioni', authenticateToken, requireAgente, async (req, res) => {
    try {
      const agente = req.user.agenteNome;
      if (!agente) {
        return res.status(400).json({ error: 'Nome agente mancante nel token' });
      }

      await sql.connect(dbConfig);

      // LOGICA SPECIALE PER GABRIELE
      if (agente.toUpperCase() === 'GABRIELE') {
        try {
          console.log('[ANDAMENTO-ATTIVAZIONI][GABRIELE] Usando vista V_Report_Completo_Gabriele...');
          
          const gabrieleRequest = new sql.Request();
          const gabrieleQuery = `
            SELECT 
              CONCAT(Anno, '-', RIGHT('0' + CAST(Mese AS VARCHAR(2)), 2)) AS ANNO_MESE,
              SUM(DISTINCT TotaleOrdiniMese) AS ENERGIA,
              0 AS MOBILE,
              0 AS FISSO,
              0 AS PRODOTTI
            FROM V_Report_Completo_Gabriele
            GROUP BY Anno, Mese
            ORDER BY Anno, Mese
          `;
          
          const gabrieleResult = await gabrieleRequest.query(gabrieleQuery);
          const data = gabrieleResult.recordset || [];
          
          console.log(`[ANDAMENTO-ATTIVAZIONI][GABRIELE] Trovati ${data.length} mesi`);
          
          return res.json({
            success: true,
            range: {
              from: data.length > 0 ? data[0].ANNO_MESE : null,
              to: data.length > 0 ? data[data.length - 1].ANNO_MESE : null
            },
            data
          });
        } catch (gabrieleError) {
          console.error('[ANDAMENTO-ATTIVAZIONI][GABRIELE] Errore:', gabrieleError);
          return res.status(500).json({ error: 'Errore recupero dati GABRIELE', details: gabrieleError.message });
        }
      }

      const dealerRequest = new sql.Request();
      // Dealer associati all'agente
      const dealerQuery = await dealerRequest
        .input('agente', sql.NVarChar, agente)
        .query('SELECT IDDealer FROM tbDealers WHERE AGENTE = @agente');
      const dealerIds = dealerQuery.recordset.map(d => d.IDDealer);
      if (dealerIds.length === 0) {
        return res.json({ success: true, data: [] });
      }

      // Gestione range: supporta query ?from=YYYY-MM&to=YYYY-MM oppure ?months=N (default 6)
      const nowRome = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Rome' }));
      const clampMonths = (val) => {
        const n = Number.parseInt(val, 10);
        if (!Number.isFinite(n) || n <= 0) return 6;
        return Math.min(24, Math.max(1, n));
      };

      let startDate;
      let endDate;

      const fromParam = (req.query.from || '').toString().trim();
      const toParam = (req.query.to || '').toString().trim();
      if (fromParam && toParam) {
        const fromMatch = /^\d{4}[-/](\d{1,2})$/.exec(fromParam);
        const toMatch = /^\d{4}[-/](\d{1,2})$/.exec(toParam);
        if (!fromMatch || !toMatch) {
          return res.status(400).json({ error: 'Formato data non valido. Usa YYYY-MM.' });
        }
        const fromYear = Number(fromParam.slice(0, 4));
        const fromMonth = Number(fromMatch[1]) - 1;
        const toYear = Number(toParam.slice(0, 4));
        const toMonth = Number(toMatch[1]) - 1;
        startDate = new Date(Date.UTC(fromYear, fromMonth, 1, 0, 0, 0));
        endDate = new Date(Date.UTC(toYear, toMonth + 1, 1, 0, 0, 0));
      } else {
        const months = clampMonths(req.query.months);
        const ref = new Date(Date.UTC(nowRome.getFullYear(), nowRome.getMonth(), 1, 0, 0, 0));
        endDate = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth() + 1, 1, 0, 0, 0));
        startDate = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth() - (months - 1), 1, 0, 0, 0));
      }

      if (!(startDate instanceof Date) || Number.isNaN(startDate)) {
        return res.status(400).json({ error: 'Intervallo start non valido' });
      }
      if (!(endDate instanceof Date) || Number.isNaN(endDate)) {
        return res.status(400).json({ error: 'Intervallo end non valido' });
      }

      const idsList = dealerIds.map((id) => Number(id)).filter((id) => Number.isFinite(id));
      if (!idsList.length) {
        return res.json({ success: true, data: [] });
      }
      const dealerPlaceholders = idsList.map((_, idx) => `@dealer${idx}`).join(', ');

      // Query TELCO (tbOrdini)
      const telcoQuery = `
        SELECT
          FORMAT(o.DataOra, 'yyyy-MM') AS AnnoMese,
          SUM(CASE WHEN UPPER(ISNULL(ofr.Tipo, '')) LIKE '%MOB%' THEN 1 ELSE 0 END) AS Mobile,
          SUM(CASE WHEN UPPER(ISNULL(ofr.Tipo, '')) LIKE '%FIS%' THEN 1 ELSE 0 END) AS Fisso,
          SUM(CASE WHEN ofr.idOperatore IN (20, 21, 27) OR UPPER(ISNULL(ofr.Tipo, '')) LIKE '%ENERG%' THEN 1 ELSE 0 END) AS Energia
        FROM dbo.tbOrdini o
        LEFT JOIN dbo.tbOfferte ofr ON ofr.IDOfferta = o.IDOfferta
        WHERE o.idDealer IN (${dealerPlaceholders})
          AND o.DataOra >= @startDate AND o.DataOra < @endDate
        GROUP BY FORMAT(o.DataOra, 'yyyy-MM')
      `;

      // Query Prodotti (tbOrdiniProdotti)
      const prodottiQuery = `
        SELECT
          FORMAT(op.DataOra, 'yyyy-MM') AS AnnoMese,
          COUNT(*) AS Prodotti
        FROM dbo.tbOrdiniProdotti op
        WHERE op.idDealer IN (${dealerPlaceholders})
          AND op.DataOra >= @startDate AND op.DataOra < @endDate
        GROUP BY FORMAT(op.DataOra, 'yyyy-MM')
      `;

      const requestTelco = new sql.Request();
      requestTelco.input('startDate', sql.DateTime, startDate);
      requestTelco.input('endDate', sql.DateTime, endDate);
      idsList.forEach((id, idx) => {
        requestTelco.input(`dealer${idx}`, sql.Int, id);
      });
      const telcoRes = await requestTelco.query(telcoQuery);

      const requestProdotti = new sql.Request();
      requestProdotti.input('startDate', sql.DateTime, startDate);
      requestProdotti.input('endDate', sql.DateTime, endDate);
      idsList.forEach((id, idx) => {
        requestProdotti.input(`dealer${idx}`, sql.Int, id);
      });
      const prodottiRes = await requestProdotti.query(prodottiQuery);

      const perMonth = new Map();

      for (const row of telcoRes.recordset || []) {
        const key = row.AnnoMese;
        if (!perMonth.has(key)) {
          perMonth.set(key, { ANNO_MESE: key, MOBILE: 0, FISSO: 0, ENERGIA: 0, PRODOTTI: 0 });
        }
        const bucket = perMonth.get(key);
        bucket.MOBILE += Number(row.Mobile ?? 0) || 0;
        bucket.FISSO += Number(row.Fisso ?? 0) || 0;
        bucket.ENERGIA += Number(row.Energia ?? 0) || 0;
      }

      for (const row of prodottiRes.recordset || []) {
        const key = row.AnnoMese;
        if (!perMonth.has(key)) {
          perMonth.set(key, { ANNO_MESE: key, MOBILE: 0, FISSO: 0, ENERGIA: 0, PRODOTTI: 0 });
        }
        const bucket = perMonth.get(key);
        bucket.PRODOTTI += Number(row.Prodotti ?? 0) || 0;
      }

      // Assicurati di includere mesi senza dati all'interno del range
      const months = [];
      const cursor = new Date(startDate.getTime());
      while (cursor < endDate) {
        const key = cursor.toISOString().slice(0, 7);
        if (!perMonth.has(key)) {
          perMonth.set(key, { ANNO_MESE: key, MOBILE: 0, FISSO: 0, ENERGIA: 0, PRODOTTI: 0 });
        }
        months.push(key);
        cursor.setUTCMonth(cursor.getUTCMonth() + 1);
      }

      const data = Array.from(perMonth.values())
        .sort((a, b) => (a.ANNO_MESE < b.ANNO_MESE ? -1 : a.ANNO_MESE > b.ANNO_MESE ? 1 : 0));

      res.json({
        success: true,
        range: {
          from: startDate.toISOString().slice(0, 7),
          to: new Date(endDate.getTime() - 1).toISOString().slice(0, 7)
        },
        data
      });
    } catch (error) {
      console.error('Errore in /api/agente/andamento-attivazioni:', error);
      res.status(500).json({ error: 'Errore del server', details: error.message });
    }
  });

  // Restituisce gli obiettivi per l'agente
  router.get('/obiettivi', authenticateToken, requireAgente, async (req, res) => {
    // --- LOGICA COPIATA DA index.mjs /api/obiettivi, ma per tutti i dealer associati all'agente ---
    try {
      const agente = req.user.agenteNome;
      if (!agente) {
        return res.status(400).json({ error: 'Nome agente mancante nel token' });
      }
      
      // Trova tutti i dealer associati all'agente
      const dealerQuery = await new sql.Request()
        .input('agente', sql.NVarChar, agente)
        .query('SELECT IDDealer, RagioneSociale FROM tbDealers WHERE AGENTE = @agente');
      const dealerIds = dealerQuery.recordset.map(d => d.IDDealer);
      if (dealerIds.length === 0) {
        return res.json({ obiettivi: [] });
      }
      // Calcolo mese/anno in timezone Europe/Rome per evitare slittamenti dovuti all'UTC
      const nowRome_ob = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Rome' }));
      const anno = nowRome_ob.getFullYear();
      const mese = nowRome_ob.getMonth() + 1;
      const request = new sql.Request();
      request.input('anno', sql.Int, anno);
      request.input('mese', sql.Int, mese);
      request.input('agente', sql.NVarChar, agente);
      // Obiettivi Agenti filtrati per agente
      const obiettiviRes = await request.query(`
        SELECT Agente, Anno, Mese,
               ObiettivoPDAFisso, ObiettivoPDAMobileRA, ObiettivoPDAEnergy
        FROM ObiettiviAgenti
        WHERE Anno = @anno AND Mese = @mese
          AND LTRIM(RTRIM(UPPER(Agente))) = LTRIM(RTRIM(UPPER(@agente)))`);
      const obiettivi = obiettiviRes.recordset;
      // Helpers per ObiettiviAgenti
      const calcolaMancano = (attuale, obiettivo) => {
        if (!obiettivo || obiettivo <= 0) {
          return 0;
        }
        return Math.max(0, obiettivo - attuale);
      };
      const getTarget = (obiettivo) => {
        return obiettivo || 0;
      };
      // Aggrega i dati di tutti i dealer
      let categorieFastweb = [], categorieEnergia = [], categorieSkyMobileWifi = [], categorieSkyTv = [];
      for (const idDealer of dealerIds) {
        // Fastweb TLC
        let fastwebStatsRes = await sql.query`EXEC GetOrderStatisticsByDealerByidDealer @idDealer = ${idDealer}`;
        let fastwebStats = fastwebStatsRes.recordset[0] || {};
        const mappaCategorieFastweb = {
          'MOBILE RES': fastwebStats['MOBILI RES'] || 0,
          'MOBILE SHP': fastwebStats['MOBILI BUS'] || 0,
          'FISSO RES': fastwebStats['FISSI RES'] || 0,
          'FISSO SHP': fastwebStats['FISSI BUS'] || 0,
          'Convergenza RES': fastwebStats['di cui CONV_RES'] || 0,
          'Convergenza SHP': fastwebStats['di cui CONV_BUS'] || 0
        };
        categorieFastweb.push(...soglie
          .filter(s => s.operatore === 'Fastweb' && s.categoria !== 'ENERGIA')
          .map(s => {
            const nomeCategoria = `${s.categoria} ${s.segmento}`.trim();
            const attuale = mappaCategorieFastweb[nomeCategoria] || 0;
            const target = getTarget(attuale, s);
            const mancano = calcolaMancano(attuale, s);
            return { nome: nomeCategoria, attuale, target, mancano, dealer: idDealer };
          }));
        // Sky Mobile & WIFI
        let skyMobileWifiRes = await sql.query`EXEC ReportAttivazioniSkyMobileWifibyIddealer @idDealer = ${idDealer}`;
        let skyMobileWifiStats = skyMobileWifiRes.recordset[0] || {};
        let mappaSkyMobileWifi = {
          'Mobile': skyMobileWifiStats.Mobile || 0,
          'WIFI': skyMobileWifiStats.WIFI || 0,
          'Mobile + WIFI': skyMobileWifiStats['Mobile + WIFI'] || 0
        };
        categorieSkyMobileWifi.push(...Object.keys(mappaSkyMobileWifi).map(cat => {
          const attuale = mappaSkyMobileWifi[cat];
          const sogliaRow = soglie.find(s => s.operatore === 'Sky Mobile & WIFI' && s.categoria === cat);
          const target = sogliaRow ? getTarget(attuale, sogliaRow) : 0;
          const mancano = sogliaRow ? calcolaMancano(attuale, sogliaRow) : 0;
          return { nome: cat, attuale, target, mancano, dealer: idDealer };
        }));
        // Sky TV
        let skyTvRes = await sql.query`EXEC ReportAttivazioniSkyTV @idDealer = ${idDealer}`;
        let skyTvStats = skyTvRes.recordset[0] || {};
        let mappaSkyTv = {
          'ONLY TV': skyTvStats['ONLY TV'] || 0,
          '3P': skyTvStats['3P'] || 0,
          'GLASS': skyTvStats['GLASS'] || 0,
          '3P GLASS': skyTvStats['3P GLASS'] || 0
        };
        categorieSkyTv.push(...Object.keys(mappaSkyTv).map(cat => {
          const attuale = mappaSkyTv[cat];
          const sogliaRow = soglie.find(s => s.operatore === 'Sky TV' && s.categoria === cat);
          const target = sogliaRow ? getTarget(attuale, sogliaRow) : 0;
          const mancano = sogliaRow ? calcolaMancano(attuale, sogliaRow) : 0;
          return { nome: cat, attuale, target, mancano, dealer: idDealer };
        }));
      }

      // Aggrega energia dalla vista condivisa (coerente con il SuperMaster)
      try {
        const energiaReq = new sql.Request();
        energiaReq.input('Anno', sql.Int, anno);
        energiaReq.input('Mese', sql.Int, mese);
        energiaReq.input('Agente', sql.NVarChar, agente);
        const energiaRes = await energiaReq.query(`
          SELECT SUM(energia_inseriti) AS EnergiaTotale
          FROM dbo.vw_agenti_province_mensile
          WHERE Anno = @Anno AND Mese = @Mese
            AND LTRIM(RTRIM(UPPER(ISNULL(AGENTE, N'')))) = LTRIM(RTRIM(UPPER(@Agente)))
        `);
        const energiaTotale = Number(energiaRes.recordset?.[0]?.EnergiaTotale) || 0;

        const energyTarget = Number(obiettivi?.[0]?.ObiettivoPDAEnergy) ||
          Number(soglie.find(s => s.operatore === 'Fastweb' && s.categoria === 'ENERGIA')?.soglia_1_max) ||
          0;

        categorieEnergia.push({
          nome: 'Energia',
          attuale: energiaTotale,
          target: energyTarget,
          mancano: Math.max(0, energyTarget - energiaTotale),
          dealer: 'AGGREGATO',
        });
      } catch (energiaErr) {
        console.warn('[Agente][obiettivi] energia vista condivisa non disponibile:', energiaErr?.message || energiaErr);
      }

      // Risposta finale aggregata
      res.json({
        success: true,
        data: [
          { operatore: 'Fastweb TLC', categorie: categorieFastweb },
          { operatore: 'Fastweb ENERGIA', categorie: categorieEnergia },
          { operatore: 'Sky Mobile & WIFI', categorie: categorieSkyMobileWifi },
          { operatore: 'Sky TV', categorie: categorieSkyTv }
        ]
      });
    } catch (err) {
      console.error('Errore in /api/agente/obiettivi:', err);
      res.status(500).json({ error: 'Errore nel recupero degli obiettivi', details: err.message });
    }
  });

  // Endpoint per ottenere i dealer assegnati all'agente
  router.get('/miei-dealer', authenticateToken, requireAgente, async (req, res) => {
    try {
      const agentEmail = req.user.email;
      if (!agentEmail) {
        return res.status(401).json({ error: 'Email agente mancante nel token' });
      }

      // Recupera il nome dell'agente
      const resultAgent = await new sql.Request()
        .input('email', sql.NVarChar, agentEmail)
        .query('SELECT Nome, IdAgente FROM dbo.tbAgenti WHERE RecapitoEmail = @email');

      if (!resultAgent.recordset.length) {
        return res.status(404).json({ error: 'Agente non trovato' });
      }

      const { Nome: nomeAgente, IdAgente } = resultAgent.recordset[0];

      // Recupera i dealer associati all'agente
      const result = await new sql.Request()
        .input('nomeAgente', sql.NVarChar, nomeAgente)
        .query('SELECT IDDealer, RagioneSociale, RecapitoEmail, RecapitoCell FROM dbo.tbDealers WHERE AGENTE = @nomeAgente');

      const dealers = result.recordset.map(dealer => ({
        id: dealer.IDDealer,
        ragioneSociale: dealer.RagioneSociale,
        email: dealer.RecapitoEmail,
        telefono: dealer.RecapitoCell
      }));

      return res.json({ dealers, idAgente: IdAgente });
    } catch (err) {
      console.error('Errore in /api/agente/miei-dealer:', err);
      res.status(500).json({ error: 'Errore del server', details: err.message });
    }
  });

  // Endpoint per l'invio ordine da agente a dealer
  router.post(
    '/ordine',
    authenticateToken,
    requireAgente,
    (req, res, next) => {
      const contentType = req.headers['content-type'] || '';
      if (contentType.includes('multipart/form-data')) {
        agentOrderUpload.array('photos', 10)(req, res, (err) => {
          if (err) {
            const message = err?.message || 'Errore durante il caricamento delle immagini';
            return res.status(400).json({ error: message });
          }
          req.agentOrderPhotos = extractAgentPhotos(req.files);
          next();
        });
      } else {
        jsonParser(req, res, (err) => {
          if (err) {
            return res.status(400).json({ error: 'Payload JSON non valido', details: err?.message });
          }
          req.agentOrderPhotos = [];
          next();
        });
      }
    },
    async (req, res) => {
      const contentType = req.headers['content-type'] || '';
      const isMultipart = contentType.includes('multipart/form-data');
      let payload = null;

      try {
        if (isMultipart) {
          if (req.body?.order) {
            payload = typeof req.body.order === 'string' ? JSON.parse(req.body.order) : req.body.order;
          } else {
            const raw = { ...req.body };
            if (typeof raw.carrello === 'string') {
              try { raw.carrello = JSON.parse(raw.carrello); } catch (e) {}
            }
            payload = raw;
          }
        } else {
          payload = req.body;
        }
      } catch (parseErr) {
        return res.status(400).json({ error: 'Impossibile interpretare i dati dell\'ordine', details: parseErr?.message });
      }

      const { carrello, idDealer, noteOrdine, idAgente, trasporto, paymentMethod, paymentLink } = payload || {};
      const photoFiles = Array.isArray(req.agentOrderPhotos) ? req.agentOrderPhotos : [];

      try {
        if (!Array.isArray(carrello) || carrello.length === 0) {
          return res.status(400).json({ error: 'Carrello vuoto o non valido' });
        }
        if (!idDealer) {
          return res.status(400).json({ error: 'ID dealer mancante' });
        }
        if (!trasporto) {
          return res.status(400).json({ error: 'Metodo di trasporto mancante' });
        }
        // Validazione idOfferta nei prodotti
        for (const item of carrello) {
          if (!item.idOfferta) {
            return res.status(400).json({ error: 'idOfferta mancante per un prodotto del carrello' });
          }
        }
      
      // Ricava info agente da token/DB, così OrdineDA contiene il NOME agente
      const agenteNomeFromToken = req.user?.agenteNome || null;
      const agentEmail = req.user?.email || null;
      const agentUserId = req.user?.userId || null;
      let effectiveAgenteNome = agenteNomeFromToken || null;
      let effectiveIdAgente = idAgente || null;

      try {
        if ((!effectiveAgenteNome || !effectiveIdAgente) && agentEmail) {
          const agentInfoReq = new sql.Request();
          const agentInfoRes = await agentInfoReq
            .input('email', sql.NVarChar, agentEmail)
            .query('SELECT Nome, IdAgente FROM dbo.tbAgenti WHERE RecapitoEmail = @email');
          if (agentInfoRes.recordset?.length) {
            const row = agentInfoRes.recordset[0];
            if (!effectiveAgenteNome) effectiveAgenteNome = row.Nome || null;
            if (!effectiveIdAgente) effectiveIdAgente = row.IdAgente || null;
          }
        }
      } catch (e) {
        console.warn('[AGENTE][ordine] Lookup agente da email fallita:', e?.message || e);
      }

      if (!effectiveAgenteNome) {
        return res.status(400).json({ error: 'Nome agente mancante (OrdineDA)' });
      }

      // VALIDAZIONE CRITICA: l'idDealer selezionato deve appartenere alla scuderia dell'agente
      try {
        const authReq = new sql.Request();
        authReq.input('agente', sql.NVarChar, effectiveAgenteNome);
        const authRes = await authReq.query('SELECT IDDealer FROM dbo.tbDealers WHERE AGENTE = @agente');
        const allowedIds = (authRes.recordset || []).map(r => Number(r.IDDealer));
        const requestedDealer = Number(idDealer);
        if (!allowedIds.includes(requestedDealer)) {
          console.warn('[AGENTE][ordine] Dealer non autorizzato per agente:', { agente: effectiveAgenteNome, requestedDealer, allowedIdsCount: allowedIds.length });
          return res.status(403).json({ error: 'Dealer non autorizzato per questo agente' });
        }
      } catch (authErr) {
        console.warn('[AGENTE][ordine] Verifica appartenenza dealer fallita:', authErr?.message || authErr);
        // Per sicurezza, se la verifica fallisce per errore DB, blocchiamo l'ordine
        return res.status(503).json({ error: 'Impossibile verificare dealer per agente, riprova' });
      }

      // Normalizza metodo di pagamento (default BONIFICO se assente)
      const pmRaw = (paymentMethod || '').toString().trim().toUpperCase();
      const isCarta = ['CARTA', 'CARD', 'CC', 'CREDIT_CARD', 'CREDIT CARD'].includes(pmRaw);
      const isBonifico = pmRaw.includes('BONIF');
      // Per gli ordini inseriti da agente, lo stato iniziale deve essere 0 (IN ATTESA DI PAGAMENTO) se non è carta
      const statoPagamentoIniziale = isCarta ? 20 : 0; // 20 = pagato carta, 0 = in attesa pagamento

      // Calcolo spese di spedizione per AGENTE
      let speseSpedizione = 0;
      const tRaw = (trasporto || '').toString().trim();
      const t = tRaw.toUpperCase();
      
      // LOGICA CORRETTA: Se "CONSEGNA A MANO" -> Mai spese di trasporto
      if (t.includes('CONSEGNA') && t.includes('MANO')) {
        speseSpedizione = 0;
        console.log(`[AGENTE] CONSEGNA A MANO: Nessuna spesa di spedizione`);
      } else if (t.includes('INVIO') && t.includes('SEDE')) {
        // Per "INVIO DA SEDE": Verifica se almeno 1 prodotto richiede spese di trasporto
        const idsList = (Array.isArray(carrello) ? carrello : [])
          .map(it => Number(it?.idOfferta))
          .filter(n => Number.isFinite(n) && n > 0);
        if (idsList.length) {
          const q = `SELECT IDOfferta, SpeseSpedizione FROM dbo.tbOfferte WHERE IDOfferta IN (${idsList.join(',')})`;
          const result = await new sql.Request()
            .query(q);
          if (result.recordset && result.recordset.length > 0) {
            // Se almeno 1 prodotto ha spese > 0, applica le spese (prendi il massimo)
            const spesePerProdotto = result.recordset.map(r => Number(r.SpeseSpedizione) || 0);
            const hasSpeseTrasporto = spesePerProdotto.some(s => s > 0);
            speseSpedizione = hasSpeseTrasporto ? Math.max(...spesePerProdotto) : 0;
            console.log(`[AGENTE] INVIO DA SEDE: Spese spedizione €${speseSpedizione} (prodotti con spese: ${hasSpeseTrasporto})`);
          }
        }
      } else {
        speseSpedizione = 0;
        console.log(`[AGENTE] Metodo trasporto sconosciuto (${trasporto}): Nessuna spesa`);
      }

        const transaction = new sql.Transaction();
        let transactionStarted = false;
      
        try {
          await transaction.begin();
          transactionStarted = true;
          const request = new sql.Request(transaction);
        
        // Normalizza gli item del carrello (gestione prezzo/quantita mancanti)
        const normItems = carrello.map(it => ({
          idOfferta: Number(it.idOfferta),
          quantita: Number(it.quantita) > 0 ? Number(it.quantita) : 1,
          prezzoEuro: Number(((Number(it.prezzo || 0) / 100))).toFixed ? Number(((Number(it.prezzo || 0) / 100)).toFixed(2)) : (Number(it.prezzo || 0) / 100),
          customCode: it?.customCode
        }));

        // Calcola il totale dell'ordine in euro sommando gli item normalizzati
        const totale = normItems.reduce((sum, it) => sum + (Number(it.prezzoEuro) * Number(it.quantita)), 0);
        
        // Inserisci l'ordine
        const dataOra = new Date(); // oggetto Date per sql.DateTime
        // Determina stato spedizione iniziale con priorità regole:
        // 1) Se presente offerta 446 -> DA RICARICARE (ID 25)
        // 2) Se TRASPORTO = INVIO DA SEDE -> DA SPEDIRE (ID 31)
        // 3) Se TRASPORTO = CONSEGNA A MANO -> CONSEGNATO (ID 4)
        // 4) Default -> NON SPEDITO (ID 0)
        const has446 = Array.isArray(carrello) && carrello.some(x => Number(x.idOfferta) === 446);
        const tRaw = (trasporto || '').toString().trim();
        const t = tRaw.toUpperCase();
        let idStatoSpedizioneIniziale = 0;
        // Valori ammessi dal CHECK su dbo.tbOrdiniProdotti.stato_spedizione (UPPERCASE esatti)
        // Tabella di riferimento: dbo.tbStatiSpedizioneOrdiniProdotti
        // 0 = NON SPEDITO, 31 = DA SPEDIRE, 4 = CONSEGNATO, 25 = DA RICARICARE
        let statoSpedizioneIniziale = 'NON SPEDITO';
        if (has446) {
          idStatoSpedizioneIniziale = 25;
          statoSpedizioneIniziale = 'DA RICARICARE';
        } else if (t.includes('INVIO') && t.includes('SEDE')) {
          idStatoSpedizioneIniziale = 31;
          statoSpedizioneIniziale = 'DA SPEDIRE';
        } else if (t.includes('CONSEGNA') && t.includes('MANO')) {
          idStatoSpedizioneIniziale = 4;
          statoSpedizioneIniziale = 'CONSEGNATO';
        }

        // Verifica se la colonna idStatoSpedizione esiste
        const colExists = await ensureHasIdStatoSpedizione();

        let reqBuilder = request
          .input('idDealer', sql.Int, Number(idDealer))
          .input('DataOra', sql.DateTime, dataOra)
          // OrdineDA deve contenere il NOME dell'agente
          .input('OrdineDA', sql.NVarChar, effectiveAgenteNome)
          .input('SpeseSpedizione', sql.Decimal(10, 2), speseSpedizione)
          .input('TotaleOrdine', sql.Decimal(10, 2), totale)
          .input('Payload', sql.NVarChar, JSON.stringify(carrello))
          .input('idStatoOrdineProdotto', sql.Int, statoPagamentoIniziale)
          .input('NoteOrdine', sql.NVarChar, noteOrdine || '') // Campo obbligatorio, vuoto se non valorizzato
          .input('Note4Dealer', sql.NVarChar, '') // Campo obbligatorio, vuoto se non valorizzato
          .input('NoteInterne', sql.NVarChar, '') // Campo obbligatorio, vuoto se non valorizzato
          .input('OrdineDaAgente', sql.Int, 1) // Flag ordine da agente
          .input('DataStato', sql.DateTime, dataOra)
          ;

        if (colExists) {
          reqBuilder = reqBuilder.input('idStatoSpedizione', sql.Int, idStatoSpedizioneIniziale);
        }

        const columns = `idDealer, DataOra, OrdineDA, SpeseSpedizione, TotaleOrdine, Payload, 
              idStatoOrdineProdotto, NoteOrdine, Note4Dealer, NoteInterne, OrdineDaAgente, DataStato${colExists ? ', idStatoSpedizione' : ''}`;
        const values = `@idDealer, @DataOra, @OrdineDA, @SpeseSpedizione, @TotaleOrdine, @Payload, 
              @idStatoOrdineProdotto, @NoteOrdine, @Note4Dealer, @NoteInterne, @OrdineDaAgente, @DataStato${colExists ? ', @idStatoSpedizione' : ''}`;

          const result = await reqBuilder.query(`
            INSERT INTO dbo.tbOrdiniProdotti (${columns})
            OUTPUT INSERTED.IDOrdineProdotto
            VALUES (${values})
          `);
        
          const idOrdineProdotto = result.recordset[0].IDOrdineProdotto;

        // Aggiorna lo stato testuale nel rispetto del CHECK (solo 'Non Spedito' | 'Spedito')
          if (colExists) {
            await new sql.Request(transaction)
              .input('id', sql.Int, idOrdineProdotto)
              .query(`
                UPDATE op
                SET op.stato_spedizione = CASE WHEN op.idStatoSpedizione IN (3,4) THEN 'Spedito' ELSE 'Non Spedito' END
                FROM dbo.tbOrdiniProdotti op
                WHERE op.IDOrdineProdotto = @id
              `);
          } else {
            await new sql.Request(transaction)
              .input('id', sql.Int, idOrdineProdotto)
              .input('val', sql.NVarChar, 'Non Spedito')
              .query(`UPDATE dbo.tbOrdiniProdotti SET stato_spedizione = @val WHERE IDOrdineProdotto = @id`);
          }
        
        // Inserisci i dettagli dell'ordine
        for (const item of normItems) {
          const idOfferta = Number(item.idOfferta);
          const quantita = Number(item.quantita) || 1;
          let costoUnitarioEuro = Number(item.prezzoEuro);

          if (!Number.isInteger(idOfferta) || idOfferta <= 0) {
            console.warn('[AGENTE][ordine] idOfferta non valido, item saltato:', item);
            continue;
          }

          // Regola speciale OFFERTA 446
          if (idOfferta === 446) {
            const code = (item?.customCode || '').toString().trim();
            const valid = /^cim-flora-kim-d\d{1,3}$/.test(code);
            if (!valid) {
              try {
                await new sql.Request(transaction)
                  .input('idOrdineProdotto', sql.Int, idOrdineProdotto)
                  .query(`UPDATE dbo.tbOrdiniProdotti SET NoteOrdine = CONCAT(ISNULL(NoteOrdine,''), CASE WHEN LEN(ISNULL(NoteOrdine,''))>0 THEN ' | ' ELSE '' END, 'OFFERTA 446: codice mancante/invalid') WHERE IDOrdineProdotto = @idOrdineProdotto`);
              } catch (noteErr) {
                console.warn('[AGENTE][446] Append nota fallita:', noteErr?.message || noteErr);
              }
              continue; // salta inserimento riga
            }
            // Applica sconto fisso 3%
            costoUnitarioEuro = Number((costoUnitarioEuro * 0.97).toFixed(2));
            try {
              await new sql.Request(transaction)
                .input('idOrdineProdotto', sql.Int, idOrdineProdotto)
                .query(`UPDATE dbo.tbOrdiniProdotti SET NoteOrdine = CONCAT(ISNULL(NoteOrdine,''), CASE WHEN LEN(ISNULL(NoteOrdine,''))>0 THEN ' | ' ELSE '' END, 'OFFERTA 446 CODE: ${'' + code.replace(/'/g, "''")}') WHERE IDOrdineProdotto = @idOrdineProdotto`);
            } catch (noteErr) {
              console.warn('[AGENTE][446] Append codice in nota fallita:', noteErr?.message || noteErr);
            }
          }

          const detailRequest = new sql.Request(transaction);
          await detailRequest
            .input('IDOrdineProdotto', sql.Int, idOrdineProdotto)
            .input('IDOfferta', sql.Int, idOfferta)
            .input('Quantita', sql.Int, quantita)
            .input('CostoUnitario', sql.Decimal(10, 2), costoUnitarioEuro)
            .query(`
              INSERT INTO dbo.tbDettagliOrdiniProdotti (
                IDOrdineProdotto, IDOfferta, Quantita, CostoUnitario
              )
              VALUES (
                @IDOrdineProdotto, @IDOfferta, @Quantita, @CostoUnitario
              )
            `);
        }

        const uploadedPhotos = [];
        if (photoFiles.length) {
          const now = new Date();
          const year = String(now.getFullYear());
          const month = String(now.getMonth() + 1).padStart(2, '0');

          for (const file of photoFiles) {
            try {
              const safeOriginal = sanitizeFileName(file.originalname || 'foto.jpg');
              const customKey = `ordini-prodotti/${year}/${month}/${idOrdineProdotto}/${Date.now()}_${crypto.randomUUID()}_${safeOriginal}`;
              const uploadRes = await uploadToS3(file, String(idOrdineProdotto), month, year, customKey);

              const insertPhotoReq = new sql.Request(transaction);
              await insertPhotoReq
                .input('IDOrdineProdotto', sql.Int, idOrdineProdotto)
                .input('S3Key', sql.NVarChar(512), uploadRes?.key || customKey)
                .input('Url', sql.NVarChar(1024), uploadRes?.url || '')
                .input('OriginalName', sql.NVarChar(255), safeOriginal)
                .query(`
                  INSERT INTO dbo.tbOrdiniProdottiFoto (IDOrdineProdotto, S3Key, Url, OriginalName)
                  VALUES (@IDOrdineProdotto, @S3Key, @Url, @OriginalName)
                `);

              uploadedPhotos.push({
                url: uploadRes?.url || `https://${process.env.S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${uploadRes?.key || customKey}`,
                key: uploadRes?.key || customKey,
                originalName: safeOriginal
              });
            } catch (photoErr) {
              console.error('[AGENTE][ordine][FOTO] Errore upload/insert foto ordine:', photoErr);
              throw photoErr;
            }
          }
        }

        await transaction.commit();
        transactionStarted = false;
        
        // Invia email di notifica ordine prodotto creato
        try {
          await emailService.sendProductOrderEmail('ORDINE_PRODOTTO_CREATO', idOrdineProdotto, {
            createdByAgent: true,
            agentId: agentUserId || null,
            agentLegacyId: effectiveIdAgente || null,
            agentName: effectiveAgenteNome || null,
            agentEmail: agentEmail || null,
            paymentStatus: isCarta ? 'paid' : 'pending',
            paymentMethod: isCarta ? 'CARTA' : (isBonifico ? 'BONIFICO' : 'UNKNOWN'),
            paymentLink: isCarta ? (paymentLink || null) : null
          });
          console.log(`[EMAIL] Email ordine prodotto inviata per ordine ${idOrdineProdotto} creato da agente ${effectiveAgenteNome || agenteNomeFromToken || 'sconosciuto'} (userId=${agentUserId || 'n/d'}, legacyId=${effectiveIdAgente || 'n/d'})`);
        } catch (emailError) {
          console.error('[EMAIL] Errore invio email ordine prodotto:', emailError);
          // Non interrompiamo il flusso in caso di errore nell'invio email
        }
        
        res.status(201).json({ 
          success: true, 
          message: 'Ordine creato con successo', 
          idOrdine: idOrdineProdotto,
          photos: uploadedPhotos
        });
        
      } catch (err) {
        if (transactionStarted) {
          try {
            await transaction.rollback();
          } catch (rollbackErr) {
            console.error('[AGENTE][ordine] Rollback fallito:', rollbackErr);
          }
        }
        throw err;
      }
    } catch (err) {
        try {
          const cartInfo = Array.isArray(carrello)
            ? carrello.map(it => ({ idOfferta: it?.idOfferta, quantita: it?.quantita, prezzo: it?.prezzo })).slice(0, 10)
            : [];
          console.error('Errore in /api/agente/ordine:', err?.stack || err, {
            dealer: idDealer,
            trasporto,
            itemsPreview: cartInfo,
            photosCount: photoFiles.length
          });
        } catch {}
        
        res.status(500).json({ 
          error: 'Errore durante la creazione dell\'ordine', 
          details: err.message 
        });
      }
    }
  );

  // Endpoint per ottenere le statistiche delle attivazioni per l'agente
  router.get('/statistiche', authenticateToken, requireAgente, async (req, res) => {
    try {
      const agenteNome = req.user.agenteNome;
      const { anno, mese } = req.query;
      
      if (!agenteNome) {
        return res.status(400).json({ error: 'Nome agente mancante nel token' });
      }

      
      
      // Query per ottenere le statistiche
      const query = `
        SELECT 
            Operatore,
            Anno,
            Mese,
            COUNT(*) AS TotaleAttivazioni,
            FORMAT(DATEFROMPARTS(Anno, Mese, 1), 'yyyy-MM-dd') AS DataMese
        FROM (
            SELECT 
                CASE 
                    WHEN op.Denominazione = 'SKY MOBILE' THEN 'SKY MOBILE'
                    WHEN op.Denominazione = 'WEEDOO' THEN 'WEEDOO'
                END AS Operatore,
                YEAR(o.DataOra) AS Anno,
                MONTH(o.DataOra) AS Mese
            FROM dbo.tbOrdini o
            INNER JOIN dbo.tbDealers d ON o.idDealer = d.IDDealer
            INNER JOIN dbo.tbOfferte ofr ON o.idOfferta = ofr.IDOfferta
            INNER JOIN dbo.tbOperatori op ON ofr.idOperatore = op.IDOperatore
            WHERE d.AGENTE = @agenteNome
            AND op.Denominazione IN ('SKY MOBILE', 'WEEDOO')
        ) AS Attivazioni
        WHERE 1=1
        ${anno ? 'AND Anno = @anno' : ''}
        ${mese ? 'AND Mese = @mese' : ''}
        GROUP BY Operatore, Anno, Mese, FORMAT(DATEFROMPARTS(Anno, Mese, 1), 'yyyy-MM-dd')
        ORDER BY Anno, Mese, Operatore`;
      
      const params = { agenteNome };
      if (anno) params.anno = parseInt(anno, 10);
      if (mese) params.mese = parseInt(mese, 10);
      
      const result = await sql.query(query, params);
      res.json(result.recordset);
      
    } catch (err) {
      console.error('Errore in /api/agente/statistiche:', err);
      res.status(500).json({ error: 'Errore server', details: err.message });
    }
  });

  // Endpoint per attivazioni mensili per dealer della scuderia agente
  router.get('/ultime-attivazioni-agente', authenticateToken, requireAgente, async (req, res) => {
    try {
      const agenteNome = req.user.agenteNome;
      
      if (!agenteNome) {
        return res.status(400).json({ error: 'Nome agente mancante nel token' });
      }

      // Ottieni anno e mese correnti in timezone Europe/Rome
      const nowRome = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Rome' }));
      const anno = nowRome.getFullYear();
      const mese = nowRome.getMonth() + 1; // getMonth() restituisce 0-11, quindi +1

      console.log(`[AGENTE] Chiamata stored procedure per ${agenteNome}, Anno: ${anno}, Mese: ${mese}`);
      console.log(`[AGENTE] Query eseguita: EXEC dbo.attivazionimensilidealeragente @Agente = N'${agenteNome}', @Anno = ${anno}, @Mese = ${mese}`);

      // Chiamata alla stored procedure per attivazioni mensili per dealer
      const request = new sql.Request();
      request.input('Agente', sql.NVarChar, agenteNome);
      request.input('Anno', sql.Int, anno);
      request.input('Mese', sql.Int, mese);
      
      const result = await request.execute('dbo.attivazionimensilidealeragente');
      
      console.log(`[AGENTE] Risultati stored procedure: ${result.recordset.length} dealer trovati`);
      console.log(`[AGENTE] Primi 3 risultati:`, result.recordset.slice(0, 3));
      
      res.json(result.recordset);
      
    } catch (err) {
      console.error('Errore in /api/agente/ultime-attivazioni-agente:', err);
      res.status(500).json({ error: 'Errore server', details: err.message });
    }
  });

  // Endpoint per dettaglio attivazioni agente (modale "Dettagli")
  router.get('/attivazioni-dettaglio', authenticateToken, requireAgente, async (req, res) => {
    try {
      const agenteNome = req.user.agenteNome;
      
      if (!agenteNome) {
        return res.status(400).json({ error: 'Nome agente mancante nel token' });
      }

      // Ottieni anno e mese da query params o usa correnti
      const nowRome = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Rome' }));
      const anno = req.query.anno ? parseInt(req.query.anno) : nowRome.getFullYear();
      const mese = req.query.mese ? parseInt(req.query.mese) : nowRome.getMonth() + 1;
      const monthStart = `${anno}-${String(mese).padStart(2, '0')}-01`;

      console.log(`[AGENTE][DETTAGLIO] Richiesta dettagli per ${agenteNome}, Mese: ${monthStart}`);

      // Query dalla view vw_compensi_agenti_mese_dettaglio con JOIN a tbDealers per POINT
      // UNION con ENI e SKY da tbOrdini
      const query = `
        -- TLC e ENERGY dalla view
        SELECT 
          ISNULL(d.RagioneSociale, v.Cliente) AS Point,
          v.TIPO,
          v.IsConvergenzaMobile,
          v.TipoRicaNorm,
          v.ValoreFisso,
          v.Offerta,
          v.BatchDate
        FROM vw_compensi_agenti_mese_dettaglio v
        LEFT JOIN dbo.tbDealers d ON (
          v.COMSY_RAW = d.COMSY1 OR v.COMSY_RAW = d.COMSY2
        )
        WHERE v.Agente = @agenteNome
          AND v.MonthStart = @monthStart

        UNION ALL

        -- ENI e SKY da tbOrdini
        SELECT 
          d.RagioneSociale AS Point,
          CASE 
            WHEN op.Denominazione LIKE '%ENI%' OR op.Denominazione LIKE '%PLENITUDE%' THEN 'ENERGIA'
            WHEN op.Denominazione LIKE '%SKY%' THEN 'SKY'
            ELSE 'ALTRO'
          END AS TIPO,
          0 AS IsConvergenzaMobile,
          '-' AS TipoRicaNorm,
          ofr.Titolo AS ValoreFisso,
          NULL AS Offerta,
          CONVERT(date, o.DataOra) AS BatchDate
        FROM dbo.tbOrdini o
        INNER JOIN dbo.tbDealers d ON o.idDealer = d.IDDealer
        INNER JOIN dbo.tbOfferte ofr ON o.idOfferta = ofr.IDOfferta
        INNER JOIN dbo.tbOperatori op ON ofr.idOperatore = op.IDOperatore
        WHERE d.AGENTE = @agenteNome
          AND CONVERT(date, o.DataOra) >= @monthStart
          AND CONVERT(date, o.DataOra) < DATEADD(MONTH, 1, @monthStart)
          AND (
            op.Denominazione LIKE '%ENI%' 
            OR op.Denominazione LIKE '%PLENITUDE%'
            OR op.Denominazione LIKE '%SKY%'
          )

        ORDER BY BatchDate DESC, Point
      `;

      const request = new sql.Request();
      request.input('agenteNome', sql.NVarChar, agenteNome);
      request.input('monthStart', sql.Date, monthStart);
      
      const result = await request.query(query);
      
      console.log(`[AGENTE][DETTAGLIO] Trovate ${result.recordset.length} attivazioni`);
      
      res.json(result.recordset);
      
    } catch (err) {
      console.error('Errore in /api/agente/attivazioni-dettaglio:', err);
      res.status(500).json({ error: 'Errore server', details: err.message });
    }
  });

  // Endpoint per la reportistica agente
  router.get('/reportistica', authenticateToken, requireAgente, async (req, res) => {
    try {
      const agenteNome = req.user.agenteNome || req.user.nome || req.user.name || req.user.email || req.user.userId;
      
      if (!agenteNome) {
        return res.status(400).json({ error: 'Impossibile identificare l\'agente' });
      }

      
      
      // Query per ottenere le statistiche di attivazione per l'agente
      const query = `
        SELECT 
            op.Denominazione AS Operatore,
            COUNT(DISTINCT o.IDOrdine) AS TotaleAttivazioni,
            SUM(CASE WHEN o.Stato = 1 THEN 1 ELSE 0 END) AS AttivazioniCompletate,
            SUM(CASE WHEN o.Stato = 2 THEN 1 ELSE 0 END) AS AttivazioniAnnullate
        FROM dbo.tbOrdini o
        INNER JOIN dbo.tbDealers d ON o.idDealer = d.IDDealer
        INNER JOIN dbo.tbOfferte ofr ON o.idOfferta = ofr.IDOfferta
        INNER JOIN dbo.tbOperatori op ON ofr.idOperatore = op.IDOperatore
        WHERE d.AGENTE = @agenteNome
        GROUP BY op.Denominazione
        ORDER BY op.Denominazione`;
      
      const result = await sql.query(query, { agenteNome });
      res.json(result.recordset);
      
    } catch (err) {
      console.error('Errore in /api/agente/reportistica:', err);
      res.status(500).json({ error: 'Errore server', details: err.message });
    }
  });

  // Endpoint per le statistiche agente
  router.get('/statistiche', authenticateToken, requireAgente, async (req, res) => {
    try {
      const agenteNome = req.user.agenteNome;
      const { anno, mese } = req.query;
      
      if (!agenteNome) {
        return res.status(400).json({ error: 'Nome agente mancante nel token' });
      }

      
      
      // Query per ottenere le statistiche mensili per l'agente
      const query = `
        WITH MaxBatchFWE AS (
            SELECT 
                YEAR([Batch]) AS Anno, 
                MONTH([Batch]) AS Mese, 
                MAX([Batch]) AS MaxBatch
            FROM dbo.FWEnergiaimporter f
            INNER JOIN DealerAgente d ON f.[Codice Comsy/Order Owner (Report!DBSELLER)] IN (d.COMSY1, d.COMSY2)
            GROUP BY YEAR([Batch]), MONTH([Batch])
        )
        SELECT 
            Operatore, 
            Anno, 
            Mese, 
            FORMAT(DATEFROMPARTS(Anno, Mese, 1), 'yyyy-MM-dd') as Data,
            COUNT(*) AS NumeroAttivazioni
        FROM (
            -- Fastweb
            SELECT 
                'FASTWEB' AS Operatore, 
                YEAR(o.DataOra) AS Anno,
                MONTH(o.DataOra) AS Mese
            FROM dbo.tbOrdini o
            INNER JOIN dbo.tbDealers d ON o.idDealer = d.IDDealer
            INNER JOIN dbo.tbOfferte ofr ON o.idOfferta = ofr.IDOfferta
            INNER JOIN dbo.tbOperatori op ON ofr.idOperatore = op.IDOperatore
            WHERE d.AGENTE = @agenteNome
            AND op.Denominazione = 'FASTWEB'
            
            UNION ALL
            
            -- Fastweb Energia
            SELECT 
                'FASTWEB ENERGIA' AS Operatore, 
                YEAR(f.[Batch]) AS Anno, 
                MONTH(f.[Batch]) AS Mese
            FROM dbo.FWEnergiaimporter f
            INNER JOIN DealerAgente d ON f.[Codice Comsy/Order Owner (Report!DBSELLER)] IN (d.COMSY1, d.COMSY2)
            INNER JOIN MaxBatchFWE mb ON YEAR(f.Batch) = mb.Anno AND MONTH(f.Batch) = mb.Mese AND f.Batch = mb.MaxBatch
            WHERE d.AGENTE = @agenteNome
            
            UNION ALL
            
            -- Sky/Weedoo
            SELECT 
                CASE 
                    WHEN op.Denominazione = 'SKY MOBILE' THEN 'SKY MOBILE'
                    WHEN op.Denominazione = 'WEEDOO' THEN 'WEEDOO'
                END AS Operatore,
                YEAR(o.DataOra) AS Anno,
                MONTH(o.DataOra) AS Mese
            FROM dbo.tbOrdini o
            INNER JOIN dbo.tbDealers d ON o.idDealer = d.IDDealer
            INNER JOIN dbo.tbOfferte ofr ON o.idOfferta = ofr.IDOfferta
            INNER JOIN dbo.tbOperatori op ON ofr.idOperatore = op.IDOperatore
            WHERE d.AGENTE = @agenteNome
            AND op.Denominazione IN ('SKY MOBILE', 'WEEDOO')
        ) AS Attivazioni
        WHERE 1=1
        ${anno ? 'AND Anno = @anno' : ''}
        ${mese ? 'AND Mese = @mese' : ''}
        GROUP BY Operatore, Anno, Mese, FORMAT(DATEFROMPARTS(Anno, Mese, 1), 'yyyy-MM-dd')
        ORDER BY Anno, Mese, Operatore`;
      
      const params = { agenteNome };
      if (anno) params.anno = parseInt(anno, 10);
      if (mese) params.mese = parseInt(mese, 10);
      
      const result = await sql.query(query, params);
      res.json(result.recordset);
      
    } catch (err) {
      console.error('Errore in /api/agente/statistiche:', err);
      res.status(500).json({ error: 'Errore server', details: err.message });
    }
  });

  // GET /api/agente/compensi - Compensi mese corrente o selezionato (stessa vista SuperMaster)
  router.get('/compensi', authenticateToken, async (req, res) => {
    try {
      const agenteEmail = req.user?.email;
      // Prova tutti i possibili campi nome nel token
      const agenteNome = req.user?.agenteNome || req.user?.nome || req.user?.name || req.user?.agentName;
      
      console.log('[AGENTE][COMPENSI] Richiesta per agente:', agenteNome, 'email:', agenteEmail);
      console.log('[AGENTE][COMPENSI] Token user object:', JSON.stringify(req.user));
      
      if (!agenteEmail && !agenteNome) {
        return res.status(400).json({ error: 'Email o nome agente mancante nel token' });
      }

      // Mese: usa monthStart da query param oppure mese corrente
      const monthStartParam = req.query.monthStart || '';
      let monthStart;
      let monthStartStr;
      
      if (monthStartParam) {
        // Usa il mese selezionato (formato: "2025-10-01")
        monthStart = new Date(monthStartParam);
        monthStartStr = monthStartParam;
        console.log('[AGENTE][COMPENSI] Mese selezionato:', monthStartStr);
      } else {
        // Mese corrente (primo giorno del mese)
        const now = new Date();
        monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        monthStartStr = monthStart.toISOString().split('T')[0];
        console.log('[AGENTE][COMPENSI] Mese corrente:', monthStartStr);
      }

      // Query usando la stessa vista del SuperMaster
      const request = new sql.Request();
      request.input('p_monthStart', sql.Date, monthStart);
      request.input('p_agente', sql.NVarChar(100), agenteNome);
      
      const result = await request.query(`
        DECLARE @MonthStart date = CONVERT(date, @p_monthStart, 23);
        DECLARE @Agente nvarchar(100) = @p_agente;
        SELECT TOP 1 *
        FROM dbo.vw_compensi_agenti_mese_compensi WITH (NOLOCK)
        WHERE MonthStart = @MonthStart
          AND Agente = @Agente;
      `);

      const row = result.recordset?.[0];
      
      console.log('[AGENTE][COMPENSI] ========== DEBUG COMPLETO ==========');
      console.log('[AGENTE][COMPENSI] Query params:', { monthStart: monthStartStr, agente: agenteNome });
      console.log('[AGENTE][COMPENSI] Risultato query:', row ? 'Trovato' : 'Nessun dato', 'recordset length:', result.recordset?.length);
      console.log('[AGENTE][COMPENSI] Recordset completo:', JSON.stringify(result.recordset, null, 2));
      
      if (row) {
        console.log('[AGENTE][COMPENSI] Valori RAW dalla vista:');
        console.log('  - MonthStart:', row.MonthStart);
        console.log('  - MESE_LABEL:', row.MESE_LABEL);
        console.log('  - Agente:', row.Agente);
        console.log('  - Euro_RA:', row.Euro_RA);
        console.log('  - Euro_Prodotti:', row.Euro_Prodotti);
        console.log('  - Euro_SimVendute:', row.Euro_SimVendute);
        console.log('  - Euro_Bonus:', row.Euro_Bonus);
        console.log('  - Euro_Contributo:', row.Euro_Contributo);
        console.log('  - Euro_Extra_Fisso_Comp:', row.Euro_Extra_Fisso_Comp);
        console.log('  - Euro_Totale_Compenso (dalla vista):', row.Euro_Totale_Compenso);
      }
      console.log('[AGENTE][COMPENSI] =====================================');
      
      if (!row) {
        // Nessun dato per il mese corrente, ritorna valori a zero
        return res.json({
          monthStart: monthStartStr,
          agente: agenteNome,
          data: {
            Euro_RA: 0,
            Euro_Attivazioni: 0,
            Euro_SimVendute: 0,
            Euro_Bonus: 0,
            Euro_Contributo: 0,
            Euro_Extra_Fisso_Comp: 0,
            Euro_Totale_Compenso: 0
          }
        });
      }

      // Mappa i dati dalla vista (FIX: usa nomi colonne corretti)
      const euroRA = Number(row.Euro_RA || 0);
      const euroAttivazioni = Number(row.Euro_Prodotti || 0); // PRODOTTI → ATTIVAZIONI
      const euroSimVendute = Number(row.Euro_SimVendute || 0);
      const euroBonus = Number(row.Euro_Bonus || 0);
      const euroContributo = Number(row.Euro_Contributo || 0);
      
      // FIX: Euro_Totale dalla vista (non Euro_Totale_Compenso che non esiste)
      const euroTotale = Number(row.Euro_Totale || 0);
      
      console.log('[AGENTE][COMPENSI] Valori mappati:');
      console.log('  - Euro_RA:', euroRA);
      console.log('  - Euro_Attivazioni:', euroAttivazioni);
      console.log('  - Euro_SimVendute:', euroSimVendute);
      console.log('  - Euro_Bonus:', euroBonus);
      console.log('  - Euro_Contributo:', euroContributo);
      console.log('  - Euro_Totale (dalla vista):', euroTotale);
      
      const data = {
        Euro_RA: euroRA,
        Euro_Attivazioni: euroAttivazioni,
        Euro_SimVendute: euroSimVendute,
        Euro_Bonus: euroBonus,
        Euro_Contributo: euroContributo,
        Euro_Totale_Compenso: euroTotale
      };

      res.json({
        monthStart: monthStartStr,
        meseLabel: row.MESE_LABEL || monthStartStr,
        agente: row.Agente || agenteNome,
        data
      });

    } catch (err) {
      console.error('[AGENTE][COMPENSI] Errore:', err);
      res.status(500).json({ error: 'Errore server', details: err.message });
    }
  });

  return router;
};

export default createAgenteRouter;
