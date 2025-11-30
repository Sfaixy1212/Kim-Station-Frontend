import express from 'express';
import sql from 'mssql';
import { authenticateToken } from './auth-middleware.mjs';
import { invalidateCache } from './redis-client.mjs';

const router = express.Router();

// Middleware: solo SUPERMASTER
function onlySupermaster(req, res, next) {
  const roles = (req.user?.ruoli || []).map(r => String(r).toUpperCase());
  if (roles.includes('SUPERMASTER') || roles.includes('MASTER')) return next();
  return res.status(403).json({ error: 'Accesso riservato ai SUPERMASTER' });
}

// Funzione speciale per GABRIELE: stored procedure normale + integrazione manuale
async function buildGabrieleReport({ pool, year, month }) {
  console.log('[GABRIELE] Inizio calcolo report con integrazione manuale');
  
  // 1. CHIAMA LA STORED PROCEDURE NORMALE (come gli altri agenti)
  const spRequest = pool.request();
  spRequest.input('agente', sql.NVarChar, 'GABRIELE');
  spRequest.input('year', sql.Int, year);
  spRequest.input('month', sql.Int, month);

  const spResult = await spRequest.execute('dbo.sp_report_agente_fastweb_mese');
  const rs = spResult.recordsets || [];

  if (rs.length < 4) {
    throw Object.assign(new Error('Stored procedure ha restituito un numero inatteso di recordset'), {
      statusCode: 500,
      recordsets: rs.length,
      agente: 'GABRIELE',
      year,
      month
    });
  }

  // 2. LEGGI DATI MANUALI DA tbGabrieleIntegrazione (con JOIN a tbDealers)
  const manualRequest = pool.request();
  manualRequest.input('anno', sql.Int, year);
  manualRequest.input('mese', sql.Int, month);

  const manualQuery = `
    SELECT 
      g.IDDealer,
      d.RagioneSociale,
      d.COMSY1,
      d.COMSY2,
      d.Provincia,
      g.Fisso,
      g.Mobile,
      g.FissoBU,
      g.Convergenza,
      g.Totale,
      g.Energia
    FROM dbo.tbGabrieleIntegrazione g
    INNER JOIN dbo.tbDealers d ON g.IDDealer = d.IDDealer
    WHERE g.Anno = @anno AND g.Mese = @mese
  `;

  const manualResult = await manualRequest.query(manualQuery);
  const manualData = manualResult.recordset || [];

  console.log('[GABRIELE] Dati manuali trovati:', manualData.length);

  // 3. INTEGRA I DUE DATASET
  const dealersData = rs[0] || [];
  
  // Crea una mappa per dealer (usa DealerKey come chiave)
  const dealerMap = new Map();

  // Aggiungi dati dalla stored procedure
  dealersData.forEach(d => {
    const key = d.DealerKey || (d.RagioneSociale || '').trim();
    if (!dealerMap.has(key)) {
      dealerMap.set(key, {
        dealerKey: key,
        ragioneSociale: d.RagioneSociale,
        comsy1: d.COMSY1 || '',
        comsy2: d.COMSY2 || '',
        provincia: d.Provincia || '',
        fisso: Number(d.FISSO || 0),
        fissoShp: Number(d['FISSO SHP'] || 0),
        fissoRes: Number(d['FISSO RES'] || 0),
        mobile: Number(d.MOBILE || 0),
        mobileShp: Number(d['MOBILE SHP'] || 0),
        mobileRes: Number(d['MOBILE RES'] || 0),
        mobileRa: Number(d['Mobile RA'] || 0),
        convergenza: Number(d.CONVERGENZA || 0),
        energia: Number(d.ENERGIA || 0),
        eni: Number(d.ENI || 0),
        source: 'auto'
      });
    }
  });

  // Aggiungi/integra dati manuali (usa IDDealer per match preciso)
  manualData.forEach(m => {
    // Cerca il dealer nella mappa usando diversi criteri
    let key = null;
    let existing = null;
    
    // Prova a trovare il dealer per DealerKey, COMSY o RagioneSociale
    for (const [k, v] of dealerMap.entries()) {
      if (v.ragioneSociale === m.RagioneSociale || 
          v.comsy1 === m.COMSY1 || 
          v.comsy2 === m.COMSY2) {
        key = k;
        existing = v;
        break;
      }
    }

    const fisso = Number(m.Fisso || 0);
    const mobile = Number(m.Mobile || 0);
    const fissoBU = Number(m.FissoBU || 0);
    const convergenza = Number(m.Convergenza || 0);
    const energia = Number(m.Energia || 0);

    if (existing) {
      // Dealer già presente: SOMMA i valori
      existing.fisso += fisso;
      existing.mobile += mobile;
      existing.fissoShp += fissoBU; // FissoBU = FISSO SHP
      existing.convergenza += convergenza;
      existing.energia += energia;
      existing.source = 'auto+manual';
    } else {
      // Dealer NON presente: AGGIUNGI nuovo dealer
      const newKey = `manual_${m.IDDealer}`;
      dealerMap.set(newKey, {
        dealerKey: newKey,
        ragioneSociale: m.RagioneSociale,
        comsy1: m.COMSY1 || '',
        comsy2: m.COMSY2 || '',
        provincia: m.Provincia || '',
        fisso: fisso,
        fissoShp: fissoBU,
        fissoRes: Math.max(0, fisso - fissoBU), // FISSO RES = FISSO - FISSO SHP
        mobile: mobile,
        mobileShp: 0,
        mobileRes: mobile,
        mobileRa: 0,
        convergenza: convergenza,
        energia: energia,
        eni: 0,
        source: 'manual'
      });
    }
  });

  // 4. CALCOLA KPI E DEALERS FINALI
  const dealers = Array.from(dealerMap.values()).map(d => {
    const totale = d.fisso + d.mobile + d.energia;
    const isIngaggiato = totale > 0;

    return {
      dealerKey: d.dealerKey || d.ragioneSociale,
      ragioneSociale: d.ragioneSociale,
      comsy1: d.comsy1,
      comsy2: d.comsy2,
      provincia: d.provincia,
      ingaggiato: isIngaggiato,
      fisso: d.fisso,
      fissoShp: d.fissoShp,
      fissoRes: d.fissoRes,
      mobile: d.mobile,
      mobileShp: d.mobileShp,
      mobileRes: d.mobileRes,
      mobileRa: d.mobileRa,
      convergenza: d.convergenza,
      energia: d.energia,
      eni: d.eni || 0,
      totale: totale,
      convRes: d.fissoRes,
      convBus: d.fissoShp,
      tlcFissoInseriti: d.fisso,
      tlcMobileInseriti: d.mobile,
      energiaInseriti: d.energia,
      eniInseriti: d.eni || 0,
      convResInseriti: d.fissoRes,
      convBusInseriti: d.fissoShp,
      mobileRaInseriti: d.mobileRa,
      _source: d.source // Debug: mostra origine dati
    };
  }).sort((a, b) => b.totale - a.totale);

  // Per GABRIELE: conta tutti i dealer
  // Per altri agenti: conta solo dealer con COMSY
  const dealersPerConteggio = dealers;
  
  const dealerTotali = dealersPerConteggio.length;
  const dealerIngaggiati = dealersPerConteggio.filter(d => d.ingaggiato).length;
  const dealerIngaggiatiFisso = dealersPerConteggio.filter(d => d.fisso > 0).length;
  const dealerIngaggiatiMobile = dealersPerConteggio.filter(d => d.mobile > 0).length;

  const sum = (keySelector) => dealers.reduce((tot, d) => tot + Number(keySelector(d) || 0), 0);
  const tlcFissoInseriti = sum(d => d.fisso);
  const tlcMobileInseriti = sum(d => d.mobile);
  const energiaInseriti = sum(d => d.energia);
  const eniInseriti = sum(d => d.eni || 0);
  const tlcMobileRaInseriti = sum(d => d.mobileRa);

  const kpi = {
    totalePoint: dealerTotali,
    dealerTotali,
    dealerIngaggiati,
    dealerIngaggiatiFisso,
    dealerIngaggiatiMobile,
    tlcFissoInseriti,
    tlcMobileInseriti,
    energiaInseriti,
    eniInseriti,
    tlc_mobile_ra_inseriti: tlcMobileRaInseriti,
    tlc_mobile_rp_inseriti: Math.max(0, tlcMobileInseriti - tlcMobileRaInseriti),
    engagementRate: dealerTotali > 0 ? dealerIngaggiati / dealerTotali : 0
  };

  // 5. PROVINCE TOTALS (integra dati manuali)
  const provinceMap = new Map();

  // Aggiungi province dalla stored procedure
  (rs[1] || []).forEach(p => {
    const prov = (p.Provincia || '').trim();
    if (prov && prov.toUpperCase() !== 'N/D') {
      provinceMap.set(prov, {
        provincia: prov,
        dealerTotali: Number(p.dealer_totali || 0),
        dealerIngaggiati: Number(p.dealer_ingaggiati || 0),
        tlcFissoInseriti: Number(p.tlc_fisso_inseriti || 0),
        tlcMobileInseriti: Number(p.tlc_mobile_inseriti || 0),
        energiaInseriti: Number(p.energia_inseriti || 0)
      });
    }
  });

  // Aggiungi/integra province dai dati manuali
  manualData.forEach(m => {
    const prov = (m.Provincia || '').trim();
    if (prov && prov.toUpperCase() !== 'N/D') {
      if (provinceMap.has(prov)) {
        const existing = provinceMap.get(prov);
        existing.tlcFissoInseriti += Number(m.Fisso || 0);
        existing.tlcMobileInseriti += Number(m.Mobile || 0);
        existing.energiaInseriti += Number(m.Energia || 0);
      } else {
        provinceMap.set(prov, {
          provincia: prov,
          dealerTotali: 0,
          dealerIngaggiati: 0,
          tlcFissoInseriti: Number(m.Fisso || 0),
          tlcMobileInseriti: Number(m.Mobile || 0),
          energiaInseriti: Number(m.Energia || 0)
        });
      }
    }
  });

  const provinceTotals = Array.from(provinceMap.values()).map(p => ({
    ...p,
    coverage: p.dealerTotali > 0 ? p.dealerIngaggiati / p.dealerTotali : 0
  }));

  // 6. PROVINCE SEGMENT ENGAGEMENT (dalla stored procedure)
  const provinceSegmentEngagement = (rs[2] || [])
    .filter(r => (r.Provincia || '').toUpperCase() !== 'N/D')
    .map(r => ({
      provincia: r.Provincia,
      segmento: r.segmento,
      dealerIngaggiati: Number(r.dealer_ingaggiati || 0)
    }));

  // 7. PROVINCE SEGMENT CATEGORY ACTIVATIONS (dalla stored procedure)
  const provinceSegmentCategoryActivations = (rs[3] || [])
    .filter(r => (r.Provincia || '').toUpperCase() !== 'N/D')
    .map(r => ({
      provincia: r.Provincia,
      segmento: r.segmento,
      categoria: r.categoria,
      attivazioni: Number(r.attivazioni || 0)
    }));

  console.log('[GABRIELE] Report completato:', {
    dealerTotali,
    dealerIngaggiati,
    dealerDaStoredProc: dealersData.length,
    dealerManuali: manualData.length,
    dealerFinali: dealers.length
  });

  return {
    agent: 'GABRIELE',
    period: {
      start: `${year}-${String(month).padStart(2, '0')}-01`,
      end: `${year}-${String(month).padStart(2, '0')}-31`,
      year,
      month
    },
    kpi,
    dealers,
    provinceTotals,
    provinceSegmentEngagement,
    provinceSegmentCategoryActivations
  };
}

