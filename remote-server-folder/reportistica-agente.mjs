import sql from 'mssql';
import { authenticateToken } from './auth-middleware.mjs';

// Funzione speciale per GABRIELE usando V_Report_Completo_Gabriele
async function handleGabrieleReportistica(req, res, { agenteNome, year, month }) {
  try {
    console.log(`[ReportisticaAgente][GABRIELE] Usando vista speciale per ${agenteNome}, anno=${year}, mese=${month}`);
    
    const request = new sql.Request();
    request.input('anno', sql.Int, year);
    request.input('mese', sql.Int, month);

    // Query principale dalla vista
    const query = `
      SELECT 
        Anno,
        Mese,
        DataOra,
        RagioneSociale,
        Provincia,
        TitoloOfferta,
        idOrdine,
        TotaleOrdiniMese,
        OrdiniMeseProvincia,
        TotaleDealersAgente,
        DealersIngaggiatiMese,
        AttivazioniDealerMese
      FROM V_Report_Completo_Gabriele
      WHERE Anno = @anno AND Mese = @mese
      ORDER BY DataOra DESC
    `;

    const result = await request.query(query);
    const rows = result.recordset || [];

    if (rows.length === 0) {
      // Nessun dato per il periodo
      return res.json({
        success: true,
        agente: agenteNome,
        year,
        month,
        data: {
          kpi_card: [{
            dealer_totali: 0,
            dealer_ingaggiati: 0,
            tlc_fisso_inseriti: 0,
            tlc_mobile_inseriti: 0,
            energia_inseriti: 0,
            sim_ric_automatica: 0,
            sim_ric_pura: 0
          }],
          report_kpi: [],
          report_dealers: [],
          report_dealers_alt: [],
          province_distrib: []
        }
      });
    }

    // Estrai i totali (sono uguali per tutte le righe dello stesso mese)
    const firstRow = rows[0];
    const totaleDealersAgente = Number(firstRow.TotaleDealersAgente || 0);
    const dealersIngaggiatiMese = Number(firstRow.DealersIngaggiatiMese || 0);
    const totaleOrdiniMese = Number(firstRow.TotaleOrdiniMese || 0);

    console.log(`[ReportisticaAgente][GABRIELE] Totali: Dealers=${totaleDealersAgente}, Ingaggiati=${dealersIngaggiatiMese}, Ordini=${totaleOrdiniMese}`);

    // KPI Card
    const kpi_card = [{
      dealer_totali: totaleDealersAgente,
      dealer_ingaggiati: dealersIngaggiatiMese,
      tlc_fisso_inseriti: 0,
      tlc_mobile_inseriti: 0,
      energia_inseriti: totaleOrdiniMese,
      sim_ric_automatica: 0,
      sim_ric_pura: 0
    }];

    // Raggruppa per dealer (RagioneSociale)
    const dealerMap = new Map();
    rows.forEach(row => {
      const dealer = row.RagioneSociale;
      const attivazioni = Number(row.AttivazioniDealerMese || 0);
      
      if (!dealerMap.has(dealer)) {
        dealerMap.set(dealer, {
          RagioneSociale: dealer,
          Fisso: 0,
          'Conv RES': 0,
          'Conv BUS': 0,
          Mobile: 0,
          'Mobili R. Automatica': 0,
          Energia: attivazioni,
          Ingaggiato: attivazioni > 0 ? 'SI' : 'NO'
        });
      }
    });

    const report_dealers_alt = Array.from(dealerMap.values()).sort((a, b) => b.Energia - a.Energia);

    // Raggruppa per provincia
    const provinciaMap = new Map();
    rows.forEach(row => {
      const prov = row.Provincia || 'N/D';
      const ordini = Number(row.OrdiniMeseProvincia || 0);
      
      if (!provinciaMap.has(prov)) {
        provinciaMap.set(prov, {
          Provincia: prov,
          TotaleFisso: 0,
          TotaleMobile: 0,
          TotaleEnergia: ordini,
          TotaleMobileRA: 0,
          TotaleMobileRP: 0
        });
      }
    });

    const province_distrib = Array.from(provinciaMap.values())
      .filter(p => p.Provincia !== 'N/D')
      .sort((a, b) => b.TotaleEnergia - a.TotaleEnergia);

    console.log(`[ReportisticaAgente][GABRIELE] Dealers trovati: ${report_dealers_alt.length}, Province: ${province_distrib.length}`);

    return res.json({
      success: true,
      agente: agenteNome,
      year,
      month,
      data: {
        kpi_card,
        report_kpi: [],
        report_dealers: [],
        report_dealers_alt,
        province_distrib
      }
    });
  } catch (err) {
    console.error('[ReportisticaAgente][GABRIELE] Errore:', err);
    return res.status(500).json({ 
      success: false, 
      message: 'Errore reportistica GABRIELE', 
      details: err.message 
    });
  }
}

