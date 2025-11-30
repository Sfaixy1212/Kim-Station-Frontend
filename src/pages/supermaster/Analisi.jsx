import { useEffect, useMemo, useRef, useState } from 'react';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { getProtectedData, postProtectedData, getToken } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import toast from 'react-hot-toast';

// Config
const AGENTI = ['RAFFAELE', 'LUIGI', 'GIACOMO', 'ARMANDO', 'GABRIELE'];
const DEFAULT_AGENT = 'RAFFAELE';

// Utils
// Ruoli e permessi sono gestiti da ProtectedRoute a livello di router.

function fmtCurrency(num) {
  const n = Number(num);
  if (Number.isNaN(n)) return '-';
  return n.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });
}

// Helpers locali
function formatItDate(d) {
  if (!d) return '-';
  try {
    const dt = new Date(d);
    if (!isNaN(dt.getTime())) {
      const dd = String(dt.getDate()).padStart(2, '0');
      const mm = String(dt.getMonth() + 1).padStart(2, '0');
      const yyyy = dt.getFullYear();
      return `${dd}/${mm}/${yyyy}`;
    }
    const s = String(d);
    const m = s.match(/^(\d{4})[-/]?(\d{2})[-/]?(\d{2})/);
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
    return s;
  } catch { return '-'; }
}

function Badge({ label, value, color = 'blue' }) {
  const classes = {
    blue: 'bg-blue-50 text-blue-700 border-blue-100',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    amber: 'bg-amber-50 text-amber-700 border-amber-100',
    gray: 'bg-gray-50 text-gray-700 border-gray-100',
  };
  const cls = classes[color] || classes.blue;
  return (
    <div className={`inline-flex items-center gap-2 px-2 py-1 rounded-full text-xs border ${cls}`}>
      <span className="font-medium whitespace-nowrap">{label}</span>
      <span className="font-semibold">{value ?? '-'}</span>
    </div>
  );
}

async function fetchAnalisi({ agente, year, month }) {
  const params = new URLSearchParams({ agente, year: String(year), month: String(month) });
  return await getProtectedData(`/supermaster/report-agente?${params.toString()}`);
}
async function fetchDettagli({ agente, year, month }) {
  const params = new URLSearchParams({ agente, year: String(year), month: String(month) });
  // Prova l'endpoint ordini; se non ha la struttura utile (provincia/segmento/categoria/attivazioni)
  // oppure è vuoto, fallback a quello per provincia/segmento/categoria
  try {
    const r = await getProtectedData(`/supermaster/report-agente/dettagli-ordini?${params.toString()}`);
    const arr = Array.isArray(r?.rows) ? r.rows : [];
    const hasStructure = arr.some(row => (
      (row.provincia || row.Provincia) &&
      (row.segmento || row.Segmento) &&
      (row.categoria || row.Categoria) &&
      (row.attivazioni != null || row.Attivazioni != null)
    ));
    if (arr.length > 0 && hasStructure) return r;
  } catch {}
  return await getProtectedData(`/supermaster/report-agente/dettagli?${params.toString()}`);
}
async function fetchProvinceDistrib({ agente, year, month }) {
  const params = new URLSearchParams({ agente, year: String(year), month: String(month) });
  return await getProtectedData(`/supermaster/report-agente/province-distrib?${params.toString()}`);
}

// --- Chart.js loader (CDN) ---
async function ensureChartJs() {
  if (typeof window !== 'undefined' && window.Chart) return window.Chart;
  await new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js';
    s.async = true;
    s.onload = resolve;
    s.onerror = () => reject(new Error('Chart.js CDN load failed'));
    document.head.appendChild(s);
  });
  return window.Chart;
}

function FiltersBar({ value, onChange, onLoad, loading }){
  const months = useMemo(()=>[
    {v:1,l:'Gen'},{v:2,l:'Feb'},{v:3,l:'Mar'},{v:4,l:'Apr'},{v:5,l:'Mag'},{v:6,l:'Giu'},
    {v:7,l:'Lug'},{v:8,l:'Ago'},{v:9,l:'Set'},{v:10,l:'Ott'},{v:11,l:'Nov'},{v:12,l:'Dic'}
  ],[]);
  const years = useMemo(()=>{
    const now = new Date().getFullYear();
    return [now-2, now-1, now, now+1];
  },[]);
  return (
    <div className="flex items-end gap-2 flex-wrap">
      <div className="flex flex-col text-sm">
        <label htmlFor="sel-mese" className="text-gray-500">Mese</label>
        <select id="sel-mese" className="border rounded px-2 py-1" value={value.month} onChange={e=>onChange({ ...value, month: Number(e.target.value) })}>
          {months.map(m=> <option key={m.v} value={m.v}>{m.l}</option>)}
        </select>
      </div>
      <div className="flex flex-col text-sm">
        <label htmlFor="sel-anno" className="text-gray-500">Anno</label>
        <select id="sel-anno" className="border rounded px-2 py-1" value={value.year} onChange={e=>onChange({ ...value, year: Number(e.target.value) })}>
          {years.map(y=> <option key={y} value={y}>{y}</option>)}
        </select>
      </div>
      <button type="button" onClick={onLoad} disabled={loading} className="ml-2 mt-5 inline-flex items-center rounded bg-blue-600 text-white px-3 py-1.5 text-sm disabled:opacity-60">
        {loading ? 'Caricamento…' : 'Carica'}
      </button>
    </div>
  );
}