export async function buildAgentFastwebReport({ agente, year, month }) {
  const agenteNorm = String(agente || '').trim().toUpperCase();
  const y = Number(parseInt(year, 10));
  const m = Number(parseInt(month, 10));

  if (!agenteNorm || !Number.isFinite(y) || !Number.isFinite(m)) {
    throw Object.assign(new Error('Parametri mancanti o non validi'), {
      statusCode: 400,
      details: { agente: agenteNorm, year: year, month: month }
    });
  }

  const pool = await sql.connect();
  
  // LOGICA SPECIALE PER GABRIELE: usa vista V_Report_Completo_Gabriele
  if (agenteNorm === 'GABRIELE') {
    return await buildGabrieleReport({ pool, year: y, month: m });
  }

  const request = pool.request();
  request.input('agente', sql.NVarChar, agenteNorm);
  request.input('year', sql.Int, y);
  request.input('month', sql.Int, m);

  const result = await request.execute('dbo.sp_report_agente_fastweb_mese');
  const rs = result.recordsets || [];

  if (rs.length < 4) {
    throw Object.assign(new Error('Stored procedure ha restituito un numero inatteso di recordset'), {
      statusCode: 500,
      recordsets: rs.length,
      agente: agenteNorm,
      year: y,
      month: m
    });
  }

  const dealersData = rs[0] || [];
  
  // Filtra dealer con COMSY validi (solo per agenti NON GABRIELE)
  const dealersConComsy = dealersData.filter(d => d.COMSY1 || d.COMSY2);
  
  console.log(`[${agenteNorm}] Dealer totali dalla SP: ${dealersData.length}, con COMSY: ${dealersConComsy.length}`);
  
  const dealerTotali = dealersConComsy.length;
  const dealerIngaggiati = dealersConComsy.filter(d => String(d.Ingaggiato || '').toUpperCase() === 'SI').length;
  
  // Calcola dealer ingaggiati per tipologia (almeno 1 attivazione)
  const dealerIngaggiatiFisso = dealersConComsy.filter(d => Number(d.FISSO || 0) > 0).length;
  const dealerIngaggiatiMobile = dealersConComsy.filter(d => Number(d.MOBILE || 0) > 0).length;

  const sum = (keySelector) => dealersData.reduce((tot, row) => tot + Number(keySelector(row) || 0), 0);
  const tlcFissoInseriti = sum(d => d.FISSO);
  const tlcMobileInseriti = sum(d => d.MOBILE);
  const energiaInseriti = sum(d => d.ENERGIA);
  const eniInseriti = sum(d => d.ENI);
  const tlcMobileRaInseriti = sum(d => d['Mobile RA']);

  const kpi = {
    totalePoint: dealerTotali,
    dealerTotali,
    dealerIngaggiati,
    dealerIngaggiatiFisso,
    dealerIngaggiatiMobile,
    tlcFissoInseriti,
    tlcMobileInseriti,
    energiaInseriti,
    eniInseriti,
    tlc_mobile_ra_inseriti: tlcMobileRaInseriti,
    tlc_mobile_rp_inseriti: Math.max(0, tlcMobileInseriti - tlcMobileRaInseriti),
    engagementRate: dealerTotali > 0 ? dealerIngaggiati / dealerTotali : 0
  };

  const pickNumber = (row, ...keys) => {
    for (const key of keys) {
      if (key in row && row[key] != null) {
        const value = Number(row[key]);
        if (!Number.isNaN(value)) return value;
      }
    }
    return 0;
  };

  const dealers = dealersData.map(r => {
    const fisso = pickNumber(r, 'FISSO', 'Fisso', 'fisso', 'tlc_fisso_inseriti');
    const fissoShp = pickNumber(r, 'FISSO SHP', 'fisso_shp');
    const fissoRes = pickNumber(r, 'FISSO RES', 'fisso_res');
    const mobile = pickNumber(r, 'MOBILE', 'Mobile', 'mobile', 'tlc_mobile_inseriti');
    const mobileShp = pickNumber(r, 'MOBILE SHP', 'mobile_shp');
    const mobileRes = pickNumber(r, 'MOBILE RES', 'mobile_res');
    const mobileRa = pickNumber(r, 'Mobile RA', 'Mobili R. Automatica', 'MobiliRA', 'mobile_ra', 'tlc_mobile_ra_inseriti', 'ricariche_automatiche');
    const convergenza = pickNumber(r, 'CONVERGENZA', 'Convergenza', 'convergenza');
    const energia = pickNumber(r, 'ENERGIA', 'Energia', 'energia', 'energia_inseriti');
    const eni = pickNumber(r, 'ENI', 'eni');

    const convRes = fissoRes;
    const convBus = fissoShp;
    const totale = fisso + convRes + convBus + mobile + energia;

    const isIngaggiato = String(r.Ingaggiato || '').toUpperCase() === 'SI';

    return {
      dealerKey: r.DealerKey,
      ragioneSociale: r.RagioneSociale,
      comsy1: r.COMSY1,
      comsy2: r.COMSY2,
      ingaggiato: isIngaggiato,
      fisso,
      fissoShp,
      fissoRes,
      mobile,
      mobileShp,
      mobileRes,
      mobileRa,
      convergenza,
      energia,
      eni,
      totale,
      convRes,
      convBus,
      tlcFissoInseriti: fisso,
      tlcMobileInseriti: mobile,
      energiaInseriti: energia,
      eniInseriti: eni,
      convResInseriti: convRes,
      convBusInseriti: convBus,
      mobileRaInseriti: mobileRa
    };
  });

  const provinceTotals = (rs[1] || [])
    .filter(r => (r.Provincia || '').toUpperCase() !== 'N/D')
    .map(r => {
      const tot = Number(r.dealer_totali || 0);
      const ing = Number(r.dealer_ingaggiati || 0);
      return {
        provincia: r.Provincia,
        dealerTotali: tot,
        dealerIngaggiati: ing,
        tlcFissoInseriti: Number(r.tlc_fisso_inseriti || r.TotaleFisso || 0),
        tlcMobileInseriti: Number(r.tlc_mobile_inseriti || r.TotaleMobile || 0),
        energiaInseriti: Number(r.energia_inseriti || r.TotaleEnergia || r.energia || 0),
        coverage: tot > 0 ? ing / tot : 0
      };
    });

  const provinceSegmentEngagement = (rs[2] || [])
    .filter(r => (r.Provincia || '').toUpperCase() !== 'N/D')
    .map(r => ({
      provincia: r.Provincia,
      segmento: r.segmento,
      dealerIngaggiati: Number(r.dealer_ingaggiati || 0)
    }));

  const provinceSegmentCategoryActivations = (rs[3] || [])
    .filter(r => (r.Provincia || '').toUpperCase() !== 'N/D')
    .map(r => ({
      provincia: r.Provincia,
      segmento: r.segmento,
      categoria: r.categoria,
      attivazioni: Number(r.attivazioni || 0)
    }));

  const period = {
    start: `${y}-${String(m).padStart(2, '0')}-01`,
    end: `${y}-${String(m).padStart(2, '0')}-31`,
    year: y,
    month: m
  };

  return {
    agent: agenteNorm,
    period,
    kpi,
    dealers,
    provinceTotals,
    provinceSegmentEngagement,
    provinceSegmentCategoryActivations
  };
}

