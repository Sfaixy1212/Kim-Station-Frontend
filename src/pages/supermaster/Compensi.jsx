import { useEffect, useMemo, useState } from 'react';
import SuperMasterTopbar from '../../components/supermaster/Topbar';
import Card from '../../components/common/Card';
import { getProtectedData, apiCallBlob } from '../../services/api';
import toast from 'react-hot-toast';

// Formattazione italiana
const formatEuro = (v) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 }).format(Number(v || 0));
const formatInt = (v) => new Intl.NumberFormat('it-IT', { maximumFractionDigits: 0 }).format(Number(v || 0));
const formatMonth = (monthStart) => {
  if (!monthStart) return '';
  const date = new Date(monthStart);
  return date.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
};

const SECTION_LABELS = {
  BONUS: 'Bonus',
  CONTRIBUTO: 'Contributi',
  DETTAGLIO_FISSO: 'Dettaglio Fisso',
  DETTAGLIO_SIM_EXTRA: 'Dettaglio SIM Extra',
  FW_RA_EXTRA: 'Fastweb RA Extra',
  FW_RA_EXTRA_DETT: 'Dettaglio Fastweb RA Extra',
  PRODOTTO: 'Prodotti',
  PRODOTTI: 'Prodotti',
  PRODOTTO_DETT: 'Dettaglio Prodotti',
  SIM: 'SIM',
  SIM_BASE: 'SIM Base',
};

const SUBSECTION_LABELS = {
  // Bonus
  'BONUS FISSI': 'Bonus Fissi',
  FISSI: 'Bonus Fissi',
  // Contributi
  'RIMBORSO SPESE': 'Rimborso Spese',
  // Dettaglio Fisso
  FW_FISSO_CONV: 'Fastweb Fisso Convergenza',
  // Dettaglio SIM Extra
  FULL: 'Full & Maxi',
  'FW MOBILE': 'Fastweb Mobile',
  MAXI: 'Mobile Ultra/Maxi',
  // Prodotti
  'FW ENERGY': 'Fastweb Energy',
  FW_ENERGY: 'Fastweb Energy',
  'FW FISSO': 'Fastweb Fisso',
  FW_FISSO: 'Fastweb Fisso',
  'SKY CORE': 'Sky Core',
  SKY_CORE: 'Sky Core',
  // SIM
  'COMPENSO BASE': 'Compenso Base',
  'EXTRA RIC. AUTO': 'Extra Ricarica Automatica',
  // Legacy labels
  FW_RA: 'Fastweb RA',
  FW_RA_EXTRA: 'Fastweb RA Extra',
  FW_RA_EXTRA_DETT: 'Dettaglio RA Extra',
  '1MOBILE': '1Mobile',
  FASTWEB: 'Fastweb',
  ILIAD: 'Iliad',
  SKY: 'Sky',
};

const humanizeKey = (value) => {
  if (!value) return '';
  return String(value)
    .replace(/[_\s]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map(token => {
      if (token.length <= 3) return token.toUpperCase();
      return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
    })
    .join(' ');
};

const friendlyLabel = (value, dictionary, fallback) => {
  if (!value) return fallback;
  
  // Prova prima il valore originale
  if (dictionary && Object.prototype.hasOwnProperty.call(dictionary, value)) {
    return dictionary[value];
  }
  
  // Poi prova in maiuscolo
  const upper = String(value).toUpperCase();
  if (dictionary && Object.prototype.hasOwnProperty.call(dictionary, upper)) {
    return dictionary[upper];
  }
  
  // Debug per troubleshooting
  console.log('[COMPENSI] No label match for:', value, '| upper:', upper);
  
  return humanizeKey(upper);
};

const friendlySectionLabel = (value) => friendlyLabel(value, SECTION_LABELS, 'Altro');
const friendlySottoVoceLabel = (value) => friendlyLabel(value, SUBSECTION_LABELS, 'Generale');

const toMonthStartISO = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  return `${year}-${String(month + 1).padStart(2, '0')}-01`;
};

// Definizioni operative per tooltip
const DEFINITIONS = {
  'FW_FISSI': 'Attivazioni Fastweb Fissi (FTTH/FTTC)',
  'FW_SIM_RA': 'SIM Fastweb con Ricarica Automatica totali',
  'FW_CONV_RA': 'SIM RA in convergenza (FISSO+MOBILE)',
  'FW_ONLYMOB_RA': 'SIM RA only mobile (solo MOBILE)',
  'FW_ENERGY': 'Attivazioni Fastweb Energy',
  'SKY_CORE': 'Attivazioni Sky (tutti i prodotti)',
  'SIM_VENDUTE': 'Totale SIM vendute nel periodo',
  'PERC_RA': 'Percentuale RA su totale Mobile',
  'EURO_FISSI': 'Compensi per attivazioni Fissi',
  'EURO_RA': 'Compensi totali per SIM RA',
  'EURO_ENERGY': 'Compensi per attivazioni Energy',
  'EURO_SKY': 'Compensi per attivazioni Sky',
  'EURO_SIM': 'Compensi per vendita SIM',
  'EURO_BONUS': 'Bonus raggiungimento soglie',
  'EURO_CONTRIBUTO': 'Rimborso spese e contributi',
  'EURO_TOTALE': 'Totale compensi del periodo'
};

// Componente Card KPI informativa (non più cliccabile)
function KpiCard({ title, value, icon, definition, onClick, isActive }) {
  const [showTooltip, setShowTooltip] = useState(false);
  const isClickable = typeof onClick === 'function';
  
  return (
    <div 
      className={`relative bg-white border rounded-lg shadow-sm p-4 transition-all ${
        isClickable 
          ? `cursor-pointer hover:shadow-md ${isActive ? 'ring-2 ring-blue-500 bg-blue-50' : 'hover:bg-gray-50'}`
          : 'cursor-default'
      }`}
      onClick={isClickable ? onClick : undefined}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">{title}</span>
        <div className="flex items-center gap-1">
          <span className="text-lg">{icon}</span>
        </div>
      </div>
      <div className="text-2xl font-bold text-gray-900">{value}</div>
      
      {/* Tooltip */}
      {showTooltip && (
        <div className="absolute z-10 bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg shadow-lg max-w-xs">
          {definition}
          <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
        </div>
      )}
    </div>
  );
}

