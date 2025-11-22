import { useState, useEffect } from 'react';
import { 
  Euro, TrendingUp, Target, ChevronRight, X, 
  Loader2, AlertTriangle, Zap, Wifi, Smartphone, Award 
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

const currency = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });

export default function CompensiRealtimeWide() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerVisible, setDrawerVisible] = useState(false);
  
  // Mese selezionato (default: mese corrente)
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  
  // Genera lista mesi da settembre 2025 a oggi
  const getAvailableMonths = () => {
    const months = [];
    const start = new Date(2025, 8, 1); // Settembre 2025 (mese 8 = settembre)
    const end = new Date();
    
    let current = new Date(start);
    while (current <= end) {
      const year = current.getFullYear();
      const month = String(current.getMonth() + 1).padStart(2, '0');
      months.push({
        value: `${year}-${month}`,
        label: current.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })
      });
      current.setMonth(current.getMonth() + 1);
    }
    
    return months.reverse(); // Più recenti prima
  };
  
  const availableMonths = getAvailableMonths();

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Usa il mese selezionato
        const monthStart = `${selectedMonth}-01`;

        console.log('[CompensiRealtimeWide] Fetching compensi for month:', monthStart);

        const token = localStorage.getItem('token');
        const response = await fetch('/api/supermaster/compensi-dealer', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            monthStart
            // dealerId viene estratto dal token JWT dal backend
          })
        });

        if (!response.ok) {
          throw new Error('Errore nel caricamento dei dati');
        }

        const result = await response.json();
        console.log('[CompensiRealtimeWide] API Response:', result);
        console.log('[CompensiRealtimeWide] Dettagli count:', result?.dettagli?.length || 0);
        console.log('[CompensiRealtimeWide] Totale compensi:', result?.totaleCompensi);
        setData(result);
      } catch (err) {
        console.error('[CompensiRealtimeWide] Errore caricamento compensi:', err);
        setError(err?.response?.data?.message || 'Errore caricamento dati');
      } finally {
        setLoading(false);
      }
    };

    if (user) {
      fetchData();
    }
  }, [user, selectedMonth]);

  const openDrawer = () => {
    setDrawerOpen(true);
    setTimeout(() => setDrawerVisible(true), 10);
  };

  const closeDrawer = () => {
    setDrawerVisible(false);
    setTimeout(() => setDrawerOpen(false), 300);
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm ring-1 ring-gray-100 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 bg-gradient-to-br from-green-100 to-emerald-100 rounded-lg flex items-center justify-center">
              <Euro className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">I Tuoi Compensi</h3>
              <p className="text-sm text-gray-500">Caricamento dati...</p>
            </div>
          </div>
        </div>
        <div className="animate-pulse grid grid-cols-3 gap-4">
          <div className="h-20 bg-gray-200 rounded-lg"></div>
          <div className="h-20 bg-gray-200 rounded-lg"></div>
          <div className="h-20 bg-gray-200 rounded-lg"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-xl shadow-sm ring-1 ring-gray-100 p-4">
        <div className="flex items-center space-x-2 mb-3">
          <div className="w-8 h-8 bg-gradient-to-br from-red-100 to-orange-100 rounded flex items-center justify-center">
            <Euro className="w-4 h-4 text-red-600" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">I Tuoi Compensi</h3>
            <p className="text-sm text-red-500">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  // Estrazione dati reali dall'API
  const maturato = data?.totaleCompensi || 0;
  
  console.log('[CompensiRealtimeWide] Calcolo compensi:', {
    totaleCompensi: data?.totaleCompensi,
    totaleGenerale: data?.totaleGenerale,
    maturato,
    dettagliCount: data?.dettagli?.length
  });
  
  // Se non ci sono dati, mostra messaggio
  const hasData = maturato > 0 || (data?.dettagli && data.dettagli.length > 0);
  
  // Calcolo proiezione (semplice: maturato * giorni totali / giorni passati)
  // Usa il mese selezionato per il calcolo
  const [selectedYear, selectedMonthNum] = selectedMonth.split('-').map(Number);
  const selectedDate = new Date(selectedYear, selectedMonthNum - 1, now.getDate());
  const dayOfMonth = selectedDate.getDate();
  const daysInMonth = new Date(selectedYear, selectedMonthNum, 0).getDate();
  
  // Per mesi passati (completi), la proiezione è uguale al maturato
  const isCurrentMonth = selectedYear === now.getFullYear() && selectedMonthNum === (now.getMonth() + 1);
  const proiezione = isCurrentMonth && dayOfMonth > 0 
    ? (maturato / dayOfMonth) * daysInMonth 
    : maturato;
  
  console.log('[CompensiRealtimeWide] Calcolo proiezione:', {
    selectedMonth,
    isCurrentMonth,
    dayOfMonth,
    daysInMonth,
    maturato,
    proiezione
  });
  
  // ========================================
  // CALCOLO POTENZIALE MASSIMO BASATO SULLE SOGLIE
  // ========================================
  const calcolaPotenzialeMassimo = () => {
    if (!data?.soglie || !data?.dettagli) {
      console.log('[CompensiRealtimeWide] Nessuna soglia disponibile');
      return maturato * 1.3; // Fallback al vecchio calcolo
    }

    console.log('[CompensiRealtimeWide] Soglie disponibili:', data.soglie.length);
    
    // Raggruppa attivazioni per categoria/segmento
    const attivazioniPerCategoria = new Map();
    
    data.dettagli.forEach(detail => {
      // Solo attivazioni TLC (escludiamo CESSIONE_SIM e ANTICIPO)
      if (detail.ambito !== 'TLC') return;
      
      const key = `${detail.categoria}_${detail.segmento}`;
      if (!attivazioniPerCategoria.has(key)) {
        attivazioniPerCategoria.set(key, {
          categoria: detail.categoria,
          segmento: detail.segmento,
          qtyTotale: 0,
          euroAttuali: 0
        });
      }
      
      const gruppo = attivazioniPerCategoria.get(key);
      gruppo.qtyTotale += detail.qty || 0;
      gruppo.euroAttuali += detail.euroCalcolati || 0;
    });

    console.log('[CompensiRealtimeWide] Attivazioni per categoria:', Array.from(attivazioniPerCategoria.entries()));

    let potenzialeTotale = maturato; // Partiamo dal maturato attuale
    
    // Per ogni categoria, calcola il potenziale massimo
    attivazioniPerCategoria.forEach((gruppo, key) => {
      // Trova tutte le soglie per questa categoria/segmento
      const soglieCategoria = data.soglie.filter(s => 
        s.categoria === gruppo.categoria && 
        s.segmento === gruppo.segmento &&
        s.ambito === 'TLC'
      ).sort((a, b) => a.sogliaMin - b.sogliaMin);

      if (soglieCategoria.length === 0) return;

      // Trova la soglia massima (quella con sogliaMax più alto o null)
      const sogliaMax = soglieCategoria.reduce((max, curr) => {
        if (curr.sogliaMax === null || curr.sogliaMax === 0) return curr;
        if (max.sogliaMax === null || max.sogliaMax === 0) return max;
        return curr.sogliaMax > max.sogliaMax ? curr : max;
      });

      // Calcola il compenso massimo raggiungibile
      const qtyPerSogliaMax = sogliaMax.sogliaMax || sogliaMax.sogliaMin + 10; // Se null, usa min + 10
      const compensoMassimo = qtyPerSogliaMax * sogliaMax.importoPerPezzo;
      
      // Aggiungi la differenza al potenziale
      const differenza = compensoMassimo - gruppo.euroAttuali;
      if (differenza > 0) {
        potenzialeTotale += differenza;
      }

      console.log(`[CompensiRealtimeWide] ${key}:`, {
        qtyAttuale: gruppo.qtyTotale,
        euroAttuali: gruppo.euroAttuali,
        sogliaMax: sogliaMax.sogliaMin + '-' + (sogliaMax.sogliaMax || '∞'),
        importoPerPezzo: sogliaMax.importoPerPezzo,
        compensoMassimo,
        differenza
      });
    });

    return potenzialeTotale;
  };
  
  const potenziale = calcolaPotenzialeMassimo();
  
  // Breakdown per ambito con qty
  const breakdown = {};
  if (data?.dettagli && Array.isArray(data.dettagli)) {
    console.log('[CompensiRealtimeWide] Processing dettagli:', data.dettagli.length);
    // Raggruppa per ambito
    const ambitoMap = new Map();
    data.dettagli.forEach(detail => {
      const ambito = detail.ambito || 'ALTRO';
      if (!ambitoMap.has(ambito)) {
        ambitoMap.set(ambito, { euro: 0, qty: 0 });
      }
      const current = ambitoMap.get(ambito);
      current.euro += detail.euroCalcolati || 0;
      current.qty += detail.qty || 0;
    });
    
    // Converti in oggetto con chiavi lowercase
    ambitoMap.forEach((value, key) => {
      breakdown[key.toLowerCase()] = value;
    });
    console.log('[CompensiRealtimeWide] Breakdown calculated:', breakdown);
  } else {
    console.log('[CompensiRealtimeWide] No dettagli found in data:', data);
  }
  
  // ========================================
  // CALCOLO OPPORTUNITÀ BASATE SULLE SOGLIE
  // ========================================
  const calcolaOpportunita = () => {
    const opportunita = [];
    
    if (!data?.soglie || !data?.dettagli) {
      return opportunita;
    }

    // Raggruppa attivazioni per categoria/segmento
    const attivazioniPerCategoria = new Map();
    
    data.dettagli.forEach(detail => {
      if (detail.ambito !== 'TLC') return;
      
      const key = `${detail.categoria}_${detail.segmento}`;
      if (!attivazioniPerCategoria.has(key)) {
        attivazioniPerCategoria.set(key, {
          categoria: detail.categoria,
          segmento: detail.segmento,
          qtyTotale: 0,
          euroAttuali: 0,
          sogliaAttuale: detail.sogliaMin
        });
      }
      
      const gruppo = attivazioniPerCategoria.get(key);
      gruppo.qtyTotale += detail.qty || 0;
      gruppo.euroAttuali += detail.euroCalcolati || 0;
    });

    // Per ogni categoria, trova opportunità di salire di soglia
    attivazioniPerCategoria.forEach((gruppo, key) => {
      const soglieCategoria = data.soglie.filter(s => 
        s.categoria === gruppo.categoria && 
        s.segmento === gruppo.segmento &&
        s.ambito === 'TLC'
      ).sort((a, b) => a.sogliaMin - b.sogliaMin);

      if (soglieCategoria.length === 0) return;

      // Trova la soglia attuale e la prossima
      let sogliaAttuale = null;
      let sogliaProssima = null;

      for (let i = 0; i < soglieCategoria.length; i++) {
        const soglia = soglieCategoria[i];
        if (gruppo.qtyTotale >= soglia.sogliaMin && 
            (soglia.sogliaMax === null || gruppo.qtyTotale <= soglia.sogliaMax)) {
          sogliaAttuale = soglia;
          sogliaProssima = soglieCategoria[i + 1] || null;
          break;
        }
      }

      // Se c'è una soglia successiva, crea un'opportunità
      if (sogliaProssima) {
        const attivazioniMancanti = sogliaProssima.sogliaMin - gruppo.qtyTotale;
        const compensoConSogliaProssima = sogliaProssima.sogliaMin * sogliaProssima.importoPerPezzo;
        const guadagnoExtra = compensoConSogliaProssima - gruppo.euroAttuali;

        opportunita.push({
          tipo: 'SOGLIA_SUCCESSIVA',
          descrizione: `Raggiungi ${gruppo.categoria} ${gruppo.segmento} livello ${sogliaProssima.sogliaMin}+`,
          categoria: `${gruppo.categoria} ${gruppo.segmento}`,
          attualeQty: gruppo.qtyTotale,
          targetQty: sogliaProssima.sogliaMin,
          mancano: attivazioniMancanti,
          importoAttuale: sogliaAttuale?.importoPerPezzo || 0,
          importoProssimo: sogliaProssima.importoPerPezzo,
          guadagnoExtra: Math.max(0, guadagnoExtra),
          urgenza: attivazioniMancanti <= 2 ? 'alta' : attivazioniMancanti <= 5 ? 'media' : 'bassa',
          percentualeAttuale: Math.round((gruppo.qtyTotale / sogliaProssima.sogliaMin) * 100),
          percentualeTarget: 100
        });
      }
    });

    // Opportunità: Potenziale massimo generale
    if (potenziale > maturato) {
      const guadagnoExtra = potenziale - maturato;
      const percentualeAttuale = Math.round((maturato / potenziale) * 100);
      opportunita.push({
        tipo: 'POTENZIALE',
        descrizione: 'Raggiungi il potenziale massimo',
        percentualeAttuale,
        percentualeTarget: 100,
        guadagnoExtra,
        urgenza: percentualeAttuale < 70 ? 'alta' : percentualeAttuale < 85 ? 'media' : 'bassa'
      });
    }

    // Ordina per urgenza e guadagno
    return opportunita.sort((a, b) => {
      const urgenzaOrder = { alta: 3, media: 2, bassa: 1 };
      if (urgenzaOrder[a.urgenza] !== urgenzaOrder[b.urgenza]) {
        return urgenzaOrder[b.urgenza] - urgenzaOrder[a.urgenza];
      }
      return b.guadagnoExtra - a.guadagnoExtra;
    });
  };
  
  const opportunita = calcolaOpportunita();
  const topOpportunita = opportunita.slice(0, 3);

  const getIconForCategory = (key) => {
    const k = key.toLowerCase();
    if (k.includes('fisso') || k.includes('tlc')) return <Wifi className="w-3 h-3 text-blue-600" />;
    if (k.includes('mobile')) return <Smartphone className="w-3 h-3 text-purple-600" />;
    if (k.includes('energia')) return <Zap className="w-3 h-3 text-green-600" />;
    return <Target className="w-3 h-3 text-gray-600" />;
  };

  return (
    <>
      <div className="bg-white rounded-xl shadow-sm ring-1 ring-gray-100 p-4">
        {/* ⚠️ BANNER AVVISO ULTRA COMPATTO */}
        <div className="mb-2 bg-amber-50 border-l-4 border-amber-400 p-1.5 rounded-r-lg">
          <div className="flex items-center space-x-1">
            <AlertTriangle className="w-3 h-3 text-amber-600 flex-shrink-0" />
            <p className="text-xs font-medium text-amber-900">
              ⚙️ Dati indicativi
            </p>
          </div>
        </div>

        {/* Header Ultra Compatto */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center space-x-1.5">
            <div className="w-6 h-6 bg-gradient-to-br from-green-100 to-emerald-100 rounded flex items-center justify-center">
              <Euro className="w-3 h-3 text-green-600" />
            </div>
            <div>
              <h3 className="text-xs font-semibold text-gray-900">Compensi</h3>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="text-xs text-gray-600 bg-transparent border-none cursor-pointer hover:text-gray-900 focus:outline-none"
              >
                {availableMonths.map(month => (
                  <option key={month.value} value={month.value}>
                    {month.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <button
            onClick={openDrawer}
            className="p-0.5 rounded hover:bg-gray-100 transition-colors"
            title="Apri dettaglio"
          >
            <ChevronRight className="w-3 h-3 text-gray-600" />
          </button>
        </div>

        {/* Messaggio Nessun Dato */}
        {!hasData && (
          <div className="text-center py-6 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-600 mb-1">📊 Nessun dato disponibile</p>
            <p className="text-xs text-gray-500">
              Non ci sono compensi calcolati per questo mese o non sono ancora state configurate le regole di compenso.
            </p>
          </div>
        )}

        {/* KPI Row Ultra Compatto */}
        {hasData && (
        <>
        <div className="grid grid-cols-3 gap-1.5 mb-2">
          {/* Maturato */}
          <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded p-1.5 border border-green-200">
            <p className="text-xs font-medium text-green-900">Maturato</p>
            <p className="text-sm font-bold text-green-600">{currency.format(maturato)}</p>
          </div>

          {/* Proiezione */}
          <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded p-1.5 border border-blue-200">
            <p className="text-xs font-medium text-blue-900">Proiezione</p>
            <p className="text-sm font-bold text-blue-600">{currency.format(proiezione)}</p>
          </div>

          {/* Potenziale */}
          <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded p-1.5 border border-purple-200">
            <p className="text-xs font-medium text-purple-900">Potenziale</p>
            <p className="text-sm font-bold text-purple-600">{currency.format(potenziale)}</p>
          </div>
        </div>
        
        {/* Content Grid Ultra Compatto */}
        <div className="grid grid-cols-2 gap-2 mb-2">
          {/* Left: Breakdown */}
          <div>
            <h4 className="text-xs font-semibold text-gray-900 mb-2 flex items-center">
              <TrendingUp className="w-3 h-3 mr-1 text-blue-600" />
              Breakdown
            </h4>
            <div className="space-y-1">
              {Object.entries(breakdown).length > 0 ? (
                Object.entries(breakdown).map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between text-xs">
                    <div className="flex items-center space-x-1">
                      {getIconForCategory(key)}
                      <span className="text-gray-700 capitalize">
                        {key.replace('_', ' ').replace('tlc ', '')}
                      </span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <span className="font-semibold text-gray-900">
                        {currency.format(value.euro)}
                      </span>
                      <span className="text-gray-500 text-xs">({value.qty})</span>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-xs text-gray-500">Nessun dato</p>
              )}
            </div>
          </div>

          {/* Right: Opportunità */}
          <div>
            <h4 className="text-xs font-semibold text-gray-900 mb-2 flex items-center">
              <Target className="w-3 h-3 mr-1 text-orange-600" />
              Obiettivi
            </h4>
            {topOpportunita.length > 0 ? (
              <div className="space-y-1">
                {topOpportunita.slice(0, 2).map((opp, idx) => (
                  <div
                    key={idx}
                    className={`flex items-center justify-between p-1.5 rounded text-xs ${
                      opp.urgenza === 'alta'
                        ? 'bg-red-50 border border-red-200'
                        : opp.urgenza === 'media'
                        ? 'bg-orange-50 border border-orange-200'
                        : 'bg-blue-50 border border-blue-200'
                    }`}
                  >
                    <div className="flex-1">
                      <div className="flex items-center space-x-1">
                        <span className="text-xs text-gray-700">{opp.descrizione}</span>
                      </div>
                      {opp.tipo === 'SOGLIA_SUCCESSIVA' && opp.mancano && (
                        <div className="text-xs text-gray-500 mt-0.5">
                          Mancano {opp.mancano} attivazioni
                        </div>
                      )}
                      {opp.tipo === 'POTENZIALE' && opp.percentualeAttuale && (
                        <div className="text-xs text-gray-500 mt-0.5">
                          {opp.percentualeAttuale}% → {opp.percentualeTarget || 100}%
                        </div>
                      )}
                    </div>
                    <span className="font-bold text-green-600 text-xs ml-2">
                      +{currency.format(opp.guadagnoExtra)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500">Nessun obiettivo disponibile</p>
            )}
          </div>
        </div>
        </>
        )}

        {/* CTA Button Ultra Compatto */}
        {hasData && (
        <div className="mt-2 pt-1.5 border-t border-gray-200">
          <button
            onClick={openDrawer}
            className="w-full flex items-center justify-center space-x-1 px-2 py-1 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white rounded text-xs font-medium transition-all"
          >
            <span>Dettagli</span>
            <ChevronRight className="w-3 h-3" />
          </button>
        </div>
        )}
      </div>

      {/* Drawer Dettagliato */}
      {drawerOpen && (
        <>
          <div
            className={`fixed inset-0 bg-black/30 backdrop-blur-sm z-40 transition-opacity duration-300 ${
              drawerVisible ? 'opacity-100' : 'opacity-0'
            }`}
            onClick={closeDrawer}
          />
          <div
            className={`fixed top-0 right-0 h-full w-full max-w-2xl bg-white shadow-xl z-50 flex flex-col transition-transform duration-300 ${
              drawerVisible ? 'translate-x-0' : 'translate-x-full'
            }`}
          >
            {/* Header Drawer */}
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Compensi Dettagliati</h2>
                <p className="text-sm text-gray-500">
                  {new Date(selectedYear, selectedMonthNum - 1).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })}
                </p>
              </div>
              <button
                onClick={closeDrawer}
                className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {/* Content Drawer - Scrollabile */}
            <div className="flex-1 overflow-y-auto p-6">
              {/* Banner Avviso nel Drawer */}
              <div className="mb-6 bg-amber-50 border border-amber-200 rounded-lg p-4">
                <div className="flex items-start space-x-3">
                  <AlertTriangle className="w-6 h-6 text-amber-600 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-amber-900 mb-1">
                      ⚙️ Dati in Fase di Integrazione
                    </p>
                    <p className="text-xs text-amber-700">
                      I compensi e le simulazioni mostrate sono indicativi. Stiamo completando l'integrazione con il sistema di calcolo ufficiale. I dati definitivi saranno disponibili a breve.
                    </p>
                  </div>
                </div>
              </div>

              {/* Totale Maturato */}
              <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl p-6 mb-6 border border-green-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-green-900 mb-1">Totale Maturato</p>
                    <p className="text-4xl font-bold text-green-600">
                      {currency.format(maturato)}
                    </p>
                  </div>
                  <div className="w-16 h-16 bg-green-200 rounded-full flex items-center justify-center">
                    <Euro className="w-8 h-8 text-green-700" />
                  </div>
                </div>
              </div>

              {/* Breakdown Dettagliato */}
              {Object.keys(breakdown).length > 0 && (
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                    <TrendingUp className="w-5 h-5 mr-2 text-blue-600" />
                    Breakdown per Categoria
                  </h3>
                  <div className="space-y-3">
                    {Object.entries(breakdown).map(([key, value]) => (
                      <div key={key} className="bg-white border border-gray-200 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium text-gray-700 uppercase">
                            {key.replace('_', ' ')}
                          </span>
                          <span className="text-lg font-bold text-gray-900">
                            {currency.format(value.euro)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-xs text-gray-500">
                          <span>{value.qty} attivazioni</span>
                          <span>Media: {currency.format(value.importoMedio)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Opportunità Dettagliate */}
              {opportunita.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                    <Target className="w-5 h-5 mr-2 text-orange-600" />
                    Opportunità di Guadagno
                  </h3>
                  <div className="space-y-4">
                    {opportunita.map((opp, idx) => (
                      <div
                        key={idx}
                        className={`border-2 rounded-xl p-4 ${
                          opp.urgenza === 'alta'
                            ? 'border-red-300 bg-red-50'
                            : opp.urgenza === 'media'
                            ? 'border-orange-300 bg-orange-50'
                            : 'border-blue-300 bg-blue-50'
                        }`}
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center space-x-2">
                            <span className="text-2xl">
                              {opp.tipo === 'POTENZIALE' ? '🚀' : opp.tipo === 'SOGLIA_SUCCESSIVA' ? '🎯' : '⚖️'}
                            </span>
                            <div>
                              <h4 className="font-semibold text-gray-900">{opp.descrizione}</h4>
                              {opp.categoria && (
                                <p className="text-xs text-gray-600">{opp.categoria}</p>
                              )}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-2xl font-bold text-green-600">
                              +{currency.format(opp.guadagnoExtra)}
                            </div>
                          </div>
                        </div>

                        {/* Dettagli specifici per tipo */}
                        {opp.tipo === 'SOGLIA_SUCCESSIVA' && (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-gray-700">Attivazioni attuali:</span>
                              <span className="font-semibold">{opp.attualeQty}</span>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-gray-700">Prossima soglia:</span>
                              <span className="font-semibold">{opp.targetQty}</span>
                            </div>
                            <div className="flex items-center justify-between text-sm font-semibold">
                              <span className="text-gray-900">Mancano:</span>
                              <span className="text-orange-600">{opp.mancano} attivazioni</span>
                            </div>
                            <div className="mt-2 p-2 bg-blue-50 rounded text-xs text-blue-900">
                              💰 Compenso attuale: {currency.format(opp.importoAttuale)}/pezzo → 
                              Prossimo: {currency.format(opp.importoProssimo)}/pezzo
                            </div>
                            {/* Progress Bar */}
                            <div className="mt-3">
                              <div className="w-full bg-gray-200 rounded-full h-2">
                                <div
                                  className="bg-gradient-to-r from-green-500 to-emerald-500 h-2 rounded-full transition-all duration-500"
                                  style={{ width: `${opp.percentualeAttuale}%` }}
                                ></div>
                              </div>
                            </div>
                          </div>
                        )}

                        {opp.tipo === 'POTENZIALE' && (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-gray-700">Progresso attuale:</span>
                              <span className="font-semibold">{opp.percentualeAttuale}%</span>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-gray-700">Obiettivo:</span>
                              <span className="font-semibold">{opp.percentualeTarget}%</span>
                            </div>
                            {/* Progress Bar */}
                            <div className="mt-3">
                              <div className="w-full bg-gray-200 rounded-full h-2">
                                <div
                                  className="bg-gradient-to-r from-green-500 to-emerald-500 h-2 rounded-full transition-all duration-500"
                                  style={{ width: `${opp.percentualeAttuale}%` }}
                                ></div>
                              </div>
                            </div>
                          </div>
                        )}

                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Potenziale Massimo */}
              {potenziale > 0 && (
                <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl p-6 border-2 border-purple-200">
                  <div className="flex items-center space-x-3 mb-3">
                    <Award className="w-8 h-8 text-purple-600" />
                    <div>
                      <h3 className="text-lg font-semibold text-purple-900">Potenziale Massimo</h3>
                      <p className="text-sm text-purple-700">
                        {data?.potenzialeMassimo?.dettaglio || 'Con tutti i livelli e bonus raggiungibili'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-baseline space-x-2">
                    <span className="text-4xl font-bold text-purple-600">
                      {currency.format(potenziale)}
                    </span>
                    {potenziale > maturato && (
                      <span className="text-lg font-semibold text-purple-500">
                        (+{data?.potenzialeMassimo?.incrementoPercentuale || Math.round(((potenziale - maturato) / maturato) * 100)}%)
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Footer Drawer */}
            <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
              <button
                onClick={closeDrawer}
                className="w-full px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors font-medium"
              >
                Chiudi
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