// GET (mounted at /api/supermaster/report-agente)?agente=&year=&month=
router.get('/', authenticateToken, onlySupermaster, async (req, res) => {
  try {
    const agente = (req.query.agente || req.user?.agenteNome || '').toString().trim().toUpperCase();
    const year = parseInt(req.query.year, 10);
    const month = parseInt(req.query.month, 10);

    console.log(`[SuperMaster] Report per agente: ${agente}, year: ${year}, month: ${month}`);

    // Cache Redis disabilitata per questo endpoint
    const payload = await buildAgentFastwebReport({ agente, year, month });

    res.json(payload);
  } catch (err) {
    console.error('[SUPERMASTER REPORT] Errore per agente:', agente, 'year:', year, 'month:', month);
    console.error('[SUPERMASTER REPORT] Errore completo:', err);
    console.error('[SUPERMASTER REPORT] Stack trace:', err.stack);
    res.status(500).json({ error: 'Errore nel report agente', details: err.message, agente, year, month });
  }
});

// GET /api/supermaster/report-agente/province-distrib?agente=&year=&month=
router.get('/province-distrib', authenticateToken, onlySupermaster, async (req, res) => {
  try {
    const agente = (req.query.agente || '').toString().trim().toUpperCase();
    const year = parseInt(req.query.year, 10);
    const month = parseInt(req.query.month, 10);

    if (!agente || !year || !month) {
      return res.status(400).json({ error: 'Parametri mancanti', details: 'agente, year, month obbligatori' });
    }

    // Cache Redis disabilitata per questo endpoint
    const result = await getProvinceDistrib(agente, year, month);
    
    res.json(result);
  } catch (err) {
    console.error('[SUPERMASTER PROVINCE DISTRIB] Errore:', err);
    res.status(500).json({ error: 'Errore nella distribuzione per provincia', details: err.message });
  }
});

