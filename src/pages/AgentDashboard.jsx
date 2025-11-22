import { useEffect, useState, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import DashboardLayout from '../components/layout/DashboardLayout';
import StatsCard from '../components/common/StatsCard';
import NewsCard from '../components/common/NewsCard';
import CompensationCard from '../components/agent/CompensationCard';
import MonthlyTrend from '../components/dealer/MonthlyTrend';
import AgendaFAB from '../components/agent/AgendaFAB';
import { getProtectedData } from '../services/api';

// Componente per le 3 card Obiettivi & Compensi
function ObiettiviCards() {
  const now = new Date();
  const [year] = useState(now.getFullYear());
  const [month] = useState(now.getMonth() + 1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        setLoading(true);
        const res = await getProtectedData(`/agente/obiettivi-compensi-v2?year=${year}&month=${month}`);
        if (active) setData(res);
      } catch (e) {
        console.error('Errore fetch obiettivi:', e);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [year, month]);

  const cards = useMemo(() => {
    if (!data?.targetsDetailed) return [];
    const td = data.targetsDetailed;
    const prog = data.progressi || {};
    
    const buildProg = (act, tgt) => {
      if (!tgt) return { actual: act || 0, target: 0, percent: 0 };
      const pct = Math.round((act / tgt) * 100);
      return { actual: act || 0, target: tgt, percent: pct };
    };

    const fissiTotale = td.fissi?.totale || 0;
    const mobileTotale = td.mobili?.totale || 0;
    const energyTotale = td.energy?.totale || 0;
    
    // Calcola totali attivati per percentuali sul mix
    const fissiTotAttivati = (prog.fissiStart || 0) + (prog.fissiPro || 0) + (prog.fissiUltra || 0);
    const mobiliTotAttivati = (prog.mobileStart || 0) + (prog.mobilePro || 0) + (prog.mobileUltra || 0);
    const energyTotAttivati = (prog.energyCore || 0) + (prog.energyFlex || 0) + (prog.energyFix || 0) + (prog.energyEni || 0);
    
    const calcPercent = (val, total) => total > 0 ? Math.round((val / total) * 100) : 0;
    
    return [
      {
        title: 'FISSI',
        summary: buildProg(prog.fissiAttuali, fissiTotale),
        details: [
          { label: 'Start', actual: prog.fissiStart || 0, percent: calcPercent(prog.fissiStart, fissiTotAttivati), showTarget: false },
          { label: 'Pro', actual: prog.fissiPro || 0, percent: calcPercent(prog.fissiPro, fissiTotAttivati), showTarget: false },
          { label: 'Ultra', actual: prog.fissiUltra || 0, percent: calcPercent(prog.fissiUltra, fissiTotAttivati), showTarget: false },
        ].filter(d => d.actual > 0)
      },
      {
        title: 'MOBILI',
        summary: buildProg(prog.mobileAttuali, mobileTotale),
        details: [
          { label: 'Start', actual: prog.mobileStart || 0, percent: calcPercent(prog.mobileStart, mobiliTotAttivati), showTarget: false },
          { label: 'Pro', actual: prog.mobilePro || 0, percent: calcPercent(prog.mobilePro, mobiliTotAttivati), showTarget: false },
          { label: 'Ultra', actual: prog.mobileUltra || 0, percent: calcPercent(prog.mobileUltra, mobiliTotAttivati), showTarget: false },
          { label: '% RA', actual: prog.mobilePercentRA || 0, unit: '%', showTarget: false, isRAPercentage: true },
          { label: 'Convergenze', actual: prog.convergenzaRES || 0, percent: calcPercent(prog.convergenzaRES, mobiliTotAttivati), showTarget: false },
        ].filter(d => d.isRAPercentage || d.actual > 0)
      },
      {
        title: 'ENERGY',
        summary: buildProg(prog.energyAttuali, energyTotale),
        details: [
          { label: 'Core', actual: prog.energyCore || 0, percent: calcPercent(prog.energyCore, energyTotAttivati), showTarget: false },
          { label: 'Flex', actual: prog.energyFlex || 0, percent: calcPercent(prog.energyFlex, energyTotAttivati), showTarget: false },
          { label: 'Fix', actual: prog.energyFix || 0, percent: calcPercent(prog.energyFix, energyTotAttivati), showTarget: false },
          { label: 'ENI', actual: prog.energyEni || 0, percent: calcPercent(prog.energyEni, energyTotAttivati), showTarget: false },
          { label: '% FW', actual: prog.energyPercentFastweb || 0, unit: '%', showTarget: false, isRAPercentage: true },
        ].filter(d => d.isRAPercentage || d.actual > 0)
      },
    ];
  }, [data]);

  if (loading) return <div className="text-sm text-gray-500">Caricamento obiettivi...</div>;
  if (!cards.length) return <div className="text-sm text-gray-500">Nessun obiettivo disponibile</div>;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {cards.map((card) => (
        <ObjectiveCard key={card.title} {...card} />
      ))}
    </div>
  );
}

