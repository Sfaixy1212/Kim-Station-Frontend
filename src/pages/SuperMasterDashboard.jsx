import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getToken } from '../services/api';
import Incentivi from './Incentivi';
import AnalisiSuperMasterPage from './supermaster/Analisi';
import Strumenti from './Strumenti';
import StatsCard from '../components/common/StatsCard';
import Card from '../components/common/Card';
import { getProtectedData } from '../services/api';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar, Cell } from 'recharts';
import SuperMasterTopbar from '../components/supermaster/Topbar';


// Report Center: elenco report e anteprima recordset
function ReportCenter() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [data, setData] = useState({ recordsets: [], loading: false, error: '' });

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const res = await getProtectedData('/supermaster/reports');
        if (!mounted) return;
        setList(Array.isArray(res?.rows) ? res.rows : []);
      } finally { if (mounted) setLoading(false); }
    })();
    return () => { mounted = false; };
  }, []);

  const loadReport = async (id) => {
    setSelected(id);
    setData({ recordsets: [], loading: true, error: '' });
    try {
      const res = await getProtectedData(`/supermaster/reports/${id}`);
      const rs = Array.isArray(res?.recordsets) ? res.recordsets : [];
      setData({ recordsets: rs, loading: false, error: '' });
    } catch (e) {
      setData({ recordsets: [], loading: false, error: 'Errore nel caricamento report' });
    }
  };

  const table = (rows) => {
    const arr = Array.isArray(rows) ? rows : [];
    if (arr.length === 0) return <div className="text-sm text-gray-500">Nessun dato</div>;
    const cols = Object.keys(arr[0] || {});
    return (
      <div className="overflow-auto border border-gray-200 rounded">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>{cols.map(c => (<th key={c} className="px-3 py-2 text-left text-gray-600 border-b">{c}</th>))}</tr>
          </thead>
          <tbody>
            {arr.map((r,i) => (
              <tr key={i} className="border-b last:border-0">
                {cols.map(c => (<td key={c} className="px-3 py-2 text-gray-800 whitespace-nowrap">{String(r[c])}</td>))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      <Card title="Report Center" subtitle="Report dinamici per ARMANDO">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {loading ? Array.from({ length: 6 }).map((_,i)=>(<div key={i} className="h-20 bg-gray-100 animate-pulse rounded" />)) :
            list.map(r => (
              <button key={r.ID} onClick={()=>loadReport(r.ID)} className={`text-left p-3 border rounded hover:bg-gray-50 ${selected===r.ID?'border-indigo-500':'border-gray-200'}`}>
                <div className="font-medium text-gray-800 line-clamp-1">{r.Titolo}</div>
                <div className="text-xs text-gray-500 line-clamp-2">{r.Descrizione}</div>
              </button>
            ))}
        </div>
      </Card>

      {selected != null && (
        <Card title="Anteprima" subtitle={`Report ID: ${selected}`}>
          {data.loading && <div className="text-sm text-gray-500">Caricamento…</div>}
          {data.error && <div className="text-sm text-red-600">{data.error}</div>}
          {!data.loading && !data.error && (
            <div className="space-y-6">
              {data.recordsets.map((rs, idx) => (
                <div key={idx}>
                  <div className="text-xs text-gray-500 mb-2">Recordset {idx+1}</div>
                  {table(rs)}
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
// Sezione Home (KPI + placeholder moduli)
function SuperMasterHome() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // Filtri globali home con logica smart per il primo giorno del mese
  const now = new Date();
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
  const [year, setYear] = useState(smartDefaults.year);
  const [month, setMonth] = useState(smartDefaults.month);
  // Provincia rimossa dal selettore
  const [province, setProvince] = useState('');
  const [agent, setAgent] = useState('');
  // bump serve per forzare il refresh dei KPI anche quando i valori ritornano identici
  const [filtersBump, setFiltersBump] = useState(0);
  const [kpi, setKpi] = useState({
    attivazioniMese: 0,
    agentiAttiviMese: 0,
    andamentoAttivazioniPercentuale: 0,
    fastwebTlc: 0,
    fastwebFissi: 0,
    fastwebMobili: 0,
    fastwebEnergy: 0,
    sky: 0,
    iliad: 0,
    eniPlenitude: 0,
    lastBatchTlc: null,
    lastBatchEnergy: null,
    generatedAt: null,
  });

  

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const qp = new URLSearchParams();
        if (year) qp.set('year', String(year));
        if (month) qp.set('month', String(month));
        // provincia non più utilizzata
        if (agent) qp.set('agente', agent);
        const res = await getProtectedData(`/supermaster/kpi${qp.toString() ? `?${qp.toString()}` : ''}`);
        if (!mounted) return;
        // Helper: trova il primo numero per chiavi che matchano un pattern
        const getFirstNumber = (obj, regexes) => {
          const seen = new Set();
          const walk = (node) => {
            if (!node || typeof node !== 'object') return undefined;
            if (seen.has(node)) return undefined; seen.add(node);
            if (Array.isArray(node)) {
              for (const item of node) {
                const r = walk(item); if (r !== undefined) return r;
              }
              return undefined;
            }
            for (const [k, v] of Object.entries(node)) {
              if (regexes.some(r => r.test(k))) {
                const n = Number(v);
                if (Number.isFinite(n)) return n;
              }
            }
            for (const v of Object.values(node)) {
              if (v && typeof v === 'object') {
                const r = walk(v); if (r !== undefined) return r;
              }
            }
            return undefined;
          };
          try {
            const out = walk(obj);
            return Number.isFinite(out) ? out : 0;
          } catch { return 0; }
        };
        // Log di debug una tantum: mostra chiavi disponibili sulla risposta generale
        try { if (!window.__SM_KPI_KEYS_LOGGED__) { console.log('[SM KPI] /supermaster/kpi keys:', Object.keys(res || {})); window.__SM_KPI_KEYS_LOGGED__ = true; } } catch {}

        // Valori base dalla risposta generale
        const base = {
          attivazioniMese: Number(res?.attivazioniMese ?? 0),
          agentiAttiviMese: Number(res?.agentiAttiviMese ?? res?.dealerAttiviMese ?? 0),
          andamentoAttivazioniPercentuale: Number(res?.andamentoAttivazioniPercentuale ?? 0),
          fastwebTlc: Number(res?.fastwebTlc ?? 0),
          // Tentativi di estrazione diretta se già presenti
          fastwebFissi: Number(res?.fastwebFissi ?? res?.fastwebTlcFissi ?? res?.fwFissi ?? res?.fissi ?? 0),
          fastwebMobili: Number(res?.fastwebMobili ?? res?.fastwebTlcMobili ?? res?.fwMobili ?? res?.mobili ?? 0),
          fastwebEnergy: Number(res?.fastwebEnergy ?? 0),
          sky: getFirstNumber(res, [/(^|_)sky($|_|\b)/i, /sky\s*mese/i, /sky\s*tot/i]),
          iliad: getFirstNumber(res, [/(^|_)iliad($|_|\b)/i, /iliad\s*mese/i, /iliad\s*tot/i]),
          lastBatchTlc: res?.lastBatchTlc ?? null,
          lastBatchEnergy: res?.lastBatchEnergy ?? null,
          generatedAt: res?.generatedAt ?? null,
        };

        // Valori SKY/ILIAD/ENI già inclusi nella risposta unificata del backend
        base.sky = Number(res?.sky ?? base.sky ?? 0);
        base.iliad = Number(res?.iliad ?? base.iliad ?? 0);
        base.eniPlenitude = Number(res?.eniPlenitude ?? 0);

        // Se non abbiamo i dettagli FISSI/MOBILI, prova a ricavarli esplorando le chiavi
        if (!base.fastwebFissi) {
          base.fastwebFissi = getFirstNumber(res, [/fiss[oi]/i, /fw\s*fissi/i, /fissi_fw/i, /fastweb.*fiss[oi]/i]);
        }
        if (!base.fastwebMobili) {
          base.fastwebMobili = getFirstNumber(res, [/mobil[ei]/i, /fw\s*mobili/i, /mobile_fw/i, /fastweb.*mobil[ei]/i]);
        }
        // Se ancora zero ma abbiamo il totale fastwebTlc e una sola delle due componenti, stima l'altra
        if (base.fastwebTlc && base.fastwebFissi && !base.fastwebMobili) base.fastwebMobili = Math.max(0, base.fastwebTlc - base.fastwebFissi);
        if (base.fastwebTlc && base.fastwebMobili && !base.fastwebFissi) base.fastwebFissi = Math.max(0, base.fastwebTlc - base.fastwebMobili);

        // % RIC.AUTOMATICA già calcolata correttamente nel backend principale con filtri year/month
        // Rimuoviamo la chiamata separata che non rispettava i filtri temporali

        // Attivazioni mese = somma componenti (FW Fissi + FW Mobili + FW Energy + SKY + ILIAD + ENI)
        try {
          const fissi = Number(base.fastwebFissi || 0);
          const mobili = Number(base.fastwebMobili || 0);
          const energy = Number(base.fastwebEnergy || 0);
          const skyN = Number(base.sky || 0);
          const iliadN = Number(base.iliad || 0);
          const eniN = Number(base.eniPlenitude || 0);
          base.attivazioniMese = fissi + mobili + energy + skyN + iliadN + eniN;
        } catch {}

        setKpi(base);
        setError('');
      } catch (e) {
        console.error('[SuperMaster][KPI] Fetch error:', e);
        setError('Impossibile caricare i KPI');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [year, month, province, agent, filtersBump]);

  const stats = [
    { title: 'Attivazioni mese', value: String(kpi.attivazioniMese), change: '', icon: '⚡', trend: 'flat' },
    { title: 'FASTWEB FISSI', value: String(kpi.fastwebFissi), change: '', icon: '📶', trend: 'flat' },
    { title: 'FASTWEB MOBILI', value: String(kpi.fastwebMobili), change: '', icon: '📱', trend: 'flat' },
    { title: '% RIC.AUTOMATICA', value: (Number.isFinite(kpi.andamentoAttivazioniPercentuale) ? `${kpi.andamentoAttivazioniPercentuale}%` : '-'), change: '', icon: '🔁', trend: 'flat' },
    { title: 'FASTWEB ENERGY', value: String(kpi.fastwebEnergy), change: '', icon: '🔌', trend: 'flat' },
    { title: 'SKY', value: String(kpi.sky), change: '', icon: '📺', trend: 'flat' },
    { title: 'ILIAD', value: String(kpi.iliad), change: '', icon: '📶', trend: 'flat' },
    { title: 'ENI PLENITUDE', value: String(kpi.eniPlenitude), change: '', icon: '⚡', trend: 'flat' },
  ];

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Filter Bar */}
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Anno</label>
          <select value={year} onChange={e => setYear(Number(e.target.value))} className="border-gray-300 rounded-md text-sm">
            {Array.from({ length: 5 }, (_, i) => now.getFullYear() - i).map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Mese</label>
          <select value={month} onChange={e => setMonth(Number(e.target.value))} className="border-gray-300 rounded-md text-sm">
            {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => <option key={m} value={m}>{String(m).padStart(2,'0')}</option>)}
          </select>
        </div>
        {/* Provincia rimossa */}
        <div>
          <label className="block text-xs text-gray-500 mb-1">Agente</label>
          <input value={agent} onChange={e => setAgent(e.target.value)} placeholder="Nome agente" className="border-gray-300 rounded-md text-sm px-2 py-1.5" />
        </div>
        <button onClick={() => {
          const d = new Date();
          const currentDay = d.getDate();
          setProvince('');
          setAgent('');
          // Applica la stessa logica smart del reset
          if (currentDay === 1) {
            const prevMonth = d.getMonth() === 0 ? 12 : d.getMonth();
            const prevYear = d.getMonth() === 0 ? d.getFullYear() - 1 : d.getFullYear();
            setYear(prevYear);
            setMonth(prevMonth);
          } else {
            setYear(d.getFullYear());
            setMonth(d.getMonth() + 1);
          }
          // bump per forzare ricalcolo anche se i valori coincidono
          setFiltersBump(v => v + 1);
        }} className="ml-auto text-xs px-3 py-2 border border-gray-300 rounded-md text-gray-600 hover:bg-gray-50">Reset filtri</button>
      </div>
      {/* Badge ultimo aggiornamento dati (TLC / ENERGY / real-time) */}
      {!loading && (
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <span className="text-xs text-gray-500">Ultimo aggiornamento dati</span>
          <span className="text-xs px-2 py-1 rounded-full border border-gray-200 bg-white text-gray-700">
            TLC: {kpi.lastBatchTlc ? new Date(kpi.lastBatchTlc).toLocaleDateString() : 'n/d'}
          </span>
          <span className="text-xs px-2 py-1 rounded-full border border-gray-200 bg-white text-gray-700">
            ENERGY: {kpi.lastBatchEnergy ? new Date(kpi.lastBatchEnergy).toLocaleDateString() : 'n/d'}
          </span>
          <span className="text-xs px-2 py-1 rounded-full border border-gray-200 bg-white text-gray-700">
            SKY/ILIAD: real‑time
          </span>
          {kpi.generatedAt && (
            <span className="ml-auto text-[11px] text-gray-400">
              generato: {new Date(kpi.generatedAt).toLocaleString()}
            </span>
          )}
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-8 gap-4 mb-6">
        {loading
          ? Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="bg-white border border-gray-200 rounded-lg shadow-sm p-4 animate-pulse h-24" />
            ))
          : stats.map((s, i) => (
            <div key={i} className="animate-fade-in" style={{ animationDelay: `${i * 0.05}s` }}>
              <StatsCard {...s} />
            </div>
          ))}
      </div>

      {/* Layout a due colonne: contenuti analitici + colonna laterale */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Colonna principale (2/3) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Trend sintetico mensile */}
          <TrendSinteticoMensile filters={{ year, month, province, agent }} />

          {/* Mix prodotti (FW TLC, FW Energy, SKY, ILIAD) */}
          <MixProdotti kpi={kpi} year={year} month={month} />

          {/* Classifica Top 10 (manteniamo esistente) */}
          <TopRanking year={year} month={month} />
        </div>

        {/* Colonna laterale (1/3) */}
        <div className="space-y-6">
          {/* AlertAvvisi rimosso su richiesta */}
          <AttivitaRecenti filters={{ year, month, province, agent }} />
          <QuickActions />
        </div>
      </div>

      {/* Ultime attivazioni (sintesi) */}
      <RecentActivationsSM />
    </div>
  );
}

// ---- Sezioni Home aggiuntive ----

function TrendSinteticoMensile({ filters }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        // 1) Prova ad usare i report dinamici (SuperMaster)
        const list = await getProtectedData('/supermaster/reports');
        const reports = Array.isArray(list?.rows) ? list.rows : [];
        const target = reports.find(r => /FASTWEB\s*-\s*Totali\s*Attivazione\s*Fissi\s*e\s*Mobili\s*mese\s*per\s*mese/i.test(r.Titolo || r.titolo || ''));
        if (target?.ID != null) {
          const rep = await getProtectedData(`/supermaster/reports/${target.ID}`);
          const recordsets = Array.isArray(rep?.recordsets) ? rep.recordsets : [];
          const table = recordsets[0] || [];
          // Atteso: colonne AnnoMese, Mobile_FW, Fissi_FW
          const rows = table.map(r => ({
            label: r.AnnoMese || r['Anno/Mese'] || r.PERIODO || '',
            mobile: Number(r.Mobile_FW || r.MOBILE || 0),
            fisso: Number(r.Fissi_FW || r.FISSO || r.WIFI || 0)
          }))
          // Ordina per label crescente (YYYY/MM)
          .sort((a,b) => String(a.label).localeCompare(String(b.label)));
          if (mounted) {
            setData(rows.map((r, i) => ({ Giorno: r.label, Attivazioni: r.mobile + r.fisso })));
            setError('');
            setLoading(false);
            return;
          }
        }
        // 2) Fallback: endpoint generico (se presente)
        const res = await getProtectedData('/supermaster/trend-mensile');
        if (!mounted) return;
        const rows = Array.isArray(res?.rows) ? res.rows : (res?.data || res || []);
        setData(rows);
        setError('');
      } catch (e) {
        setError(''); // silenzioso: la home deve restare pulita
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [filters?.year, filters?.month, filters?.province, filters?.agent]);

  // Prepara serie per grafico
  const chartData = data.map((d, i) => ({
    x: d.Giorno || d.giorno || d.label || d.PERIODO || i + 1,
    y: Number(d.Attivazioni || d.attivazioni || d.val || d.Totale || 0)
  }));
  const maxVal = Math.max(1, ...chartData.map(d => d.y));
  // Delta semplice (ultimo vs media precedenti)
  const last = chartData.length ? chartData[chartData.length - 1].y : 0;
  const avgPrev = chartData.length > 1 ? Math.round((chartData.slice(0, -1).reduce((a, b) => a + b.y, 0)) / (chartData.length - 1)) : 0;
  const delta = avgPrev ? Math.round(((last - avgPrev) / Math.max(1, avgPrev)) * 100) : 0;
  const deltaColor = delta >= 0 ? 'text-emerald-600 bg-emerald-50 border-emerald-100' : 'text-rose-600 bg-rose-50 border-rose-100';
  return (
    <Card
      title="Trend mensile"
      subtitle="Attivazioni giorno per giorno (mese corrente)"
      actions={<span className={`text-xs px-2 py-1 border rounded-full ${deltaColor}`} title={`Ultimo giorno vs media precedenti`}>{delta >= 0 ? `+${delta}%` : `${delta}%`}</span>}
      className="isolate"
    >
      {error && <div className="text-xs text-red-600 mb-2">{error}</div>}
      <div className="h-52">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="gradLine" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#6366f1" stopOpacity={0.9} />
                <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.5} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#eef2ff" />
            <XAxis dataKey="x" tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} />
            <YAxis hide domain={[0, maxVal]} />
            <Tooltip formatter={(v) => [v, 'Attivazioni']} labelFormatter={(l) => `Giorno ${l}`} />
            <Line type="monotone" dataKey="y" stroke="url(#gradLine)" strokeWidth={3} dot={false} activeDot={{ r: 5 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-3 text-right">
        <a href="/supermaster/analisi" className="text-xs text-indigo-600 hover:text-indigo-700">Vedi tutto →</a>
      </div>
    </Card>
  );
}

function MixProdotti({ kpi, year, month }) {
  const [skyHover, setSkyHover] = useState(null);
  const [skyBreakdown, setSkyBreakdown] = useState([]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const qp = new URLSearchParams();
        if (Number.isFinite(month)) qp.set('month', String(month));
        if (Number.isFinite(year)) qp.set('year', String(year));
        const res = await getProtectedData(`/supermaster/kpi/sky-hoover${qp.toString() ? `?${qp.toString()}` : ''}`);
        const rows = Array.isArray(res?.rows) ? res.rows : Array.isArray(res) ? res : [];
        const skip = new Set(['Anno','Mese','AnnoMese','Anno/Mese','PERIODO','Agente','AGENTE','Point','POINT','CITTA','Provincia','PROVINCIA','ORDINAMENTO','ORDINAMENTO_DETTAGLI','DataAggiornamento','ID','Titolo']);
        let tot = 0;
        const agg = {};
        for (const r of rows) {
          for (const [k, v] of Object.entries(r)) {
            if (skip.has(k)) continue;
            const n = Number(v);
            if (!Number.isFinite(n) || n === 0) continue;
            tot += n;
            agg[k] = (agg[k] || 0) + n;
          }
        }
        const breakdown = Object.entries(agg)
          .map(([label, value]) => ({ label, value }))
          .sort((a,b) => b.value - a.value);
        try { console.debug('[SM][sky-hoover]', { year, month, rowsLen: rows.length, tot, breakdown }); } catch {}
        if (mounted) { setSkyHover(tot); setSkyBreakdown(breakdown); }
      } catch {
        if (mounted) { setSkyHover(null); setSkyBreakdown([]); }
      }
    })();
    return () => { mounted = false; };
  }, [year, month]);

  const items = [
    { name: 'FASTWEB FISSI', value: Number(kpi.fastwebFissi || 0), color: 'bg-blue-600' },
    { name: 'FASTWEB MOBILI', value: Number(kpi.fastwebMobili || 0), color: 'bg-sky-500' },
    { name: 'FASTWEB ENERGY', value: Number(kpi.fastwebEnergy || 0), color: 'bg-cyan-500' },
    { name: 'SKY', value: Number(kpi.sky || 0), color: 'bg-indigo-500' },
    { name: 'ILIAD', value: Number(kpi.iliad || 0), color: 'bg-purple-500' },
    { name: 'ENI PLENITUDE', value: Number(kpi.eniPlenitude || 0), color: 'bg-emerald-500' },
  ];
  const total = items.reduce((a, b) => a + b.value, 0) || 1;
  const barData = items.map(it => ({ name: it.name, value: it.value, color: it.color }));
  // Tooltip personalizzato per Recharts
  const CustomTooltip = ({ active, payload, label }) => {
    try { console.debug('[SM][MixProdotti][Tooltip]', { active, label, payloadLen: (payload||[]).length }); } catch {}
    if (!active || !payload || !payload.length) return null;
    const name = payload[0]?.payload?.name || label;
    const val = payload[0]?.value ?? 0;
    if (name !== 'SKY') {
      return (
        <div className="text-xs bg-white p-2 rounded shadow border border-gray-200">
          <div className="font-semibold text-gray-800">{name}</div>
          <div className="text-gray-700">{name}: {val}</div>
        </div>
      );
    }
    const totVal = Number.isFinite(skyHover) ? skyHover : val;
    return (
      <div className="text-xs bg-white p-2 rounded shadow border border-gray-200 max-w-[240px]">
        <div className="font-semibold text-gray-800 mb-1">SKY</div>
        <div className="text-gray-800 mb-1">Totale: {totVal}</div>
        {skyBreakdown && skyBreakdown.length > 0 ? (
          <ul className="space-y-0.5 max-h-40 overflow-auto">
            {skyBreakdown.map((it, i) => (
              <li key={i} className="flex justify-between gap-2">
                <span className="text-gray-600 truncate">{it.label}</span>
                <span className="text-gray-900 font-medium">{it.value}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="text-gray-500">Nessun dettaglio disponibile</div>
        )}
      </div>
    );
  };

  return (
    <Card title="Mix prodotti (mese)" subtitle="Distribuzione attivazioni per linea (Fissi/Mobili separati)" className="isolate">
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={barData} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eef2ff" />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} />
            <YAxis hide />
            <Tooltip content={(p) => <CustomTooltip {...p} />} />
            <Bar dataKey="value" radius={[6, 6, 0, 0]}>
              {barData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={
                  entry.color === 'bg-blue-600' ? '#2563eb'
                  : entry.color === 'bg-sky-500' ? '#0ea5e9'
                  : entry.color === 'bg-cyan-500' ? '#06b6d4'
                  : entry.color === 'bg-indigo-500' ? '#6366f1'
                  : entry.color === 'bg-purple-500' ? '#8b5cf6'
                  : entry.color === 'bg-emerald-500' ? '#10b981'
                  : '#8b5cf6'
                } />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

function AlertAvvisi() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        // 1) Prova ad usare il report dinamico "SUPERM. - Avvisi"
        const list = await getProtectedData('/supermaster/reports');
        const reports = Array.isArray(list?.rows) ? list.rows : [];
        const target = reports.find(r => /SUPERM\.?\s*-\s*Avvisi/i.test(r.Titolo || r.titolo || ''));
        if (target?.ID != null) {
          const rep = await getProtectedData(`/supermaster/reports/${target.ID}`);
          const rs = Array.isArray(rep?.recordsets) ? rep.recordsets : [];
          const table = rs[0] || [];
          if (mounted) {
            if (Array.isArray(table) && table.length > 0) setRows(table);
            setLoading(false);
            return;
          }
        }
        // 2) Fallback: endpoint precedente
        const res = await getProtectedData('/supermaster/alert');
        if (!mounted) return;
        setRows(Array.isArray(res?.rows) ? res.rows : (res?.data || res || []));
      } catch {
        // Non sovrascrivere eventuali dati già caricati
      } finally { if (mounted) setLoading(false); }
    })();
    return () => { mounted = false; };
  }, []);
  return (
    <Card title="Alert & Avvisi" subtitle="Eventi che richiedono attenzione" actions={loading ? <span className="text-xs text-gray-400">Caricamento…</span> : null}>
      {rows.length === 0 && !loading && (
        <div className="text-sm text-gray-500">Nessun avviso.</div>
      )}
      <ul className="space-y-2">
        {rows.slice(0, 6).map((r, i) => (
          <li key={i} className="text-sm text-gray-700 flex items-start gap-2">
            <span className="mt-1 w-2 h-2 rounded-full bg-amber-500" />
            <span>{r.message || r.msg || r.descrizione || r.titolo || 'Avviso'}</span>
          </li>
        ))}
      </ul>
      {rows.length > 6 && <div className="mt-3 text-xs text-indigo-600 cursor-pointer">Vedi tutti →</div>}
    </Card>
  );
}

function AttivitaRecenti() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  // modalFilter: 'ALL' | 'ATT' | 'ORD'
  const [modalFilter, setModalFilter] = useState('ALL');
  const [attTop5, setAttTop5] = useState([]);
  const [ordTop5, setOrdTop5] = useState([]);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState('');
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        // 1) Prova ad usare il report dinamico "SUPERM. - Attività recenti"
        const list = await getProtectedData('/supermaster/reports');
        const reports = Array.isArray(list?.rows) ? list.rows : [];
        const target = reports.find(r => /SUPERM\.?\s*-\s*Attivit[aà]\s*recenti/i.test(r.Titolo || r.titolo || ''));
        if (target?.ID != null) {
          const rep = await getProtectedData(`/supermaster/reports/${target.ID}`);
          const rs = Array.isArray(rep?.recordsets) ? rep.recordsets : [];
          const table = rs[0] || [];
          if (mounted) {
            if (Array.isArray(table) && table.length > 0) setRows(table);
            setLoading(false);
            return;
          }
        }
        // Nessun fallback: evita di sovrascrivere con dati vuoti
        try { console.debug('[SM][AttivitaRecenti] Report non trovato o vuoto'); } catch {}
      } catch {
        // Evita di azzerare i dati già caricati (StrictMode doppia invocazione)
      } finally { if (mounted) setLoading(false); }
    })();
    return () => { mounted = false; };
  }, []);
  const openModal = async (filter) => {
    try {
      setModalLoading(true);
      setModalError('');
      if (filter) setModalFilter(filter);
      // Ricarica il report per ottenere i recordset dettagliati (2 e 3)
      const list = await getProtectedData('/supermaster/reports');
      const reports = Array.isArray(list?.rows) ? list.rows : [];
      const target = reports.find(r => /SUPERM\.?\s*-\s*Attivit[aà]\s*recenti/i.test(r.Titolo || r.titolo || ''));
      if (target?.ID != null) {
        const rep = await getProtectedData(`/supermaster/reports/${target.ID}`);
        const rs = Array.isArray(rep?.recordsets) ? rep.recordsets : [];
        setAttTop5((rs[1] || []).slice(0, 5));
        setOrdTop5((rs[2] || []).slice(0, 5));
      } else {
        setAttTop5([]); setOrdTop5([]);
      }
      setModalOpen(true);
    } catch (e) {
      setModalError('Errore nel caricamento dei dettagli');
      setModalOpen(true);
    } finally { setModalLoading(false); }
  };

  return (
    <Card title="Attività recenti" subtitle="Ultimi eventi su attivazioni, ordini e dealer" actions={loading ? <span className="text-xs text-gray-400">Caricamento…</span> : null}>
      <ul className="divide-y divide-gray-100">
        {(rows.length ? rows : (loading ? Array.from({ length: 5 }) : [])).slice(0, 5).map((r, i) => {
          const tipo = (r?.Tipo || r?.tipo || '').toString().toUpperCase();
          const isAtt = tipo.includes('ATTIVAZIONE');
          const badgeCls = isAtt ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-indigo-100 text-indigo-700 border-indigo-200';
          const badgeTxt = isAtt ? '⚡ ATT' : '🧾 ORD';
          return (
            <li key={i} className="py-2 text-sm flex items-center justify-between cursor-pointer hover:bg-gray-50 px-2 rounded" onClick={() => openModal(isAtt ? 'ATT' : 'ORD')}>
              <div className="flex items-center gap-2 min-w-0">
                <span className={`inline-flex items-center justify-center text-[10px] font-semibold px-2 py-0.5 rounded border ${badgeCls}`}>{badgeTxt}</span>
                <div className="text-gray-700 truncate">{r?.Descrizione || r?.descrizione || r?.title || 'Evento'}</div>
              </div>
              <div className="text-xs text-gray-400 whitespace-nowrap">{String(r?.Data || r?.data || '').slice(0, 16)}</div>
            </li>
          );
        })}
      </ul>
      {rows.length === 0 && !loading && <div className="text-sm text-gray-500">Nessuna attività recente.</div>}

      {/* Modal Dettagli */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30" onClick={() => setModalOpen(false)} />
          <div className="relative bg-white rounded-lg shadow-xl w-full max-w-3xl mx-4 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-800">Dettagli recenti</h3>
              <button onClick={() => setModalOpen(false)} className="text-gray-500 hover:text-gray-700">✕</button>
            </div>
            {modalLoading && <div className="text-sm text-gray-500">Caricamento…</div>}
            {modalError && <div className="text-sm text-red-600">{modalError}</div>}
            {!modalLoading && !modalError && (
              <div className={`grid grid-cols-1 ${modalFilter==='ALL' ? 'md:grid-cols-2' : ''} gap-4`}>
                {(modalFilter === 'ALL' || modalFilter === 'ATT') && (
                <div>
                  <div className="text-xs text-gray-500 mb-2">Ultime 5 Attivazioni</div>
                  <div className="max-h-72 overflow-auto border rounded">
                    <table className="min-w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-3 py-2 text-left">Tipo</th>
                          <th className="px-3 py-2 text-left">Data</th>
                          <th className="px-3 py-2 text-left">Descrizione</th>
                        </tr>
                      </thead>
                      <tbody>
                        {attTop5.map((r, idx) => {
                          const tipo = (r?.Tipo || r?.tipo || '').toString().toUpperCase();
                          return (
                            <tr key={idx} className="border-b last:border-0">
                              <td className="px-3 py-2 text-gray-700">{tipo || 'ATTIVAZIONE'}</td>
                              <td className="px-3 py-2 text-gray-600">{String(r.Data || r.data || '').slice(0,16)}</td>
                              <td className="px-3 py-2 text-gray-800">{r.Descrizione || r.descrizione || ''}</td>
                            </tr>
                          );
                        })}
                        {attTop5.length === 0 && (
                          <tr><td colSpan={3} className="px-3 py-4 text-sm text-gray-500">Nessuna attivazione</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
                )}
                {(modalFilter === 'ALL' || modalFilter === 'ORD') && (
                <div>
                  <div className="text-xs text-gray-500 mb-2">Ultimi 5 Ordini</div>
                  <div className="max-h-72 overflow-auto border rounded">
                    <table className="min-w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-3 py-2 text-left">Tipo</th>
                          <th className="px-3 py-2 text-left">Data</th>
                          <th className="px-3 py-2 text-left">Descrizione</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ordTop5.map((r, idx) => {
                          const tipo = (r?.Tipo || r?.tipo || '').toString().toUpperCase() || 'ORDINE';
                          return (
                            <tr key={idx} className="border-b last:border-0">
                              <td className="px-3 py-2 text-gray-700">{tipo}</td>
                              <td className="px-3 py-2 text-gray-600">{String(r.Data || r.data || '').slice(0,16)}</td>
                              <td className="px-3 py-2 text-gray-800">{r.Descrizione || r.descrizione || ''}</td>
                            </tr>
                          );
                        })}
                        {ordTop5.length === 0 && (
                          <tr><td colSpan={3} className="px-3 py-4 text-sm text-gray-500">Nessun ordine</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

function QuickActions() {
  const navigate = useNavigate();
  const actions = [
    { label: 'Report mensile', onClick: () => window.open('/api/supermaster/report/mensile', '_blank') },
    { label: 'Export attivazioni', onClick: () => window.open('/api/supermaster/export/attivazioni?period=month', '_blank') },
    { label: 'Apri geolocalizzazione', onClick: () => navigate('/supermaster/geolocalizzazione') },
    { label: 'Analisi agenti', onClick: () => navigate('/supermaster/analisi') },
  ];
  return (
    <Card title="Azioni rapide" subtitle="Report ed esplorazione">
      <div className="grid grid-cols-1 gap-2">
        {actions.map((a, i) => (
          <button key={i} onClick={a.onClick} className="w-full text-left px-3 py-2 border border-gray-200 rounded-md hover:bg-gray-50 active:scale-[0.99] transition text-sm text-gray-700">
            {a.label}
          </button>
        ))}
      </div>
    </Card>
  );
}

// Sezione Piani Incentivi (riusa pagina Incentivi)
function SuperMasterIncentivi() {
  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 py-6">
      <Incentivi />
    </div>
  );
}

// Sezione Geolocalizzazione placeholder
function SuperMasterGeo() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [loadStatus, setLoadStatus] = useState({ step: 0, msg: 'Caricamento…', progress: 5 });
  const mapContainerId = 'sm-map-container';

  // Helper: load external script once
  const loadScript = (src) => new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) { existing.addEventListener('load', resolve); existing.addEventListener('error', reject); return; }
    const s = document.createElement('script');
    s.src = src; s.async = true; s.defer = true;
    s.onload = resolve; s.onerror = reject;
    document.head.appendChild(s);
  });

  // Normalize lat/lng field names
  const pickLatLng = (d) => {
    const lat = d.lat ?? d.latitude ?? d.Latitude ?? d.Latitudine ?? d.Lat;
    const lng = d.lng ?? d.longitude ?? d.Longitude ?? d.Longitudine ?? d.Lng;
    if (lat == null || lng == null) return null;
    const nlat = Number(lat), nlng = Number(lng);
    if (Number.isFinite(nlat) && Number.isFinite(nlng)) return { lat: nlat, lng: nlng };
    return null;
  };

  // Build address from dealer fields
  const buildAddress = (d) => {
    const parts = [d.Indirizzo || d.indirizzo, d.CAP || d.cap, d.Citta || d.Città || d.citta, d.Provincia || d.provincia, 'Italia']
      .filter(Boolean)
      .map(x => String(x).trim())
      .filter(Boolean);
    return parts.join(', ');
  };

  // Local geocode cache
  const CACHE_KEY = 'supermaster_geocode_cache_v1';
  const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 giorni
  const readCache = () => {
    try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}'); } catch { return {}; }
  };
  const writeCache = (obj) => {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(obj)); } catch {}
  };
  const getGeocodeFromCache = (address) => {
    if (!address) return null;
    const cache = readCache();
    const item = cache[address];
    if (!item) return null;
    if (Date.now() - (item.ts || 0) > CACHE_TTL_MS) return null;
    return { lat: item.lat, lng: item.lng };
  };
  const setGeocodeInCache = (address, latLng) => {
    if (!address || !latLng) return;
    const cache = readCache();
    cache[address] = { lat: latLng.lat, lng: latLng.lng, ts: Date.now() };
    writeCache(cache);
  };

  // Geocode with backoff
  const geocodeWithBackoff = async (geocoder, address) => {
    const MAX_RETRY = 4;
    const delays = [150, 300, 600, 1200];
    for (let i = 0; i < MAX_RETRY; i++) {
      try {
        const res = await geocoder.geocode({ address });
        const r = res?.results?.[0]?.geometry?.location;
        if (r) return { lat: r.lat(), lng: r.lng() };
      } catch (e) {
        const msg = (e && e.message) || '';
        if (!/OVER_QUERY_LIMIT|RESOURCE_EXHAUSTED/i.test(msg) && i === MAX_RETRY - 1) throw e;
      }
      await new Promise(r => setTimeout(r, delays[i]));
    }
    return null;
  };

  // HQ distance (Haversine)
  const computeDistanceKm = (a, b) => {
    const lat1 = a.lat, lng1 = a.lng, lat2 = b.lat, lng2 = b.lng;
    const R = 6371, toRad = x => x * Math.PI / 180;
    const dLat = toRad(lat2 - lat1), dLon = toRad(lng2 - lng1);
    const s1 = Math.sin(dLat/2), s2 = Math.sin(dLon/2);
    const A = s1*s1 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * s2*s2;
    const c = 2 * Math.atan2(Math.sqrt(A), Math.sqrt(1 - A));
    return R * c;
  };

  // SVG pin
  const makePinSvg = (color = '#2563eb') => ({
    url: `data:image/svg+xml;utf-8,${encodeURIComponent(`<?xml version="1.0" ?><svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.5"><path d="M12 22s8-4.5 8-12a8 8 0 1 0-16 0c0 7.5 8 12 8 12z" fill="${color}" stroke="${color}"/></svg>`)}`,
    scaledSize: new window.google.maps.Size(32, 32),
    anchor: new window.google.maps.Point(16, 30),
  });

  // Costruisce contenuto InfoWindow per dealer (scope corretto per SuperMasterGeo)
  const buildDealerInfo = (d, distKm) => {
    const rows = [];
    const push = (label, value) => {
      if (value == null || value === '' || value === 'NULL') return;
      rows.push(`<div><span style="color:#64748b">${label}:</span> <strong style="color:#111827">${String(value)}</strong></div>`);
    };
    push('Ragione Sociale', d.RagioneSociale || d.ragioneSociale || d.Dealer || d.NomeDealer || d.dealer);
    push('Cellulare', d.RecapitoCell || d.cell || d.Cell || d.RecapitoCellulare);
    push('StationCode', d.StationCode || d.stationCode);
    push('COMSY1', d.COMSY1);
    push('COMSY2', d.COMSY2);
    push('Agente', d.Agente || d.agente || d.NOME_AGENTE || d.nomeAgente);
    if (typeof distKm === 'number') {
      const distStr = distKm < 10 ? distKm.toFixed(2) : distKm.toFixed(1);
      rows.push(`<div><span style=\"color:#64748b\">Distanza</span>: <strong style=\"color:#111827\">${distStr} km da KIM srls</strong></div>`);
    }
    const title = d.RagioneSociale || d.Dealer || d.NomeDealer || 'Dealer';
    return `
      <div style="font-size:12px; line-height:1.3; max-width:260px">
        <div style="font-weight:600; color:#111827; margin-bottom:4px">${title}</div>
        ${rows.join('')}
      </div>
    `;
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        setLoadStatus({ step: 1, msg: 'Caricamento…', progress: 10 });
        // 1) Fetch API key and map id
        const cfg = await getProtectedData('/config/maps-key');
        if (!mounted) return;
        setLoadStatus({ step: 2, msg: 'Sto preparando la mappa…', progress: 20 });
        const apiKey = cfg?.apiKey || cfg?.key;
        const mapId = cfg?.mapId || undefined;
        if (!apiKey) throw new Error('API key Google Maps non configurata');

        // 2) Load Google Maps JS API (v=weekly with importLibrary support)
        await loadScript(`https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly`);
        // Marker Clusterer
        await loadScript('https://unpkg.com/@googlemaps/markerclusterer/dist/index.min.js');
        if (!mounted) return;
        setLoadStatus({ step: 3, msg: 'Sto caricando i dealers…', progress: 35 });

        // 3) Create container if not exists
        let container = document.getElementById(mapContainerId);
        if (!container) {
          container = document.createElement('div');
          container.id = mapContainerId;
          container.style.width = '100%';
          container.style.height = '70vh';
          const holder = document.getElementById(`${mapContainerId}-holder`);
          if (holder) holder.appendChild(container);
        }

        // 4) Fetch dealers locations
        const dealers = await getProtectedData('/dealers/locations');
        if (!mounted) return;
        setLoadStatus({ step: 4, msg: 'Sto posizionando i dealers sulla mappa…', progress: 45 });
        const geocoder = new window.google.maps.Geocoder();
        // HQ
        const HQ_ADDR = 'Via Appia 324, 72100 Brindisi, Italia';
        let hq = getGeocodeFromCache(HQ_ADDR);
        if (!hq) {
          const r = await geocodeWithBackoff(geocoder, HQ_ADDR);
          if (r) { hq = r; setGeocodeInCache(HQ_ADDR, r); }
        }

        // Prepare points with fallback to geocode
        const points = [];
        const list = Array.isArray(dealers) ? dealers : [];
        const total = list.length || 1;
        let processed = 0;
        for (const d of list) {
          let ll = pickLatLng(d);
          if (!ll) {
            const addr = buildAddress(d);
            if (addr) {
              ll = getGeocodeFromCache(addr) || await geocodeWithBackoff(geocoder, addr);
              if (ll) setGeocodeInCache(addr, ll);
            }
          }
          if (ll) points.push({ d, ll });
          processed += 1;
          if (mounted && processed % 3 === 0) {
            // Aggiorna progress in modo graduale da 45 a 85
            const frac = Math.min(processed / total, 1);
            const prog = Math.floor(45 + frac * 40);
            setLoadStatus(s => ({ ...s, progress: prog }));
          }
        }

        // 5) Init map
        const center = points[0]?.ll || { lat: 41.1171, lng: 16.8719 }; // default Bari
        const map = new window.google.maps.Map(container, {
          center,
          zoom: 6,
          mapId,
        });
        if (mounted) setLoadStatus({ step: 5, msg: 'Quasi pronto…', progress: 90 });

        // 6) Add markers + cluster + HQ marker (con InfoWindow migliorato)
        const bounds = new window.google.maps.LatLngBounds();
        const sharedInfoWindow = new window.google.maps.InfoWindow();
        let pinnedMarker = null;
        let hoverOpenTimer = null;
        let hoverCloseTimer = null;
        const openInfo = (marker, html) => {
          try { sharedInfoWindow.setContent(html); } catch {}
          sharedInfoWindow.open({ anchor: marker, map });
        };
        const closeInfo = () => { try { sharedInfoWindow.close(); } catch {} };

        // Chiudi InfoWindow e sblocca pin su click mappa
        map.addListener('click', () => { pinnedMarker = null; closeInfo(); });

        const markers = points.map(({ d, ll }) => {
          const hasComsy = !!(d.COMSY || d.Comsy || d.comsy || d.COMSY1 || d.COMSY2);
          const icon = makePinSvg(hasComsy ? '#f97316' : '#2563eb'); // arancione se COMSY presente
          const m = new window.google.maps.Marker({ position: ll, icon });
          const dist = hq ? computeDistanceKm(ll, hq) : null;
          const html = buildDealerInfo(d, dist);

          // Hover con piccoli delay per UX più gradevole
          m.addListener('mouseover', () => {
            if (pinnedMarker && pinnedMarker !== m) return; // se fissato altrove, non interferire
            if (hoverCloseTimer) { clearTimeout(hoverCloseTimer); hoverCloseTimer = null; }
            hoverOpenTimer = setTimeout(() => openInfo(m, html), 120);
          });
          m.addListener('mouseout', () => {
            if (pinnedMarker === m) return; // se fissato questo marker, non chiudere su hover out
            if (hoverOpenTimer) { clearTimeout(hoverOpenTimer); hoverOpenTimer = null; }
            hoverCloseTimer = setTimeout(() => closeInfo(), 200);
          });
          // Click per fissare/sbloccare
          m.addListener('click', () => {
            if (pinnedMarker === m) {
              pinnedMarker = null;
              closeInfo();
            } else {
              pinnedMarker = m;
              openInfo(m, html);
            }
          });

          bounds.extend(ll);
          return m;
        });

        // HQ marker
        if (hq) {
          const hqm = new window.google.maps.Marker({ position: hq, map, title: 'HQ • KIM srls', icon: makePinSvg('#16a34a') });
          bounds.extend(hq);
        }

        // Cluster
        try {
          const MC = window.markerClusterer?.MarkerClusterer || window.MarkerClusterer;
          if (MC) new MC({ map, markers });
          else markers.forEach(m => m.setMap(map));
        } catch { markers.forEach(m => m.setMap(map)); }

        if (!bounds.isEmpty && (typeof bounds.isEmpty !== 'function' || !bounds.isEmpty())) {
          map.fitBounds(bounds);
        }

        if (!mounted) return;
        setError(points.length ? '' : 'Nessun dealer con coordinate disponibili.');
        setLoadStatus({ step: 6, msg: 'Fatto!', progress: 100 });
      } catch (e) {
        console.error('[SuperMaster][Geo] Errore mappa:', e);
        if (mounted) setError(e.message || 'Errore nella mappa');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 py-6 space-y-4">
      <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-800">Geolocalizzazione Dealer</h3>
          {loading && (
            <div className="flex items-center gap-3 text-xs text-gray-500">
              <span>{loadStatus.msg}</span>
              <div className="w-40 h-2 bg-gray-200 rounded overflow-hidden">
                <div className="h-2 bg-blue-600 transition-all duration-300" style={{ width: `${Math.min(loadStatus.progress, 100)}%` }} />
              </div>
            </div>
          )}
        </div>
        {error && <div className="text-xs text-red-600 mt-2">{error}</div>}
      </div>

      <div id={`${mapContainerId}-holder`} className="bg-white border border-gray-200 rounded-lg shadow-sm p-2">
        {/* Status placeholder durante il setup mappa */}
        {loading && (
          <div className="px-2 pb-2">
            <div className="text-xs text-gray-500 mb-2">{loadStatus.msg}</div>
            <div className="w-full h-2 bg-gray-200 rounded overflow-hidden">
              <div className="h-2 bg-blue-600 transition-all duration-300" style={{ width: `${Math.min(loadStatus.progress, 100)}%` }} />
            </div>
            <div className="mt-2 text-[11px] text-gray-400">Sto preparando la mappa, caricando i dealers e posizionando i marker…</div>
          </div>
        )}
        {/* Map container injected dynamically to avoid SSR issues */}
        {!loading && <div className="text-xs text-gray-400 px-2 pb-2">Mappa interattiva</div>}
      </div>
    </div>
  );
}

// Sezione Analisi placeholder
function SuperMasterAnalisi() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [agent, setAgent] = useState('');
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [kpi, setKpi] = useState(null);
  const [provinceDistrib, setProvinceDistrib] = useState([]);
  const [details, setDetails] = useState([]);
  const [fwAgentMonthly, setFwAgentMonthly] = useState({ rows: [], loading: true, error: '' });

  // Carica lista agenti (sorgente select) in base ad anno/mese
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const p = new URLSearchParams();
        if (year) p.set('year', String(year));
        if (month) p.set('month', String(month));
        const qs = p.toString() ? `?${p.toString()}` : '';
        const data = await getProtectedData(`/supermaster/kpi${qs}`);
        if (!mounted) return;
        const names = (Array.isArray(data) ? data : []).map(r => r.Agente || r.agente).filter(Boolean);
        setAgents(Array.from(new Set(names)));
        if (!agent && names.length > 0) setAgent(names[0]);
      } catch (e) {
        console.error('[SuperMaster][Analisi] Errore caricamento agenti:', e);
      }
    })();
    return () => { mounted = false; };
  }, [year, month]);

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i);
  const months = [1,2,3,4,5,6,7,8,9,10,11,12];

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Filtri */}
      <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-4">
        <div className="flex flex-col md:flex-row md:items-end gap-4">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs text-gray-500 mb-1">Agente</label>
            <select value={agent} onChange={e => setAgent(e.target.value)} className="w-full border-gray-300 rounded-md text-sm">
              {agents.map(a => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Anno</label>
            <select value={year} onChange={e => setYear(Number(e.target.value))} className="border-gray-300 rounded-md text-sm">
              {years.map(y => (<option key={y} value={y}>{y}</option>))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Mese</label>
            <select value={month} onChange={e => setMonth(Number(e.target.value))} className="border-gray-300 rounded-md text-sm">
              {months.map(m => (<option key={m} value={m}>{m.toString().padStart(2,'0')}</option>))}
            </select>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="bg-white border border-gray-200 rounded-lg shadow-sm p-4 animate-pulse h-20" />
          ))
        ) : (
          <>
            <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-4">
              <div className="text-xs text-gray-500">Dealer totali</div>
              <div className="text-2xl font-semibold text-gray-800">{kpi?.dealerTotali ?? '–'}</div>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-4">
              <div className="text-xs text-gray-500">Dealer ingaggiati</div>
              <div className="text-2xl font-semibold text-gray-800">{kpi?.dealerIngaggiati ?? '–'}</div>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-4">
              <div className="text-xs text-gray-500">TLC Fisso</div>
              <div className="text-2xl font-semibold text-gray-800">{kpi?.tlcFissoInseriti ?? '–'}</div>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-4">
              <div className="text-xs text-gray-500">TLC Mobile</div>
              <div className="text-2xl font-semibold text-gray-800">{kpi?.tlcMobileInseriti ?? '–'}</div>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-4">
              <div className="text-xs text-gray-500">ENERGY</div>
              <div className="text-2xl font-semibold text-gray-800">{kpi?.energiaInseriti ?? '–'}</div>
            </div>
          </>
        )}
      </div>

      {/* Distribuzione per Provincia */}
      <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-gray-800">Distribuzione per Provincia</h3>
          {loading && <span className="text-xs text-gray-400">Caricamento…</span>}
        </div>
        {error && <div className="text-xs text-red-600 mb-2">{error}</div>}
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-gray-500">
              <tr>
                <th className="py-2 pr-3">Provincia</th>
                <th className="py-2 pr-3">Dealer Totali</th>
                <th className="py-2 pr-3">Ingaggiati</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="border-t border-gray-100">
                    <td className="py-2 pr-3"><div className="h-4 bg-gray-200 rounded w-32 animate-pulse" /></td>
                    <td className="py-2 pr-3"><div className="h-4 bg-gray-200 rounded w-16 animate-pulse" /></td>
                    <td className="py-2 pr-3"><div className="h-4 bg-gray-200 rounded w-16 animate-pulse" /></td>
                  </tr>
                ))
              ) : (
                provinceDistrib.map((r, idx) => (
                  <tr key={idx} className="border-t border-gray-100">
                    <td className="py-2 pr-3">{r.Provincia || r.provincia || '—'}</td>
                    <td className="py-2 pr-3">{r.DealerTotali ?? r.dealerTotali ?? r.dealer_totali ?? '0'}</td>
                    <td className="py-2 pr-3">{r.DealerIngaggiati ?? r.dealerIngaggiati ?? r.dealer_ingaggiati ?? '0'}</td>
                  </tr>
                ))
              )}
              {(!loading && (!provinceDistrib || provinceDistrib.length === 0)) && (
                <tr><td className="py-4 text-gray-500" colSpan={3}>Nessun dato</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Dettagli Attivazioni */}
      <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-gray-800">Dettagli attivazioni</h3>
          {loading && <span className="text-xs text-gray-400">Caricamento…</span>}
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-gray-500">
              <tr>
                <th className="py-2 pr-3">Data</th>
                <th className="py-2 pr-3">Tipo</th>
                <th className="py-2 pr-3">Dealer</th>
                <th className="py-2 pr-3">Agente</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="border-t border-gray-100">
                    <td className="py-2 pr-3"><div className="h-4 bg-gray-200 rounded w-24 animate-pulse" /></td>
                    <td className="py-2 pr-3"><div className="h-4 bg-gray-200 rounded w-48 animate-pulse" /></td>
                    <td className="py-2 pr-3"><div className="h-4 bg-gray-200 rounded w-28 animate-pulse" /></td>
                    <td className="py-2 pr-3"><div className="h-4 bg-gray-200 rounded w-24 animate-pulse" /></td>
                  </tr>
                ))
              ) : (
                details.map((r, idx) => (
                  <tr key={idx} className="border-t border-gray-100">
                    <td className="py-2 pr-3">{String(r.Data || r.DataOra || r.data || '').slice(0,10)}</td>
                    <td className="py-2 pr-3">{r.Tipo || r.tipo || '—'}</td>
                    <td className="py-2 pr-3">{r.Dealer || r.dealer || r.NomeDealer || '—'}</td>
                    <td className="py-2 pr-3">{r.Agente || r.agente || '—'}</td>
                  </tr>
                ))
              )}
              {(!loading && (!details || details.length === 0)) && (
                <tr><td className="py-4 text-gray-500" colSpan={4}>Nessun dettaglio disponibile</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// Component: Top Ranking (Agenti)
function TopRanking({ year, month }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const qp = new URLSearchParams();
        if (Number.isFinite(month)) qp.set('month', String(month));
        if (Number.isFinite(year)) qp.set('year', String(year));
        const url = `/supermaster/classifica-agenti${qp.toString() ? `?${qp.toString()}` : ''}`;
        const data = await getProtectedData(url);
        if (!mounted) return;
        setRows(Array.isArray(data) ? data.slice(0, 10) : []);
        setError('');
      } catch (e) {
        console.error('[SuperMaster][RANKING] Fetch error:', e);
        setError('Impossibile caricare la classifica agenti');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [year, month]);

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold text-gray-800">Top Agenti (mese corrente)</h3>
        {loading && <span className="text-xs text-gray-400">Caricamento…</span>}
      </div>
      {error && <div className="text-xs text-red-600 mb-2">{error}</div>}
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="text-left text-gray-500">
            <tr>
              <th className="py-2 pr-3">Agente</th>
              <th className="py-2 pr-3">Dealer totali</th>
              <th className="py-2 pr-3">Dealer ingaggiati</th>
              <th className="py-2 pr-3">Attivazioni</th>
              <th className="py-2 pr-3">Media/Dealer</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => (
              <tr key={idx} className="border-t border-gray-100">
                <td className="py-2 pr-3 font-medium text-gray-800">{r.Agente || r.agente || '—'}</td>
                <td className="py-2 pr-3">{r.DealerTotali ?? r.dealer_totali ?? '0'}</td>
                <td className="py-2 pr-3">{r.DealerIngaggiati ?? r.dealer_ingaggiati ?? '0'}</td>
                <td className="py-2 pr-3">{r.TotaleAttivazioni ?? r.totale_attivazioni ?? '0'}</td>
                <td className="py-2 pr-3">{(r.MediaAttivazioniPerDealer ?? r.media_attivazioni_per_dealer ?? 0).toFixed ? (r.MediaAttivazioniPerDealer ?? r.media_attivazioni_per_dealer ?? 0).toFixed(2) : (r.MediaAttivazioniPerDealer ?? r.media_attivazioni_per_dealer ?? 0)}</td>
              </tr>
            ))}
            {(!rows || rows.length === 0) && !loading && (
              <tr>
                <td className="py-4 text-gray-500" colSpan={5}>Nessun dato disponibile per il mese corrente.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Component: Ultime Attivazioni (sintesi)
function RecentActivationsSM() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const data = await getProtectedData('/supermaster/attivazioni');
        if (!mounted) return;
        setRows(Array.isArray(data) ? data.slice(0, 10) : (Array.isArray(data?.rows) ? data.rows.slice(0, 10) : []));
        setError('');
      } catch (e) {
        console.error('[SuperMaster][ATTIVAZIONI] Fetch error:', e);
        setError('Impossibile caricare le attivazioni');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold text-gray-800">Ultime attivazioni (mese corrente)</h3>
        {loading && <span className="text-xs text-gray-400">Caricamento…</span>}
      </div>
      {error && <div className="text-xs text-red-600 mb-2">{error}</div>}
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="text-left text-gray-500">
            <tr>
              <th className="py-2 pr-3">Data</th>
              <th className="py-2 pr-3">Tipo</th>
              <th className="py-2 pr-3">Dealer</th>
              <th className="py-2 pr-3">Agente</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => {
              const data = r.DataOra || r.Data || r.created_at || r.dataInserimento || '';
              const tipo = r.Tipo || r.source || r.Operatore || r.operatore || '—';
              const dealer = r.Dealer || r.NomeDealer || r.dealer || r.nomeDealer || '—';
              const agente = r.Agente || r.agente || '—';
              return (
                <tr key={idx} className="border-top border-gray-100">
                  <td className="py-2 pr-3">{String(data).slice(0, 10)}</td>
                  <td className="py-2 pr-3">{tipo}</td>
                  <td className="py-2 pr-3">{dealer}</td>
                  <td className="py-2 pr-3">{agente}</td>
                </tr>
              );
            })}
            {(!rows || rows.length === 0) && !loading && (
              <tr>
                <td className="py-4 text-gray-500" colSpan={4}>Nessuna attivazione trovata per il mese corrente.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function SuperMasterDashboard() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  // Guardia locale: impedisce accesso se non autenticato o ruolo errato
  useEffect(() => {
    const token = getToken();
    const role = (user?.role || '').toString().trim().toLowerCase().replace(/[^a-z]/g, '');
    try {
      console.log('[SM Guard] token?', !!token, 'role:', role, 'path:', window?.location?.pathname);
    } catch {}
    if (!token) {
      navigate('/login', { replace: true });
      return;
    }
    // Se l'utente è AGENTE (impersonate), instrada alla dashboard agente
    if (role === 'agente' || role === 'agent') {
      navigate('/agente', { replace: true });
      return;
    }
    // Solo SuperMaster/Admin restano in questa dashboard
    if (role && role !== 'supermaster' && role !== 'admin') {
      navigate('/unauthorized', { replace: true });
      return;
    }
  }, [user]);

  // Normalizza pathname alle 4 sezioni supportate
  const path = (location.pathname || '').toLowerCase();
  const section = path.includes('/strumenti')
    ? 'strumenti'
    : path.includes('/incentivi')
    ? 'incentivi'
    : path.includes('/geolocalizzazione')
    ? 'geo'
    : path.includes('/analisi')
    ? 'analisi'
    : path.includes('/reports')
    ? 'reports'
    : 'home';

  // Log diagnostico per capire la sezione attiva
  useEffect(() => {
    try { console.log('[SM] pathname:', location.pathname, '-> section:', section); } catch {}
  }, [location.pathname, section]);

  return (
    <div className="min-h-screen bg-gray-50">
      <SuperMasterTopbar />
      {section === 'home' && <SuperMasterHome />}
      {section === 'incentivi' && <SuperMasterIncentivi />}
      {section === 'strumenti' && <Strumenti />}
      {section === 'geo' && <SuperMasterGeo />}
      {section === 'analisi' && <AnalisiSuperMasterPage embed />}
      {section === 'reports' && <ReportCenter />}
    </div>
  );
}