// Funzione helper per province-distrib (estratta per cache)
async function getProvinceDistrib(agente, year, month) {
  try {
    const pool = await sql.connect();
    const request = pool.request();
    request.input('agente', sql.NVarChar, agente);
    request.input('anno', sql.Int, year);
    request.input('mese', sql.Int, month);

    const query = `;WITH 
dealer_reali_per_provincia AS (
    SELECT
        COALESCE(NULLIF(d.Provincia, ''), 'N/D') AS Provincia,
        COUNT(DISTINCT COALESCE(
            CASE WHEN d.COMSY1 LIKE 'NR.1217.0601NA.C%' AND CHARINDEX('.C', d.COMSY1) > 0 THEN SUBSTRING(d.COMSY1, CHARINDEX('.C', d.COMSY1) + 2, 100) END,
            CASE WHEN d.COMSY2 LIKE 'NS.1638.0601NA.C%' AND CHARINDEX('.C', d.COMSY2) > 0 THEN SUBSTRING(d.COMSY2, CHARINDEX('.C', d.COMSY2) + 2, 100) END
        )) AS DealerUniciTotali
    FROM dbo.vw_dealers_base AS d
    WHERE d.AGENTE = @agente
    GROUP BY COALESCE(NULLIF(d.Provincia, ''), 'N/D')
),
attivazioni_per_provincia AS (
    SELECT
        Provincia,
        SUM(dealer_ingaggiati)      AS DealerIngaggiati,
        SUM(tlc_fisso_inseriti)     AS TotaleFisso,
        SUM(tlc_mobile_inseriti)    AS TotaleMobile,
        SUM(energia_inseriti)       AS TotaleEnergia,
        SUM(tlc_mobile_ra_inseriti) AS TotaleMobileRA,
        SUM(tlc_mobile_rp_inseriti) AS TotaleMobileRP
    FROM dbo.vw_agenti_province_mensile
    WHERE AGENTE = @agente AND Anno = @anno AND Mese = @mese
    GROUP BY Provincia
)
SELECT
    1 AS SortOrder,
    '--- TOTALE GENERALE ---' AS Provincia,
    (SELECT COUNT(DISTINCT COALESCE(
        CASE WHEN d.COMSY1 LIKE 'NR.1217.0601NA.C%' AND CHARINDEX('.C', d.COMSY1) > 0 THEN SUBSTRING(d.COMSY1, CHARINDEX('.C', d.COMSY1) + 2, 100) END,
        CASE WHEN d.COMSY2 LIKE 'NS.1638.0601NA.C%' AND CHARINDEX('.C', d.COMSY2) > 0 THEN SUBSTRING(d.COMSY2, CHARINDEX('.C', d.COMSY2) + 2, 100) END
    )) FROM dbo.vw_dealers_base AS d WHERE d.AGENTE = @agente) AS DealerUniciTotali,
    SUM(a.DealerIngaggiati)      AS DealerIngaggiati,
    SUM(a.TotaleFisso)           AS TotaleFisso,
    SUM(a.TotaleMobile)          AS TotaleMobile,
    SUM(a.TotaleEnergia)         AS TotaleEnergia,
    SUM(a.TotaleMobileRA)        AS TotaleMobileRA,
    SUM(a.TotaleMobileRP)        AS TotaleMobileRP
FROM attivazioni_per_provincia AS a

UNION ALL

SELECT
    2 AS SortOrder,
    a.Provincia,
    d.DealerUniciTotali,
    a.DealerIngaggiati,
    a.TotaleFisso,
    a.TotaleMobile,
    a.TotaleEnergia,
    a.TotaleMobileRA,
    a.TotaleMobileRP
FROM attivazioni_per_provincia a
LEFT JOIN dealer_reali_per_provincia d ON a.Provincia = d.Provincia
ORDER BY SortOrder, Provincia;`;

    const result = await request.query(query);
    const rows = result.recordset || [];

    // Build Chart.js-friendly data from detail rows (SortOrder = 2), skip 'N/D'
    const details = rows.filter(r => Number(r.SortOrder) === 2 && String(r.Provincia || '').toUpperCase() !== 'N/D');
    const labels = details.map(r => r.Provincia);
    const datasetFisso = details.map(r => Number(r.TotaleFisso || 0));
    const datasetMobileRA = details.map(r => Number(r.TotaleMobileRA || 0));
    const datasetMobileRP = details.map(r => Number(r.TotaleMobileRP || 0));
    const datasetEnergia = details.map(r => Number(r.TotaleEnergia || 0));

    return {
      success: true,
      agent: agente,
      year,
      month,
      rows,
      chart: {
        type: 'bar',
        labels,
        datasets: [
          { label: 'Fisso', backgroundColor: '#0ea5e9', data: datasetFisso, stack: 's1' },
          { label: 'Mobile RA', backgroundColor: '#fbbf24', data: datasetMobileRA, stack: 's1' },
          { label: 'Mobile RP', backgroundColor: '#f59e0b', data: datasetMobileRP, stack: 's1' },
          { label: 'Energia', backgroundColor: '#22c55e', data: datasetEnergia, stack: 's1' }
        ]
      }
    };
  } catch (err) {
    console.error('[SUPERMASTER PROVINCE DISTRIB getProvinceDistrib] Errore:', err);
    throw err;
  }
}