function ObjectiveCard({ title, summary, details }) {
  const pct = summary?.percent ?? 0;
  const color = pct >= 100 ? 'text-emerald-600' : pct >= 75 ? 'text-amber-600' : pct >= 50 ? 'text-orange-500' : 'text-rose-500';
  const barColor = pct >= 100 ? 'bg-emerald-500' : pct >= 75 ? 'bg-amber-500' : pct >= 50 ? 'bg-orange-400' : 'bg-rose-500';
  
  return (
    <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
        <span className={`text-2xl font-bold ${color}`}>{pct}%</span>
      </div>
      <div className="mb-4">
        <div className="flex justify-between text-sm mb-2">
          <span className="text-gray-600">Target: {summary?.target || 0} attivazioni</span>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div className={`h-2 ${barColor}`} style={{ width: `${Math.min(pct, 100)}%` }} />
        </div>
        <div className="mt-2 text-sm text-gray-600">
          {summary?.actual || 0} / {summary?.target || 0} attivazioni
        </div>
      </div>
      {details && details.length > 0 && (
        <div className="space-y-2 pt-4 border-t border-gray-100">
          {details.map((d, i) => (
            <div key={i} className="flex justify-between items-center text-xs">
              <span className="text-gray-600">{d.label}</span>
              <div className="flex items-center gap-2">
                <span className={`font-medium ${d.isRAPercentage ? (d.actual >= 50 ? 'text-emerald-600' : 'text-rose-600') : ''}`}>
                  {d.showTarget === false 
                    ? `${d.actual || 0} ${d.unit || 'attivazioni'}`
                    : `${d.actual || 0} / ${d.target || 0} ${d.unit || ''}`
                  }
                </span>
                {d.showTarget === false && !d.isRAPercentage && d.percent != null && d.percent > 0 && (
                  <span className="text-[10px] text-gray-400">({d.percent}%)</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AgentDashboard() {
  const [attivazioniOggi, setAttivazioniOggi] = useState(null);
  const [ordiniAttesa, setOrdiniAttesa] = useState(null);
  const [dealerAttivi, setDealerAttivi] = useState(null);
  const { user } = useAuth();

  useEffect(() => {
    let mounted = true;
    async function loadData() {
      try {
        const year = new Date().getFullYear();
        const month = new Date().getMonth() + 1;
        // Prende il nome agente dal token decodificato (agentenome) con fallback a name
        const agente = encodeURIComponent((user?.agentenome || user?.name || '').toString());
        const [a, o, r] = await Promise.all([
          getProtectedData('/agente/attivazioni-oggi'),
          getProtectedData('/agente/ordini-attesa-pagamento-count'),
          getProtectedData(`/agente/reportistica?year=${year}&month=${month}${agente ? `&agente=${agente}` : ''}`)
        ]);
        if (!mounted) return;
        setAttivazioniOggi(a?.totale ?? 0);
        setOrdiniAttesa(o?.totale ?? 0);
        const kpiCard = r?.data?.kpi_card?.[0];
        setDealerAttivi(kpiCard?.dealer_ingaggiati ?? 0);
      } catch (err) {
        console.error('[AgentDashboard] Errore caricamento KPI:', err);
        if (mounted) {
          setAttivazioniOggi(0);
          setOrdiniAttesa(0);
          setDealerAttivi(0);
        }
      }
    }
    loadData();
    return () => { mounted = false; };
  }, [user?.agentenome, user?.name]);

  const statsData = [
    // Sostituita la prima card con NewsCard
    { title: 'Ordini in Attesa di pagamento', value: ordiniAttesa ?? '—', subtitle: 'Stato ordini = 0', icon: '📦', trend: 'neutral', trendValue: '', color: 'orange' },
    { title: 'Dealer Attivi', value: dealerAttivi ?? '—', subtitle: 'Dealer ingaggiati (mese corrente)', icon: '👥', trend: 'neutral', trendValue: '', color: 'purple' },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-4">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* News per Agente (sostituisce Attivazioni Oggi) */}
          <NewsCard scope="agente" agente={(user?.agentenome || user?.name || '').toString()} title="News" maxItems={3} />

          {/* Statistiche principali per Agente (restanti) */}
          {statsData
            .filter((s) => s.title !== 'Fatturato Mensile')
            .map((stat, index) => (
              <StatsCard
                key={index}
                title={stat.title}
                value={String(stat.value)}
                subtitle={stat.subtitle}
                icon={stat.icon}
                trend={stat.trend}
                trendValue={stat.trendValue}
                color={stat.color}
              />
            ))}
        </div>

        {/* Card Obiettivi & Compensi */}
        <ObiettiviCards />

        {/* Sezioni principali */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {/* Compensi del Mese */}
          <CompensationCard />

          {/* Andamento Mensile */}
          <MonthlyTrend />
        </div>

        {/* Rimosso widget/modale Plafond per Agenti */}
      </div>

      {/* FAB Agenda Visite */}
      <AgendaFAB />
    </DashboardLayout>
  );
}
