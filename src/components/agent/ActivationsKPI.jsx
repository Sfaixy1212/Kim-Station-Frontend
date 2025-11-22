import { useState, useEffect } from 'react';
import { getProtectedData } from '../../services/api';
import { Zap, Wifi, Smartphone, Battery, Tv, Flame } from 'lucide-react';

export default function ActivationsKPI() {
  const [kpi, setKpi] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchKPI();
  }, []);

  const fetchKPI = async () => {
    try {
      setLoading(true);
      // Chiama l'endpoint che restituisce i totali per l'agente
      const response = await getProtectedData('/agente/ultime-attivazioni-agente');
      
      // Calcola i totali
      const totals = {
        fissi: 0,
        mobili: 0,
        energy: 0,
        eni: 0,
        sky: 0,
        totale: 0
      };

      if (Array.isArray(response)) {
        response.forEach(dealer => {
          totals.fissi += Number(dealer['FW FISSI'] || dealer.FWFissi || dealer.fw_fissi || 0);
          totals.mobili += Number(dealer['FW MOBILI'] || dealer.FWMobili || dealer.fw_mobili || 0);
          totals.energy += Number(dealer['FW ENERGY'] || dealer.FWEnergy || dealer.fw_energy || 0);
          totals.eni += Number(dealer.ENI || dealer.eni || 0);
          totals.sky += Number(dealer.SKY || dealer.sky || 0);
        });
        totals.totale = totals.fissi + totals.mobili + totals.energy + totals.eni + totals.sky;
      }

      setKpi(totals);
    } catch (error) {
      console.error('Errore caricamento KPI:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="bg-white rounded-lg border border-gray-200 p-4 animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-20 mb-2"></div>
            <div className="h-8 bg-gray-200 rounded w-12"></div>
          </div>
        ))}
      </div>
    );
  }

  if (!kpi) return null;

  const cards = [
    {
      label: 'Attivazioni mese',
      value: kpi.totale,
      icon: Zap,
      color: 'text-orange-600',
      bgColor: 'bg-orange-50'
    },
    {
      label: 'FASTWEB FISSI',
      value: kpi.fissi,
      icon: Wifi,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50'
    },
    {
      label: 'FASTWEB MOBILI',
      value: kpi.mobili,
      icon: Smartphone,
      color: 'text-purple-600',
      bgColor: 'bg-purple-50'
    },
    {
      label: 'FASTWEB ENERGY',
      value: kpi.energy,
      icon: Battery,
      color: 'text-green-600',
      bgColor: 'bg-green-50'
    },
    {
      label: 'SKY',
      value: kpi.sky,
      icon: Tv,
      color: 'text-indigo-600',
      bgColor: 'bg-indigo-50'
    },
    {
      label: 'ENI PLENITUDE',
      value: kpi.eni,
      icon: Flame,
      color: 'text-emerald-600',
      bgColor: 'bg-emerald-50'
    }
  ];

  return (
    <div className="relative z-10 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
      {cards.map((card, index) => {
        const Icon = card.icon;
        return (
          <div
            key={index}
            className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-gray-600 uppercase tracking-wide">
                {card.label}
              </span>
              <div className={`${card.bgColor} p-1.5 rounded-lg`}>
                <Icon className={`w-4 h-4 ${card.color}`} />
              </div>
            </div>
            <div className="text-2xl font-bold text-gray-900">
              {card.value}
            </div>
          </div>
        );
      })}
    </div>
  );
}