// GET /api/supermaster/report-agente/dettagli?agente=&year=&month=
router.get('/dettagli', authenticateToken, onlySupermaster, async (req, res) => {
  try {
    const agente = (req.query.agente || req.user?.agenteNome || '').toString().trim().toUpperCase();
    const year = parseInt(req.query.year, 10);
    const month = parseInt(req.query.month, 10);

    if (!agente || !year || !month) {
      return res.status(400).json({ error: 'Parametri mancanti', details: 'agente, year, month obbligatori' });
    }

    // Cache Redis disabilitata per questo endpoint
    const pool = await sql.connect();
    const request = pool.request();
    request.input('agente', sql.NVarChar, agente);
    // Stored procedure expects @year and @month
    request.input('year', sql.Int, year);
    request.input('month', sql.Int, month);

    const spResult = await request.execute('dbo.sp_report_agente_fastweb_mese');
    const rs = spResult.recordsets || [];
    if (rs.length < 4) {
      throw new Error(`Stored procedure ha restituito un numero inatteso di recordset: ${rs.length}`);
    }

    // Recordset 3: Attivazioni per provincia/segmento/categoria
    const raw = rs[3] || [];
    const rows = raw
      .filter(r => (String(r.Provincia || '').toUpperCase() !== 'N/D'))
      .map(r => ({
        provincia: r.Provincia,
        segmento: r.segmento,
        categoria: r.categoria,
        attivazioni: Number(r.attivazioni || 0)
      }));

    const result = { success: true, agent: agente, year, month, rows };
    
    res.json(result);
  } catch (err) {
    console.error('[SUPERMASTER DETTAGLI] Errore:', err);
    res.status(500).json({ error: 'Errore nel recupero dettagli', details: err.message });
  }
});

