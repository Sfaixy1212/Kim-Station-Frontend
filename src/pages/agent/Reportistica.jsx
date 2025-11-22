import { useEffect, useMemo, useState } from 'react';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { useAuth } from '../../contexts/AuthContext';
import { getProtectedData } from '../../services/api';
import toast from 'react-hot-toast';

export default function Reportistica() {
  const { user } = useAuth();
  const currentYear = new Date().getFullYear();
  
  const [year, setYear] = useState(currentYear);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState({ fastweb: {}, sky: {}, sim: {} });
  
  // Filtro dealer
  const [dealerQuery, setDealerQuery] = useState('');
  const [dealer, setDealer] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [lastUpdates, setLastUpdates] = useState({ tlc: null, energy: null });

  // Carica le ultime date di aggiornamento
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await getProtectedData('/agente/reportistica/last-updates');
        const d = res?.data?.data || res?.data || {};
        if (!active) return;
        setLastUpdates({ tlc: d.tlc || null, energy: d.energy || null });
      } catch (e) {
        console.warn('[Reportistica] last-updates errore:', e?.message);
      }
    })();
    return () => { active = false; };
  }, []);

  // Funzione per rilevare se i dati sono pre o post settembre 2025
  const detectPeriodType = (dealers) => {
    if (!dealers || dealers.length === 0) return 'new'; // Default: nuove offerte
    
    // Controlla se ci sono valori nelle colonne "nuove" (Start/Pro/Ultra)
    const hasNewOffers = dealers.some(d => 
      (d.FissoStart > 0 || d.FissoPro > 0 || d.FissoUltra > 0 ||
       d.MobileStart > 0 || d.MobilePro > 0 || d.MobileUltra > 0)
    );
    
    // Controlla se ci sono valori nelle colonne "vecchie" (Light/Casa/Business/Mobile/Full/Maxi)
    const hasOldOffers = dealers.some(d => 
      (d.FissoLight > 0 || d.FissoCasa > 0 || d.FissoBusiness > 0 ||
       d.MobileMobile > 0 || d.MobileFull > 0 || d.MobileMaxi > 0)
    );
    
    // Se ci sono entrambi, mostra entrambi i set di colonne
    if (hasNewOffers && hasOldOffers) return 'mixed';
    // Se ci sono solo vecchie offerte
    if (hasOldOffers) return 'old';
    // Default: nuove offerte
    return 'new';
  };

  // Carica dati dalla nuova API V3
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        
        const params = new URLSearchParams({ year: String(year) });
        if (dealer && dealer.trim()) {
          params.set('dealer', dealer.trim());
        }
        
        const url = `/agente/reportistica/v3?${params.toString()}`;
        console.log('[Reportistica] Chiamando API:', url);
        
        const res = await getProtectedData(url);
        const payload = res?.data || {};
        
        if (active) {
          // Applica filtro >= settembre 2025 SOLO a Fastweb
          const fastweb = payload.fastweb || { totale: {}, dealers: [] };
          const sky = payload.sky || { totale: {}, dealers: [] };
          const sim = payload.sim || { aggregated: {}, details: [] };
          
          setData({
            fastweb: {
              totale: fastweb.totale,
              dealers: fastweb.dealers || [] // Nessun filtro temporale
            },
            sky: {
              totale: sky.totale,
              dealers: sky.dealers || []
            },
            sim: {
              aggregated: sim.aggregated,
              details: sim.details || []
            }
          });
          console.log('[Reportistica] Dati caricati:', payload);
        }
      } catch (e) {
        console.error('[Reportistica] Errore:', e);
        if (active) {
          setError(e.message || 'Errore nel caricamento');
          toast.error('Errore nel caricamento dati');
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [year, dealer]);

  // Suggerimenti dealer basati sui dati Fastweb caricati
  const dealerSuggestions = useMemo(() => {
    const q = (dealerQuery || '').trim().toLowerCase();
    if (!q || q.length < 2) return [];
    
    const dealers = data.fastweb?.dealers || [];
    const names = dealers
      .map(d => d.Point || '')
      .filter(Boolean);
    
    const seen = new Set();
    const matches = [];
    for (const name of names) {
      const norm = name.trim();
      const key = norm.toUpperCase();
      if (seen.has(key)) continue;
      if (norm.toLowerCase().includes(q)) {
        seen.add(key);
        matches.push(norm);
      }
      if (matches.length >= 15) break;
    }
    return matches;
  }, [dealerQuery, data.fastweb]);

  // KPI dalla riga TOTALE
  const kpiTotals = useMemo(() => {
    const fw = data.fastweb?.totale || {};
    const sk = data.sky?.totale || {};
    const simDetails = data.sim?.details || [];
    
    // Per le SIM, prendi solo l'ultimo mese disponibile
    let simFW = 0;
    let simUNO = 0;
    
    if (simDetails.length > 0) {
      // Ordina per mese decrescente e prendi solo l'ultimo mese
      const sortedSim = [...simDetails].sort((a, b) => 
        (b.AnnoMese || '').localeCompare(a.AnnoMese || '')
      );
      const lastMonth = sortedSim[0]?.AnnoMese;
      
      // Filtra solo le SIM dell'ultimo mese
      const lastMonthSim = sortedSim.filter(s => s.AnnoMese === lastMonth);
      
      lastMonthSim.forEach(s => {
        if (s.SIMTYPE === 'FW_SIM') {
          simFW += Number(s.SIM_Vendute || 0);
        } else if (s.SIMTYPE === 'UNO_SIM') {
          simUNO += Number(s.SIM_Vendute || 0);
        }
      });
    }
    
    return {
      fissi: Number(fw.FISSI || 0),
      mobili: Number(fw.MOBILI || 0),
      mobileRA: Number(fw.MobileRA || 0),
      percentRA: Number(fw.MobilePercentRA || 0),
      energy: Number(fw.ENERGY || 0),
      skyTotale: Number(sk.SKY_TOTALE || 0),
      simFW: simFW,
      simUNO: simUNO,
      simTotale: simFW + simUNO
    };
  }, [data]);

  return (
    <DashboardLayout title="Reportistica V3">
      <div className="space-y-4 mt-4">
        {/* Badge Ultimo Aggiornamento */}
        <div className="bg-white rounded-xl p-3 border border-gray-100 flex items-center justify-between">
          <div className="text-sm text-gray-700 font-semibold">Reportistica Agente (Nuova Versione)</div>
          <div className="flex items-center gap-2">
            <Badge label="Ultimo Aggiornamento TLC" value={formatItDate(lastUpdates.tlc)} color="blue" />
            <Badge label="Ultimo aggiornamento ENERGY" value={formatItDate(lastUpdates.energy)} color="emerald" />
          </div>
        </div>

        {/* Filtri */}
        <div className="bg-white rounded-xl p-4 border border-gray-100">
          <div className="flex items-center gap-3 flex-wrap">
            {/* Anno */}
            <div>
              <label className="block text-xs text-gray-600 mb-1">Anno</label>
              <select 
                value={year} 
                onChange={(e) => setYear(Number(e.target.value))}
                className="rounded-lg border-gray-300 focus:border-blue-500 focus:ring-blue-500 text-sm"
              >
                {[currentYear, currentYear - 1, currentYear - 2].map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>

            {/* Filtro Dealer */}
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input 
                  type="radio" 
                  name="dealerFilter" 
                  checked={!dealer} 
                  onChange={() => {
                    setDealer('');
                    setDealerQuery('');
                    setShowSuggestions(false);
                  }}
                  className="text-blue-600"
                />
                TUTTI
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input 
                  type="radio" 
                  name="dealerFilter" 
                  checked={!!dealer} 
                  onChange={() => {}}
                  className="text-blue-600"
                />
                Dealer specifico
              </label>
            </div>

            {/* Autocomplete Dealer */}
            <div className="relative">
              <label className="block text-xs text-gray-600 mb-1">Ragione Sociale</label>
              <input
                value={dealerQuery}
                onChange={(e) => {
                  setDealerQuery(e.target.value);
                  setDealer('');
                  setShowSuggestions(true);
                }}
                onFocus={() => setShowSuggestions(true)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && dealerSuggestions.length > 0) {
                    const chosen = dealerSuggestions[0];
                    setDealerQuery(chosen);
                    setDealer(chosen);
                    setShowSuggestions(false);
                    e.preventDefault();
                  }
                }}
                placeholder="Ragione Sociale"
                className="rounded-lg border-gray-300 focus:border-blue-500 focus:ring-blue-500 text-sm w-64"
              />
              {/* Dropdown suggerimenti */}
              {showSuggestions && dealerSuggestions.length > 0 && (
                <div className="absolute z-10 mt-1 w-64 max-h-56 overflow-auto rounded-lg border border-gray-200 bg-white shadow">
                  {dealerSuggestions.map((name) => (
                    <button
                      type="button"
                      key={name}
                      onClick={() => {
                        setDealerQuery(name);
                        setDealer(name);
                        setShowSuggestions(false);
                      }}
                      className="block w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                    >
                      {name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {loading && <div className="text-sm text-gray-500">Caricamento…</div>}
            {error && <div className="text-sm text-red-600">{error}</div>}
          </div>
        </div>

        {/* Card KPI Riepilogative */}
        {!dealer && (
          <section className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
            <KpiTile label="Fissi" value={kpiTotals.fissi} />
            <KpiTile label="Mobili" value={kpiTotals.mobili} />
            <KpiTile label="Mobile RA" value={kpiTotals.mobileRA} />
            <KpiTile label="% RA" value={`${kpiTotals.percentRA.toFixed(1)}%`} />
            <KpiTile label="Energy" value={kpiTotals.energy} />
            <KpiTile label="Sky" value={kpiTotals.skyTotale} />
            <KpiTile label="SIM FW" value={kpiTotals.simFW} />
            <KpiTile label="SIM Totali" value={kpiTotals.simTotale} />
          </section>
        )}

        {/* Tabella Fastweb */}
        <section className="bg-white rounded-xl p-4 border border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">📊 Dettaglio Fastweb</h3>
          <div className="overflow-auto max-h-[500px]">
            <FastwebTable dealers={data.fastweb?.dealers || []} />
          </div>
        </section>

        {/* Tabella Sky */}
        {!dealer && data.sky?.dealers?.length > 0 && (
          <section className="bg-white rounded-xl p-4 border border-gray-100">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">📺 Dettaglio Sky</h3>
            <div className="overflow-auto max-h-[400px]">
              <SkyTable dealers={data.sky?.dealers || []} />
            </div>
          </section>
        )}

        {/* Tabella SIM Vendute */}
        {!dealer && data.sim?.details?.length > 0 && (
          <section className="bg-white rounded-xl p-4 border border-gray-100">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">
              📱 SIM Vendute (Ultimo Mese: {(() => {
                const sorted = [...(data.sim?.details || [])].sort((a, b) => 
                  (b.AnnoMese || '').localeCompare(a.AnnoMese || '')
                );
                return sorted[0]?.AnnoMese || '-';
              })()})
            </h3>
            <div className="overflow-auto">
              <SimTable details={data.sim?.details || []} />
            </div>
          </section>
        )}
      </div>
    </DashboardLayout>
  );
}

// Componente Tabella Fastweb con colonne dinamiche
function FastwebTable({ dealers }) {
  if (dealers.length === 0) {
    return <div className="text-center py-8 text-gray-500">Nessun dato disponibile</div>;
  }

  // Rileva il tipo di periodo (old/new/mixed)
  const periodType = useMemo(() => {
    const hasNewOffers = dealers.some(d => 
      (d.FissoStart > 0 || d.FissoPro > 0 || d.FissoUltra > 0 ||
       d.MobileStart > 0 || d.MobilePro > 0 || d.MobileUltra > 0)
    );
    const hasOldOffers = dealers.some(d => 
      (d.FissoLight > 0 || d.FissoCasa > 0 || d.FissoBusiness > 0 ||
       d.MobileMobile > 0 || d.MobileFull > 0 || d.MobileMaxi > 0)
    );
    if (hasNewOffers && hasOldOffers) return 'mixed';
    if (hasOldOffers) return 'old';
    return 'new';
  }, [dealers]);

  const showNewColumns = periodType === 'new' || periodType === 'mixed';
  const showOldColumns = periodType === 'old' || periodType === 'mixed';

  return (
    <table className="min-w-full text-sm">
      <thead className="bg-gray-50 text-gray-700 sticky top-0 z-10">
        <tr>
          <Th>Point</Th>
          <Th>Mese</Th>
          <Th>FISSI</Th>
          {showNewColumns && <><Th>Start</Th><Th>Pro</Th><Th>Ultra</Th></>}
          {showOldColumns && <><Th>Light</Th><Th>Casa</Th><Th>Business</Th></>}
          <Th>MOBILI</Th>
          {showNewColumns && <><Th>Start</Th><Th>Pro</Th><Th>Ultra</Th></>}
          {showOldColumns && <><Th>Mobile</Th><Th>Full</Th><Th>Maxi</Th></>}
          <Th>RA</Th>
          <Th>% RA</Th>
          <Th>RES</Th>
          <Th>BUS</Th>
          <Th>Conv RES</Th>
          <Th>Conv BUS</Th>
          <Th>ENERGY</Th>
          <Th>Core</Th>
          <Th>Flex</Th>
          <Th>Fix</Th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100">
        {dealers.map((d, i) => (
          <tr key={i} className="odd:bg-white even:bg-gray-50 hover:bg-blue-50">
            <Td>{d.Point}</Td>
            <Td>{d.AnnoMese}</Td>
            <Td><strong>{d.FISSI || 0}</strong></Td>
            {showNewColumns && (
              <>
                <Td>{d.FissoStart || 0}</Td>
                <Td>{d.FissoPro || 0}</Td>
                <Td>{d.FissoUltra || 0}</Td>
              </>
            )}
            {showOldColumns && (
              <>
                <Td>{d.FissoLight || 0}</Td>
                <Td>{d.FissoCasa || 0}</Td>
                <Td>{d.FissoBusiness || 0}</Td>
              </>
            )}
            <Td><strong>{d.MOBILI || 0}</strong></Td>
            {showNewColumns && (
              <>
                <Td>{d.MobileStart || 0}</Td>
                <Td>{d.MobilePro || 0}</Td>
                <Td>{d.MobileUltra || 0}</Td>
              </>
            )}
            {showOldColumns && (
              <>
                <Td>{d.MobileMobile || 0}</Td>
                <Td>{d.MobileFull || 0}</Td>
                <Td>{d.MobileMaxi || 0}</Td>
              </>
            )}
            <Td className="font-semibold text-blue-600">{d.MobileRA || 0}</Td>
            <Td>{(d.MobilePercentRA || 0).toFixed(1)}%</Td>
            <Td>{d['MOBILI RES'] || 0}</Td>
            <Td>{d['MOBILI BUS'] || 0}</Td>
            <Td>{d['di cui CONV_RES'] || 0}</Td>
            <Td>{d['di cui CONV_BUS'] || 0}</Td>
            <Td><strong>{d.ENERGY || 0}</strong></Td>
            <Td>{d.EnergyCore || 0}</Td>
            <Td>{d.EnergyFlex || 0}</Td>
            <Td>{d.EnergyFix || 0}</Td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// Componente Tabella Sky
function SkyTable({ dealers }) {
  if (dealers.length === 0) {
    return <div className="text-center py-8 text-gray-500">Nessun dato Sky disponibile</div>;
  }

  return (
    <table className="min-w-full text-sm">
      <thead className="bg-gray-50 text-gray-700 sticky top-0">
        <tr>
          <Th>Point</Th>
          <Th>Mese</Th>
          <Th>TV Only</Th>
          <Th>Triple Play</Th>
          <Th>WiFi RES</Th>
          <Th>Sky Glass</Th>
          <Th>4P</Th>
          <Th>Prova Sky</Th>
          <Th>Mobile</Th>
          <Th>WiFi BUS</Th>
          <Th>B&B BUS</Th>
          <Th>BAR BUS</Th>
          <Th>TOTALE</Th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100">
        {dealers.map((d, i) => (
          <tr key={i} className="odd:bg-white even:bg-gray-50 hover:bg-purple-50">
            <Td>{d.Point}</Td>
            <Td>{d.Mese}</Td>
            <Td>{d.TV_ONLY || 0}</Td>
            <Td>{d.TRIPLE_PLAY || 0}</Td>
            <Td>{d.WIFI_RESIDENZIALE || 0}</Td>
            <Td>{d.SKY_GLASS || 0}</Td>
            <Td>{d['4P'] || 0}</Td>
            <Td>{d['PROVA SKY'] || 0}</Td>
            <Td>{d.MOBILE || 0}</Td>
            <Td>{d.WIFI_BUSINESS || 0}</Td>
            <Td>{d['B&B BUS'] || 0}</Td>
            <Td>{d['BAR BUS'] || 0}</Td>
            <Td><strong>{d.SKY_TOTALE || 0}</strong></Td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// Componente Tabella SIM
function SimTable({ details }) {
  if (details.length === 0) {
    return <div className="text-center py-8 text-gray-500">Nessuna SIM venduta</div>;
  }

  // Calcola i totali solo per l'ultimo mese
  const sortedSim = [...details].sort((a, b) => 
    (b.AnnoMese || '').localeCompare(a.AnnoMese || '')
  );
  const lastMonth = sortedSim[0]?.AnnoMese;
  const lastMonthSim = sortedSim.filter(s => s.AnnoMese === lastMonth);
  
  let simFW = 0;
  let simUNO = 0;
  lastMonthSim.forEach(s => {
    if (s.SIMTYPE === 'FW_SIM') {
      simFW += Number(s.SIM_Vendute || 0);
    } else if (s.SIMTYPE === 'UNO_SIM') {
      simUNO += Number(s.SIM_Vendute || 0);
    }
  });

  return (
    <div className="space-y-4">
      {/* Riepilogo ultimo mese */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
          <div className="text-xs text-blue-600 font-medium">FW SIM</div>
          <div className="text-2xl font-bold text-blue-900">{simFW}</div>
        </div>
        <div className="bg-green-50 rounded-lg p-3 border border-green-200">
          <div className="text-xs text-green-600 font-medium">UNO SIM</div>
          <div className="text-2xl font-bold text-green-900">{simUNO}</div>
        </div>
        <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
          <div className="text-xs text-gray-600 font-medium">TOTALE</div>
          <div className="text-2xl font-bold text-gray-900">{simFW + simUNO}</div>
        </div>
      </div>

      {/* Dettaglio per mese */}
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50 text-gray-700">
          <tr>
            <Th>Mese</Th>
            <Th>Tipologia</Th>
            <Th>Quantità</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {details.map((s, i) => (
            <tr key={i} className="odd:bg-white even:bg-gray-50">
              <Td>{s.AnnoMese}</Td>
              <Td>
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                  s.SIMTYPE === 'FW_SIM' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'
                }`}>
                  {s.SIMTYPE}
                </span>
              </Td>
              <Td><strong>{s.SIM_Vendute || 0}</strong></Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Componenti helper
function KpiTile({ label, value }) {
  return (
    <div className="bg-white rounded-xl p-3 border border-gray-100">
      <div className="text-xs text-gray-600">{label}</div>
      <div className="text-xl font-bold text-gray-900">{value ?? '-'}</div>
    </div>
  );
}

function Th({ children }) {
  return <th className="px-3 py-2 text-left text-xs font-semibold whitespace-nowrap">{children}</th>;
}

function Td({ children, className = '' }) {
  return <td className={`px-3 py-2 whitespace-nowrap ${className}`}>{children}</td>;
}

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
  } catch {
    return '-';
  }
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