export default function(app) {
  // GET /api/agente/reportistica/last-updates -> ultime date Batch per TLC ed ENERGIA
  app.get('/api/agente/reportistica/last-updates', authenticateToken, async (req, res) => {
    try {
      // Usa due query semplici con NOLOCK per non bloccare
      const r1 = new sql.Request();
      const q1 = `SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED; SELECT MAX(Batch) AS lastBatch FROM dbo.InseritoFW WITH (NOLOCK);`;
      const tlcRes = await r1.query(q1);
      const tlc = tlcRes?.recordset?.[0]?.lastBatch || null;

      const r2 = new sql.Request();
      const q2 = `SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED; SELECT MAX(Batch) AS lastBatch FROM dbo.FWEnergiaImporter WITH (NOLOCK);`;
      const enRes = await r2.query(q2);
      const energy = enRes?.recordset?.[0]?.lastBatch || null;

      return res.json({ success: true, data: { tlc, energy } });
    } catch (err) {
      console.error('[ReportisticaAgente][last-updates] Error:', err);
      return res.status(500).json({ success: false, message: 'Errore lettura last updates', details: err.message });
    }
  });
  // GET /api/agente/reportistica?year=YYYY&month=MM
  app.get('/api/agente/reportistica', authenticateToken, async (req, res) => {
    try {
      const agenteNome = req.user?.agenteNome || req.user?.nome || req.user?.username;
      if (!agenteNome) return res.status(401).json({ success: false, message: 'Token senza agenteNome' });

      const year = Math.min(2100, Math.max(2000, parseInt(req.query?.year, 10) || new Date().getFullYear()));
      const month = Math.min(12, Math.max(1, parseInt(req.query?.month, 10) || (new Date().getMonth() + 1)));
      const operator = String(req.query?.operator || 'fastweb').toLowerCase();
      
      // Parametri di range dal frontend (se presenti)
      const fromParam = req.query?.from ? String(req.query.from) : null;
      const toParam = req.query?.to ? String(req.query.to) : null;
      const includeZero = req.query?.includeZero === 'true' || req.query?.includeZero === '1';

      // SKY: logica esistente mantenuta
      if (operator === 'sky') {
        try {
          const kpiReq = new sql.Request();
          kpiReq.input('Agente', sql.VarChar(100), agenteNome);
          kpiReq.input('Anno', sql.Int, year);
          kpiReq.input('Mese', sql.Int, month);
          const kpiRes = await kpiReq.execute('sp_AgenteSkyKPI');
          const k = kpiRes?.recordset?.[0] || {};
          const kpi_card = [{
            dealer_totali: Number(k?.dealer_totali || 0),
            dealer_ingaggiati: Number(k?.dealer_ingaggiati || 0),
            wifi_inseriti: Number(k?.wifi_inseriti || 0),
            mobili_inseriti: Number(k?.mobili_inseriti || 0),
            tv_inseriti: Number(k?.tv_inseriti || 0),
          }];

          let report_dealers_alt = [];
          try {
            const skyReq = new sql.Request();
            skyReq.input('agente', sql.NVarChar, agenteNome);
            const skyRes = await skyReq.query(`EXEC sp_GetDealerOffersSummaryByAgent @agente = @agente`);
            const raw = skyRes?.recordset || [];
            const filtered = raw.filter(r => Number(r?.Mese) === Number(month));
            report_dealers_alt = filtered;
          } catch (e2) {
            console.warn('[ReportisticaAgente][SKY] Stored sp_GetDealerOffersSummaryByAgent non disponibile:', e2.message);
          }

          return res.json({
            success: true,
            agente: agenteNome,
            year,
            month,
            data: {
              kpi_card,
              report_kpi: [],
              report_dealers: [],
              report_dealers_alt,
              province_distrib: [],
            }
          });
        } catch (e) {
          console.error('[ReportisticaAgente][SKY] Errore integrazione SKY:', e);
          return res.status(500).json({ success: false, message: 'Errore reportistica SKY', details: e.message });
        }
      }

      // LOGICA SPECIALE PER GABRIELE
      if (agenteNome.toUpperCase() === 'GABRIELE') {
        return await handleGabrieleReportistica(req, res, { agenteNome, year, month });
      }

      // FASTWEB: usa le date from/to dal frontend se disponibili, altrimenti fallback al mese
      let firstDay, lastDayStr;
      
      if (fromParam && toParam) {
        // Usa le date specifiche dal frontend
        firstDay = fromParam;
        lastDayStr = toParam;
        console.log(`[ReportisticaAgente] Usando range personalizzato: ${firstDay} - ${lastDayStr}`);
      } else {
        // Fallback al mese intero (comportamento precedente)
        firstDay = `${year}-${String(month).padStart(2,'0')}-01`;
        const lastDay = new Date(year, month, 0); // ultimo giorno del mese
        lastDayStr = `${year}-${String(month).padStart(2,'0')}-${String(lastDay.getDate()).padStart(2,'0')}`;
        console.log(`[ReportisticaAgente] Usando mese completo: ${firstDay} - ${lastDayStr}`);
      }

      console.log(`[ReportisticaAgente] Range finale per ${agenteNome}: ${firstDay} - ${lastDayStr}`);
      console.log(`[ReportisticaAgente] Date convertite: Dal=${new Date(firstDay).toISOString()}, Al=${new Date(lastDayStr).toISOString()}`);
      console.log(`[ReportisticaAgente] Parametri: Agente=${agenteNome}, Dal=${firstDay}, Al=${lastDayStr}, FallbackPrev=1`);

      const req1 = new sql.Request();
      req1.input('Agente', sql.NVarChar(100), agenteNome);
      req1.input('DalGiorno', sql.Date, new Date(firstDay));
      req1.input('AlGiorno', sql.Date, new Date(lastDayStr));
      req1.input('FallbackPrev', sql.Bit, 1); // sempre 1 per avere dati precisi
      
      // Usa i nuovi parametri della stored procedure modificata
      let result;
      try {
        result = await req1.query(`
          EXEC dbo.sp_report_agente_fastweb_range 
          @agente        = @Agente,
          @from_date     = @DalGiorno,
          @to_date       = @AlGiorno,
          @fallback_prev = @FallbackPrev
        `);
      } catch (spError) {
        console.error(`[ReportisticaAgente] Errore stored procedure per ${agenteNome}:`, spError);
        console.error(`[ReportisticaAgente] Parametri che hanno causato errore:`, {
          agente: agenteNome,
          dal_giorno: firstDay,
          al_giorno: lastDayStr,
          fallback_prev: 1
        });
        
        // Restituisci dati vuoti invece di errore 500
        return res.json({
          success: true,
          agente: agenteNome,
          year,
          month,
          data: {
            kpi_card: [{
              dealer_totali: 0,
              dealer_ingaggiati: 0,
              tlc_fisso_inseriti: 0,
              tlc_mobile_inseriti: 0,
              energia_inseriti: 0,
              sim_ric_automatica: 0,
              sim_ric_pura: 0
            }],
            report_kpi: [],
            report_dealers: [],
            report_dealers_alt: [],
            province_distrib: []
          },
          message: `Nessun dato disponibile per il periodo ${firstDay} - ${lastDayStr}`,
          error_details: spError.message
        });
      }
      
      // La stored procedure restituisce 5 recordset nell'ordine:
      // 0: Dettaglio dealer
      // 1: Totali per provincia
      // 2: Ingaggio per provincia/segmento
      // 3: Attivazioni per provincia/segmento/categoria
      // 4: KPI riassuntivi
      const recordsets = result?.recordsets || [];
      console.log(`[ReportisticaAgente] Recordsets trovati: ${recordsets.length}`);
      recordsets.forEach((rs, i) => {
        console.log(`[ReportisticaAgente] Recordset ${i}: ${rs?.length || 0} righe`);
        if (rs && rs.length > 0) {
          console.log(`[ReportisticaAgente] Recordset ${i} prima riga:`, rs[0]);
        }
      });
      
      const dealers = recordsets[0] || [];
      const provinces = recordsets[1] || [];

      if (recordsets.length < 5) {
        console.warn('[ReportisticaAgente] Recordset KPI mancante: attendo almeno 5 set, trovati', recordsets.length);
      }
      const kpiData = recordsets[4]?.[0] || {};

      const parseNumber = (value) => {
        const num = Number(value);
        return Number.isFinite(num) ? num : null;
      };
      const eniFromDealers = dealers.reduce((tot, d) => tot + Number(d.ENI || d.eni || 0), 0);
      let eniValue = (() => {
        const fromKpi = parseNumber(kpiData.eni_inseriti ?? kpiData.ENI);
        if (fromKpi != null) return fromKpi;
        const fromDealers = parseNumber(eniFromDealers);
        if (fromDealers != null) return fromDealers;
        return 0;
      })();

      if (!eniValue) {
        try {
          const monthlyReq = new sql.Request();
          monthlyReq.input('agente', sql.NVarChar, agenteNome.toUpperCase());
          monthlyReq.input('year', sql.Int, year);
          monthlyReq.input('month', sql.Int, month);
          const monthlyResult = await monthlyReq.execute('dbo.sp_report_agente_fastweb_mese');
          const monthlyDealers = monthlyResult?.recordsets?.[0] || [];
          const monthlyEni = monthlyDealers.reduce((tot, row) => tot + Number(row.ENI || row.eni || 0), 0);
          if (Number.isFinite(monthlyEni) && monthlyEni > 0) {
            eniValue = monthlyEni;
          }
        } catch (monthlyErr) {
          console.warn('[ReportisticaAgente] ENI fallback mensile non disponibile:', monthlyErr?.message || monthlyErr);
        }
      }

      // Usa i KPI direttamente dalla stored procedure (nomi colonne originali)
      const kpi_totals = {
        dealer_totali: Number(kpiData.dealer_totali || kpiData.DealerTotali || 0),
        dealer_ingaggiati: Number(kpiData.dealer_ingaggiati || kpiData.Ingaggiati || 0),
        dealer_ingaggiati_fisso: Number(kpiData.dealer_ingaggiati_fisso || kpiData.DealerIngaggiatiFisso || 0),
        dealer_ingaggiati_mobile: Number(kpiData.dealer_ingaggiati_mobile || kpiData.DealerIngaggiatiMobile || 0),
        tlc_fisso_inseriti: Number(kpiData.tlc_fisso_inseriti || kpiData.FissoInseriti || 0),
        tlc_mobile_inseriti: Number(kpiData.tlc_mobile_inseriti || kpiData.MobileInseriti || 0),
        energia_inseriti: Number(kpiData.energia_inseriti || kpiData.EnergiaInseriti || 0),
        eni_inseriti: eniValue,
        sim_ric_automatica: Number(kpiData.ricariche_automatiche || kpiData.RicaricheAutomatiche || 0),
        sim_ric_pura: 0 // Non presente nella stored
      };

      try {
        const raReq = new sql.Request();
        raReq.input('Anno', sql.Int, year);
        raReq.input('Mese', sql.Int, month);
        raReq.input('Agente', sql.NVarChar, agenteNome);
        const raRes = await raReq.query(`
          SELECT
            SUM(tlc_mobile_ra_inseriti) AS MobileRA,
            SUM(tlc_mobile_rp_inseriti) AS MobileRP
          FROM dbo.vw_agenti_province_mensile
          WHERE Anno = @Anno AND Mese = @Mese
            AND LTRIM(RTRIM(UPPER(ISNULL(AGENTE, N'')))) = LTRIM(RTRIM(UPPER(@Agente)))
        `);
        const raRow = raRes.recordset?.[0] || {};
        if (raRow.MobileRA != null) {
          kpi_totals.sim_ric_automatica = Number(raRow.MobileRA) || 0;
        }
        if (raRow.MobileRP != null) {
          kpi_totals.sim_ric_pura = Number(raRow.MobileRP) || 0;
        }
      } catch (e) {
        console.warn('[ReportisticaAgente] Impossibile recuperare RA/RP da vw_agenti_province_mensile:', e?.message || e);
      }

      // Mappa i dealer per il frontend - usa i nomi corretti dal recordset 0
      const report_dealers_alt = dealers.map(d => {
        const fissoTot = Number(d.FISSO || 0);
        const fissoShp = Number(d['FISSO SHP'] || 0);
        const fissoRes = Number(d['FISSO RES'] || 0);
        const mobileTot = Number(d.MOBILE || 0);
        const mobileShp = Number(d['MOBILE SHP'] || 0);
        const mobileRes = Number(d['MOBILE RES'] || 0);
        const mobileRa = Number(d['Mobile RA'] || 0);
        const energiaTot = Number(d.ENERGIA || 0);
        
        return {
          RagioneSociale: d.RagioneSociale || '',
          Fisso: fissoTot,
          'Conv RES': fissoRes,
          'Conv BUS': fissoShp,
          Mobile: mobileTot,
          'Mobili R. Automatica': mobileRa,
          Energia: energiaTot,
          Ingaggiato: d.Ingaggiato || ((fissoTot > 0 || mobileTot > 0 || energiaTot > 0) ? 'SI' : 'NO')
        };
      });

      // Mappa le province per il frontend
      console.log(`[ReportisticaAgente] Province trovate: ${provinces.length}`);
      if (provinces.length > 0) {
        console.log(`[ReportisticaAgente] Prima provincia:`, provinces[0]);
      }
      
      // Mappa le province nel formato che si aspetta il frontend
      const province_distrib = provinces.map(p => ({
        SortOrder: 2, // Il frontend filtra solo le righe con SortOrder = 2
        Provincia: p.Provincia,
        dealer_totali: Number(p.dealer_totali || 0),
        dealer_ingaggiati: Number(p.dealer_ingaggiati || 0),
        TotaleFisso: Number(p.tlc_fisso_inseriti || 0),
        TotaleMobile: Number(p.tlc_mobile_inseriti || 0),
        TotaleEnergia: Number(p.energia_inseriti || 0),
        RicaricheAutomatiche: Number(p.mobile_ricarica_automatica || 0)
      }));

      return res.json({
        success: true,
        agente: agenteNome,
        year,
        month,
        data: {
          kpi_card: [kpi_totals],
          report_kpi: [],
          report_dealers: report_dealers_alt, // Popola anche questo per il JOIN del frontend
          report_dealers_alt,
          province_distrib,
        }
      });
    } catch (err) {
      console.error('[ReportisticaAgente] Errore:', err);
      return res.status(500).json({ success: false, message: 'Errore reportistica agente', details: err.message });
    }
  });

  // GET /api/agente/reportistica/v3?year=YYYY&dealer=xxx (NUOVA VERSIONE)
  app.get('/api/agente/reportistica/v3', authenticateToken, async (req, res) => {
    try {
      const agenteNome = req.user?.agenteNome || req.user?.nome || req.user?.username;
      if (!agenteNome) return res.status(401).json({ success: false, message: 'Token senza agenteNome' });

      const year = Math.min(2100, Math.max(2000, parseInt(req.query?.year, 10) || new Date().getFullYear()));
      const dealer = req.query?.dealer ? String(req.query.dealer).trim() : null;

      console.log(`[ReportisticaAgente][V3] Chiamata per ${agenteNome}, year=${year}, dealer=${dealer || 'TUTTI'}`);

      // LOGICA SPECIALE PER GABRIELE
      if (agenteNome.toUpperCase() === 'GABRIELE') {
        try {
          console.log('[ReportisticaAgente][V3][GABRIELE] Usando vista V_Report_Completo_Gabriele...');
          
          const gabrieleRequest = new sql.Request();
          gabrieleRequest.input('anno', sql.Int, year);
          
          // Determina il mese corrente
          const currentMonth = new Date().getMonth() + 1; // 1-12
          const currentYear = new Date().getFullYear();
          
          // Se l'anno richiesto è quello corrente, usa il mese corrente per i KPI
          const mesePerKPI = (year === currentYear) ? currentMonth : 12; // Se anno passato, usa dicembre
          
          console.log(`[ReportisticaAgente][V3][GABRIELE] Anno richiesto: ${year}, Mese corrente: ${currentMonth}, Mese per KPI: ${mesePerKPI}`);
          
          let gabrieleQuery = `
            SELECT 
              RagioneSociale AS Point,
              CONCAT(Anno, '/', RIGHT('0' + CAST(Mese AS VARCHAR(2)), 2)) AS AnnoMese,
              0 AS FISSI,
              0 AS FissoStart,
              0 AS FissoPro,
              0 AS FissoUltra,
              0 AS MOBILI,
              0 AS MobileStart,
              0 AS MobilePro,
              0 AS MobileUltra,
              0 AS MobileRA,
              0 AS MobilePercentRA,
              0 AS [MOBILI RES],
              0 AS [MOBILI BUS],
              0 AS [di cui CONV_RES],
              0 AS [di cui CONV_BUS],
              SUM(DISTINCT AttivazioniDealerMese) AS ENERGY,
              0 AS EnergyCore,
              SUM(DISTINCT AttivazioniDealerMese) AS EnergyFlex,
              0 AS EnergyFix
            FROM V_Report_Completo_Gabriele
            WHERE Anno = @anno
          `;
          
          if (dealer) {
            gabrieleQuery += ` AND RagioneSociale LIKE '%' + @dealer + '%'`;
            gabrieleRequest.input('dealer', sql.NVarChar, dealer);
          }
          
          gabrieleQuery += `
            GROUP BY RagioneSociale, Anno, Mese
            ORDER BY Anno, Mese, RagioneSociale
          `;
          
          const gabrieleResult = await gabrieleRequest.query(gabrieleQuery);
          const fastweb_dealers = gabrieleResult.recordset || [];
          
          // Calcola totale SOLO per il mese corrente (per i KPI)
          const currentMonthStr = `${year}/${String(mesePerKPI).padStart(2, '0')}`;
          const dealersCurrentMonth = fastweb_dealers.filter(d => d.AnnoMese === currentMonthStr);
          
          const fastweb_totale = {
            FISSI: 0,
            MOBILI: 0,
            MobileRA: 0,
            MobilePercentRA: 0,
            ENERGY: dealersCurrentMonth.reduce((sum, d) => sum + Number(d.ENERGY || 0), 0)
          };
          
          console.log(`[ReportisticaAgente][V3][GABRIELE] Mese corrente: ${currentMonthStr}, Dealers nel mese: ${dealersCurrentMonth.length}, ENERGY mese corrente: ${fastweb_totale.ENERGY}`);
          
          console.log(`[ReportisticaAgente][V3][GABRIELE] Trovati ${fastweb_dealers.length} dealer, ENERGY totale: ${fastweb_totale.ENERGY}`);
          
          // Recupera dati SIM usando la stored procedure standard (stessa logica degli altri agenti)
          let sim_aggregated = {};
          let sim_details = [];
          
          try {
            const simRequest = new sql.Request();
            simRequest.input('agente', sql.NVarChar(50), agenteNome);
            simRequest.input('year', sql.Int, year);
            simRequest.input('dealer', sql.NVarChar(255), dealer);
            
            const simResult = await simRequest.execute('GetOrderStatisticsByAgent_V2');
            const sim = simResult.recordsets?.[2] || [];
            
            console.log(`[ReportisticaAgente][V3][GABRIELE] SIM trovate: ${sim.length} righe`);
            
            // Aggrega SIM per tipologia (somma tutti i mesi)
            sim.forEach(s => {
              const type = s.SIMTYPE || 'UNKNOWN';
              if (!sim_aggregated[type]) {
                sim_aggregated[type] = 0;
              }
              sim_aggregated[type] += Number(s.SIM_Vendute || 0);
            });
            
            sim_details = sim;
          } catch (simError) {
            console.warn(`[ReportisticaAgente][V3][GABRIELE] Errore recupero SIM (non bloccante):`, simError.message);
          }
          
          return res.json({
            success: true,
            agente: agenteNome,
            year,
            dealer: dealer || null,
            data: {
              fastweb: {
                totale: fastweb_totale,
                dealers: fastweb_dealers
              },
              sky: {
                totale: {},
                dealers: []
              },
              sim: {
                aggregated: sim_aggregated,
                details: sim_details
              }
            }
          });
        } catch (gabrieleError) {
          console.error('[ReportisticaAgente][V3][GABRIELE] Errore:', gabrieleError);
          return res.status(500).json({ success: false, message: 'Errore reportistica GABRIELE V3', details: gabrieleError.message });
        }
      }

      const req1 = new sql.Request();
      req1.input('agente', sql.NVarChar(50), agenteNome);
      req1.input('year', sql.Int, year);
      req1.input('dealer', sql.NVarChar(255), dealer);

      const result = await req1.execute('GetOrderStatisticsByAgent_V2');

      // La stored V2 restituisce 1 recordset:
      // 0: Dati Fastweb (con riga TOTALE dove Agente=NULL)
      const recordsets = result?.recordsets || [];
      console.log(`[ReportisticaAgente][V3] Recordsets trovati: ${recordsets.length}`);

      const fastweb = recordsets[0] || [];
      const sky = recordsets[1] || [];
      const sim = recordsets[2] || [];

      console.log(`[ReportisticaAgente][V3] Fastweb: ${fastweb.length} righe, Sky: ${sky.length} righe, SIM: ${sim.length} righe`);

      // Estrai la riga TOTALE da Fastweb (Agente = NULL)
      const fastweb_totale = fastweb.find(r => r.Agente === null) || {};
      const fastweb_dealers = fastweb.filter(r => r.Agente !== null);

      // Estrai la riga TOTALE da Sky (SortKey = 0)
      const sky_totale = sky.find(r => r.SortKey === 0) || {};
      const sky_dealers = sky.filter(r => r.SortKey !== 0);

      // Aggrega SIM per tipologia (somma tutti i mesi)
      const sim_aggregated = {};
      sim.forEach(s => {
        const type = s.SIMTYPE || 'UNKNOWN';
        if (!sim_aggregated[type]) {
          sim_aggregated[type] = 0;
        }
        sim_aggregated[type] += Number(s.SIM_Vendute || 0);
      });

      return res.json({
        success: true,
        agente: agenteNome,
        year,
        dealer: dealer || null,
        data: {
          fastweb: {
            totale: fastweb_totale,
            dealers: fastweb_dealers
          },
          sky: {
            totale: sky_totale,
            dealers: sky_dealers
          },
          sim: {
            aggregated: sim_aggregated,
            details: sim
          }
        }
      });
    } catch (err) {
      console.error('[ReportisticaAgente][V3] Error:', err);
      return res.status(500).json({ success: false, message: 'Errore reportistica V3', details: err.message });
    }
  });

  // GET /api/agente/reportistica/range?from=YYYY-MM-DD&to=YYYY-MM-DD&dealer=foo
  app.get('/api/agente/reportistica/range', authenticateToken, async (req, res) => {
    try {
      const agenteNome = req.user?.agenteNome || req.user?.nome || req.user?.username;
      if (!agenteNome) return res.status(401).json({ success: false, message: 'Token senza agenteNome' });

      const from = req.query?.from ? String(req.query.from) : null;
      const to = req.query?.to ? String(req.query.to) : null;
      const dealer = req.query?.dealer ? String(req.query.dealer) : '';
      const includeZero = req.query?.includeZero === 'true' || req.query?.includeZero === '1';

      if (!from || !to) {
        return res.status(400).json({ success: false, message: 'Parametri from e to obbligatori' });
      }

      const r = new sql.Request();
      r.input('Agente', sql.NVarChar(100), agenteNome);
      r.input('DalGiorno', sql.Date, new Date(from));
      r.input('AlGiorno', sql.Date, new Date(to));
      r.input('FallbackPrev', sql.Bit, 1); // sempre 1 per avere dati precisi
      
      const result = await r.query(`
        EXEC dbo.sp_report_agente_fastweb_range 
        @agente        = @Agente,
        @from_date     = @DalGiorno,
        @to_date       = @AlGiorno,
        @fallback_prev = @FallbackPrev
      `);
      
      // La stored procedure restituisce 5 recordset nell'ordine indicato dal requirement
      const recordsets = result?.recordsets || [];
      let dealers = recordsets[0] || [];
      const kpiRow = recordsets[4]?.[0] || {};
      
      // Filtro per dealer se specificato
      if (dealer && dealer.trim()) {
        const dealerFilter = dealer.trim().toLowerCase();
        dealers = dealers.filter(d => 
          (d.RagioneSociale || '').toLowerCase().includes(dealerFilter)
        );
      }

      // Tab1: KPI range coerenti con frontend
      const tab1 = [{
        totale_point: Number(kpiRow.dealer_totali || kpiRow.DealerTotali || 0),
        point_ingaggiati: Number(kpiRow.dealer_ingaggiati || kpiRow.Ingaggiati || 0),
        tlc_fisso_inseriti: Number(kpiRow.tlc_fisso_inseriti || kpiRow.FissoInseriti || 0),
        tlc_mobile_inseriti: Number(kpiRow.tlc_mobile_inseriti || kpiRow.MobileInseriti || 0),
        energia_inseriti: Number(kpiRow.energia_inseriti || kpiRow.EnergiaInseriti || 0),
        tlc_mobile_automatiche: Number(kpiRow.ricariche_automatiche || kpiRow.RicaricheAutomatiche || 0)
      }];

      // Tab2: Dettaglio dealers (filtrato per dealer se richiesto)
      const tab2All = dealers.map(d => ({
        RagioneSociale: d.RagioneSociale || '',
        Ingaggiato: d.Ingaggiato || 'NO',
        tlc_fisso_inseriti: Number(d.FISSO || 0),
        conv_res: Number(d['FISSO RES'] || 0),
        conv_bus: Number(d['FISSO SHP'] || 0),
        tlc_mobile_inseriti: Number(d.MOBILE || 0),
        tlc_mobile_automatiche: Number(d['Mobile RA'] || 0),
        energia_inseriti: Number(d.ENERGIA || 0)
      }));
      const tab2 = dealer && dealer.trim()
        ? tab2All.filter(r => (r.RagioneSociale || '').toLowerCase().includes(dealer.trim().toLowerCase()))
        : tab2All;

      return res.json({
        success: true,
        agente: agenteNome,
        from,
        to,
        dealer,
        tab1,
        tab2,
        tab3: [],
        tab4: []
      });
    } catch (err) {
      console.error('[ReportisticaAgente][range] Error:', err);
      return res.status(500).json({ success: false, message: 'Errore reportistica range', details: err.message });
    }
  });
}
