import { useEffect, useMemo, useState } from 'react';
import { NavLink, useSearchParams } from 'react-router-dom';
import SuperMasterTopbar from '../../components/supermaster/Topbar';
import Card from '../../components/common/Card';
import { apiCall, getProtectedData } from '../../services/api';
import toast from 'react-hot-toast';

function MonthInput({ label, value, onChange }) {
  return (
    <div>
      <label className="block text-base font-semibold text-gray-700 dark:text-gray-300 mb-2">{label}</label>
      <input type="month" value={value} onChange={(e)=>onChange(e.target.value)} className="border dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 rounded-md px-4 py-3 text-base w-full" />
    </div>
  );
}

function useDebounced(value, delay=300) {
  const [v, setV] = useState(value);
  useEffect(()=>{
    const id = setTimeout(()=> setV(value), delay);
    return ()=> clearTimeout(id);
  }, [value, delay]);
  return v;
}

export default function DealerTrend() {
  const [sp, setSp] = useSearchParams();
  const [query, setQuery] = useState('');
  const [suggest, setSuggest] = useState([]);
  const [loadingSuggest, setLoadingSuggest] = useState(false);
  const [dealer, setDealer] = useState(null);
  const [openSuggest, setOpenSuggest] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [from, setFrom] = useState(sp.get('from') || (()=>{
    const d = new Date(); d.setMonth(d.getMonth()-11); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
  })());
  const [to, setTo] = useState(sp.get('to') || (()=>{
    const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
  })());
  const [trend, setTrend] = useState(null);
  const [loadingTrend, setLoadingTrend] = useState(false);

  const debounced = useDebounced(query, 300);

  // Cerca dealers (senza scremare: endpoint supermaster prende tutti)
  useEffect(()=>{
    const run = async() => {
      const q = debounced.trim();
      if (q.length < 2) { setSuggest([]); setOpenSuggest(false); return; }
      setLoadingSuggest(true);
      try {
        const res = await getProtectedData(`/supermaster/dealers/search?q=${encodeURIComponent(q)}`);
        const results = Array.isArray(res)
          ? res
          : Array.isArray(res?.results)
            ? res.results
            : Array.isArray(res?.rows)
              ? res.rows
              : [];
        setSuggest(results);
        setOpenSuggest(results.length > 0);
        setActiveIdx(results.length ? 0 : -1);
      } catch (e) {
        console.error('[SM][DEALER SEARCH][ERR]', e);
        setOpenSuggest(false);
      } finally {
        setLoadingSuggest(false);
      }
    };
    run();
  }, [debounced]);

  const handlePick = (d) => {
    setDealer(d);
    setQuery(d?.RagioneSociale || d?.name || '');
    setSuggest([]);
    setOpenSuggest(false);
    setActiveIdx(-1);
  };

  const onKeyDown = (e) => {
    if (!openSuggest || !suggest.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => (i + 1) % suggest.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => (i - 1 + suggest.length) % suggest.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const sel = suggest[Math.max(0, activeIdx)];
      if (sel) handlePick(sel);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpenSuggest(false);
    }
  };

  const runTrend = async () => {
    const id = dealer?.IDDealer || dealer?.DealerID || dealer?.id;
    if (!id) { toast.error('Seleziona un dealer'); return; }
    setLoadingTrend(true);
    setTrend(null);
    const loadingId = toast.loading('Calcolo andamento mensile…');
    try {
      // Endpoint consolidato (v1 che restituisce schema v2)
      const url = `/supermaster/dealers/${encodeURIComponent(id)}/trend?from=${from}&to=${to}`;
      const res = await getProtectedData(url);
      setTrend(res);
      // Aggiorna querystring
      setSp({ dealerId: id, from, to }, { replace: true });
    } catch (e) {
      console.error('[SM][DEALER TREND][ERR]', e);
      toast.error(e?.message || 'Endpoint v2 non disponibile: contatta admin per deploy backend');
    } finally {
      toast.dismiss(loadingId);
      setLoadingTrend(false);
    }
  };

  const months = useMemo(()=>{
    if (!Array.isArray(trend?.months)) return [];
    return trend.months;
  }, [trend]);

  const formatMeseAnno = (m) => {
    const itMonths = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
    const label = (m?.mese_label || m?.month || '').toString();
    if (/[A-Za-zÀ-ÿ]/.test(label)) {
      // Se contiene testo (es. "Ottobre-2024"), sostituisci '-' con '/'
      return label.replace('-', '/');
    }
    const anno = m?.anno ?? m?.Year;
    const meseNum = m?.mese ?? m?.Month;
    if (anno && meseNum) {
      const idx = Math.max(1, Number(meseNum)) - 1;
      const name = itMonths[idx] || String(meseNum).padStart(2, '0');
      return `${name}/${anno}`;
    }
    return label || '';
  };

  return (
    <>
      <SuperMasterTopbar />
      <div className="w-full px-4 sm:px-6 lg:px-8 py-6">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Andamento Dealer</h1>
          <p className="text-sm text-gray-500">Ricerca un dealer e visualizza l'andamento mensile su un intervallo di mesi.</p>
        </div>
        <NavLink to="/supermaster" className="px-3 py-2 text-sm rounded-md bg-gray-100 hover:bg-gray-200 text-gray-700">Torna a SuperMaster</NavLink>
      </div>

      <Card title="Cerca dealer" subtitle="Inserisci almeno 2 caratteri. Nessun filtro: sono inclusi tutti i dealer." className="py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="relative">
            <label className="block text-base font-semibold text-gray-700 dark:text-gray-300 mb-2">Dealer</label>
            <input
              value={query}
              onChange={(e)=>{ setQuery(e.target.value); if (!e.target.value) { setDealer(null); setOpenSuggest(false);} else { setOpenSuggest(true);} }}
              onFocus={()=>{ if (suggest.length) setOpenSuggest(true); }}
              onBlur={()=>{ setTimeout(()=> setOpenSuggest(false), 150); }}
              onKeyDown={onKeyDown}
              placeholder="Cerca per Ragione Sociale, P.IVA, Nome/Cognome Agente, ecc."
              className="w-full border dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 rounded-md px-4 py-3 text-base"
            />
            {loadingSuggest && (
              <div className="absolute right-2 top-9 text-xs text-gray-500">Ricerca…</div>
            )}
            {openSuggest && query.trim().length >= 2 && !loadingSuggest && (
              <div className="absolute z-[60] mt-1 bg-white dark:bg-gray-800 border dark:border-gray-700 rounded w-full max-h-96 overflow-auto shadow-lg">
                {suggest.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">Nessun dealer trovato</div>
                ) : (
                  suggest.map((d, idx)=> (
                    <button
                      key={d.IDDealer || d.id}
                      type="button"
                      className={`w-full text-left px-3 py-2 text-sm border-b border-gray-100 dark:border-gray-700 last:border-b-0 ${idx===activeIdx ? 'bg-blue-50 dark:bg-blue-900/30' : 'hover:bg-gray-50 dark:hover:bg-gray-700'}`}
                      onMouseEnter={()=> setActiveIdx(idx)}
                      onMouseDown={(e)=> e.preventDefault()}
                      onClick={()=>handlePick(d)}
                    >
                      <div className="font-medium text-gray-900 dark:text-gray-100">{d.RagioneSociale || d.name}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">ID: {d.IDDealer || d.DealerID || d.id} {d.PartitaIVA ? `• PIVA ${d.PartitaIVA}` : ''}</div>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
          <MonthInput label="Da (YYYY-MM)" value={from} onChange={setFrom} />
          <MonthInput label="A (YYYY-MM)" value={to} onChange={setTo} />
        </div>
        <div className="mt-8 flex items-center gap-3">
          <button type="button" onClick={runTrend} disabled={loadingTrend || !dealer} className={`px-6 py-3 rounded-md text-white text-base font-medium ${loadingTrend ? 'bg-gray-400' : 'bg-blue-600 hover:bg-blue-700'}`}>{loadingTrend ? 'Elaborazione…' : 'Vedi andamento'}</button>
          <button type="button" onClick={()=>{ setDealer(null); setQuery(''); setTrend(null); }} className="px-5 py-3 text-base font-medium rounded-md bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300">Reset</button>
        </div>
      </Card>

      {trend && (
        <div className="mt-6 grid grid-cols-1 gap-6">
          <Card title="Andamento mensile" subtitle="Valori aggregati per mese (vista analisi_supermaster_dealer)">
            {!months.length ? (
              <div className="text-sm text-gray-500">Nessun dato per l'intervallo selezionato.</div>
            ) : (
              <div className="overflow-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-600">
                      <th className="py-2 pr-4">Mese</th>
                      <th className="py-2 pr-4">TLC FISSO SHP</th>
                      <th className="py-2 pr-4">TLC MOBILE SHP</th>
                      <th className="py-2 pr-4">TLC FISSO RES</th>
                      <th className="py-2 pr-4">TLC MOBILE RES</th>
                      <th className="py-2 pr-4">TLC MOBILE RES RIC.AUTO</th>
                      <th className="py-2 pr-4">TLC MOBILE RES RIC.PURA</th>
                      <th className="py-2 pr-4">ENERGIA</th>
                      <th className="py-2 pr-4">SKY WIFI</th>
                      <th className="py-2 pr-4">PROVA SKY</th>
                      <th className="py-2 pr-4">SKY GLASS</th>
                      <th className="py-2 pr-4">SKY 3P</th>
                      <th className="py-2 pr-4">SKYTV_ONLY</th>
                    </tr>
                  </thead>
                  <tbody>
                    {months.map((m)=> (
                       <tr key={m.month || m.mese_label || `${m.anno}-${m.mese}`} className="border-t">
                        <td className="py-2 pr-4 font-medium">{formatMeseAnno(m)}</td>
                        <td className="py-2 pr-4">{m.tlc_fisso_shp ?? 0}</td>
                        <td className="py-2 pr-4">{m.tlc_mobile_shp ?? 0}</td>
                        <td className="py-2 pr-4">{m.tlc_fisso_res ?? 0}</td>
                        <td className="py-2 pr-4">{m.tlc_mobile_res ?? 0}</td>
                        <td className="py-2 pr-4">{m.tlc_mobile_res_ric_auto ?? 0}</td>
                        <td className="py-2 pr-4">{m.tlc_mobile_res_ric_pura ?? 0}</td>
                        <td className="py-2 pr-4">{m.energia ?? 0}</td>
                        <td className="py-2 pr-4">{m.sky_wifi ?? 0}</td>
                        <td className="py-2 pr-4">{m.prova_sky ?? 0}</td>
                        <td className="py-2 pr-4">{m.sky_glass ?? 0}</td>
                        <td className="py-2 pr-4">{m.sky_triple_play ?? 0}</td>
                        <td className="py-2 pr-4">{m.skytv_only ?? 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}
      </div>
    </>
  );
}