// GET /api/supermaster/report-agente/dettagli-ordini?agente=&year=&month=
router.get('/dettagli-ordini', authenticateToken, onlySupermaster, async (req, res) => {
  try {
    const agente = (req.query.agente || req.user?.agenteNome || '').toString().trim().toUpperCase();
    const year = parseInt(req.query.year, 10);
    const month = parseInt(req.query.month, 10);

    if (!year || !month) {
      return res.status(400).json({ error: 'Parametri mancanti', details: 'year, month obbligatori' });
    }

    const pool = await sql.connect();
    const request = pool.request();
    request.input('anno', sql.Int, year);
    request.input('mese', sql.Int, month);

    // NOTE: This reproduces the SSMS logic provided, constrained to the selected month/year.
    // If an AGENTE filter is required, please indicate the column to join/filter (e.g., POINT/AM/AGENTE) and we will add it safely.
    const query = `WITH S AS (
  SELECT
      [Cliente],
      [FiscalCodeOrPiva],
      [Segmento],
      [AccountNumber],
      [Codice Ordine],
      [Codice Comsy Tecnico Attuale],
      [Contributo],
      [Tipo Ordine],
      [Canone],
      [Stato dell'ordine CPQ],
      [Stato dell'Ordine OM],
      [Data Inserimento Ordine],
      [Valore],
      [POINT],
      [AM],
      [TIPO],
      [VASC],
      [ID],
      [State],
      [Batch],
      [DataBatch],
      [usim pay type],
      [stato post mobile],
      [tipo ricarica],
      [usim flag mnp],
      [nr of usim],
      [microstatus],
      [macrostatus],
      [stato pda],
      [tipo firma],
      [tipo linea],
      [check ok finale],
      [tipo firma fisso],
      [stato post],
      [booster],
      TRY_CONVERT(date, [Batch]) AS batch_date,
      MAX(TRY_CONVERT(date, [Batch]))
        OVER (
          PARTITION BY DATEPART(year,  TRY_CONVERT(date, [Batch])),
                       DATEPART(month, TRY_CONVERT(date, [Batch]))
        ) AS last_batch_month
  FROM [KAM].[dbo].[InseritoFW]
)
SELECT
    [Cliente],
    [FiscalCodeOrPiva],
    [Segmento],
    [AccountNumber],
    [Codice Ordine],
    [Codice Comsy Tecnico Attuale],
    [Contributo],
    [Tipo Ordine],
    [Canone],
    [Stato dell'Ordine OM],
    [Valore],
    [Batch],
    [tipo ricarica],
    [usim flag mnp],
    [stato pda],
    [tipo firma],
    batch_date,
    [ID]
FROM S
WHERE batch_date IS NOT NULL
  AND DATEPART(year,  batch_date) = @anno
  AND DATEPART(month, batch_date) = @mese
  AND batch_date = last_batch_month
ORDER BY batch_date DESC, [ID] DESC;`;

    const result = await request.query(query);
    const rows = result.recordset || [];
    return res.json({ success: true, agent: agente, year, month, rows });
  } catch (err) {
    console.error('[SUPERMASTER DETTAGLI-ORDINI] Errore:', err);
    res.status(500).json({ error: 'Errore nel recupero dettagli ordini', details: err.message });
  }
});

