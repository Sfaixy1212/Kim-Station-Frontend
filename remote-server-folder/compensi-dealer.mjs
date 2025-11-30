import express from 'express';
import sql from 'mssql';
import { authenticateToken, dbConfig } from './index.mjs';
import { uploadToS3 } from './s3-service.mjs';

const router = express.Router();

// Middleware: SUPERMASTER e MASTERPRODOTTI
function onlySupermaster(req, res, next) {
  const roles = (req.user?.ruoli || []).map(r => String(r).toUpperCase());
  const role = String(req?.user?.role || req?.user?.ruolo || '').toUpperCase();
  
  if (roles.includes('SUPERMASTER') || role === 'SUPERMASTER' ||
      roles.includes('MASTERPRODOTTI') || role === 'MASTERPRODOTTI' ||
      roles.includes('MASTER_PRODOTTI') || role === 'MASTER_PRODOTTI') {
    return next();
  }
  return res.status(403).json({ error: 'Accesso riservato ai SUPERMASTER e MASTERPRODOTTI' });
}

// Middleware: SUPERMASTER, MASTERPRODOTTI o DEALER (solo propri dati)
function supermasterOrOwnDealer(req, res, next) {
  const roles = (req.user?.ruoli || []).map(r => String(r).toUpperCase());
  const role = String(req?.user?.role || req?.user?.ruolo || '').toUpperCase();
  
  // Se è supermaster/masterprodotti, può accedere a qualsiasi dealer
  if (roles.includes('SUPERMASTER') || role === 'SUPERMASTER' ||
      roles.includes('MASTERPRODOTTI') || role === 'MASTERPRODOTTI' ||
      roles.includes('MASTER_PRODOTTI') || role === 'MASTER_PRODOTTI') {
    return next();
  }
  
  // Se è dealer, può accedere solo ai propri dati
  if (roles.includes('DEALER') || role === 'DEALER') {
    const userDealerId = req.user?.dealerId || req.user?.idDealer;
    let requestedDealerId = parseInt(req.body?.dealerId || req.query?.dealerId || req.params?.dealerId, 10);
    
    // Se il dealer non ha specificato un dealerId nel body, usa il suo dal token
    // Questo permette ai dealer di chiamare l'endpoint senza specificare il dealerId
    if (!requestedDealerId || isNaN(requestedDealerId)) {
      console.log('[supermasterOrOwnDealer] Dealer without dealerId in body - using from token:', userDealerId);
      return next(); // Permetti l'accesso, il dealerId verrà estratto dal token nella route
    }
    
    console.log('[supermasterOrOwnDealer] Dealer check:', {
      userDealerId,
      requestedDealerId,
      match: userDealerId && requestedDealerId && parseInt(userDealerId, 10) === requestedDealerId
    });
    
    if (userDealerId && requestedDealerId && parseInt(userDealerId, 10) === requestedDealerId) {
      return next();
    }
    
    return res.status(403).json({ 
      error: 'Puoi accedere solo ai tuoi compensi',
      debug: {
        yourDealerId: userDealerId,
        requestedDealerId: requestedDealerId
      }
    });
  }
  
  return res.status(403).json({ error: 'Accesso non autorizzato' });
}

