import { useEffect, useState, useMemo } from 'react';
import { getProtectedData } from '../../services/api';

export default function CompensationCard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedMonth, setSelectedMonth] = useState(''); // '' = mese corrente

  // Genera lista mesi da Settembre 2025 fino al mese corrente
  const availableMonths = useMemo(() => {
    const months = [];
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1; // 1-12
    
    // Parte da Settembre 2025
    const startYear = 2025;
    const startMonth = 9; // Settembre
    
    let year = startYear;
    let month = startMonth;
    
    while (year < currentYear || (year === currentYear && month <= currentMonth)) {
      const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
      const label = new Date(year, month - 1, 1).toLocaleDateString('it-IT', { 
        month: 'long', 
        year: 'numeric' 
      });
      
      months.push({ value: monthStart, label: label.charAt(0).toUpperCase() + label.slice(1) });
      
      month++;
      if (month > 12) {
        month = 1;
        year++;
      }
    }
    
    return months.reverse(); // Più recente prima
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        setLoading(true);
        const url = selectedMonth 
          ? `/agente/compensi?monthStart=${selectedMonth}`
          : '/agente/compensi';
        const res = await getProtectedData(url);
        if (active) {
          console.log('[CompensationCard] Dati ricevuti:', res);
          setData(res);
        }
      } catch (e) {
        console.error('Errore fetch compensi:', e);
        if (active) setError(e.message || 'Errore di caricamento');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [selectedMonth]);

  const formatEuro = (value) => {
    return new Intl.NumberFormat('it-IT', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value || 0);
  };

  const compensiData = data?.data || {};
  const meseLabel = data?.meseLabel || 'Mese Corrente';
  
  console.log('[CompensationCard] compensiData:', compensiData);

  const cards = [
    { key: 'Euro_RA', title: '€ RA', icon: '🔁', color: 'bg-green-50 border-green-200', textColor: 'text-green-700' },
    { key: 'Euro_Attivazioni', title: '€ ATTIVAZIONI', icon: '📱', color: 'bg-blue-50 border-blue-200', textColor: 'text-blue-700' },
    { key: 'Euro_SimVendute', title: '€ SIM', icon: '🧾', color: 'bg-purple-50 border-purple-200', textColor: 'text-purple-700' },
    { key: 'Euro_Bonus', title: '€ BONUS', icon: '🎁', color: 'bg-orange-50 border-orange-200', textColor: 'text-orange-700' },
    { key: 'Euro_Contributo', title: '€ CONTRIB.', icon: '💼', color: 'bg-gray-50 border-gray-200', textColor: 'text-gray-700' },
    { key: 'Euro_Totale_Compenso', title: '€ TOTALE', icon: '💰', color: 'bg-emerald-100 border-emerald-300', textColor: 'text-emerald-800', highlight: true },
  ];

  return (
    <div className="bg-white rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 flex items-center">
          💰 Compensi del Mese
        </h3>
        <select
          value={selectedMonth}
          onChange={(e) => setSelectedMonth(e.target.value)}
          className="text-sm border border-gray-300 rounded-md px-3 py-1.5 bg-white hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
        >
          <option value="">Mese Corrente</option>
          {availableMonths.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </div>

      {loading && (
        <div className="py-6 text-sm text-gray-500 text-center">Caricamento compensi...</div>
      )}
      
      {error && !loading && (
        <div className="py-6 text-sm text-red-600 text-center">{error}</div>
      )}

      {!loading && !error && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {cards.map((card) => {
            const value = compensiData[card.key] || 0;
            return (
              <div
                key={card.key}
                className={`rounded-lg border p-3 transition-all hover:shadow-md ${
                  card.highlight ? 'ring-2 ring-emerald-400' : ''
                } ${card.color}`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-lg">{card.icon}</span>
                  {card.highlight && (
                    <span className="text-[10px] font-bold text-emerald-600 bg-emerald-200 px-1.5 py-0.5 rounded-full">
                      TOTALE
                    </span>
                  )}
                </div>
                <div className={`text-xs font-medium mb-1 ${card.textColor}`}>
                  {card.title}
                </div>
                <div className={`text-lg font-bold ${
                  card.highlight ? 'text-emerald-800' : card.textColor
                }`}>
                  {formatEuro(value)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