// Componente Card Compensi cliccabile
function CompensiCard({ title, value, icon, onClick, color = 'blue' }) {
  const colorClasses = {
    blue: 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100',
    green: 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100',
    purple: 'bg-purple-50 border-purple-200 text-purple-700 hover:bg-purple-100',
    orange: 'bg-orange-50 border-orange-200 text-orange-700 hover:bg-orange-100',
    gray: 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'
  };
  
  return (
    <div 
      className={`border rounded-lg shadow-sm p-4 transition-all cursor-pointer ${colorClasses[color]}`}
      onClick={onClick}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium uppercase tracking-wide">{title}</span>
        <span className="text-lg">{icon}</span>
      </div>
      <div className="text-xl font-bold">{value}</div>
    </div>
  );
}

export default function Compensi() {
  const [filters, setFilters] = useState({ months: [], agents: [] });
  const [selectedMonthStart, setSelectedMonthStart] = useState('');
  const [selectedAgente, setSelectedAgente] = useState('');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [extraOpen, setExtraOpen] = useState(false);
  const [extraData, setExtraData] = useState({ loading: false, rows: [], title: '', summary: null });
  const [showDebug, setShowDebug] = useState(false);
  const [showDefinitions, setShowDefinitions] = useState(false);
  const [breakdownOpen, setBreakdownOpen] = useState(false);
  const [breakdownData, setBreakdownData] = useState({ loading: false, rows: [], title: '', type: '' });

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        // Bypass cache server (version key) per allineare MonthStartStr
        const res = await getProtectedData('/compensi/filters?v=3&t=' + Date.now());
        const months = Array.isArray(res?.months) ? res.months : [];
        const agents = Array.isArray(res?.agents) ? res.agents : [];
        
        // Backend già filtra correttamente, non serve più filtro frontend
        const cleanMonths = months;
        
        // Mantieni solo GIACOMO e LUIGI (case-insensitive) e normalizza a UPPER
        const ALLOWED = new Set(['GIACOMO','LUIGI']);
        const filteredAgents = Array.from(new Set(
          agents
            .map(a => String(a || '').trim())
            .filter(a => a.length > 0)
            .map(a => a.toUpperCase())
            .filter(a => ALLOWED.has(a))
        ));
        if (!mounted) return;
        setFilters({ months: cleanMonths, agents: filteredAgents });
        // Default: nessun filtro sul mese per mostrare subito i dati aggregati
        setSelectedMonthStart('');
        setSelectedAgente('');
      } catch (e) {
        toast.error('Errore nel caricamento filtri');
      }
    })();
    return () => { mounted = false; };
  }, []);

  const computeMonthStartParam = () => {
    if (!selectedMonthStart) return '';
    const ym = selectedMonthStart.slice(0, 7);
    return `${ym}-01`;
  };

  const exportXlsx = async () => {
    if (!rows.length || loading) return;
    const qp = new URLSearchParams();
    const monthStartParam = computeMonthStartParam();
    if (monthStartParam) qp.set('monthStart', monthStartParam);
    if (selectedAgente) qp.set('agente', selectedAgente);

    try {
      const blob = await apiCallBlob(`/compensi/export${qp.toString() ? `?${qp.toString()}` : ''}`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const safeLabel = selectedMonthStart ? selectedMonthStart.replace(/[^0-9A-Za-z_-]/g, '-') : 'tutti';
      a.href = url;
      a.download = `compensi_agenti_${safeLabel}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('[COMPENSI][export] errore export XLSX:', e);
      toast.error('Errore durante l\'esportazione');
    }
  };

  const load = async () => {
    const qp = new URLSearchParams();
    // Normalizza: forza il giorno al primo del mese (YYYY-MM-01)
    const monthStartParam = computeMonthStartParam();
    if (monthStartParam) qp.set('monthStart', monthStartParam);
    if (selectedAgente) qp.set('agente', selectedAgente);
    setLoading(true); setError('');
    try {
      const res = await getProtectedData(`/compensi${qp.toString() ? `?${qp.toString()}` : ''}`);
      const list = Array.isArray(res?.rows) ? res.rows : [];
      // Normalizza le chiavi della riga ai nomi attesi dalla vista vw_compensi_agenti_mese_totale
      const pick = (obj, candidates) => {
        for (const c of candidates) {
          const keys = [c, c.toLowerCase(), c.toUpperCase()];
          for (const k of keys) { if (Object.prototype.hasOwnProperty.call(obj, k)) return obj[k]; }
        }
        return undefined;
      };
      const toNum = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
      const normalized = list.map(r => ({
        // Identificativi
        MonthStart: pick(r, ['MonthStart','month_start']) || r.MonthStart || r.monthStart,
        MESE_LABEL: pick(r, ['MESE_LABEL','mese_label','meseLabel']) || r.MESE_LABEL || r.meseLabel,
        Agente: pick(r, ['Agente','agente']) || r.Agente || r.agente,
        
        // KPI dalla vista corretta (nomi esatti dalla query)
        Fissi_Pda: toNum(pick(r, ['Fissi_Pda'])),
        Mobile_Pda: toNum(pick(r, ['Mobile_Pda'])),
        Perc_RA_su_Mobile: toNum(pick(r, ['Perc_RA_su_Mobile'])),
        Sim_RA_Tot: toNum(pick(r, ['Sim_RA_Tot'])),
        Sim_RA_Conv: toNum(pick(r, ['Sim_RA_Conv'])),
        Sim_RA_OnlyMobile: toNum(pick(r, ['Sim_RA_OnlyMobile'])),
        Mobile_Pura_Pda: toNum(pick(r, ['Mobile_Pura_Pda'])),
        Energy_Pda: toNum(pick(r, ['Energy_Pda'])),
        Sky_Pda: toNum(pick(r, ['Sky_Pda'])),
        Sim_Vendute: toNum(pick(r, ['Sim_Vendute', 'SimTotali_Vendute'])), // Alias dalla query
        
        // Euro (nomi dalla vista vw_compensi_agenti_mese_totale)
        Euro_RA: toNum(pick(r, ['Euro_RA'])),
        Euro_Prodotti: toNum(pick(r, ['Euro_Prodotti'])),
        Euro_SimVendute: toNum(pick(r, ['Euro_SimVendute'])),
        Euro_Bonus: toNum(pick(r, ['Euro_Bonus'])),
        Euro_Contributo: toNum(pick(r, ['Euro_Contributo'])),
        Euro_Bonus_MobileAuto: toNum(pick(r, ['Euro_Bonus_MobileAuto'])),
        Euro_Extra_FissiComposizione: toNum(pick(r, ['Euro_Extra_FissiComposizione'])),
        Euro_Totale_Completo: toNum(pick(r, ['Euro_Totale_Completo'])),
        // Mantieni Euro_Totale per compatibilità
        Euro_Totale: toNum(pick(r, ['Euro_Totale_Completo', 'Euro_Totale'])),
        
        // Mantieni anche i vecchi nomi per compatibilità (fallback legacy)
        SimTotali_Vendute: toNum(pick(r, ['Sim_Vendute', 'SimTotali_Vendute', 'TOT_SIM_QTY'])),
        FW_FISSI_QTY: toNum(pick(r, ['Fissi_Pda', 'FW_FISSI_QTY'])),
        FW_RA_SIMS_QTY: toNum(pick(r, ['Sim_RA_Tot', 'FW_RA_SIMS_QTY', 'FW_SIM_RA'])),
        FW_RA_IN_CONV_QTY: toNum(pick(r, ['Sim_RA_Conv', 'FW_RA_IN_CONV_QTY', 'FW_RA_IN_CONV', 'FW_CONV_RA'])),
        FW_RA_ONLYMOBILE_QTY: toNum(pick(r, ['Sim_RA_OnlyMobile', 'FW_RA_ONLYMOBILE_QTY', 'FW_RA_ONLYMOBILE', 'FW_ONLYMOB_RA'])),
        FW_ENERGY_QTY: toNum(pick(r, ['Energy_Pda', 'FW_ENERGY_QTY'])),
        SKY_CORE_QTY: toNum(pick(r, ['Sky_Pda', 'SKY_CORE_QTY'])),
        TOT_SIM_QTY: toNum(pick(r, ['Sim_Vendute', 'SimTotali_Vendute', 'TOT_SIM_QTY'])),
        EURO_FW_FISSI: toNum(pick(r, ['Euro_Prodotti', 'EURO_FW_FISSI'])), // Euro_Prodotti include fissi
        EURO_FW_RA_EXTRA: toNum(pick(r, ['Euro_RA', 'EURO_FW_RA_EXTRA'])),
        EURO_SIM_BASE: toNum(pick(r, ['Euro_SimVendute', 'EURO_SIM_BASE'])),
        EURO_FW_ENERGY: toNum(pick(r, ['Euro_Prodotti', 'EURO_FW_ENERGY'])), // Euro_Prodotti include energy
        EURO_SKY_CORE: toNum(pick(r, ['Euro_Prodotti', 'EURO_SKY_CORE'])), // Euro_Prodotti include sky
        BONUS_FISSI: toNum(pick(r, ['Euro_Bonus', 'BONUS_FISSI'])), // Euro_Bonus include tutti i bonus
        BONUS_ENERGY: toNum(pick(r, ['Euro_Bonus', 'BONUS_ENERGY'])),
        EURO_CONTRIBUTO: toNum(pick(r, ['Euro_Contributo', 'EURO_CONTRIBUTO'])),
        EURO_TOTALE: toNum(pick(r, ['Euro_Totale', 'EURO_TOTALE'])),
      }));
      setRows(normalized);
      if (list.length === 0) try { toast.dismiss(); toast('Nessun dato per i filtri selezionati', { icon: 'ℹ️' }); } catch {}
    } catch (e) {
      console.error('[COMPENSI][ERR]', e);
      setError('Errore nel caricamento dati');
      setRows([]);
    } finally { setLoading(false); }
  };

  // Rimosso autoload: la ricerca parte SOLO con il tasto "Cerca"

  const totals = useMemo(() => {
    const sum = (key) => rows.reduce((a, r) => a + Number(r[key] || 0), 0);
    const avg = (key) => {
      const values = rows.map(r => Number(r[key] || 0)).filter(v => v > 0);
      return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
    };
    
    return {
      // KPI dalla vista vw_compensi_agenti_mese_totale
      Fissi_Pda: sum('Fissi_Pda'),
      Mobile_Pda: sum('Mobile_Pda'),
      Perc_RA_su_Mobile: avg('Perc_RA_su_Mobile'), // Media percentuale
      Sim_RA_Tot: sum('Sim_RA_Tot'),
      Sim_RA_Conv: sum('Sim_RA_Conv'),
      Sim_RA_OnlyMobile: sum('Sim_RA_OnlyMobile'),
      Mobile_Pura_Pda: sum('Mobile_Pura_Pda'),
      Energy_Pda: sum('Energy_Pda'),
      Sky_Pda: sum('Sky_Pda'),
      Sim_Vendute: sum('Sim_Vendute'),
      
      // Euro dalla vista vw_compensi_agenti_mese_totale
      Euro_RA: sum('Euro_RA'),
      Euro_Prodotti: sum('Euro_Prodotti'),
      Euro_SimVendute: sum('Euro_SimVendute'),
      Euro_Bonus: sum('Euro_Bonus'),
      Euro_Contributo: sum('Euro_Contributo'),
      Euro_Bonus_MobileAuto: sum('Euro_Bonus_MobileAuto'),
      Euro_Extra_FissiComposizione: sum('Euro_Extra_FissiComposizione'),
      Euro_Totale_Completo: sum('Euro_Totale_Completo'),
      Euro_Totale: sum('Euro_Totale_Completo') || sum('Euro_Totale'),
      
      // Mantieni anche i vecchi nomi per compatibilità tabella
      SimTotali_Vendute: sum('Sim_Vendute') || sum('SimTotali_Vendute') || sum('TOT_SIM_QTY'),
      Euro_Fissi: sum('Euro_Prodotti'), // Euro_Prodotti include fissi
      Euro_Energy: sum('Euro_Prodotti'), // Euro_Prodotti include energy  
      Euro_Sky: sum('Euro_Prodotti'), // Euro_Prodotti include sky
    };
  }, [rows]);

  const extraSections = useMemo(() => {
    if (!extraData.rows.length) return [];
    const sectionMap = new Map();
    extraData.rows.forEach(row => {
      const key = row.sezione ? String(row.sezione) : 'ALTRO';
      if (!sectionMap.has(key)) sectionMap.set(key, []);
      sectionMap.get(key).push(row);
    });
    return Array.from(sectionMap.entries()).map(([sectionKey, rows]) => {
      const subsectionMap = new Map();
      rows.forEach(row => {
        const subKey = row.sottoVoce ? String(row.sottoVoce) : '';
        if (!subsectionMap.has(subKey)) subsectionMap.set(subKey, []);
        subsectionMap.get(subKey).push(row);
      });
      const subsections = Array.from(subsectionMap.entries()).map(([subKey, subRows]) => ({
        key: subKey,
        label: subKey ? friendlySottoVoceLabel(subKey) : 'Generale',
        totalEuro: subRows.reduce((sum, r) => sum + Number(r.euro || 0), 0),
        totalQty: subRows.reduce((sum, r) => sum + Number(r.qty || 0), 0),
        rows: subRows
          .slice()
          .sort((a, b) => (a.dettaglio || '').localeCompare(b.dettaglio || '', 'it', { sensitivity: 'base' })),
      })).sort((a, b) => a.label.localeCompare(b.label, 'it', { sensitivity: 'base' }));

      const sectionTotalEuro = rows.reduce((sum, r) => sum + Number(r.euro || 0), 0);
      const sectionTotalQty = rows.reduce((sum, r) => sum + Number(r.qty || 0), 0);

      return {
        key: sectionKey,
        label: friendlySectionLabel(sectionKey),
        totalEuro: sectionTotalEuro,
        totalQty: sectionTotalQty,
        subsections,
      };
    }).sort((a, b) => a.label.localeCompare(b.label, 'it', { sensitivity: 'base' }));
  }, [extraData.rows]);

  // KPI del mese (conteggi) - Aggiornati con nuova vista
  const kpiCards = [
    { key: 'FISSI_PDA', title: 'FISSI PDA', value: formatInt(totals.Fissi_Pda), icon: '📶', definition: 'Attivazioni FTTH/FTTC completate' },
    { key: 'MOBILE_PDA', title: 'MOBILE PDA', value: formatInt(totals.Mobile_Pda), icon: '📱', definition: 'Totale attivazioni Mobile PDA' },
    { key: 'PERC_RA', title: '% RA su Mobile', value: `${(totals.Perc_RA_su_Mobile || 0).toFixed(1)}%`, icon: '📊', definition: 'Percentuale RA su Mobile totali' },
    { key: 'SIM_RA_TOT', title: 'SIM RA (TOT)', value: formatInt(totals.Sim_RA_Tot), icon: '🔁', definition: 'Totale SIM con Ricarica Automatica' },
    { key: 'SIM_RA_CONV', title: 'di cui CONV RA', value: formatInt(totals.Sim_RA_Conv), icon: '🤝', definition: 'SIM RA in convergenza (FISSO+MOBILE)' },
    { key: 'SIM_RA_ONLYMOBILE', title: 'di cui ONLYMOB. RA', value: formatInt(totals.Sim_RA_OnlyMobile), icon: '📱', definition: 'SIM RA solo mobile' },
    { key: 'MOBILE_PURA', title: 'Mobile Pura', value: formatInt(totals.Mobile_Pura_Pda), icon: '📳', definition: 'Mobile senza RA (pura)' },
    { key: 'ENERGY_PDA', title: 'ENERGY PDA', value: formatInt(totals.Energy_Pda), icon: '🔌', definition: 'Attivazioni Energy completate' },
    { key: 'SKY_PDA', title: 'SKY PDA', value: formatInt(totals.Sky_Pda), icon: '📺', definition: 'Attivazioni Sky completate' },
    { key: 'SIM_VENDUTE', title: 'SIM VENDUTE', value: formatInt(totals.Sim_Vendute), icon: '🧾', definition: 'Totale SIM vendute nel periodo' },
  ];

  // Compensi (€) - Aggiornati con nuova vista vw_compensi_agenti_mese_totale
  const compensiCards = [
    { key: 'EURO_RA', title: '€ RA (TOT)', value: formatEuro(totals.Euro_RA), icon: '🔁', color: 'green' },
    { key: 'EURO_PRODOTTI', title: '€ PRODOTTI', value: formatEuro(totals.Euro_Prodotti), icon: '📦', color: 'blue' },
    { key: 'EURO_SIM', title: '€ SIM VENDUTE', value: formatEuro(totals.Euro_SimVendute), icon: '🧾', color: 'purple' },
    { key: 'EURO_BONUS', title: '€ BONUS', value: formatEuro(totals.Euro_Bonus), icon: '🎯', color: 'orange' },
    { key: 'EURO_BONUS_MOBILEAUTO', title: '€ BONUS MOBILE AUTO', value: formatEuro(totals.Euro_Bonus_MobileAuto), icon: '📱', color: 'orange' },
    { key: 'EURO_CONTRIBUTO', title: '€ CONTRIBUTO', value: formatEuro(totals.Euro_Contributo), icon: '💼', color: 'gray' },
    { key: 'EURO_EXTRA_FISSI', title: '€ EXTRA FISSI COMP.', value: formatEuro(totals.Euro_Extra_FissiComposizione), icon: '🏠', color: 'blue' },
    { key: 'EURO_TOTALE', title: '€ TOTALE COMPLETO', value: formatEuro(totals.Euro_Totale), icon: '💶', color: 'green' },
  ];

  // Funzione per aprire breakdown compensi
  const openBreakdown = async (type, title) => {
    try {
      setBreakdownOpen(true);
      setBreakdownData({ loading: true, rows: [], title, type });
      
      const qp = new URLSearchParams();
      const monthStartParam = computeMonthStartParam();
      if (monthStartParam) qp.set('monthStart', monthStartParam);
      if (selectedAgente) qp.set('agente', selectedAgente);
      
      // Chiama fn_compensi_agente_breakdown filtrata per sezione
      const res = await getProtectedData(`/compensi/breakdown?${qp.toString()}`);
      const list = Array.isArray(res?.rows) ? res.rows : [];
      
      // Filtra per tipo di breakdown
      const filtered = list.filter(row => {
        const sezione = String(row.sezione || '').toUpperCase();
        switch(type) {
          case 'EURO_RA': return sezione.includes('MOBILE_RA');
          case 'EURO_FISSI': return sezione.includes('PRODOTTO') && String(row.dettaglio || '').includes('FISSO');
          case 'EURO_ENERGY': return sezione.includes('PRODOTTO') && String(row.dettaglio || '').includes('ENERGY');
          case 'EURO_SKY': return sezione.includes('PRODOTTO') && String(row.dettaglio || '').includes('SKY');
          case 'EURO_SIM': return sezione.includes('SIM_BASE');
          case 'EURO_BONUS': return sezione.includes('BONUS');
          case 'EURO_CONTRIBUTO': return sezione.includes('CONTRIBUTO');
          default: return true;
        }
      });
      
      setBreakdownData({ loading: false, rows: filtered, title, type });
    } catch (e) {
      setBreakdownData({ loading: false, rows: [], title, type });
      toast.error('Errore nel caricamento breakdown');
    }
  };

  // Rimossa funzionalità filtro KPI - card solo informative

  const openExtra = async (r) => {
    try {
      setExtraOpen(true);
      const agenteName = r.Agente || r.agente;
      const meseLabel = r.MESE_LABEL || r.meseLabel || '';
      setExtraData({ loading: true, rows: [], title: `${agenteName || ''} • ${meseLabel}`, summary: null });
      const qp = new URLSearchParams();
      const monthStartParam = computeMonthStartParam();
      if (monthStartParam) qp.set('monthStart', monthStartParam);
      if (agenteName) qp.set('agente', agenteName);
      const res = await getProtectedData(`/compensi/extra-detail?${qp.toString()}`);
      const list = Array.isArray(res?.rows) ? res.rows : [];
      const normalized = list.map(row => ({
        sezione: row?.sezione ?? row?.Sezione ?? '',
        sottoVoce: row?.sottoVoce ?? row?.SottoVoce ?? '',
        dettaglio: row?.dettaglio ?? row?.Dettaglio ?? '',
        qty: Number(row?.qty ?? row?.Qty ?? 0),
        euroUnit: Number(row?.euroUnit ?? row?.EuroUnit ?? 0),
        euro: Number(row?.euro ?? row?.Euro ?? 0),
        createdAt: row?.createdAt ?? row?.CreatedAt ?? null,
      }));
      const summary = {
        totaleCompensi: Number(r.Euro_Totale ?? r.EURO_TOTALE ?? 0),
        totaleSim: Number(r.SimTotali_Vendute ?? r.TOT_SIM_QTY ?? 0),
        compensiFissi: Number(r.Euro_Fissi ?? r.EURO_FW_FISSI ?? 0),
        compensiRa: Number(r.Euro_RA ?? r.EURO_FW_RA_EXTRA ?? 0),
        compensiOnlyMob: Number(r.Euro_SimVendute ?? r.EURO_SIM_BASE ?? 0),
        compensiEnergy: Number(r.Euro_Energy ?? r.EURO_FW_ENERGY ?? 0),
        bonusFissi: Number(r.BONUS_FISSI ?? 0),
        bonusEnergy: Number(r.BONUS_ENERGY ?? 0),
        compensiSky: Number(r.Euro_Sky ?? r.EURO_SKY_CORE ?? 0),
        rimborsoSpese: Number(r.Euro_Contributo ?? r.EURO_CONTRIBUTO ?? 0),
      };
      setExtraData({ loading: false, rows: normalized, title: `${agenteName || ''} • ${meseLabel}`, summary });
    } catch (e) {
      setExtraData({ loading: false, rows: [], title: extraData.title, summary: extraData.summary });
      toast.error('Errore nel caricamento dettagli');
    }
  };

  const reset = () => {
    if (filters.months.length > 0) setSelectedMonthStart(filters.months[0].monthStart?.slice(0, 10));
    setSelectedAgente('');
    setRows([]);
  };

  return (
    <>
      <SuperMasterTopbar />
      <div className="w-full px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Compensi Agenti</h1>
            <p className="text-sm text-gray-500 mt-1">
              {selectedMonthStart ? `Dati per ${formatMonth(selectedMonthStart)}` : 'Dati aggregati tutti i mesi'}
              {rows.length > 0 && ` • ${rows.length} agenti`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setShowDefinitions(true)}
              className="px-3 py-2 text-xs rounded-md border text-gray-600 hover:bg-gray-50"
            >
              📖 Definizioni
            </button>
          </div>
        </div>

        {/* Filtri */}
        <Card title="Filtri & Ricerca">
          <form onSubmit={(e)=>{ e.preventDefault(); load(); }}>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Mese</label>
                <select className="border-gray-300 rounded-md text-sm" value={selectedMonthStart} onChange={e => setSelectedMonthStart(e.target.value)}>
                  <option value="">-- Seleziona mese --</option>
                  {filters.months
                    .filter(m => m.monthStart && String(m.monthStart).trim() !== '') // Filtra solo mesi con monthStart valido
                    .map(m => (
                      <option key={String(m.monthStart)} value={String(m.monthStart).slice(0,10)}>{m.meseLabel}</option>
                    ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Agente</label>
                <select className="border-gray-300 rounded-md text-sm" value={selectedAgente} onChange={e => setSelectedAgente(e.target.value)}>
                  <option value="">Tutti gli agenti</option>
                  {filters.agents.map(a => (<option key={a} value={a}>{a}</option>))}
                </select>
              </div>
              <button type="submit" disabled={loading} className={`px-4 py-2 text-sm rounded-md text-white font-medium ${loading ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}>
                {loading ? (
                  <span className="inline-flex items-center gap-2">
                    <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path></svg>
                    Caricamento...
                  </span>
                ) : '🔍 Cerca'}
              </button>
              <button type="button" onClick={reset} className="px-3 py-2 text-sm rounded-md border text-gray-700 hover:bg-gray-50">↻ Reset</button>
              <button
                type="button"
                disabled={loading}
                onClick={() => {
                  if (!rows.length) {
                    load().then(() => exportXlsx());
                  } else {
                    exportXlsx();
                  }
                }}
                className={`ml-auto px-3 py-2 text-sm rounded-md border ${loading ? 'text-gray-400 cursor-not-allowed' : 'text-gray-700 hover:bg-gray-50'}`}
              >
                📊 Esporta XLSX
              </button>
            </div>
          </form>
        </Card>

        {/* Barra di caricamento */}
        {loading && (
          <div className="w-full h-1 bg-gray-200 rounded overflow-hidden">
            <div className="h-1 bg-blue-600 animate-[progress_1.2s_ease-in-out_infinite]" style={{ width: '40%' }} />
          </div>
        )}

        {/* SEZIONE A: KPI del mese (conteggi) */}
        <Card title="📊 KPI del Mese" subtitle="Conteggi attivazioni del periodo selezionato">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-4">
            {kpiCards.map((card) => (
              <KpiCard
                key={card.key}
                title={card.title}
                value={card.value}
                icon={card.icon}
                definition={card.definition}
                onClick={null}
                isActive={false}
              />
            ))}
          </div>
        </Card>

        {/* SEZIONE B: Compensi (€) */}
        <Card title="💶 Compensi in Euro" subtitle="Clicca su una card per vedere il breakdown dettagliato">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8 gap-4">
            {compensiCards.map((card) => (
              <CompensiCard
                key={card.key}
                title={card.title}
                value={card.value}
                icon={card.icon}
                color={card.color}
                onClick={() => openBreakdown(card.key, card.title)}
              />
            ))}
          </div>
        </Card>

        {/* SEZIONE C: Tabella agenti - NASCOSTA */}
        {/* 
        <Card title="👥 Tabella Agenti" subtitle="Dettaglio per agente - Ordinabile per totale compensi">
          {loading ? (
            <div className="text-sm text-gray-500 p-4">Caricamento dati...</div>
          ) : rows.length === 0 ? (
            <div className="text-sm text-gray-500 p-4">Nessun dato trovato. Utilizza i filtri sopra per cercare.</div>
          ) : (
            <div className="overflow-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-600 border-b border-gray-200">
                    <th className="py-3 pr-4 font-semibold">Agente</th>
                    <th className="py-3 pr-4 text-center">📶<br/>Fissi</th>
                    <th className="py-3 pr-4 text-center">🔁<br/>SIM RA</th>
                    <th className="py-3 pr-4 text-center">🤝<br/>Conv RA</th>
                    <th className="py-3 pr-4 text-center">📱<br/>OnlyMob RA</th>
                    <th className="py-3 pr-4 text-center">🔌<br/>Energy</th>
                    <th className="py-3 pr-4 text-center">📺<br/>Sky</th>
                    <th className="py-3 pr-4 text-center">🧾<br/>SIM Tot</th>
                    <th className="py-3 pr-4 text-right">€ Fissi</th>
                    <th className="py-3 pr-4 text-right">€ RA</th>
                    <th className="py-3 pr-4 text-right">€ Energy</th>
                    <th className="py-3 pr-4 text-right">€ Sky</th>
                    <th className="py-3 pr-4 text-right">€ SIM</th>
                    <th className="py-3 pr-4 text-right">€ Bonus</th>
                    <th className="py-3 pr-4 text-right">€ Contributo</th>
                    <th className="py-3 pr-4 text-right font-semibold">€ Totale</th>
                    <th className="py-3 pr-4">Azioni</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="bg-blue-50 border-b border-blue-200">
                    <td className="py-3 pr-4 font-bold text-blue-900">TOTALE</td>
                    <td className="py-3 pr-4 text-center font-semibold text-blue-900">{formatInt(totals.Fissi_Pda)}</td>
                    <td className="py-3 pr-4 text-center font-semibold text-blue-900">{formatInt(totals.Sim_RA_Tot)}</td>
                    <td className="py-3 pr-4 text-center font-semibold text-blue-900">{formatInt(totals.Sim_RA_Conv)}</td>
                    <td className="py-3 pr-4 text-center font-semibold text-blue-900">{formatInt(totals.Sim_RA_OnlyMobile)}</td>
                    <td className="py-3 pr-4 text-center font-semibold text-blue-900">{formatInt(totals.Energy_Pda)}</td>
                    <td className="py-3 pr-4 text-center font-semibold text-blue-900">{formatInt(totals.Sky_Pda)}</td>
                    <td className="py-3 pr-4 text-center font-semibold text-blue-900">{formatInt(totals.SimTotali_Vendute)}</td>
                    <td className="py-3 pr-4 text-right font-semibold text-blue-900">{formatEuro(totals.Euro_Fissi)}</td>
                    <td className="py-3 pr-4 text-right font-semibold text-blue-900">{formatEuro(totals.Euro_RA)}</td>
                    <td className="py-3 pr-4 text-right font-semibold text-blue-900">{formatEuro(totals.Euro_Energy)}</td>
                    <td className="py-3 pr-4 text-right font-semibold text-blue-900">{formatEuro(totals.Euro_Sky)}</td>
                    <td className="py-3 pr-4 text-right font-semibold text-blue-900">{formatEuro(totals.Euro_SimVendute)}</td>
                    <td className="py-3 pr-4 text-right font-semibold text-blue-900">{formatEuro(totals.Euro_Bonus)}</td>
                    <td className="py-3 pr-4 text-right font-semibold text-blue-900">{formatEuro(totals.Euro_Contributo)}</td>
                    <td className="py-3 pr-4 text-right font-bold text-lg text-blue-900">{formatEuro(totals.Euro_Totale)}</td>
                    <td className="py-3 pr-4"></td>
                  </tr>
                  {rows.map((r, idx) => (
                    <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-3 pr-4 font-medium text-gray-900">{r.Agente || r.agente}</td>
                      <td className="py-3 pr-4 text-center">{formatInt(r.Fissi_Pda || r.FW_FISSI_QTY)}</td>
                      <td className="py-3 pr-4 text-center">{formatInt(r.Sim_RA_Tot || r.FW_RA_SIMS_QTY)}</td>
                      <td className="py-3 pr-4 text-center">{formatInt(r.Sim_RA_Conv || r.FW_RA_IN_CONV_QTY)}</td>
                      <td className="py-3 pr-4 text-center">{formatInt(r.Sim_RA_OnlyMobile || r.FW_RA_ONLYMOBILE_QTY)}</td>
                      <td className="py-3 pr-4 text-center">{formatInt(r.Energy_Pda || r.FW_ENERGY_QTY)}</td>
                      <td className="py-3 pr-4 text-center">{formatInt(r.Sky_Pda || r.SKY_CORE_QTY)}</td>
                      <td className="py-3 pr-4 text-center">{formatInt(r.SimTotali_Vendute || r.TOT_SIM_QTY)}</td>
                      <td className="py-3 pr-4 text-right">{formatEuro(r.Euro_Fissi || r.EURO_FW_FISSI)}</td>
                      <td className="py-3 pr-4 text-right">{formatEuro(r.Euro_RA || r.EURO_FW_RA_EXTRA)}</td>
                      <td className="py-3 pr-4 text-right">{formatEuro(r.Euro_Energy || r.EURO_FW_ENERGY)}</td>
                      <td className="py-3 pr-4 text-right">{formatEuro(r.Euro_Sky || r.EURO_SKY_CORE)}</td>
                      <td className="py-3 pr-4 text-right">{formatEuro(r.Euro_SimVendute || r.EURO_SIM_BASE)}</td>
                      <td className="py-3 pr-4 text-right">{formatEuro((r.Euro_Bonus || 0) + (r.BONUS_FISSI || 0) + (r.BONUS_ENERGY || 0))}</td>
                      <td className="py-3 pr-4 text-right">{formatEuro(r.Euro_Contributo || r.EURO_CONTRIBUTO)}</td>
                      <td className="py-3 pr-4 text-right font-semibold text-lg">{formatEuro(r.Euro_Totale || r.EURO_TOTALE)}</td>
                      <td className="py-3 pr-4">
                        <button 
                          onClick={() => openExtra(r)} 
                          className="text-xs px-3 py-1.5 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 hover:border-gray-400 transition-colors"
                        >
                          📋 Dettagli
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        */}
        {/* Drawer Extra */}
      {extraOpen && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/30" onClick={()=>setExtraOpen(false)} />
          <div className="absolute right-0 top-0 h-full w-full sm:w-[520px] bg-white shadow-xl p-4 overflow-auto">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-lg font-semibold text-gray-900">Dettagli extra</div>
                <div className="text-sm text-gray-500">{extraData.title}</div>
              </div>
              <button onClick={()=>setExtraOpen(false)} className="px-3 py-1.5 rounded-md border text-gray-700 hover:bg-gray-50">Chiudi</button>
            </div>
            {extraData.loading ? (
              <div className="text-sm text-gray-500">Caricamento…</div>
            ) : extraData.rows.length === 0 ? (
              <div className="text-sm text-gray-500">Nessun dettaglio</div>
            ) : (
              <div className="space-y-6">
                {extraData.summary && (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
                    <div className="p-3 border rounded-md bg-gray-50">
                      <div className="text-xs uppercase tracking-wide text-gray-500">Totale compensi</div>
                      <div className="text-base font-semibold text-gray-900">{formatEuro(extraData.summary.totaleCompensi)}</div>
                    </div>
                    <div className="p-3 border rounded-md bg-gray-50">
                      <div className="text-xs uppercase tracking-wide text-gray-500">SIM vendute</div>
                      <div className="text-base font-semibold text-gray-900">{formatInt(extraData.summary.totaleSim)}</div>
                    </div>
                    <div className="p-3 border rounded-md bg-gray-50">
                      <div className="text-xs uppercase tracking-wide text-gray-500">Compensi fissi</div>
                      <div className="text-base font-semibold text-gray-900">{formatEuro(extraData.summary.compensiFissi)}</div>
                    </div>
                    <div className="p-3 border rounded-md bg-gray-50">
                      <div className="text-xs uppercase tracking-wide text-gray-500">Compensi RA</div>
                      <div className="text-base font-semibold text-gray-900">{formatEuro(extraData.summary.compensiRa)}</div>
                    </div>
                    <div className="p-3 border rounded-md bg-gray-50">
                      <div className="text-xs uppercase tracking-wide text-gray-500">Compensi OnlyMob RA</div>
                      <div className="text-base font-semibold text-gray-900">{formatEuro(extraData.summary.compensiOnlyMob)}</div>
                    </div>
                    <div className="p-3 border rounded-md bg-gray-50">
                      <div className="text-xs uppercase tracking-wide text-gray-500">Compensi Energy</div>
                      <div className="text-base font-semibold text-gray-900">{formatEuro(extraData.summary.compensiEnergy)}</div>
                    </div>
                    <div className="p-3 border rounded-md bg-gray-50">
                      <div className="text-xs uppercase tracking-wide text-gray-500">Bonus fissi</div>
                      <div className="text-base font-semibold text-gray-900">{formatEuro(extraData.summary.bonusFissi)}</div>
                    </div>
                    <div className="p-3 border rounded-md bg-gray-50">
                      <div className="text-xs uppercase tracking-wide text-gray-500">Bonus energy</div>
                      <div className="text-base font-semibold text-gray-900">{formatEuro(extraData.summary.bonusEnergy)}</div>
                    </div>
                    <div className="p-3 border rounded-md bg-gray-50">
                      <div className="text-xs uppercase tracking-wide text-gray-500">Compensi SKY</div>
                      <div className="text-base font-semibold text-gray-900">{formatEuro(extraData.summary.compensiSky)}</div>
                    </div>
                    <div className="p-3 border rounded-md bg-gray-50">
                      <div className="text-xs uppercase tracking-wide text-gray-500">Rimborso spese</div>
                      <div className="text-base font-semibold text-gray-900">{formatEuro(extraData.summary.rimborsoSpese)}</div>
                    </div>
                  </div>
                )}

                {extraSections.map(section => (
                  <div key={section.key} className="border rounded-lg shadow-sm overflow-hidden">
                    <div className="flex items-center justify-between bg-gray-50 px-4 py-3">
                      <div className="text-sm font-semibold text-gray-700 uppercase tracking-wide">{section.label}</div>
                      <div className="text-sm font-semibold text-gray-900">{formatEuro(section.totalEuro)}</div>
                    </div>
                    <div className="divide-y">
                      {section.subsections.map((sub, idx) => (
                        <div key={`${section.key}-${sub.key || 'general'}-${idx}`} className="px-4 py-4 space-y-3">
                          <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <div className="text-sm font-semibold text-gray-600">{sub.label}</div>
                            <div className="text-xs text-gray-500">
                              {formatInt(sub.totalQty)} elementi · {formatEuro(sub.totalEuro)}
                            </div>
                          </div>
                          <div className="overflow-auto border rounded-md">
                            <table className="min-w-full text-sm">
                              <thead className="bg-gray-50 text-gray-600">
                                <tr>
                                  <th className="px-3 py-2 text-left w-1/2">Dettaglio</th>
                                  <th className="px-3 py-2 text-right w-1/6">Quantità</th>
                                  <th className="px-3 py-2 text-right w-1/6">Valore unitario</th>
                                  <th className="px-3 py-2 text-right w-1/6">Importo</th>
                                </tr>
                              </thead>
                              <tbody>
                                {sub.rows.map((row, rowIdx) => (
                                  <tr key={`${section.key}-${sub.key || 'general'}-${rowIdx}`} className="border-t last:border-0">
                                    <td className="px-3 py-2 text-gray-900">{row.dettaglio || '—'}</td>
                                    <td className="px-3 py-2 text-right text-gray-700">{formatInt(row.qty)}</td>
                                    <td className="px-3 py-2 text-right text-gray-700">{formatEuro(row.euroUnit)}</td>
                                    <td className="px-3 py-2 text-right font-medium text-gray-900">{formatEuro(row.euro)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

        {/* Modal Definizioni */}
        {showDefinitions && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50" onClick={() => setShowDefinitions(false)} />
            <div className="relative bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[80vh] overflow-hidden">
              <div className="flex items-center justify-between p-6 border-b">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">📖 Glossario Compensi</h3>
                  <p className="text-sm text-gray-500 mt-1">Definizioni operative e calcoli</p>
                </div>
                <button 
                  onClick={() => setShowDefinitions(false)}
                  className="px-4 py-2 text-sm rounded-md border text-gray-700 hover:bg-gray-50"
                >
                  ✕ Chiudi
                </button>
              </div>
              <div className="p-6 overflow-auto max-h-[60vh]">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h4 className="font-semibold text-gray-900 mb-3">🔢 Conteggi (KPI)</h4>
                    <div className="space-y-3 text-sm">
                      <div className="p-3 bg-blue-50 rounded-lg">
                        <div className="font-medium text-blue-900">CONV RA</div>
                        <div className="text-blue-700">TIPO=MOBILE & Tipo Ordine=FISSO E MOBILE</div>
                      </div>
                      <div className="p-3 bg-blue-50 rounded-lg">
                        <div className="font-medium text-blue-900">OnlyMobile RA</div>
                        <div className="text-blue-700">TIPO=MOBILE & Tipo Ordine=MOBILE</div>
                      </div>
                      <div className="p-3 bg-blue-50 rounded-lg">
                        <div className="font-medium text-blue-900">RA (Ricarica Automatica)</div>
                        <div className="text-blue-700">TipoRicarica='AUTOMATICA' (o 'RA' normalizzato)</div>
                      </div>
                      <div className="p-3 bg-blue-50 rounded-lg">
                        <div className="font-medium text-blue-900">Fissi PDA</div>
                        <div className="text-blue-700">Attivazioni FTTH/FTTC completate</div>
                      </div>
                    </div>
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900 mb-3">💶 Compensi</h4>
                    <div className="space-y-3 text-sm">
                      <div className="p-3 bg-green-50 rounded-lg">
                        <div className="font-medium text-green-900">€ RA (Totale)</div>
                        <div className="text-green-700">Somma compensi Conv RA + OnlyMobile RA</div>
                      </div>
                      <div className="p-3 bg-green-50 rounded-lg">
                        <div className="font-medium text-green-900">€ Bonus</div>
                        <div className="text-green-700">Bonus raggiungimento soglie (Fissi + Energy)</div>
                      </div>
                      <div className="p-3 bg-green-50 rounded-lg">
                        <div className="font-medium text-green-900">€ Contributo</div>
                        <div className="text-green-700">Rimborso spese e contributi vari</div>
                      </div>
                      <div className="p-3 bg-green-50 rounded-lg">
                        <div className="font-medium text-green-900">€ SIM Vendute</div>
                        <div className="text-green-700">Compensi base per vendita SIM</div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                  <h4 className="font-semibold text-gray-900 mb-2">ℹ️ Note Tecniche</h4>
                  <ul className="text-sm text-gray-700 space-y-1">
                    <li>• <strong>Fonte dati:</strong> Vista <code>vw_compensi_agenti_mese_totale</code> (nuova versione completa)</li>
                    <li>• <strong>Breakdown:</strong> Funzione <code>fn_compensi_agente_breakdown(@MonthStart,@Agente)</code></li>
                    <li>• <strong>Ultimo giorno utile:</strong> Dati aggiornati al {selectedMonthStart ? new Date(selectedMonthStart).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' }) : 'periodo selezionato'}</li>
                    <li>• <strong>Cache:</strong> Aggiornamento tramite <code>sp_refresh_compensi_agenti_mese</code></li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Pannello Breakdown Compensi */}
        {breakdownOpen && (
          <div className="fixed inset-0 z-50">
            <div className="absolute inset-0 bg-black/30" onClick={() => setBreakdownOpen(false)} />
            <div className="absolute right-0 top-0 h-full w-full sm:w-[600px] bg-white shadow-xl flex flex-col">
              <div className="flex items-center justify-between p-4 border-b bg-gray-50 flex-shrink-0">
                <div>
                  <div className="text-lg font-semibold text-gray-900">📊 Breakdown Dettagliato</div>
                  <div className="text-sm text-gray-500">{breakdownData.title}</div>
                  {selectedMonthStart && (
                    <div className="text-xs text-gray-400 mt-1">
                      {formatMonth(selectedMonthStart)} • {selectedAgente || 'Tutti gli agenti'}
                    </div>
                  )}
                </div>
                <button 
                  onClick={() => setBreakdownOpen(false)}
                  className="px-4 py-2 text-sm rounded-md border text-gray-700 hover:bg-gray-50"
                >
                  ✕ Chiudi
                </button>
              </div>
              <div className="flex-1 overflow-auto p-4 pb-8">
                {breakdownData.loading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="text-center">
                      <svg className="animate-spin h-8 w-8 text-blue-600 mx-auto mb-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                      </svg>
                      <div className="text-sm text-gray-500">Caricamento breakdown...</div>
                    </div>
                  </div>
                ) : breakdownData.rows.length === 0 ? (
                  <div className="text-center py-8">
                    <div className="text-gray-400 text-4xl mb-2">📋</div>
                    <div className="text-sm text-gray-500">Nessun dettaglio disponibile</div>
                    <div className="text-xs text-gray-400 mt-1">Prova con filtri diversi</div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Riepilogo */}
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-medium text-blue-900">Totale {breakdownData.title}</div>
                        <div className="text-lg font-bold text-blue-900">
                          {formatEuro(breakdownData.rows.reduce((sum, r) => sum + ((Number(r.qty) || 0) * (Number(r.euroUnit) || 0)), 0))}
                        </div>
                      </div>
                      <div className="text-xs text-blue-700 mt-1">
                        {breakdownData.rows.length} elementi • {formatInt(breakdownData.rows.reduce((sum, r) => sum + Number(r.qty || 0), 0))} quantità totale
                      </div>
                    </div>

                    {/* Tabella dettagli */}
                    <div className="border rounded-lg overflow-hidden">
                      <table className="min-w-full text-sm">
                        <thead className="bg-gray-50 border-b">
                          <tr>
                            <th className="px-4 py-3 text-left font-medium text-gray-700">Dettaglio</th>
                            <th className="px-4 py-3 text-center font-medium text-gray-700">Qty</th>
                            <th className="px-4 py-3 text-right font-medium text-gray-700">€ Unit</th>
                            <th className="px-4 py-3 text-right font-medium text-gray-700">€ Totale</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {breakdownData.rows.map((row, idx) => (
                            <tr key={idx} className="hover:bg-gray-50">
                              <td className="px-4 py-3">
                                <div className="font-medium text-gray-900">{row.dettaglio || '—'}</div>
                                {row.sottoVoce && (
                                  <div className="text-xs text-gray-500 mt-1">
                                    {row.sezione === 'MOBILE_RA' && (
                                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                        String(row.sottoVoce).includes('CONV') ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'
                                      }`}>
                                        {String(row.sottoVoce).includes('CONV') ? '🤝 Convergenza' : '📱 OnlyMobile'}
                                      </span>
                                    )}
                                    {row.sezione !== 'MOBILE_RA' && row.sottoVoce}
                                  </div>
                                )}
                              </td>
                              <td className="px-4 py-3 text-center font-mono">{formatInt(row.qty)}</td>
                              <td className="px-4 py-3 text-right font-mono">{formatEuro(row.euroUnit)}</td>
                              <td className="px-4 py-3 text-right font-semibold">{formatEuro((Number(row.qty) || 0) * (Number(row.euroUnit) || 0))}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