// GET /api/supermaster/compensi-dealer/attivazioni
// Dettaglio attivazioni per bucket (drill-down)
router.get('/attivazioni', authenticateToken, onlySupermaster, async (req, res) => {
  const toNumber = (value) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  };
  const toBool = (value) => {
    if (typeof value === 'boolean') return value;
    if (value === null || value === undefined) return false;
    if (typeof value === 'number') return value !== 0;
    const s = String(value).trim().toLowerCase();
    return ['1', 'true', 'si', 'sì', 'yes'].includes(s);
  };

  try {
    const monthStart = String(req.query.monthStart || '').trim();
    const dealerId = req.query.dealerId || req.query.idDealer;
    const bucket = (req.query.bucket || '').toString().trim();

    if (!monthStart || !dealerId) {
      return res.status(400).json({
        message: 'Parametri mancanti: monthStart e dealerId sono obbligatori'
      });
    }

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(monthStart)) {
      return res.status(400).json({
        message: 'Formato data non valido. Utilizzare YYYY-MM-DD'
      });
    }

    const pool = await sql.connect();
    const request = pool.request()
      .input('MonthStart', sql.Date, monthStart)
      .input('IDDealer', sql.Int, parseInt(dealerId, 10))
      .input('Bucket', sql.NVarChar, bucket || null);

    const query = `
      SELECT *
      FROM dbo.ufn_compensi_attivazioni_enriched(@MonthStart, @IDDealer)
      WHERE (@Bucket IS NULL OR CalcBucket = @Bucket)
      ORDER BY Segmento, Categoria, CalcBucket, Ambito
    `;

    const result = await request.query(query);
    const rows = result.recordset || [];

    const attivazioni = rows.map((row) => {
      const importoTlc = toNumber(row.ImportoTLC);
      const cessioneSim = toNumber(row.CessioneSim);
      const anticipo = toNumber(row.Anticipo);
      const netto = toNumber(row.Netto);
      const totale = importoTlc + cessioneSim + anticipo + netto;

      // Determina ambito in base alle colonne popolate
      let ambito = 'TLC';
      if (cessioneSim !== 0) ambito = 'CESSIONE_SIM';
      if (anticipo !== 0) ambito = 'ANTICIPO';

      // Importo unitario percepito (per coerenza con frontend: importo del blocco TLC se presente)
      const importoPerPezzo = importoTlc !== 0 ? importoTlc : (netto !== 0 ? netto : totale);

      return {
        monthStart: row.MonthStart,
        idDealer: row.IDDealer,
        operatore: row.Operatore || null,
        segmento: row.Segmento || null,
        categoria: row.Categoria || null,
        bucket: row.CalcBucket || row.Bucket || null,
        bucketOriginale: row.Bucket || null,
        sottoVoce: null,
        mnpOperator: row.MNP_Operator || null,
        isRA: toBool(row.IsRA),
        inConvergenza: toBool(row.InConvergenza),
        activationKey: row.ActivationKey || null,
        importoPerPezzo,
        euroCalcolati: totale,
        ambito: row.Ambito || ambito,
        ruleId: row.RuleId != null ? Number(row.RuleId) : null,
        note: row.Note || '',
        dataAttivazione: row.DataAttivazione || row.MonthStart,
        numeroPratica: row.NumeroPratica || null,
        numeroOrdine: row.NumeroOrdine || null,
        breakdown: {
          importoTlc,
          cessioneSim,
          anticipo,
          netto
        }
      };
    });

    const totaleEuro = attivazioni.reduce((sum, a) => sum + a.euroCalcolati, 0);

    res.json({
      success: true,
      monthStart,
      dealerId: parseInt(dealerId, 10),
      bucket: bucket || null,
      count: attivazioni.length,
      totaleEuro,
      attivazioni
    });
  } catch (err) {
    console.error('[COMPENSI DEALER - ATTIVAZIONI] Errore:', err);
    res.status(500).json({
      message: 'Errore nel recupero delle attivazioni',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// POST /api/supermaster/compensi-dealer
// Calcola compensi per dealer specifico in un mese
router.post('/', authenticateToken, supermasterOrOwnDealer, async (req, res) => {
  try {
    let { monthStart, dealerId } = req.body;
    
    console.log('[compensi-dealer] Request body:', { monthStart, dealerId });
    console.log('[compensi-dealer] User:', {
      role: req.user?.role,
      ruolo: req.user?.ruolo,
      ruoli: req.user?.ruoli,
      supermaster: req.user?.supermaster,
      dealer: req.user?.dealer
    });

    // Determina se è un dealer o supermaster
    const userRoles = (req.user?.ruoli || []).map(r => String(r).toUpperCase());
    const userRole = String(req?.user?.role || req?.user?.ruolo || '').toUpperCase();
    
    // È supermaster se ha il ruolo SUPERMASTER o il flag supermaster
    const isSupermaster = userRoles.includes('SUPERMASTER') || 
                          userRole === 'SUPERMASTER' || 
                          req.user?.supermaster === true;
    
    // È dealer solo se NON è supermaster E ha il ruolo dealer
    const isDealer = !isSupermaster && (userRoles.includes('DEALER') || userRole === 'DEALER' || req.user?.dealer === true);
    
    console.log('[compensi-dealer] Role check:', { isSupermaster, isDealer });
    
    if (isDealer) {
      // Per i dealer, usa sempre il dealerId dal token
      dealerId = req.user?.dealerId || req.user?.idDealer;
      console.log('[compensi-dealer] DEALER request - using dealerId from token:', dealerId);
    } else {
      console.log('[compensi-dealer] SUPERMASTER request - using dealerId from body:', dealerId);
    }

    if (!monthStart) {
      console.log('[compensi-dealer] ERROR: monthStart mancante');
      return res.status(400).json({ 
        message: 'Parametro mancante: monthStart è obbligatorio' 
      });
    }

    if (!dealerId) {
      console.log('[compensi-dealer] ERROR: dealerId mancante');
      return res.status(400).json({ 
        message: 'Parametro mancante: dealerId è obbligatorio (o non presente nel token per dealer)' 
      });
    }
    
    console.log('[compensi-dealer] Calling stored procedure with:', { monthStart, dealerId });

    // Validazione formato data
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(monthStart)) {
      return res.status(400).json({ 
        message: 'Formato data non valido. Utilizzare YYYY-MM-DD' 
      });
    }

    const pool = await sql.connect();
    
    // Esegui stored procedure per calcolo compensi dealer
    console.log('[compensi-dealer] Executing sp_calcola_compensi_dealer_mese...');
    const result = await pool.request()
      .input('MonthStart', sql.Date, monthStart)
      .input('IDDealer', sql.Int, parseInt(dealerId))
      .execute('dbo.sp_calcola_compensi_dealer_mese');

    console.log('[compensi-dealer] SP executed. Recordsets:', result.recordsets?.length);
    console.log('[compensi-dealer] First recordset rows:', result.recordset?.length);

    // Helper
    const toNumber = (value) => {
      const n = Number(value);
      return Number.isFinite(n) ? n : 0;
    };
    const toInt = (value) => {
      const n = parseInt(value, 10);
      return Number.isFinite(n) ? n : 0;
    };
    const toBool = (value) => {
      if (typeof value === 'boolean') return value;
      if (value === null || value === undefined) return false;
      if (typeof value === 'number') return value !== 0;
      const s = String(value).trim().toLowerCase();
      return ['1', 'true', 'si', 'sì', 'yes'].includes(s);
    };

    const rawDetails = result.recordset || [];
    const normalizedDetails = rawDetails.map((item) => {
      const ambito = item.Ambito || 'TLC';
      const bucket = item.Bucket || 'N/A';
      const calcBucket = item.CalcBucket || bucket;
      const note = item.Note || '';
      const euroCalcolati = toNumber(item.EuroCalcolati);
      const importoPerPezzo = toNumber(item.ImportoPerPezzo);
      const qty = toInt(item.Qty);
      const esclusoMnpVodafone = euroCalcolati === 0 && /escluso/i.test(note);
      const scontoMnpVodafone = /(sconto\s*10€\s*mnp\s*voda)/i.test(note);
      const convergenza = toBool(item.InConvergenza);

      return {
        idDealer: toInt(item.IDDealer) || toInt(dealerId),
        monthStart,
        operatore: item.Operatore || null,
        segmento: item.Segmento || 'N/A',
        categoria: item.Categoria || 'N/A',
        bucket,
        calcBucket,
        ambito,
        ruleId: item.RuleId != null ? Number(item.RuleId) : null,
        sogliaMin: item.SogliaMin != null ? Number(item.SogliaMin) : null,
        sogliaMax: item.SogliaMax != null ? Number(item.SogliaMax) : null,
        importoPerPezzo,
        qty,
        note,
        euroCalcolati,
        flags: {
          esclusoMnpVodafone,
          scontoMnpVodafone,
          convergenza
        },
        extra: {
          ambitoOriginale: item.Ambito || null,
          bucketOriginale: item.Bucket || null,
          calcBucketOriginale: item.CalcBucket || null,
          sottoVoce: item.SottoVoce || null,
          mnpOperator: item.MNP_Operator || null,
          isRa: toBool(item.IsRA),
          inConvergenza: toBool(item.InConvergenza)
        }
      };
    });

    if (normalizedDetails.length === 0) {
      return res.json({
        success: true,
        monthStart,
        dealerId: parseInt(dealerId, 10),
        totaleCompensi: 0,
        totaleGenerale: 0,
        totaleAttivazioni: 0,
        totaleAttivazioniQty: 0,
        totaliPerAmbito: [],
        grouped: [],
        dettagli: [],
        generatedAt: new Date().toISOString()
      });
    }

    const totaliPerAmbitoMap = new Map();
    normalizedDetails.forEach((row) => {
      const current = totaliPerAmbitoMap.get(row.ambito) || 0;
      totaliPerAmbitoMap.set(row.ambito, current + row.euroCalcolati);
    });
    const totaliPerAmbito = Array.from(totaliPerAmbitoMap.entries()).map(([ambito, euro]) => ({ ambito, euro }));
    const totaleCompensi = totaliPerAmbito.reduce((sum, item) => sum + item.euro, 0);
    const totaleAttivazioni = normalizedDetails.reduce((count, row) => row.ambito === 'TLC' ? count + 1 : count, 0);
    const totaleAttivazioniQty = normalizedDetails.reduce((sum, row) => row.ambito === 'TLC' ? sum + row.qty : sum, 0);

    // Raggruppamento segmento/categoria/bucket
    const groupedMap = new Map();
    const getNested = (map, key, factory) => {
      if (!map.has(key)) {
        map.set(key, factory());
      }
      return map.get(key);
    };

    normalizedDetails.forEach((row) => {
      const segmentoEntry = getNested(groupedMap, row.segmento, () => ({
        segmento: row.segmento,
        categorie: new Map()
      }));

      const categoriaEntry = getNested(segmentoEntry.categorie, row.categoria, () => ({
        categoria: row.categoria,
        buckets: new Map()
      }));

      const bucketKey = row.calcBucket || row.bucket;
      const bucketEntry = getNested(categoriaEntry.buckets, bucketKey, () => ({
        bucket: bucketKey,
        bucketOriginale: row.bucket,
        totalsPerAmbito: new Map(),
        totale: 0,
        qtyTotale: 0,
        rows: []
      }));

      const currentAmbitoTotal = bucketEntry.totalsPerAmbito.get(row.ambito) || 0;
      bucketEntry.totalsPerAmbito.set(row.ambito, currentAmbitoTotal + row.euroCalcolati);
      bucketEntry.totale += row.euroCalcolati;
      bucketEntry.qtyTotale += row.qty;
      bucketEntry.rows.push({
        ambito: row.ambito,
        ruleId: row.ruleId,
        sogliaMin: row.sogliaMin,
        sogliaMax: row.sogliaMax,
        note: row.note,
        importoPerPezzo: row.importoPerPezzo,
        qty: row.qty,
        euroCalcolati: row.euroCalcolati,
        flags: row.flags
      });
    });

    const grouped = Array.from(groupedMap.values()).map((segmento) => ({
      segmento: segmento.segmento,
      categorie: Array.from(segmento.categorie.values()).map((categoria) => ({
        categoria: categoria.categoria,
        buckets: Array.from(categoria.buckets.values()).map((bucket) => ({
          bucket: bucket.bucket,
          bucketOriginale: bucket.bucketOriginale,
          totalsPerAmbito: Array.from(bucket.totalsPerAmbito.entries()).map(([ambito, euro]) => ({ ambito, euro })),
          totale: bucket.totale,
          qtyTotale: bucket.qtyTotale,
          rows: bucket.rows
        }))
      }))
    }));

    // Query per ottenere tutte le soglie disponibili per il mese
    const soglieResult = await pool.request()
      .input('MonthStart', sql.Date, monthStart)
      .query(`
        SELECT 
          Operatore,
          Ambito,
          Categoria,
          Segmento,
          SottoVoce as Bucket,
          SogliaMin,
          SogliaMax,
          Importo as ImportoPerPezzo,
          Note
        FROM dbo.cfg_compensi_dealer
        WHERE MonthStart = @MonthStart
        ORDER BY Operatore, Categoria, Segmento, SogliaMin
      `);

    const soglie = soglieResult.recordset.map(row => ({
      operatore: row.Operatore,
      ambito: row.Ambito,
      categoria: row.Categoria,
      segmento: row.Segmento,
      bucket: row.Bucket,
      sogliaMin: toNumber(row.SogliaMin),
      sogliaMax: toNumber(row.SogliaMax),
      importoPerPezzo: toNumber(row.ImportoPerPezzo),
      note: row.Note
    }));

    const response = {
      success: true,
      monthStart,
      dealerId: parseInt(dealerId, 10),
      totaleCompensi,
      totaleGenerale: totaleCompensi,
      totaleAttivazioni,
      totaleAttivazioniQty,
      totaliPerAmbito,
      grouped,
      soglie, // ✅ TUTTE LE SOGLIE DISPONIBILI
      dettagli: normalizedDetails,
      generatedAt: new Date().toISOString()
    };

    console.log(`[COMPENSI DEALER] Calcolati per dealer ${dealerId}, mese ${monthStart}:`, {
      totaleCompensi: response.totaleCompensi,
      totaleAttivazioni: response.totaleAttivazioni,
      dettagliCount: response.dettagli.length,
      soglieCount: response.soglie.length,
      totaliPerAmbitoCount: response.totaliPerAmbito.length
    });
    
    console.log('[COMPENSI DEALER] Sending response to client...');

    res.json(response);

  } catch (err) {
    console.error('[COMPENSI DEALER] Errore:', err);
    res.status(500).json({ 
      message: 'Errore interno del server',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// GET /api/supermaster/dealers
// Restituisce lista dealer per autocompletamento
router.get('/dealers', authenticateToken, onlySupermaster, async (req, res) => {
  try {
    const pool = await sql.connect();
    
    const result = await pool.request().query(`
      SELECT 
        IDDealer as idDealer,
        RagioneSociale as ragioneSociale,
        AGENTE as agente,
        Provincia as provincia,
        Citta as citta,
        Active as attivo,
        COMSY1 as comsy1,
        COMSY2 as comsy2
      FROM dbo.tbDealers 
      WHERE Active = 1
      ORDER BY RagioneSociale ASC
    `);

    const dealers = result.recordset || [];

    res.json({
      success: true,
      dealers,
      count: dealers.length
    });

  } catch (err) {
    console.error('[DEALERS LIST] Errore:', err);
    res.status(500).json({ 
      message: 'Errore nel caricamento dei dealer',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// Lazy import per Puppeteer/Playwright
let puppeteer = null;
let chromiumLambda = null;

async function getPuppeteer() {
  if (puppeteer) return puppeteer;
  try {
    try {
      puppeteer = (await import('puppeteer')).default;
    } catch {
      puppeteer = (await import('puppeteer-core')).default;
    }
    return puppeteer;
  } catch (e) {
    throw new Error('Puppeteer non installato');
  }
}

// POST /api/supermaster/compensi-dealer/genera-invito
// Genera PDF dell'invito a fatturare e lo carica su S3
router.post('/genera-invito', authenticateToken, onlySupermaster, async (req, res) => {
  try {
    const { dealer, intestatario, compensi, dataGenerazione, numeroProgressivo } = req.body;

    if (!dealer || !compensi) {
      return res.status(400).json({ 
        message: 'Dati mancanti: dealer e compensi sono obbligatori' 
      });
    }

    // Genera HTML per l'invito a fatturare
    const html = `
<!DOCTYPE html>
<html lang="it">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Invito a Fatturare</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; color: #333; }
        .header { text-align: center; margin-bottom: 30px; }
        .title { font-size: 24px; font-weight: bold; color: #2563eb; margin-bottom: 10px; }
        .subtitle { font-size: 14px; color: #666; }
        .section { margin: 20px 0; }
        .section-title { font-size: 16px; font-weight: bold; margin-bottom: 10px; color: #1f2937; }
        .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin: 20px 0; }
        .info-box { border: 1px solid #e5e7eb; padding: 15px; border-radius: 8px; }
        .info-box h3 { margin: 0 0 10px 0; font-size: 14px; font-weight: bold; color: #374151; }
        .info-box p { margin: 2px 0; font-size: 12px; }
        .total-box { background-color: #dbeafe; border: 2px solid #2563eb; padding: 15px; border-radius: 8px; text-align: center; margin: 20px 0; }
        .total-amount { font-size: 24px; font-weight: bold; color: #1e40af; }
        .footer { margin-top: 40px; font-size: 11px; color: #666; }
        .segmento { margin: 15px 0; padding: 10px; border-left: 4px solid #2563eb; background-color: #f8fafc; }
        .segmento-title { font-weight: bold; color: #1e40af; margin-bottom: 8px; }
        .categoria { margin: 8px 0; padding: 8px; background-color: #f1f5f9; border-radius: 4px; }
    </style>
</head>
<body>
    <div class="header">
        <div class="title">INVITO A FATTURARE</div>
        <div class="subtitle">N° ${numeroProgressivo} del ${dataGenerazione}</div>
    </div>

    <div class="info-grid">
        <div class="info-box">
            <h3>DESTINATARIO FATTURA</h3>
            <p><strong>${intestatario.ragioneSociale}</strong></p>
            <p>${intestatario.indirizzo}</p>
            <p>${intestatario.cap} ${intestatario.citta} (${intestatario.provincia})</p>
            <p>P.IVA: ${intestatario.piva}</p>
            <p>C.F.: ${intestatario.codiceFiscale}</p>
            <p>Codice Destinatario: ${intestatario.codiceDestinatario}</p>
        </div>
        
        <div class="info-box">
            <h3>FORNITORE</h3>
            <p><strong>${dealer.ragioneSociale}</strong></p>
            ${dealer.indirizzo ? `<p>${dealer.indirizzo}</p>` : ''}
            ${dealer.cap && dealer.citta ? `<p>${dealer.cap} ${dealer.citta} ${dealer.provincia ? '(' + dealer.provincia + ')' : ''}</p>` : ''}
            ${dealer.piva ? `<p>P.IVA: ${dealer.piva}</p>` : ''}
            ${dealer.agente ? `<p>Agente di riferimento: ${dealer.agente}</p>` : ''}
        </div>
    </div>

    <div class="section">
        <div class="section-title">OGGETTO</div>
        <p>Compensi per attivazioni del mese di <strong>${compensi.mese}</strong></p>
    </div>

    <div class="total-box">
        <div>IMPORTO TOTALE COMPENSI</div>
        <div class="total-amount">€ ${compensi.totaleCompensi.toLocaleString('it-IT', { minimumFractionDigits: 2 })}</div>
        <div style="font-size: 14px; margin-top: 5px;">Totale attivazioni: ${compensi.totaleAttivazioni}</div>
    </div>

    <div class="section">
        <div class="section-title">DETTAGLIO COMPENSI</div>
        
        ${compensi.segmenti.map(segmento => `
            <div class="segmento">
                <div class="segmento-title">
                    ${segmento.nome === 'RES' ? '📈 Segmento Residenziale (RES)' : '🏢 Segmento Business (SHP)'}
                </div>
                
                ${segmento.categorie.map(categoria => `
                    <div class="categoria">
                        <strong>${categoria.nome === 'FISSO' ? 'Prodotti Fissi' : 
                                 categoria.bucket === 'FLEX' ? 'ENERGIA' : 'Prodotti Mobile'} - ${categoria.bucket}</strong><br>
                        ${categoria.qty} attivazioni × € ${categoria.importoPerPezzo.toLocaleString('it-IT', { minimumFractionDigits: 2 })} = 
                        <strong>€ ${categoria.euroCalcolati.toLocaleString('it-IT', { minimumFractionDigits: 2 })}</strong>
                        ${categoria.note ? `<br><em>Regola: ${categoria.note}</em>` : ''}
                    </div>
                `).join('')}
            </div>
        `).join('')}
    </div>

    <div class="section">
        <div class="section-title">MODALITÀ DI PAGAMENTO</div>
        <p>Come da accordi commerciali in essere.</p>
    </div>

    <div class="footer">
        <p><strong>Note:</strong></p>
        <p>• La presente richiesta si riferisce ai compensi maturati per le attivazioni del periodo indicato</p>
        <p>• Si prega di emettere fattura con i dati sopra indicati</p>
        <p>• Per informazioni: amministrazione@kimweb.it</p>
        <br>
        <p>Documento generato automaticamente il ${new Date().toLocaleString('it-IT')}</p>
    </div>
</body>
</html>`;

    // Genera PDF usando PDFKit (nativo JavaScript)
    let pdfBuffer = null;
    
    try {
      console.log('[INVITO PDF] Generazione PDF con PDFKit...');
      
      const PDFDocument = (await import('pdfkit')).default;
      const doc = new PDFDocument({ 
        size: 'A4', 
        margin: 50,
        info: {
          Title: `Invito a Fatturare - ${dealer.ragioneSociale}`,
          Author: 'KIM srls',
          Subject: `Compensi ${compensi.mese}`,
          Creator: 'KIM Station'
        }
      });
      
      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => {
        pdfBuffer = Buffer.concat(chunks);
      });

      // Logo ritagliato e Header
      try {
        // Carica il logo ritagliato
        const logoPath = '/home/ec2-user/ubuntu/PRODUZIONE/Backend-React/public/logokimritagliato.png';
        doc.image(logoPath, 50, 40, { width: 100 });
      } catch (logoError) {
        console.warn('[INVITO PDF] Logo ritagliato non caricato:', logoError.message);
        // Fallback al testo
        doc.fontSize(16).fillColor('#2563eb').text('KIM srls', 50, 40);
      }
      
      // Header centrato con spazio per logo
      doc.fontSize(28).fillColor('#2563eb').text('INVITO A FATTURARE', 170, 45, { width: 330, align: 'center' });
      doc.fontSize(14).fillColor('#666').text(`N° ${numeroProgressivo} del ${dataGenerazione}`, 170, 75, { width: 330, align: 'center' });
      
      // Linea separatrice
      doc.strokeColor('#2563eb').lineWidth(3);
      doc.moveTo(50, 110).lineTo(550, 110).stroke();
      
      // Sposta cursore sotto header
      doc.y = 130;

      // Salva posizione Y per allineamento
      const startY = doc.y;

      // Box Destinatario (colonna sinistra)
      doc.rect(50, startY, 240, 100).stroke('#e5e7eb');
      doc.fontSize(12).fillColor('#1f2937').text('DESTINATARIO FATTURA', 60, startY + 10);
      let currentY = startY + 30;
      doc.fontSize(10).fillColor('#333')
         .text(`${intestatario.ragioneSociale}`, 60, currentY, { width: 220 })
         .text(`${intestatario.indirizzo}`, 60, currentY + 15, { width: 220 })
         .text(`${intestatario.cap} ${intestatario.citta} (${intestatario.provincia})`, 60, currentY + 30, { width: 220 })
         .text(`P.IVA: ${intestatario.piva}`, 60, currentY + 45, { width: 220 })
         .text(`C.F.: ${intestatario.codiceFiscale}`, 60, currentY + 60, { width: 220 });

      // Box Fornitore (colonna destra)
      doc.rect(310, startY, 240, 100).stroke('#e5e7eb');
      doc.fontSize(12).fillColor('#1f2937').text('FORNITORE', 320, startY + 10);
      doc.fontSize(10).fillColor('#333')
         .text(`${dealer.ragioneSociale}`, 320, currentY, { width: 220 })
         .text(`${dealer.indirizzo || ''}`, 320, currentY + 15, { width: 220 })
         .text(`${dealer.cap || ''} ${dealer.citta || ''} ${dealer.provincia ? '(' + dealer.provincia + ')' : ''}`, 320, currentY + 30, { width: 220 });
      
      if (dealer.piva) {
        doc.text(`P.IVA: ${dealer.piva}`, 320, currentY + 45, { width: 220 });
      }
      if (dealer.agente) {
        doc.text(`Agente: ${dealer.agente}`, 320, currentY + 60, { width: 220 });
      }

      // Sposta il cursore sotto i box
      doc.y = startY + 120;

      // Oggetto
      doc.fontSize(14).fillColor('#1f2937').text('OGGETTO');
      doc.fontSize(10).fillColor('#333').text(`Compensi per attivazioni del mese di ${compensi.mese}`);
      doc.moveDown(1);

      // Importo totale
      const boxY = doc.y;
      doc.rect(50, boxY, 500, 60).fillAndStroke('#dbeafe', '#2563eb');
      doc.fontSize(16).fillColor('#1e40af').text('IMPORTO TOTALE COMPENSI', 50, boxY + 10, { width: 500, align: 'center' });
      doc.fontSize(24).fillColor('#1e40af').text(`€ ${compensi.totaleCompensi.toLocaleString('it-IT', { minimumFractionDigits: 2 })}`, 50, boxY + 30, { width: 500, align: 'center' });
      doc.fontSize(10).fillColor('#1e40af').text(`Totale attivazioni: ${compensi.totaleAttivazioni}`, 50, boxY + 50, { width: 500, align: 'center' });
      
      // Sposta cursore sotto il box
      doc.y = boxY + 80;

      // Dettaglio compensi
      doc.fontSize(14).fillColor('#1f2937').text('DETTAGLIO COMPENSI');
      doc.moveDown(0.5);

      compensi.segmenti.forEach((segmento, segIndex) => {
        // Header segmento con background
        const segY = doc.y;
        doc.rect(50, segY, 500, 25).fillAndStroke('#f8fafc', '#e2e8f0');
        doc.fontSize(12).fillColor('#1e40af').text(`${segmento.nome === 'RES' ? 'Segmento Residenziale (RES)' : 'Segmento Business (SHP)'}`, 60, segY + 8);
        doc.y = segY + 35;
        
        segmento.categorie.forEach((categoria, catIndex) => {
          const nomeCategoria = categoria.nome === 'FISSO' ? 'Prodotti Fissi' : 
                                categoria.bucket === 'FLEX' ? 'ENERGIA' : 'Prodotti Mobile';
          
          // Box per ogni categoria
          const catY = doc.y;
          doc.rect(70, catY, 460, categoria.note ? 45 : 35).stroke('#e5e7eb');
          
          // Nome categoria
          doc.fontSize(10).fillColor('#333').text(`${nomeCategoria} - ${categoria.bucket}`, 80, catY + 8, { width: 440 });
          
          // Calcolo
          doc.fontSize(9).fillColor('#666')
             .text(`${categoria.qty} attivazioni × € ${categoria.importoPerPezzo.toLocaleString('it-IT', { minimumFractionDigits: 2 })} = € ${categoria.euroCalcolati.toLocaleString('it-IT', { minimumFractionDigits: 2 })}`, 80, catY + 22, { width: 440 });
          
          // Regola se presente
          if (categoria.note) {
            doc.fontSize(8).fillColor('#888').text(`Regola: ${categoria.note}`, 80, catY + 35, { width: 440 });
          }
          
          doc.y = catY + (categoria.note ? 55 : 45);
        });
        doc.moveDown(0.5);
      });

      // Note finali
      doc.moveDown(1);
      doc.fontSize(12).fillColor('#1f2937').text('MODALITÀ DI PAGAMENTO');
      doc.fontSize(10).fillColor('#333').text('Come da accordi commerciali in essere.');
      
      doc.moveDown(1);
      doc.fontSize(10).fillColor('#666')
         .text('Note:')
         .text('• La presente richiesta si riferisce ai compensi maturati per le attivazioni del periodo indicato')
         .text('• Si prega di emettere fattura con i dati sopra indicati')
         .text('• Per informazioni: amministrazione@kimweb.it')
         .moveDown(0.5)
         .text(`Documento generato automaticamente il ${new Date().toLocaleString('it-IT')}`);

      doc.end();

      // Aspetta che il PDF sia completato
      await new Promise((resolve) => {
        doc.on('end', resolve);
      });

      console.log('[INVITO PDF] PDF generato con successo con PDFKit');
      
    } catch (pdfError) {
      console.warn('[INVITO PDF] Errore PDFKit:', pdfError.message);
      pdfBuffer = null;
    }

    // Prepara file per upload S3
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    
    let filename, fileObj;
    
    if (pdfBuffer) {
      // PDF generato con successo
      filename = `Invito_Fatturare_${dealer.ragioneSociale.replace(/[^a-zA-Z0-9]/g, '_')}_${compensi.mese.replace(/\s/g, '_')}.pdf`;
      fileObj = {
        originalname: filename,
        buffer: pdfBuffer,
        mimetype: 'application/pdf',
        size: pdfBuffer.length
      };
    } else {
      // Fallback a HTML
      filename = `Invito_Fatturare_${dealer.ragioneSociale.replace(/[^a-zA-Z0-9]/g, '_')}_${compensi.mese.replace(/\s/g, '_')}.html`;
      fileObj = {
        originalname: filename,
        buffer: Buffer.from(html, 'utf-8'),
        mimetype: 'text/html',
        size: Buffer.byteLength(html, 'utf-8')
      };
    }

    // Carica su S3 nel bucket invitiafatturare
    const s3Key = `inviti/${year}/${month}/${filename}`;
    const uploadResult = await uploadToS3(
      fileObj,
      numeroProgressivo, // orderNumber
      month, // contractMonth  
      year, // contractYear
      s3Key, // customKey
      'invitiafatturare' // bucketOverride
    );

    console.log(`[INVITO] File caricato su S3:`, uploadResult.url);

    // Restituisce URL per il download
    res.json({
      success: true,
      message: `Invito a fatturare generato con successo${pdfBuffer ? ' (PDF)' : ' (HTML)'}`,
      downloadUrl: uploadResult.url,
      filename: filename,
      s3Key: uploadResult.key,
      format: pdfBuffer ? 'pdf' : 'html'
    });

  } catch (err) {
    console.error('[GENERA INVITO] Errore:', err);
    res.status(500).json({ 
      message: 'Errore nella generazione dell\'invito a fatturare',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

export default router;