// POST /api/supermaster/report-agente/invalidate-cache
// Endpoint per invalidare la cache Redis della pagina Analisi
router.post('/invalidate-cache', authenticateToken, onlySupermaster, async (req, res) => {
  try {
    const { agente, year, month, pattern } = req.body;

    if (pattern) {
      // Invalida tutte le chiavi che matchano il pattern
      await invalidateCache(pattern);
      return res.json({ 
        success: true, 
        message: `Cache invalidata per pattern: ${pattern}` 
      });
    }

    if (agente && year && month) {
      // Invalida cache specifica per agente/anno/mese
      await invalidateCache(`report:agente:${agente}:${year}:${month}`);
      await invalidateCache(`report:province-distrib:${agente}:${year}:${month}`);
      await invalidateCache(`report:dettagli:${agente}:${year}:${month}`);
      return res.json({ 
        success: true, 
        message: `Cache invalidata per ${agente} - ${month}/${year}` 
      });
    }

    // Invalida tutta la cache dei report agenti
    await invalidateCache('report:*');
    return res.json({ 
      success: true, 
      message: 'Tutta la cache dei report agenti è stata invalidata' 
    });

  } catch (err) {
    console.error('[INVALIDATE CACHE] Errore:', err);
    res.status(500).json({ error: 'Errore invalidazione cache', details: err.message });
  }
});

export default router;
