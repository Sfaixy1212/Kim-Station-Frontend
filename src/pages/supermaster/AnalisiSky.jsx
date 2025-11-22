import { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend as RechartsLegend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import toast from 'react-hot-toast';
import SuperMasterTopbar from '../../components/supermaster/Topbar';
import Card from '../../components/common/Card';
import { getSkyQualityRanking, getSkyQualityTrend } from '../../services/api';

const SCOPE_OPTIONS = [
  { value: 'DEALER', label: 'Dealer' },
  { value: 'AGENTE', label: 'Agenti' }
];

const MONTHS_BACK_OPTIONS = [
  { value: 3, label: 'Ultimi 3 mesi' },
  { value: 6, label: 'Ultimi 6 mesi' },
  { value: 9, label: 'Ultimi 9 mesi' },
  { value: 12, label: 'Ultimi 12 mesi' }
];

const formatInt = (value) => new Intl.NumberFormat('it-IT', { maximumFractionDigits: 0 }).format(Number(value || 0));
const formatDecimal = (value) => new Intl.NumberFormat('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value || 0));
const formatMonthLabel = (isoDate) => {
  const date = new Date(isoDate);
  return date.toLocaleDateString('it-IT', { month: 'short', year: 'numeric' });
};
const formatDateTime = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' }) +
    ' ' + date.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
};

const defaultPeriod = () => {
  const today = new Date();
  const prev = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  return { year: prev.getFullYear(), month: prev.getMonth() + 1 };
};

const AGENT_COLORS = [
  '#2563EB', '#10B981', '#F97316', '#8B5CF6', '#EF4444', '#0EA5E9', '#14B8A6', '#F59E0B'
];

export default function AnalisiSky() {
  const [scope, setScope] = useState('DEALER');
  const [{ year, month }, setPeriod] = useState(defaultPeriod);
  const [monthsBack, setMonthsBack] = useState(6);
  const [loadingRanking, setLoadingRanking] = useState(false);
  const [loadingTrend, setLoadingTrend] = useState(false);
  const [rows, setRows] = useState([]);
  const [trendRows, setTrendRows] = useState([]);
  const [error, setError] = useState('');
  const [trendError, setTrendError] = useState('');

  const summary = useMemo(() => {
    if (!rows.length) {
      return {
        totAttivazioni: 0,
        business: 0,
        res: 0,
        punteggioTotale: 0,
        simSky: 0,
        lastOrderDate: null
      };
    }

    return rows.reduce((acc, r) => {
      const tot = Number(r.TotAttivazioni || 0);
      const business = Number(r.AttivazioniBusiness || 0);
      const res = Number(r.AttivazioniRes || 0);
      const score = Number(r.PunteggioTotale || 0);
      const sims = Number(r.SimSkyVendute || 0);
      const last = r.LastOrderDate ? new Date(r.LastOrderDate) : null;

      acc.totAttivazioni += tot;
      acc.business += business;
      acc.res += res;
      acc.punteggioTotale += score;
      acc.simSky += sims;
      if (last && !Number.isNaN(last.getTime())) {
        if (!acc.lastOrderDate || last > acc.lastOrderDate) acc.lastOrderDate = last;
      }
      return acc;
    }, {
      totAttivazioni: 0,
      business: 0,
      res: 0,
      punteggioTotale: 0,
      simSky: 0,
      lastOrderDate: null
    });
  }, [rows]);

  const loadRanking = async () => {
    try {
      setLoadingRanking(true);
      setError('');
      const data = await getSkyQualityRanking({ scope, year, month });
      setRows(data?.rows || []);
    } catch (err) {
      console.error('[AnalisiSky] loadRanking error:', err);
      const message = err?.message || 'Errore durante il caricamento del ranking SKY';
      setError(message);
      toast.error(message);
      setRows([]);
    } finally {
      setLoadingRanking(false);
    }
  };

  const loadTrend = async () => {
    try {
      setLoadingTrend(true);
      setTrendError('');
      const data = await getSkyQualityTrend({ scope, monthsBack });
      setTrendRows(data?.rows || []);
    } catch (err) {
      console.error('[AnalisiSky] loadTrend error:', err);
      const message = err?.message || 'Errore durante il caricamento del trend SKY';
      setTrendError(message);
      toast.error(message);
      setTrendRows([]);
    } finally {
      setLoadingTrend(false);
    }
  };

  useEffect(() => {
    loadRanking();
  }, [scope, year, month]);

  useEffect(() => {
    loadTrend();
  }, [scope, monthsBack]);

  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => Number(b.PunteggioTotale || 0) - Number(a.PunteggioTotale || 0));
  }, [rows]);

  const compositionData = useMemo(() => {
    return sortedRows.slice(0, 10).map(row => ({
      name: row.EntityName,
      business: Number(row.AttivazioniBusiness || 0),
      res: Number(row.AttivazioniRes || 0)
    }));
  }, [sortedRows]);

  const typeDistribution = useMemo(() => {
    return sortedRows.reduce((acc, row) => {
      acc.skyGlass += Number(row.SkyGlass || 0);
      acc.triplePlay += Number(row.TriplePlay || 0);
      acc.tvOnly += Number(row.TvOnly || 0);
      acc.wifiBusiness += Number(row.WifiBusiness || 0);
      acc.wifiRes += Number(row.WifiRes || 0);
      acc.mobile += Number(row.Mobile || 0);
      acc.barBus += Number(row.BarBus || 0);
      acc.bbus += Number(row.BBus || 0);
      acc.prova += Number(row.ProvaSky || 0);
      return acc;
    }, {
      skyGlass: 0,
      triplePlay: 0,
      tvOnly: 0,
      wifiBusiness: 0,
      wifiRes: 0,
      mobile: 0,
      barBus: 0,
      bbus: 0,
      prova: 0
    });
  }, [sortedRows]);

  const typeChartData = useMemo(() => ([
    { type: 'Sky Glass', value: typeDistribution.skyGlass },
    { type: 'Triple Play', value: typeDistribution.triplePlay },
    { type: 'TV Only', value: typeDistribution.tvOnly },
    { type: 'WiFi Business', value: typeDistribution.wifiBusiness },
    { type: 'WiFi Res', value: typeDistribution.wifiRes },
    { type: 'Mobile', value: typeDistribution.mobile },
    { type: 'Bar Bus', value: typeDistribution.barBus },
    { type: 'B&B Bus', value: typeDistribution.bbus },
    { type: 'Prova Sky', value: typeDistribution.prova }
  ].filter(item => item.value > 0)), [typeDistribution]);

  const trendChartConfig = useMemo(() => {
    if (!trendRows.length) {
      return { type: scope === 'DEALER' ? 'dealer' : 'agent', chartData: [], series: [] };
    }

    if (scope === 'DEALER') {
      const ordered = [...trendRows]
        .filter(r => r.EntityId === 'DEALER:ALL')
        .sort((a, b) => new Date(a.MonthStart) - new Date(b.MonthStart));

      const chartData = ordered.map(row => ({
        label: formatMonthLabel(row.MonthStart),
        monthStart: row.MonthStart,
        attivazioni: Number(row.TotAttivazioni || 0),
        punteggio: Number(row.PunteggioTotale || 0),
        sim: Number(row.SimSkyVendute || 0)
      }));

      return {
        type: 'dealer',
        chartData,
        series: [{ key: 'punteggio', name: 'Punteggio totale' }]
      };
    }

    // scope AGENTE: crea line chart per top agenti per punteggio
    const totalsByAgent = trendRows.reduce((acc, row) => {
      const key = row.EntityName;
      acc.set(key, (acc.get(key) || 0) + Number(row.PunteggioTotale || 0));
      return acc;
    }, new Map());

    const topAgents = [...totalsByAgent.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name]) => name);

    const orderedMonths = [...new Set(trendRows.map(r => r.MonthStart))]
      .sort((a, b) => new Date(a) - new Date(b));

    const chartData = orderedMonths.map(monthKey => {
      const base = { label: formatMonthLabel(monthKey), monthStart: monthKey };
      topAgents.forEach(agent => {
        base[agent] = 0;
      });
      return base;
    });

    trendRows.forEach(row => {
      if (!topAgents.includes(row.EntityName)) return;
      const monthIdx = orderedMonths.indexOf(row.MonthStart);
      if (monthIdx === -1) return;
      chartData[monthIdx][row.EntityName] = Number(row.PunteggioTotale || 0);
    });

    const series = topAgents.map((agent, index) => ({
      key: agent,
      name: agent,
      color: AGENT_COLORS[index % AGENT_COLORS.length]
    }));

    return { type: 'agent', chartData, series };
  }, [trendRows, scope]);

  const periodDate = new Date((year || new Date().getFullYear()), ((month || 1) - 1), 1);
  const periodLabel = periodDate.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });

  return (
    <div className="min-h-screen bg-gray-50">
      <SuperMasterTopbar />
      <main className="px-4 sm:px-6 lg:px-8 py-6">
        <div className="max-w-7xl mx-auto space-y-6">
          <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">Analisi SKY</h1>
              <p className="text-sm text-gray-500">Ranking e trend delle attivazioni SKY per rete SuperMaster.</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <select
                value={scope}
                onChange={(event) => setScope(event.target.value)}
                className="text-sm border-gray-300 rounded-md px-3 py-2 bg-white shadow-sm focus:ring-blue-500 focus:border-blue-500"
              >
                {SCOPE_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <select
                value={month}
                onChange={(event) => setPeriod(prev => ({ ...prev, month: Number(event.target.value) }))}
                className="text-sm border-gray-300 rounded-md px-3 py-2 bg-white shadow-sm focus:ring-blue-500 focus:border-blue-500"
              >
                {Array.from({ length: 12 }, (_, idx) => idx + 1).map(value => (
                  <option key={value} value={value}>{new Date(2000, value - 1, 1).toLocaleDateString('it-IT', { month: 'long' })}</option>
                ))}
              </select>
              <select
                value={year}
                onChange={(event) => setPeriod(prev => ({ ...prev, year: Number(event.target.value) }))}
                className="text-sm border-gray-300 rounded-md px-3 py-2 bg-white shadow-sm focus:ring-blue-500 focus:border-blue-500"
              >
                {Array.from({ length: 4 }, (_, idx) => {
                  const currentYear = new Date().getFullYear();
                  const value = currentYear - idx;
                  return <option key={value} value={value}>{value}</option>;
                })}
              </select>
              <select
                value={monthsBack}
                onChange={(event) => setMonthsBack(Number(event.target.value))}
                className="text-sm border-gray-300 rounded-md px-3 py-2 bg-white shadow-sm focus:ring-blue-500 focus:border-blue-500"
              >
                {MONTHS_BACK_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <button
                onClick={() => { loadRanking(); loadTrend(); }}
                className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md border border-gray-300 bg-white shadow-sm hover:bg-gray-50"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-4.99m0 0l-3.535 3.535A9 9 0 104.5 19.5" />
                </svg>
                Aggiorna
              </button>
            </div>
          </header>

          <section>
            <div className="mb-4">
              <span className="text-xs uppercase tracking-wide text-gray-500">Periodo</span>
              <div className="text-lg font-medium text-gray-900">{periodLabel}</div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <Card className="bg-white">
                <div className="text-xs uppercase text-gray-500">Totale attivazioni</div>
                <div className="text-2xl font-semibold text-gray-900 mt-1">{formatInt(summary.totAttivazioni)}</div>
              </Card>
              <Card className="bg-white">
                <div className="text-xs uppercase text-gray-500">Business (SHP)</div>
                <div className="text-2xl font-semibold text-gray-900 mt-1">{formatInt(summary.business)}</div>
              </Card>
              <Card className="bg-white">
                <div className="text-xs uppercase text-gray-500">Residenziale (RES)</div>
                <div className="text-2xl font-semibold text-gray-900 mt-1">{formatInt(summary.res)}</div>
              </Card>
              <Card className="bg-white">
                <div className="text-xs uppercase text-gray-500">Punteggio totale</div>
                <div className="text-2xl font-semibold text-gray-900 mt-1">{formatDecimal(summary.punteggioTotale)}</div>
              </Card>
              <Card className="bg-white">
                <div className="text-xs uppercase text-gray-500">SIM SKY vendute</div>
                <div className="text-2xl font-semibold text-gray-900 mt-1">{formatInt(summary.simSky)}</div>
              </Card>
              <Card className="bg-white">
                <div className="text-xs uppercase text-gray-500">Ultima attivazione</div>
                <div className="text-base font-medium text-gray-900 mt-1">{formatDateTime(summary.lastOrderDate)}</div>
              </Card>
            </div>

            <Card title="Legenda punteggi SKY" className="mt-6">
              <div className="space-y-3 text-sm text-gray-600">
                <p>Punteggio calcolato sommando il valore assegnato a ciascuna tipologia di offerta attiva nel periodo:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li><strong>Sky Glass</strong>: 5 punti</li>
                  <li><strong>Triple Play</strong>: 4 punti</li>
                  <li><strong>TV Only</strong>: 3 punti</li>
                  <li><strong>WiFi Business / Res</strong>: 7 punti</li>
                  <li><strong>Mobile</strong>: 2 punti</li>
                  <li><strong>Bar / B&B Business</strong>: 10 punti</li>
                  <li><strong>Prova Sky</strong>: 0 punti</li>
                </ul>
                <p className="text-xs text-gray-500">Le SIM SKY vendute derivano dal pacchetto dedicato (`idOfferta = 148`, 5 SIM per ordine) conteggiato su `tbOrdiniProdotti`.</p>
              </div>
            </Card>
          </section>

          <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <Card title="Mix Business vs Res" subtitle={`Top 10 ${scope === 'DEALER' ? 'dealer' : 'agenti'} per punteggio`} className="h-full">
              {compositionData.length ? (
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={compositionData} margin={{ top: 16, right: 24, left: 0, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-35} textAnchor="end" height={80} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                      <Tooltip formatter={(value, key) => [formatInt(value), key === 'business' ? 'Business' : 'Res']} />
                      <RechartsLegend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="business" stackId="mix" fill="#1D4ED8" radius={[4, 4, 0, 0]} name="Business" />
                      <Bar dataKey="res" stackId="mix" fill="#16A34A" radius={[4, 4, 0, 0]} name="Res" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="text-sm text-gray-500">Nessun dato disponibile per il grafico.</p>
              )}
            </Card>

            <Card title="Distribuzione tipologie" subtitle="Somma attivazioni per categoria" className="h-full">
              {typeChartData.length ? (
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={typeChartData} margin={{ top: 16, right: 24, left: 0, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                      <XAxis dataKey="type" tick={{ fontSize: 11 }} interval={0} angle={-30} textAnchor="end" height={70} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                      <Tooltip formatter={(value) => [formatInt(value), 'Attivazioni']} />
                      <Bar dataKey="value" fill="#6366F1" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="text-sm text-gray-500">Nessuna attivazione nel periodo selezionato.</p>
              )}
            </Card>
          </section>

          <section className="bg-white shadow-sm border border-gray-200 rounded-xl">
            <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Trend multi-mese</h2>
                <p className="text-xs text-gray-500">Analisi temporale degli ultimi {monthsBack} mesi completati.</p>
              </div>
              {loadingTrend && (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <div className="h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  Caricamento trend...
                </div>
              )}
            </div>
            <div className="p-4">
              {trendError && (
                <p className="text-sm text-rose-600">{trendError}</p>
              )}
              {!trendError && !trendChartConfig.chartData.length && !loadingTrend && (
                <p className="text-sm text-gray-500">Nessun dato disponibile per il trend nel periodo selezionato.</p>
              )}
              {!trendError && trendChartConfig.type === 'dealer' && trendChartConfig.chartData.length > 0 && (
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={trendChartConfig.chartData} margin={{ top: 16, right: 24, left: 0, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                      <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                      <YAxis yAxisId="left" allowDecimals={false} tick={{ fontSize: 12 }} />
                      <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} />
                      <Tooltip
                        formatter={(value, key) => {
                          if (key === 'attivazioni') return [formatInt(value), 'Attivazioni'];
                          if (key === 'sim') return [formatInt(value), 'SIM SKY'];
                          return [formatDecimal(value), 'Punteggio'];
                        }}
                      />
                      <RechartsLegend wrapperStyle={{ fontSize: 12 }} />
                      <Bar yAxisId="left" dataKey="attivazioni" barSize={28} fill="#22C55E" radius={[4, 4, 0, 0]} name="Attivazioni" />
                      <Bar yAxisId="left" dataKey="sim" barSize={20} fill="#0EA5E9" radius={[4, 4, 0, 0]} name="SIM SKY" />
                      <Line yAxisId="right" type="monotone" dataKey="punteggio" stroke="#EF4444" strokeWidth={2} dot={{ r: 3 }} name="Punteggio" />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              )}
              {!trendError && trendChartConfig.type === 'agent' && trendChartConfig.chartData.length > 0 && (
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={trendChartConfig.chartData} margin={{ top: 16, right: 24, left: 0, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                      <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                      <Tooltip formatter={(value) => [formatDecimal(value), 'Punteggio']} />
                      <RechartsLegend wrapperStyle={{ fontSize: 12 }} />
                      {trendChartConfig.series.map(series => (
                        <Line
                          key={series.key}
                          type="monotone"
                          dataKey={series.key}
                          name={series.name}
                          stroke={series.color}
                          strokeWidth={2}
                          dot={{ r: 3 }}
                          connectNulls
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </section>

          <section className="bg-white shadow-sm border border-gray-200 rounded-xl">
            <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Classifica {scope === 'DEALER' ? 'dealer' : 'agenti'}</h2>
                <p className="text-xs text-gray-500">Ordine per punteggio totale con dettaglio tipologia e SIM vendute.</p>
              </div>
              {loadingRanking && (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <div className="h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  Caricamento...
                </div>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold">#</th>
                    <th className="px-4 py-3 text-left font-semibold">{scope === 'DEALER' ? 'Dealer' : 'Agente'}</th>
                    <th className="px-4 py-3 text-right font-semibold">Tot</th>
                    <th className="px-4 py-3 text-right font-semibold">Business</th>
                    <th className="px-4 py-3 text-right font-semibold">Res</th>
                    <th className="px-4 py-3 text-right font-semibold">Glass</th>
                    <th className="px-4 py-3 text-right font-semibold">Triple</th>
                    <th className="px-4 py-3 text-right font-semibold">WiFi BUS</th>
                    <th className="px-4 py-3 text-right font-semibold">WiFi RES</th>
                    <th className="px-4 py-3 text-right font-semibold">Mobile</th>
                    <th className="px-4 py-3 text-right font-semibold">Bar BUS</th>
                    <th className="px-4 py-3 text-right font-semibold">B&B BUS</th>
                    <th className="px-4 py-3 text-right font-semibold">Prova</th>
                    <th className="px-4 py-3 text-right font-semibold">SIM</th>
                    <th className="px-4 py-3 text-right font-semibold">Punteggio</th>
                    <th className="px-4 py-3 text-left font-semibold">Ultimo ordine</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {error && (
                    <tr>
                      <td colSpan={16} className="px-4 py-6 text-center text-sm text-rose-600">{error}</td>
                    </tr>
                  )}
                  {!error && !loadingRanking && sortedRows.length === 0 && (
                    <tr>
                      <td colSpan={16} className="px-4 py-6 text-center text-sm text-gray-500">Nessun dato disponibile per il periodo selezionato.</td>
                    </tr>
                  )}
                  {!error && sortedRows.map((row, index) => (
                    <tr key={`${row.EntityId}-${index}`} className={index === 0 ? 'bg-yellow-50/60' : ''}>
                      <td className="px-4 py-3 text-xs font-semibold text-gray-500">{index + 1}</td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{row.EntityName}</td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-900">{formatInt(row.TotAttivazioni)}</td>
                      <td className="px-4 py-3 text-right text-gray-700">{formatInt(row.AttivazioniBusiness)}</td>
                      <td className="px-4 py-3 text-right text-gray-700">{formatInt(row.AttivazioniRes)}</td>
                      <td className="px-4 py-3 text-right text-gray-700">{formatInt(row.SkyGlass)}</td>
                      <td className="px-4 py-3 text-right text-gray-700">{formatInt(row.TriplePlay)}</td>
                      <td className="px-4 py-3 text-right text-gray-700">{formatInt(row.WifiBusiness)}</td>
                      <td className="px-4 py-3 text-right text-gray-700">{formatInt(row.WifiRes)}</td>
                      <td className="px-4 py-3 text-right text-gray-700">{formatInt(row.Mobile)}</td>
                      <td className="px-4 py-3 text-right text-gray-700">{formatInt(row.BarBus)}</td>
                      <td className="px-4 py-3 text-right text-gray-700">{formatInt(row.BBus)}</td>
                      <td className="px-4 py-3 text-right text-gray-700">{formatInt(row.ProvaSky)}</td>
                      <td className="px-4 py-3 text-right text-gray-700">{formatInt(row.SimSkyVendute)}</td>
                      <td className="px-4 py-3 text-right text-blue-700 font-semibold">{formatDecimal(row.PunteggioTotale)}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{formatDateTime(row.LastOrderDate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