function AgentSummaryCard({ agente, year, month }){
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState(null);
  const [sim, setSim] = useState({ auto:null, pura:null });

  useEffect(()=>{
    let alive = true;
    (async ()=>{
      try {
        setLoading(true);
        const res = await fetchAnalisi({ agente, year, month });
        // Helper: trova il primo numero nel payload che matcha una lista di regex di chiavi
        const getFirstNumber = (obj, regexes) => {
          const seen = new Set();
          const walk = (node) => {
            if (!node || typeof node !== 'object') return undefined;
            if (seen.has(node)) return undefined; seen.add(node);
            if (Array.isArray(node)) {
              for (const item of node) { const r = walk(item); if (r !== undefined) return r; }
              return undefined;
            }
            for (const [k, v] of Object.entries(node)) {
              if (regexes.some(r => r.test(k))) {
                const n = Number(v);
                if (Number.isFinite(n)) return n;
              }
            }
            for (const v of Object.values(node)) {
              if (v && typeof v === 'object') { const r = walk(v); if (r !== undefined) return r; }
            }
            return undefined;
          };
          try { const out = walk(obj); return Number.isFinite(out) ? out : 0; } catch { return 0; }
        };

        const pt = Array.isArray(res?.provinceTotals) ? res.provinceTotals : [];
        const sumFromPT = pt.reduce((acc, r) => ({
          dealerTotali: acc.dealerTotali + Number(r.dealerTotali || r.tot || 0),
          dealerIngaggiati: acc.dealerIngaggiati + Number(r.dealerIngaggiati || 0),
          tlcFissoInseriti: acc.tlcFissoInseriti + Number(r.tlcFissoInseriti || 0),
          tlcMobileInseriti: acc.tlcMobileInseriti + Number(r.tlcMobileInseriti || 0),
          energiaInseriti: acc.energiaInseriti + Number(r.energiaInseriti || r.energia_inseriti || r.energy || 0)
        }), { dealerTotali:0, dealerIngaggiati:0, tlcFissoInseriti:0, tlcMobileInseriti:0, energiaInseriti:0 });
        
        // Usa kpi.dealerTotali invece di sommare da provinceTotals (per rispettare filtro COMSY)
        sumFromPT.dealerTotali = Number(res?.kpi?.dealerTotali || sumFromPT.dealerTotali);
        sumFromPT.dealerIngaggiati = Number(res?.kpi?.dealerIngaggiati || sumFromPT.dealerIngaggiati);
        
        // Estrai dealer ingaggiati per tipologia dal KPI
        const dealerIngaggiatiFisso = Number(res?.kpi?.dealerIngaggiatiFisso || 0);
        const dealerIngaggiatiMobile = Number(res?.kpi?.dealerIngaggiatiMobile || 0);

        // Fallback avanzati: leggi anche dalla distribuzione per provincia
        let energiaInseriti = sumFromPT.energiaInseriti;

        // Prepara default per SIM RA e ENI
        let simAuto = getFirstNumber(res, [/mobile.*automatic/i, /ric.*automat/i, /tlc.*mobile.*automat/i, /mobile_automat/i]);
        let eniInseriti = getFirstNumber(res, [/eni.*inser/i, /^eni$/i, /eniInseriti/i]);

        try {
          const prov = await fetchProvinceDistrib({ agente, year, month });
          const details = Array.isArray(prov?.rows) ? prov.rows : [];
          const det = details.filter(r => Number(r?.SortOrder) === 2);
          const sumBy = (key) => det.reduce((a, r) => a + Number(r?.[key] || 0), 0);
          const energyFromProv = sumBy('TotaleEnergia');
          const raFromProv = sumBy('TotaleMobileRA');
          if (!energiaInseriti && energyFromProv) energiaInseriti = energyFromProv;
          if ((simAuto == null || simAuto === 0) && raFromProv) simAuto = raFromProv;
        } catch {}

        // Se ancora ENERGY non presente, tenta dal KPI
        if (!energiaInseriti && res?.kpi && Number(res.kpi.energiaInseriti || 0) > 0) {
          energiaInseriti = Number(res.kpi.energiaInseriti);
        }

        // Se SIM RA non presente, prova da KPI
        if ((simAuto == null || simAuto === 0) && res?.kpi && Number(res.kpi.tlc_mobile_ra_inseriti || res.kpi.mobile_ricarica_automatica || 0) > 0) {
          simAuto = Number(res.kpi.tlc_mobile_ra_inseriti || res.kpi.mobile_ricarica_automatica);
        }

        // Se ENI non presente, prova da KPI
        if ((eniInseriti == null || eniInseriti === 0) && res?.kpi && Number(res.kpi.eniInseriti || 0) > 0) {
          eniInseriti = Number(res.kpi.eniInseriti);
        }

        // Se ancora ENERGY non presente, tenta dal payload principale
        if (!energiaInseriti) {
          const energyGuess = getFirstNumber(res, [/energia.*inser/i, /energia(_|\s)*tot/i, /fw.*energy/i, /^energy$/i, /TotaleEnergia/i, /energy.*inser/i]);
          if (Number.isFinite(energyGuess) && energyGuess > 0) energiaInseriti = energyGuess;
        }

        const sum = { ...sumFromPT, energiaInseriti, dealerIngaggiatiFisso, dealerIngaggiatiMobile };
        if (alive) setSummary(sum);
        if (alive) setSim({ auto: (simAuto || simAuto === 0) ? simAuto : 0, eni: (eniInseriti || eniInseriti === 0) ? eniInseriti : 0 });
      } finally { if (alive) setLoading(false); }
    })();
    return ()=>{ alive = false; };
  }, [agente, year, month]);

  const items = [
    { label: 'DEALER TOTALI', value: summary?.dealerTotali },
    { label: 'DEALER INGAGGIATI FISSO', value: summary?.dealerIngaggiatiFisso },
    { label: 'DEALER INGAGGIATI MOBILE', value: summary?.dealerIngaggiatiMobile },
    { label: 'ATT.FISSO', value: summary?.tlcFissoInseriti },
    { label: 'ATTIVAZIONI MOBILE', value: summary?.tlcMobileInseriti },
    { label: 'ENERGIA INSERITI', value: summary?.energiaInseriti },
    { label: 'SIM RIC. AUTOMATICA', value: sim.auto },
    { label: 'ENI', value: sim.eni }
  ];

  return (
    <div className="bg-white rounded-xl shadow-sm ring-1 ring-gray-100 p-4">
      <h3 className="text-sm font-semibold text-login-bg mb-2">{agente}</h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
        {items.map((it, i)=> (
          <div key={i} className="rounded border border-gray-100 p-2">
            <div className="text-[11px] text-gray-500">{it.label}</div>
            <div className="text-sm font-semibold">{String(it.value ?? (loading ? '…' : '-'))}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AgentsSummaryGrid({ year, month }){
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5 gap-3">
      {AGENTI.map(a=> <AgentSummaryCard key={a} agente={a} year={year} month={month} />)}
    </div>
  );
}

function DealersTable({ dealers }){
  const rows = useMemo(()=>{
    const list = Array.isArray(dealers) ? dealers : [];
    const pickName = (d) => d?.ragioneSociale || d?.RagioneSociale || d?.DealerKey || d?.dealerKey || d?.nome || d?.name || '-';
    const toNumber = (value) => {
      const n = Number(value);
      return Number.isFinite(n) ? n : 0;
    };
    const rowsWithMetrics = list.map(d => {
      // Nuove colonne dalla stored procedure aggiornata
      const fisso = toNumber(d?.fisso ?? d?.FISSO ?? d?.Fisso ?? d?.tlcFissoInseriti);
      const fissoShp = toNumber(d?.fissoShp ?? d?.['FISSO SHP'] ?? d?.fisso_shp);
      const fissoRes = toNumber(d?.fissoRes ?? d?.['FISSO RES'] ?? d?.fisso_res);
      const mobile = toNumber(d?.mobile ?? d?.MOBILE ?? d?.Mobile ?? d?.tlcMobileInseriti);
      const mobileShp = toNumber(d?.mobileShp ?? d?.['MOBILE SHP'] ?? d?.mobile_shp);
      const mobileRes = toNumber(d?.mobileRes ?? d?.['MOBILE RES'] ?? d?.mobile_res);
      const mobileRa = toNumber(d?.mobileRa ?? d?.['Mobile RA'] ?? d?.['Mobili R. Automatica'] ?? d?.MobiliRA ?? d?.mobile_ra);
      const convergenza = toNumber(d?.convergenza ?? d?.CONVERGENZA ?? d?.Convergenza);
      const energia = toNumber(d?.energia ?? d?.ENERGIA ?? d?.Energia ?? d?.energiaInseriti);
      
      // Per compatibilità con il frontend, manteniamo anche i campi legacy
      const convRes = fissoRes; // FISSO RES corrisponde a Conv RES
      const convBus = fissoShp; // FISSO SHP corrisponde a Conv BUS
      
      const totale = fisso + convRes + convBus + mobile + energia;
      return {
        dealer: pickName(d),
        fisso,
        fissoShp,
        fissoRes,
        mobile,
        mobileShp,
        mobileRes,
        mobileRa,
        convergenza,
        energia,
        totale
      };
    });
    return rowsWithMetrics
      // mostra solo righe con almeno un valore rilevante > 0
      .filter(r => r.totale > 0 || r.mobileRa > 0 || r.convergenza > 0)
      .sort((a, b) => b.totale - a.totale || b.mobile - a.mobile || a.dealer.localeCompare(b.dealer));
  }, [dealers]);
  return (
    <div className="bg-white rounded-xl shadow-sm ring-1 ring-gray-100 p-4">
      <h3 className="text-sm font-semibold text-gray-900 mb-3">Avanzamento</h3>
      <div className="overflow-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-gray-600">
              <th className="text-left px-2 py-1">Dealer</th>
              <th className="text-right px-2 py-1 whitespace-nowrap">Fisso</th>
              <th className="text-right px-2 py-1 whitespace-nowrap">Fisso SHP</th>
              <th className="text-right px-2 py-1 whitespace-nowrap">Fisso RES</th>
              <th className="text-right px-2 py-1">Mobile</th>
              <th className="text-right px-2 py-1 whitespace-nowrap">Mobile SHP</th>
              <th className="text-right px-2 py-1 whitespace-nowrap">Mobile RES</th>
              <th className="text-right px-2 py-1 whitespace-nowrap">Mobile RA</th>
              <th className="text-right px-2 py-1 whitespace-nowrap">Convergenza</th>
              <th className="text-right px-2 py-1">Energia</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.length ? rows.map((r, i)=> (
              <tr key={i}>
                <td className="px-2 py-1">{r.dealer}</td>
                <td className="px-2 py-1 text-right">{r.fisso}</td>
                <td className="px-2 py-1 text-right">{r.fissoShp}</td>
                <td className="px-2 py-1 text-right">{r.fissoRes}</td>
                <td className="px-2 py-1 text-right">{r.mobile}</td>
                <td className="px-2 py-1 text-right">{r.mobileShp}</td>
                <td className="px-2 py-1 text-right">{r.mobileRes}</td>
                <td className="px-2 py-1 text-right">{r.mobileRa}</td>
                <td className="px-2 py-1 text-right">{r.convergenza}</td>
                <td className="px-2 py-1 text-right">{r.energia}</td>
              </tr>
            )) : (
              <tr><td className="px-2 py-3 text-center text-gray-500" colSpan={10}>Nessun dato</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Grafico per distribuzione per provincia (Chart.js via CDN)
function ProvinceBarChart({ agente, year, month }){
  const canvasRef = useRef(null);
  const chartRef = useRef(null);
  const [empty, setEmpty] = useState(false);
  useEffect(()=>{
    let alive = true;
    (async ()=>{
      try{
        const payload = await fetchProvinceDistrib({ agente, year, month });
        const labels = payload?.chart?.labels || [];
        const datasets = payload?.chart?.datasets || [];
        setEmpty(labels.length === 0);
        await ensureChartJs();
        if (!alive || !canvasRef.current) return;
        if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; }
        chartRef.current = new window.Chart(canvasRef.current, {
          type: 'bar',
          data: { labels, datasets },
          options: {
            responsive:true,
            maintainAspectRatio:false,
            plugins:{ legend:{ display:false } },
            scales:{ x:{ ticks:{ maxRotation:0, autoSkip:true } }, y:{ beginAtZero:true } }
          }
        });
      } catch(e){ /* no-op */ }
    })();
    return ()=>{ let c=chartRef.current; if (c) { try{ c.destroy(); }catch{} chartRef.current=null; } alive=false; };
  }, [agente, year, month]);
  return (
    <div className="bg-white rounded-xl shadow-sm ring-1 ring-gray-100 p-4">
      <h3 className="text-sm font-semibold text-gray-900 mb-2">Distribuzione per provincia</h3>
      <div className="h-[220px]">
        <canvas ref={canvasRef} aria-label="Grafico distribuzione per provincia" />
      </div>
      {empty && <div className="text-xs text-gray-500 mt-2">Nessun dato per il periodo</div>}
    </div>
  );
}

function AgentPanel({ agente, year, month }){
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [state, setState] = useState({ kpi:null, province:[], provSegment:[], dealers:[], provTotalsForStack:null, dettagli:[] });

  useEffect(()=>{
    let alive = true;
    (async ()=>{
      try{
        setError(''); setLoading(true);
        const res = await fetchAnalisi({ agente, year, month });
        const provSeg = Array.isArray(res?.provSegment) ? res.provSegment : [];
        const province = Array.isArray(res?.provinceTotals) ? res.provinceTotals : (Array.isArray(res?.province) ? res.province : []);
        // dettagli
        let dettagliRows = [];
        try {
          const det = await fetchDettagli({ agente, year, month });
          const arr = Array.isArray(det?.rows) ? det.rows : [];
          dettagliRows = arr.map(r=> ({
            provincia: r.provincia || r.Provincia || '',
            segmento: r.segmento || r.Segmento || '',
            categoria: r.categoria || r.Categoria || '',
            attivazioni: Number(r.attivazioni || r.Attivazioni || 0)
          })).sort((a,b)=> (b.attivazioni - a.attivazioni) || a.provincia.localeCompare(b.provincia));
        } catch { dettagliRows = []; }
        if (alive) setState({
          kpi: res.kpi || null,
          province,
          provSegment: provSeg,
          dealers: Array.isArray(res?.dealers) ? res.dealers : [],
          provTotalsForStack: res?.provTotalsForStack || null,
          dettagli: dettagliRows
        });
      } catch(e) { if (alive) setError('Errore caricamento dati'); }
      finally { if (alive) setLoading(false); }
    })();
    return ()=>{ alive = false; };
  }, [agente, year, month]);

  return (
    <div className="bg-white rounded-xl shadow-sm ring-1 ring-gray-100 p-4">
      <h3 className="text-sm font-semibold text-login-bg mb-2">{agente}</h3>
      {loading && <div className="text-sm text-gray-500 mb-2">Caricamento…</div>}
      {error && <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2 mb-2">{error}</div>}
      <div className="grid grid-cols-1 gap-3">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <ProvinceBarChart agente={agente} year={year} month={month} />
          <DealersTable dealers={state.dealers} />
        </div>
        <div>
          <h4 className="text-sm font-medium text-gray-900 mb-1">Dettagli per provincia / segmento / categoria</h4>
          <div className="overflow-auto">
            <table className="min-w-full text-xs">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="text-left px-2 py-1">Provincia</th>
                  <th className="text-left px-2 py-1">Segmento</th>
                  <th className="text-left px-2 py-1">Categoria</th>
                  <th className="text-right px-2 py-1">Attivazioni</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {state.dettagli.length ? state.dettagli.map((r, i)=> (
                  <tr key={i}>
                    <td className="px-2 py-1">{r.provincia || '-'}</td>
                    <td className="px-2 py-1">{r.segmento || '-'}</td>
                    <td className="px-2 py-1">{r.categoria || '-'}</td>
                    <td className="px-2 py-1 text-right">{r.attivazioni ?? '-'}</td>
                  </tr>
                )) : (
                  <tr><td className="px-2 py-3 text-center text-gray-500" colSpan={4}>Nessun dato</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

// Componente per export PDF statistiche
function ExportPdfSection() {
  const now = new Date();
  const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const [dateFrom, setDateFrom] = useState(firstDayOfMonth.toISOString().split('T')[0]);
  const [dateTo, setDateTo] = useState(now.toISOString().split('T')[0]);
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    if (!dateFrom || !dateTo) {
      toast.error('Seleziona entrambe le date');
      return;
    }

    if (new Date(dateFrom) > new Date(dateTo)) {
      toast.error('La data iniziale deve essere precedente alla data finale');
      return;
    }

    try {
      setExporting(true);
      const params = new URLSearchParams({ dateFrom, dateTo });
      const url = `/supermaster/export-kpi-pdf?${params.toString()}`;
      
      // Ottieni il token
      const token = getToken();
      
      // Fetch con autenticazione
      const response = await fetch(`${import.meta.env.VITE_API_BASE || ''}${url}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error('Errore durante la generazione del PDF');
      }

      // Download del PDF
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `statistiche_agenti_${dateFrom}_${dateTo}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(downloadUrl);

      toast.success('PDF generato con successo!');
    } catch (error) {
      console.error('Errore export PDF:', error);
      toast.error(error.message || 'Errore durante l\'esportazione');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm ring-1 ring-gray-100 p-4 mb-4">
      <h3 className="text-sm font-semibold text-gray-900 mb-3">📊 Stampa Statistiche</h3>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col">
          <label className="text-xs text-gray-500 mb-1">Dal</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="border-gray-300 rounded-md text-sm px-3 py-1.5"
          />
        </div>
        <div className="flex flex-col">
          <label className="text-xs text-gray-500 mb-1">Al</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="border-gray-300 rounded-md text-sm px-3 py-1.5"
          />
        </div>
        <button
          onClick={handleExport}
          disabled={exporting}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {exporting ? (
            <>
              <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span>Generazione...</span>
            </>
          ) : (
            <>
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              <span>STAMPA</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}

export default function AnalisiSuperMasterPage({ embed = false }){
  const { user } = useAuth();
  const now = new Date();
  
  // Logica smart per il primo giorno del mese
  const getSmartDefaults = () => {
    const currentDay = now.getDate();
    // Solo il primo giorno del mese mostra il mese precedente
    if (currentDay === 1) {
      const prevMonth = now.getMonth() === 0 ? 12 : now.getMonth();
      const prevYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
      return { year: prevYear, month: prevMonth };
    }
    // Dal secondo giorno in poi mostra il mese corrente
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  };
  
  const smartDefaults = getSmartDefaults();
  const [filters, setFilters] = useState({ month: smartDefaults.month, year: smartDefaults.year });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState({ kpi:null, province:[], provSegment:[], dealers:[], provTotalsForStack:null });
  const [lastUpdates, setLastUpdates] = useState({ tlc: null, energy: null });

  // Carica subito e ad ogni cambio di filtri (mese/anno)
  useEffect(()=>{ load(); }, [filters.year, filters.month]);

  // Carica date ultimo aggiornamento (TLC/ENERGY)
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await getProtectedData('/agente/reportistica/last-updates');
        const d = res?.data?.data || res?.data || {};
        if (!alive) return;
        setLastUpdates({ tlc: d.tlc || null, energy: d.energy || null });
      } catch (e) {
        // non bloccare la pagina
        // console.warn('[SuperMaster][Analisi] last-updates:', e?.message);
      }
    })();
    return () => { alive = false; };
  }, []);

  async function load(){
    try{
      setError(''); setLoading(true);
      const res = await fetchAnalisi({ agente: DEFAULT_AGENT, year: filters.year, month: filters.month });
      const pt = Array.isArray(res?.provinceTotals) ? res.provinceTotals : [];
      const summary = pt.reduce((acc, r) => ({
        dealerTotali: acc.dealerTotali + Number(r.dealerTotali || r.tot || 0),
        dealerIngaggiati: acc.dealerIngaggiati + Number(r.dealerIngaggiati || 0),
        tlcFissoInseriti: acc.tlcFissoInseriti + Number(r.tlcFissoInseriti || 0),
        tlcMobileInseriti: acc.tlcMobileInseriti + Number(r.tlcMobileInseriti || 0),
        energiaInseriti: acc.energiaInseriti + Number(r.energiaInseriti || r.energia_inseriti || r.energy || 0)
      }), { dealerTotali:0, dealerIngaggiati:0, tlcFissoInseriti:0, tlcMobileInseriti:0, energiaInseriti:0 });
      
      // Usa kpi.dealerTotali invece di sommare da provinceTotals (per rispettare filtro COMSY)
      summary.dealerTotali = Number(res?.kpi?.dealerTotali || summary.dealerTotali);
      summary.dealerIngaggiati = Number(res?.kpi?.dealerIngaggiati || summary.dealerIngaggiati);
      setData({
        kpi: res?.kpi || null,
        province: pt.length ? pt.map(p=> ({ province: p.provincia || p.Provincia || p.province || '', tot: Number(p.dealerTotali || p.tot || 0) })) : (res?.province || []),
        provSegment: res?.provinceSegmentEngagement || res?.provSegment || res?.provWide || [],
        provTotalsForStack: pt,
        dealers: Array.isArray(res?.dealers) ? res.dealers : []
      });
    } catch(e){ setError('Impossibile caricare i dati.'); setData({ kpi:null, province:[], provSegment:[], dealers:[], provTotalsForStack:null }); }
    finally{ setLoading(false); }
  }

  // Funzione per invalidare la cache Redis
  const [resettingCache, setResettingCache] = useState(false);
  
  const handleResetCache = async () => {
    if (resettingCache) return;
    
    try {
      setResettingCache(true);
      const response = await postProtectedData('/supermaster/report-agente/invalidate-cache', {});
      
      if (response?.success) {
        toast.success(response.message || 'Cache invalidata con successo!');
        // Ricarica i dati dopo aver invalidato la cache
        await load();
      } else {
        toast.error('Errore durante l\'invalidazione della cache');
      }
    } catch (err) {
      console.error('Errore reset cache:', err);
      toast.error(err.message || 'Errore durante l\'invalidazione della cache');
    } finally {
      setResettingCache(false);
    }
  };

  const content = (
    <>
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <h1 className="text-[20px] leading-6 font-semibold text-gray-900 tracking-[-0.01em]">Analisi</h1>
          <Badge label="Ultimo Aggiornamento TLC" value={formatItDate(lastUpdates.tlc)} color="blue" />
          <Badge label="Ultimo aggiornamento ENERGY" value={formatItDate(lastUpdates.energy)} color="emerald" />
          <button
            onClick={handleResetCache}
            disabled={resettingCache || loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="Invalida la cache Redis e ricarica i dati"
          >
            {resettingCache ? (
              <>
                <svg className="animate-spin h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>Reset...</span>
              </>
            ) : (
              <>
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span>Reset Cache</span>
              </>
            )}
          </button>
        </div>
        <FiltersBar value={filters} onChange={setFilters} onLoad={load} loading={loading} />
      </div>

      {error && <div className="mb-3 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">{error}</div>}

      {/* Export PDF Statistiche */}
      <ExportPdfSection />

      <div className="space-y-4">
        <AgentsSummaryGrid year={filters.year} month={filters.month} />
        <div className="grid grid-cols-1 gap-4">
          {AGENTI.map(a=> <AgentPanel key={a} agente={a} year={filters.year} month={filters.month} />)}
        </div>
        <AggregatedDetails year={filters.year} month={filters.month} />
      </div>
    </>
  );

  if (embed) {
    // Quando embeddato dentro SuperMasterDashboard, NON usare DashboardLayout (niente sidebar)
    return (
      <div className="w-full px-4 sm:px-6 lg:px-8 py-6">
        {content}
      </div>
    );
  }

  return (
    <DashboardLayout title="Analisi">
      {content}
    </DashboardLayout>
  );
}

// --- Tabella aggregata in puro React + Tailwind (no ag-Grid) ---
function AggregatedDetails({ year, month }){
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [full, setFull] = useState(false); // vista completa/compatta
  const [filters, setFilters] = useState({ agente: 'ALL', provincia: 'ALL', segmento: 'ALL', categoria: 'ALL' });

  useEffect(()=>{
    let alive = true;
    (async ()=>{
      try{
        setError(''); setLoading(true);
        const results = await Promise.all(
          AGENTI.map(async (agente) => {
            try{
              const det = await fetchDettagli({ agente, year, month });
              const arr = Array.isArray(det?.rows) ? det.rows : [];
              return arr.map(r => ({
                agente,
                provincia: r.provincia || r.Provincia || '',
                segmento: r.segmento || r.Segmento || '',
                categoria: r.categoria || r.Categoria || '',
                attivazioni: Number(r.attivazioni || r.Attivazioni || 0),
                // campi aggiuntivi (per vista completa)
                prodotto: r.prodotto || r.Prodotto || r.OFFERTA || r.offerta || undefined,
                operatore: r.operatore || r.Operatore || r.OPERATORE || undefined,
                mese: r.mese || r.Mese || r.month || undefined,
                anno: r.anno || r.Anno || r.year || undefined,
                dealer: r.dealer || r.Dealer || r.RagioneSociale || r.ragione_sociale || undefined,
              }));
            } catch { return []; }
          })
        );
        const merged = results.flat().sort((a,b)=> (b.attivazioni - a.attivazioni) || a.provincia.localeCompare(b.provincia));
        if (alive) setRows(merged);
      } catch(e){ if (alive) setError('Errore caricamento dettagli'); }
      finally { if (alive) setLoading(false); }
    })();
    return ()=>{ alive = false; };
  }, [year, month]);

  // Colonne replicate come legacy
  const compactCols = ['agente','provincia','segmento','categoria','attivazioni'];
  const fullCols = ['agente','provincia','segmento','categoria','prodotto','operatore','dealer','mese','anno','attivazioni'];
  const cols = full ? fullCols : compactCols;

  const headerAlias = {
    agente: 'Agente', provincia: 'Provincia', segmento: 'Segmento', categoria: 'Categoria', attivazioni: 'Attivazioni',
    prodotto: 'Prodotto', operatore: 'Operatore', dealer: 'Dealer', mese: 'Mese', anno: 'Anno'
  };
  const headName = (s) => headerAlias[s] || s.replace(/_/g,' ').replace(/\b\w/g, c=> c.toUpperCase());

  // Filtri options (derivati dai dati)
  const optFrom = (arr, key) => ['ALL', ...Array.from(new Set(arr.map(r => (r[key] || '').toString().trim()).filter(Boolean))).sort((a,b)=>a.localeCompare(b))];
  const options = useMemo(()=>({
    agente: optFrom(rows, 'agente'),
    provincia: optFrom(rows, 'provincia'),
    segmento: optFrom(rows, 'segmento'),
    categoria: optFrom(rows, 'categoria')
  }), [rows]);

  // Applica filtri
  const filtered = rows.filter(r =>
    (filters.agente==='ALL' || r.agente===filters.agente) &&
    (filters.provincia==='ALL' || r.provincia===filters.provincia) &&
    (filters.segmento==='ALL' || r.segmento===filters.segmento) &&
    (filters.categoria==='ALL' || r.categoria===filters.categoria)
  );

  // Export CSV delle righe filtrate con le colonne correnti
  const exportCsv = () => {
    const data = filtered;
    const sep = ';';
    const esc = (v) => {
      const s = (v == null ? '' : String(v));
      const needs = /[";\n]/.test(s);
      return needs ? '"' + s.replace(/"/g,'""') + '"' : s;
    };
    const header = cols.map(c => headName(c)).join(sep);
    const body = data.map(r => cols.map(c => esc(r[c])).join(sep)).join('\n');
    const csv = header + '\n' + body;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `analisi_${year}-${String(month).padStart(2,'0')}_${full?'completa':'compatta'}.csv`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-white rounded-lg shadow-sm ring-1 ring-gray-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[13px] font-semibold text-gray-900 tracking-[-0.01em]">Dettagli attivazioni (aggregato)</h3>
        <div className="flex items-center gap-2">
          <button onClick={exportCsv} className="text-xs px-3 py-1.5 rounded-md border border-gray-200 hover:bg-gray-50 text-gray-700">Export CSV</button>
          <div className="hidden sm:flex items-center gap-1 text-xs">
            <span className="text-gray-500 mr-1">Vista</span>
            <button onClick={()=>setFull(false)} className={`px-2 py-1 rounded border ${!full ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-200'}`}>Compatta</button>
            <button onClick={()=>setFull(true)} className={`px-2 py-1 rounded border ${full ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-200'}`}>Completa</button>
          </div>
        </div>
      </div>
      {/* Barra filtri */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-2 mb-3">
        <div className="flex flex-col">
          <label className="text-[11px] text-gray-500 mb-1">Agente</label>
          <select value={filters.agente} onChange={e=>setFilters(f=>({ ...f, agente: e.target.value }))} className="border-gray-300 rounded text-xs px-2 py-1.5">
            {options.agente.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
        <div className="flex flex-col">
          <label className="text-[11px] text-gray-500 mb-1">Provincia</label>
          <select value={filters.provincia} onChange={e=>setFilters(f=>({ ...f, provincia: e.target.value }))} className="border-gray-300 rounded text-xs px-2 py-1.5">
            {options.provincia.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
        <div className="flex flex-col">
          <label className="text-[11px] text-gray-500 mb-1">Segmento</label>
          <select value={filters.segmento} onChange={e=>setFilters(f=>({ ...f, segmento: e.target.value }))} className="border-gray-300 rounded text-xs px-2 py-1.5">
            {options.segmento.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
        <div className="flex flex-col">
          <label className="text-[11px] text-gray-500 mb-1">Categoria</label>
          <select value={filters.categoria} onChange={e=>setFilters(f=>({ ...f, categoria: e.target.value }))} className="border-gray-300 rounded text-xs px-2 py-1.5">
            {options.categoria.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
      </div>
      {error && <div className="text-sm text-red-600 mb-2">{error}</div>}
      <div className="overflow-auto">
        <table className="min-w-full text-[12px]">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              {cols.map(c => (
                <th key={c} className="text-left px-2 py-2 whitespace-nowrap font-medium">{headName(c)}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td className="px-2 py-3 text-center text-gray-500" colSpan={cols.length}>Caricamento…</td></tr>
            ) : filtered.length ? (
              filtered.map((r, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  {cols.map(c => (
                    <td key={c} className="px-2 py-1.5 whitespace-nowrap text-gray-800">{r[c] ?? '-'}</td>
                  ))}
                </tr>
              ))
            ) : (
              <tr><td className="px-2 py-3 text-center text-gray-500" colSpan={cols.length}>Nessun dato</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
