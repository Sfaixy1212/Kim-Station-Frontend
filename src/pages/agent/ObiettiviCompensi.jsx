import { useEffect, useMemo, useState } from 'react';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { getProtectedData } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';

// Utils
const monthNames = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const pctColor = (p) => (p >= 100 ? 'bg-green-500' : p >= 80 ? 'bg-amber-500' : p >= 50 ? 'bg-orange-500' : 'bg-blue-500');
const formatEuro = (v) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(Number(v||0));
const formatInt = (v) => new Intl.NumberFormat('it-IT', { maximumFractionDigits: 0 }).format(Number(v || 0));
const formatPercent = (v) => `${new Intl.NumberFormat('it-IT', { maximumFractionDigits: 2 }).format(Number(v || 0))}%`;

function Progress({ percent = 0, colorClass }) {
  const pct = clamp(Math.round(Number(percent) || 0), 0, 100);
  const color = colorClass || pctColor(pct);
  return (
    <div className="w-full">
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-2 ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-1 text-xs text-gray-600">{pct}%</div>
    </div>
  );
}

function ObjectiveCard({ title, summary, units = 'attivazioni', details = [] }) {
  const target = summary?.target ?? 0;
  const actual = summary?.actual ?? 0;
  const percent = summary?.target ? summary.percent : null;
  const missing = summary?.target ? Math.max(summary.target - actual, 0) : null;
  const percentLabel = percent != null ? `${percent}%` : '—';
  const percentColor = percent == null
    ? 'text-gray-400'
    : percent >= 100
      ? 'text-emerald-600'
      : percent >= 75
        ? 'text-amber-600'
        : percent >= 50
          ? 'text-orange-500'
          : 'text-rose-500';
  const barColor = percent == null
    ? 'bg-gray-300'
    : percent >= 100
      ? 'bg-emerald-500'
      : percent >= 75
        ? 'bg-amber-500'
        : percent >= 50
          ? 'bg-orange-400'
          : 'bg-rose-500';

  let status;
  if (!summary?.target) {
    status = { text: 'Nessun target impostato', color: 'text-gray-400' };
  } else if (percent >= 100) {
    status = { text: 'Obiettivo raggiunto!', color: 'text-emerald-600' };
  } else if (percent >= 75) {
    status = { text: 'Quasi al traguardo', color: 'text-amber-600' };
  } else {
    status = { text: 'Serve più impegno', color: 'text-rose-500' };
  }

  return (
    <div className="border border-gray-200 rounded-xl bg-white/90 p-4 shadow-sm flex flex-col gap-3">
      <div className="flex items-start justify-between">
        <div className="text-sm font-semibold uppercase tracking-wide text-gray-700">{title}</div>
        <div className={`text-sm font-semibold ${percentColor}`}>{percentLabel}</div>
      </div>

      <div className="text-sm text-gray-700">
        {summary?.target
          ? `${formatInt(actual)} / ${formatInt(target)} ${units}`
          : `Target: ${formatInt(target)} ${units}`}
      </div>
      {missing != null && summary?.target ? (
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>Mancano:</span>
          <span className="font-medium text-gray-700">{formatInt(missing)} {units}</span>
        </div>
      ) : null}

      <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
        <div
          className={`h-1.5 rounded-full transition-all ${barColor}`}
          style={{ width: `${summary?.target ? Math.min(summary.percent, 100) : 0}%` }}
        />
      </div>

      <div className={`text-xs font-medium ${status.color}`}>{status.text}</div>

      {details?.length ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-1">
          {details.map(({ label, target: detailTarget = 0, actual: detailActual = 0, hint, unit = units, showTarget = true, isRAPercentage = false, percent: mixPercent }) => {
            const hasTarget = showTarget && detailTarget > 0;
            const pct = hasTarget ? clamp(Math.round((detailActual / detailTarget) * 100), 0, 999) : null;
            const pctLabel = pct != null ? `${pct}%` : '—';
            
            // Per % RA: verde se >= 50%, altrimenti rosso
            const barClass = isRAPercentage
              ? (detailActual >= 50 ? 'bg-emerald-500' : 'bg-rose-500')
              : pct == null
                ? 'bg-gray-300'
                : pct >= 100
                  ? 'bg-emerald-500'
                  : pct >= 75
                    ? 'bg-amber-500'
                    : pct >= 50
                      ? 'bg-orange-400'
                      : 'bg-sky-500';
            
            return (
              <div key={label} className="rounded-lg border border-gray-100 bg-white px-3 py-2">
                <div className="flex items-center justify-between text-[11px] font-medium text-gray-500 uppercase tracking-wide">
                  <span>{label}</span>
                  {/* Per % RA non mostriamo la percentuale calcolata */}
                  {hasTarget && !isRAPercentage && <span className="text-gray-400">{pctLabel}</span>}
                </div>
                <div className="text-sm font-semibold mt-1 flex items-center gap-2">
                  <span className={isRAPercentage ? (detailActual >= 50 ? 'text-emerald-600' : 'text-rose-600') : 'text-gray-900'}>
                    {hasTarget 
                      ? `${formatInt(detailActual)} / ${formatInt(detailTarget)} ${unit}`
                      : `${formatInt(detailActual)} ${unit}`
                    }
                  </span>
                  {/* Mostra percentuale sul mix attivato (tranne per % RA) */}
                  {!isRAPercentage && mixPercent != null && mixPercent > 0 && (
                    <span className="text-[10px] font-normal text-gray-500">({mixPercent}%)</span>
                  )}
                </div>
                {hasTarget && (
                  <div className="mt-2 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                    <div
                      className={`h-1.5 rounded-full ${barClass}`}
                      style={{ width: `${isRAPercentage ? Math.min(detailActual * 2, 100) : Math.min(pct, 100)}%` }}
                    />
                  </div>
                )}
                {hint ? <div className="mt-1 text-[11px] text-gray-400">{hint}</div> : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export default function ObiettiviCompensi() {
  const { user } = useAuth();
  const role = (user?.role || '').toString().toLowerCase();
  const isAgent = role === 'agente' || role === 'agent';
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1); // 1..12
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null); // ObiettiviCompensiResponse
  const [add, setAdd] = useState({ ra: 0, energy: 0, fissi: 0 }); // what-if
  const [kpiData, setKpiData] = useState(null);
  const [kpiLoading, setKpiLoading] = useState(false);
  const [kpiError, setKpiError] = useState(null);
  const [compensiData, setCompensiData] = useState(null);
  const [compensiLoading, setCompensiLoading] = useState(false);

  const { objectiveCards, objectivesLastUpdate } = useMemo(() => {
    const detailed = data?.targetsDetailed || {};
    const fallback = data?.targets || {};
    const progressi = data?.progressi || {};

    const safeNumber = (value, backup = 0) => {
      const n = value ?? backup ?? 0;
      const parsed = Number(n);
      return Number.isFinite(parsed) ? parsed : 0;
    };

    const buildProgress = (actual, target, overrideActual) => {
      const actualVal = overrideActual != null ? Number(overrideActual) || 0 : Number(actual) || 0;
      const targetVal = Number(target) || 0;
      if (!targetVal && !actualVal) return null;
      const pct = targetVal ? clamp(Math.round((actualVal / targetVal) * 100), 0, 999) : 0;
      return {
        percent: pct,
        display: `${formatInt(actualVal)} / ${formatInt(targetVal || 0)}`,
        actual: actualVal,
        target: targetVal,
      };
    };

    const safeActual = (value) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : 0;
    };

    const eniReal = safeActual(kpiData?.eni_inseriti ?? progressi.energyEni);
    const energyTotalReal = safeActual((kpiData?.energia_inseriti ?? progressi.energyAttuali) + eniReal);

    const realActuals = {
      fissi: safeActual(kpiData?.tlc_fisso_inseriti ?? progressi.fissiAttuali),
      mobili: safeActual(kpiData?.tlc_mobile_inseriti ?? progressi.mobileAttuali),
      energy: energyTotalReal,
      energyEni: eniReal,
      simRa: safeActual(kpiData?.sim_ric_automatica ?? progressi.mobileRa),
    };
    const realPercentRA = realActuals.mobili > 0
      ? Math.round(((realActuals.simRa || 0) / realActuals.mobili) * 1000) / 10
      : safeActual(progressi.mobilePercentRA);

    const fissi = {
      totale: safeNumber(detailed?.fissi?.totale, fallback?.fissi?.goal ?? fallback?.TargetFissi),
      start: safeNumber(detailed?.fissi?.start),
      pro: safeNumber(detailed?.fissi?.pro),
      ultra: safeNumber(detailed?.fissi?.ultra),
      progressTotale: buildProgress(progressi.fissiAttuali, detailed?.fissi?.totale ?? fallback?.fissi?.goal ?? fallback?.TargetFissi, realActuals.fissi),
      progressStart: buildProgress(safeActual(progressi.fissiStart), detailed?.fissi?.start),
      progressPro: buildProgress(safeActual(progressi.fissiPro), detailed?.fissi?.pro),
      progressUltra: buildProgress(safeActual(progressi.fissiUltra), detailed?.fissi?.ultra),
    };

    const mobili = {
      totale: safeNumber(detailed?.mobili?.totale, fallback?.mobili?.goal ?? fallback?.ra?.goal ?? fallback?.TargetRA),
      start: safeNumber(detailed?.mobili?.start),
      pro: safeNumber(detailed?.mobili?.pro),
      ultra: safeNumber(detailed?.mobili?.ultra),
      percentRA: safeNumber(detailed?.mobili?.percentRA),
      convergenze: safeNumber(detailed?.mobili?.convergenze),
      progressTotale: buildProgress(progressi.mobileAttuali, detailed?.mobili?.totale ?? fallback?.mobili?.goal ?? fallback?.ra?.goal ?? fallback?.TargetRA, realActuals.mobili),
      progressConvergenze: buildProgress(progressi.convergenzaRES, detailed?.mobili?.convergenze),
      progressStart: buildProgress(safeActual(progressi.mobileStart), detailed?.mobili?.start),
      progressPro: buildProgress(safeActual(progressi.mobilePro), detailed?.mobili?.pro),
      progressUltra: buildProgress(safeActual(progressi.mobileUltra), detailed?.mobili?.ultra),
    };

    const energy = {
      totale: safeNumber(detailed?.energy?.totale, fallback?.energy?.goal ?? fallback?.TargetEnergy),
      core: safeNumber(detailed?.energy?.core),
      flex: safeNumber(detailed?.energy?.flex),
      fix: safeNumber(detailed?.energy?.fix),
      eni: safeNumber(detailed?.energy?.eni),
      percentFastweb: safeNumber(detailed?.energy?.percentFastweb),
      progressTotale: buildProgress(progressi.energyAttuali, detailed?.energy?.totale ?? fallback?.energy?.goal ?? fallback?.TargetEnergy, realActuals.energy),
      progressCore: buildProgress(safeActual(progressi.energyCore), detailed?.energy?.core),
      progressFlex: buildProgress(safeActual(progressi.energyFlex), detailed?.energy?.flex),
      progressFix: buildProgress(safeActual(progressi.energyFix), detailed?.energy?.fix),
      progressEni: buildProgress(safeActual(progressi.energyEni), detailed?.energy?.eni, realActuals.energyEni),
    };

    const calcPercent = (val, total) => total > 0 ? Math.round((val / total) * 100) : 0;
    
    const fissiTotTarget = fissi.totale;
    const mobileTotTarget = mobili.totale;
    const energyTotTarget = energy.totale;
    
    // Calcola totali attivati (non target) per le percentuali sul mix
    const fissiTotAttivati = (fissi.progressStart?.actual ?? 0) + (fissi.progressPro?.actual ?? 0) + (fissi.progressUltra?.actual ?? 0);
    const mobiliTotAttivati = (mobili.progressStart?.actual ?? 0) + (mobili.progressPro?.actual ?? 0) + (mobili.progressUltra?.actual ?? 0);
    const energyTotAttivati = (energy.progressCore?.actual ?? 0) + (energy.progressFlex?.actual ?? 0) + (energy.progressFix?.actual ?? 0);
    
    const cards = [
      {
        key: 'fissi',
        title: 'Fissi',
        summary: fissi.progressTotale,
        units: 'attivazioni',
        details: [
          { label: 'Start', actual: fissi.progressStart?.actual ?? 0, target: fissi.progressStart?.target ?? 0, percent: calcPercent(fissi.progressStart?.actual, fissiTotAttivati), showTarget: (fissi.progressStart?.target ?? 0) > 0 },
          { label: 'Pro', actual: fissi.progressPro?.actual ?? 0, target: fissi.progressPro?.target ?? 0, percent: calcPercent(fissi.progressPro?.actual, fissiTotAttivati), showTarget: (fissi.progressPro?.target ?? 0) > 0 },
          { label: 'Ultra', actual: fissi.progressUltra?.actual ?? 0, target: fissi.progressUltra?.target ?? 0, percent: calcPercent(fissi.progressUltra?.actual, fissiTotAttivati), showTarget: (fissi.progressUltra?.target ?? 0) > 0 },
        ].filter(d => d.actual > 0 || d.target > 0),
      },
      {
        key: 'mobili',
        title: 'Mobili',
        summary: mobili.progressTotale,
        units: 'attivazioni',
        details: [
          { label: 'Start', actual: mobili.progressStart?.actual ?? 0, target: mobili.progressStart?.target ?? 0, percent: calcPercent(mobili.progressStart?.actual, mobiliTotAttivati), showTarget: (mobili.progressStart?.target ?? 0) > 0 },
          { label: 'Pro', actual: mobili.progressPro?.actual ?? 0, target: mobili.progressPro?.target ?? 0, percent: calcPercent(mobili.progressPro?.actual, mobiliTotAttivati), showTarget: (mobili.progressPro?.target ?? 0) > 0 },
          { label: 'Ultra', actual: mobili.progressUltra?.actual ?? 0, target: mobili.progressUltra?.target ?? 0, percent: calcPercent(mobili.progressUltra?.actual, mobiliTotAttivati), showTarget: (mobili.progressUltra?.target ?? 0) > 0 },
          { label: '% RA', actual: realPercentRA ?? safeActual(progressi.mobilePercentRA), unit: '%', showTarget: false, isRAPercentage: true },
          { label: 'Convergenze', actual: mobili.progressConvergenze?.actual ?? 0, target: mobili.progressConvergenze?.target ?? 0, percent: calcPercent(mobili.progressConvergenze?.actual, mobiliTotAttivati), showTarget: (mobili.progressConvergenze?.target ?? 0) > 0 },
        ].filter(d => d.isRAPercentage || d.actual > 0 || d.target > 0),
      },
      {
        key: 'energy',
        title: 'Energy',
        summary: energy.progressTotale,
        units: 'attivazioni',
        details: [
          { label: 'Core (FW)', actual: energy.progressCore?.actual ?? 0, target: energy.progressCore?.target ?? 0, percent: calcPercent(energy.progressCore?.actual, energyTotAttivati), showTarget: (energy.progressCore?.target ?? 0) > 0 },
          { label: 'Flex (FW)', actual: energy.progressFlex?.actual ?? 0, target: energy.progressFlex?.target ?? 0, percent: calcPercent(energy.progressFlex?.actual, energyTotAttivati), showTarget: (energy.progressFlex?.target ?? 0) > 0 },
          { label: 'Fix (FW)', actual: energy.progressFix?.actual ?? 0, target: energy.progressFix?.target ?? 0, percent: calcPercent(energy.progressFix?.actual, energyTotAttivati), showTarget: (energy.progressFix?.target ?? 0) > 0 },
          { label: 'ENI', actual: energy.progressEni?.actual ?? 0, target: energy.progressEni?.target ?? 0, percent: calcPercent(energy.progressEni?.actual, energyTotAttivati), showTarget: (energy.progressEni?.target ?? 0) > 0 },
          { label: '% FW minima', actual: safeActual(progressi.energyPercentFastweb), unit: '%', showTarget: false, isRAPercentage: true, hint: energy.percentFastweb > 0 ? `Target: ${energy.percentFastweb}%` : null },
        ].filter(d => d.isRAPercentage || d.actual > 0 || d.target > 0),
      },
    ];

    const lastUpdate = detailed?.meta?.lastUpdate
      || detailed?.lastUpdate
      || fallback?.meta?.lastUpdate
      || fallback?.lastUpdate
      || data?.targetsLastUpdate;

    return { objectiveCards: cards, objectivesLastUpdate: lastUpdate };
  }, [data, kpiData]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await getProtectedData(`/agente/obiettivi-compensi-v2?year=${year}&month=${month}`);
        if (active) setData(res);
      } catch (e) {
        console.error('Errore fetch obiettivi agente:', e);
        if (active) setError(e?.message || 'Errore nel caricamento degli obiettivi');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [year, month]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        setKpiLoading(true);
        setKpiError(null);
        const params = new URLSearchParams({ year: String(year), month: String(month), operator: 'fastweb' });
        const res = await getProtectedData(`/agente/reportistica?${params.toString()}`);
        const root = res?.data || res || {};
        const payload = root?.data ?? root;
        const card = Array.isArray(payload?.kpi_card) ? payload.kpi_card[0] : null;
        if (active) setKpiData(card || null);
      } catch (e) {
        console.error('[Obiettivi][KPI]', e);
        if (active) {
          setKpiError(e?.message || 'Errore KPI agenti');
          setKpiData(null);
        }
      } finally {
        if (active) setKpiLoading(false);
      }
    })();
    return () => { active = false; };
  }, [year, month]);

  // Fetch compensi breakdown
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        setCompensiLoading(true);
        const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
        const res = await getProtectedData(`/agente/compensi?monthStart=${monthStart}`);
        if (active) setCompensiData(res || null);
      } catch (e) {
        console.error('[Obiettivi][Compensi]', e);
        if (active) setCompensiData(null);
      } finally {
        if (active) setCompensiLoading(false);
      }
    })();
    return () => { active = false; };
  }, [year, month]);

  return (
    <DashboardLayout title="Obiettivi & Compensi">
      <div className="rounded-2xl bg-white p-4 sm:p-6 shadow-sm mt-4">
        {/* Header + Period controls */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Obiettivi & Compensi</h1>
            <p className="text-sm text-gray-600">Periodo: {monthNames[month-1]} {year}</p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={month}
              onChange={(e) => {
                const m = parseInt(e.target.value, 10);
                // Evita mesi futuri
                const today = new Date();
                const future = (year > today.getFullYear()) || (year === today.getFullYear() && m > (today.getMonth()+1));
                if (future) return;
                setMonth(m);
              }}
              className="border rounded-md px-2 py-1 text-sm"
            >
              {monthNames.map((n, i) => (
                <option key={n} value={i+1}>{n}</option>
              ))}
            </select>
            <select
              value={year}
              onChange={(e) => {
                const y = parseInt(e.target.value, 10);
                const today = new Date();
                if (y > today.getFullYear()) return;
                // Se anno corrente e mese futuro -> correggi mese a corrente
                if (y === today.getFullYear() && month > (today.getMonth()+1)) setMonth(today.getMonth()+1);
                setYear(y);
              }}
              className="border rounded-md px-2 py-1 text-sm"
            >
              {Array.from({ length: 6 }).map((_, idx) => {
                const y = now.getFullYear() - idx;
                return <option key={y} value={y}>{y}</option>;
              })}
            </select>
          </div>
        </div>

        {/* Loading / Error states */}
        {loading && (<div className="py-8 text-sm text-gray-500">Caricamento…</div>)}
        {error && !loading && (<div className="py-8 text-sm text-red-600">{error}</div>)}

        {!loading && !error && (
          <>
            <section className="mb-8">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Obiettivi</h2>
                  {objectivesLastUpdate ? (
                    <p className="text-xs text-gray-500 mt-1">Ultimo aggiornamento: {new Date(objectivesLastUpdate).toLocaleString('it-IT')}</p>
                  ) : null}
                </div>
                <div className="text-xs text-gray-500">I target indicati sono impostati dall'Agenzia.</div>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {objectiveCards.map((group) => (
                  <ObjectiveCard
                    key={group.key}
                    title={group.title}
                    summary={group.summary}
                    units={group.units}
                    details={group.details}
                  />
                ))}
              </div>
            </section>

            <section className="mb-8">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">KPI Reali (fonte Supermaster)</h2>
                  <p className="text-xs text-gray-500 mt-1">Conteggi estratti dagli stessi dati utilizzati nel cruscotto Supermaster.</p>
                </div>
                {kpiLoading && <span className="text-xs text-gray-500">Caricamento…</span>}
                {kpiError && !kpiLoading && <span className="text-xs text-red-600">{kpiError}</span>}
              </div>
              {kpiData ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {[
                    { label: 'Dealer Totali', value: kpiData.dealer_totali ?? kpiData.dealerTotali },
                    { label: 'Dealer Ingaggiati Fisso', value: kpiData.dealer_ingaggiati_fisso ?? kpiData.dealerIngaggiatiFisso },
                    { label: 'Dealer Ingaggiati Mobile', value: kpiData.dealer_ingaggiati_mobile ?? kpiData.dealerIngaggiatiMobile },
                    { label: 'Attivazioni Fisso', value: kpiData.tlc_fisso_inseriti ?? kpiData.tlcFissoInseriti },
                    { label: 'Attivazioni Mobile', value: kpiData.tlc_mobile_inseriti ?? kpiData.tlcMobileInseriti },
                    { label: 'SIM Ric. Automatica', value: kpiData.sim_ric_automatica ?? kpiData.tlc_mobile_ra_inseriti },
                    { label: 'Energy', value: kpiData.energia_inseriti ?? kpiData.energiaInseriti },
                    { label: 'ENI', value: kpiData.eni_inseriti ?? kpiData.eniInseriti ?? kpiData.eni }
                  ].map((item) => (
                    <div key={item.label} className="rounded-xl border border-gray-200 bg-white/90 p-4 shadow-sm">
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{item.label}</p>
                      <p className="text-2xl font-semibold text-gray-900 mt-1">{formatInt(item.value || 0)}</p>
                    </div>
                  ))}
                </div>
              ) : !kpiLoading ? (
                <div className="text-sm text-gray-500 bg-gray-50 border border-dashed border-gray-200 rounded-xl p-4">
                  Nessun KPI disponibile per il periodo selezionato.
                </div>
              ) : null}
            </section>

            {/* Sezione Compensi con Breakdown Dettagliato */}
            <section className="rounded-xl border border-gray-200 bg-white p-6">
              <div className="text-lg font-semibold text-gray-800 mb-4">Compensi - Dettaglio</div>
              
              {compensiLoading ? (
                <div className="text-center text-gray-500 py-8">Caricamento compensi...</div>
              ) : compensiData?.breakdown ? (
                <div className="space-y-6">
                  {/* Totale */}
                  <div className="bg-gradient-to-r from-emerald-50 to-teal-50 rounded-xl p-4 border border-emerald-200">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-emerald-700">TOTALE COMPENSO</span>
                      <span className="text-2xl font-bold text-emerald-700">{formatEuro(compensiData.data?.Euro_Totale_Compenso || 0)}</span>
                    </div>
                  </div>

                  {/* Grid breakdown */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    
                    {/* Prodotti */}
                    <div className="rounded-lg border border-gray-200 p-4">
                      <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                        Prodotti
                      </h4>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-600">Fissi ({compensiData.breakdown.prodotti?.fissi?.qty || 0} × €10)</span>
                          <span className="font-medium">{formatEuro(compensiData.breakdown.prodotti?.fissi?.euro || 0)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Energy FW ({compensiData.breakdown.prodotti?.energyFW?.qty || 0} × €10)</span>
                          <span className="font-medium">{formatEuro(compensiData.breakdown.prodotti?.energyFW?.euro || 0)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">SKY ({compensiData.breakdown.prodotti?.sky?.qty || 0} × €10)</span>
                          <span className="font-medium">{formatEuro(compensiData.breakdown.prodotti?.sky?.euro || 0)}</span>
                        </div>
                        <div className="flex justify-between pt-2 border-t border-gray-100">
                          <span className="font-medium text-gray-700">Subtotale</span>
                          <span className="font-semibold text-blue-600">{formatEuro(compensiData.breakdown.prodotti?.totale || 0)}</span>
                        </div>
                      </div>
                    </div>

                    {/* SIM RA */}
                    <div className="rounded-lg border border-gray-200 p-4">
                      <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-purple-500"></span>
                        SIM Ricarica Automatica
                      </h4>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-600">Totale RA</span>
                          <span className="font-medium">{compensiData.breakdown.simRA?.totale || 0}</span>
                        </div>
                        <div className="flex justify-between text-xs text-gray-500">
                          <span>- In convergenza</span>
                          <span>{compensiData.breakdown.simRA?.convergenza || 0}</span>
                        </div>
                        <div className="flex justify-between text-xs text-gray-500">
                          <span>- Only mobile</span>
                          <span>{compensiData.breakdown.simRA?.onlyMobile || 0}</span>
                        </div>
                        <div className="flex justify-between pt-2 border-t border-gray-100">
                          <span className="font-medium text-gray-700">Subtotale</span>
                          <span className="font-semibold text-purple-600">{formatEuro(compensiData.breakdown.simRA?.euro || 0)}</span>
                        </div>
                      </div>
                    </div>

                    {/* SIM Vendute */}
                    <div className="rounded-lg border border-gray-200 p-4">
                      <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                        SIM Vendute (€1/SIM)
                      </h4>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-600">Fastweb</span>
                          <span className="font-medium">{compensiData.breakdown.simVendute?.fastweb || 0}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Iliad</span>
                          <span className="font-medium">{compensiData.breakdown.simVendute?.iliad || 0}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">1Mobile</span>
                          <span className="font-medium">{compensiData.breakdown.simVendute?.oneMobile || 0}</span>
                        </div>
                        <div className="flex justify-between pt-2 border-t border-gray-100">
                          <span className="font-medium text-gray-700">Totale ({compensiData.breakdown.simVendute?.totale || 0} SIM)</span>
                          <span className="font-semibold text-amber-600">{formatEuro(compensiData.breakdown.simVendute?.euro || 0)}</span>
                        </div>
                      </div>
                    </div>

                    {/* ENI */}
                    <div className="rounded-lg border border-gray-200 p-4">
                      <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-orange-500"></span>
                        ENI Plenitude
                      </h4>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-600">Commodity ({compensiData.breakdown.eni?.totali || 0} × €5)</span>
                          <span className="font-medium">{formatEuro(compensiData.breakdown.eni?.euroBase || 0)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Addebito RID ({compensiData.breakdown.eni?.rid || 0} × €2)</span>
                          <span className="font-medium">{formatEuro(compensiData.breakdown.eni?.euroAddebito || 0)}</span>
                        </div>
                        {compensiData.breakdown.eni?.euroBoost > 0 && (
                          <div className="flex justify-between">
                            <span className="text-gray-600">Boost Energy</span>
                            <span className="font-medium">{formatEuro(compensiData.breakdown.eni?.euroBoost || 0)}</span>
                          </div>
                        )}
                        <div className="flex justify-between pt-2 border-t border-gray-100">
                          <span className="font-medium text-gray-700">Subtotale</span>
                          <span className="font-semibold text-orange-600">{formatEuro(compensiData.breakdown.eni?.euro || 0)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Bonus */}
                    <div className="rounded-lg border border-gray-200 p-4">
                      <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-green-500"></span>
                        Bonus
                      </h4>
                      <div className="space-y-2 text-sm">
                        {compensiData.breakdown.bonus?.soglie > 0 && (
                          <div className="flex justify-between">
                            <span className="text-gray-600">Soglie (Energy/Fissi)</span>
                            <span className="font-medium">{formatEuro(compensiData.breakdown.bonus?.soglie || 0)}</span>
                          </div>
                        )}
                        {compensiData.breakdown.bonus?.extraFissi > 0 && (
                          <div className="flex justify-between">
                            <span className="text-gray-600">Extra Fissi (composizione)</span>
                            <span className="font-medium">{formatEuro(compensiData.breakdown.bonus?.extraFissi || 0)}</span>
                          </div>
                        )}
                        {compensiData.breakdown.bonus?.mobileAuto > 0 && (
                          <div className="flex justify-between">
                            <span className="text-gray-600">Mobile Auto</span>
                            <span className="font-medium">{formatEuro(compensiData.breakdown.bonus?.mobileAuto || 0)}</span>
                          </div>
                        )}
                        {compensiData.breakdown.bonus?.simMNP > 0 && (
                          <div className="flex justify-between">
                            <span className="text-gray-600">SIM MNP Target</span>
                            <span className="font-medium">{formatEuro(compensiData.breakdown.bonus?.simMNP || 0)}</span>
                          </div>
                        )}
                        {compensiData.breakdown.bonus?.totale === 0 && (
                          <div className="text-gray-400 text-xs">Nessun bonus raggiunto</div>
                        )}
                        <div className="flex justify-between pt-2 border-t border-gray-100">
                          <span className="font-medium text-gray-700">Subtotale</span>
                          <span className="font-semibold text-green-600">{formatEuro(compensiData.breakdown.bonus?.totale || 0)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Contributo */}
                    <div className="rounded-lg border border-gray-200 p-4">
                      <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-gray-500"></span>
                        Contributo Fisso
                      </h4>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-600">Contributo mensile</span>
                          <span className="font-semibold text-gray-700">{formatEuro(compensiData.breakdown.contributo || 0)}</span>
                        </div>
                      </div>
                    </div>

                  </div>
                </div>
              ) : (
                <div className="text-center text-gray-500 py-8">
                  Nessun dato compensi disponibile per il periodo selezionato.
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
