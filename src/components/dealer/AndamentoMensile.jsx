import React from 'react';
import { TrendingUp, TrendingDown, Minus, Calendar, Zap, Smartphone, Wifi } from 'lucide-react';
import useAndamentoMensile from '../../hooks/dealer/useAndamentoMensile';

export default function AndamentoMensile() {
  const { data, loading, error } = useAndamentoMensile();

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm ring-1 ring-gray-100 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Andamento Mensile</h3>
          <div className="flex items-center space-x-2 text-blue-600">
            <Calendar className="w-5 h-5" />
            <span className="text-sm">Attivazioni</span>
          </div>
        </div>
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded mb-2"></div>
          <div className="h-4 bg-gray-200 rounded mb-4"></div>
          <div className="grid grid-cols-3 gap-4">
            <div className="h-16 bg-gray-200 rounded"></div>
            <div className="h-16 bg-gray-200 rounded"></div>
            <div className="h-16 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-xl shadow-sm ring-1 ring-gray-100 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Andamento Mensile</h3>
          <div className="flex items-center space-x-2 text-blue-600">
            <Calendar className="w-5 h-5" />
            <span className="text-sm">Attivazioni</span>
          </div>
        </div>
        <div className="text-center py-8">
          <div className="text-red-500 text-sm mb-2">Errore nel caricamento</div>
          <div className="text-gray-500 text-xs">{error}</div>
        </div>
      </div>
    );
  }

  const current = data?.current || {};
  const variation = data?.variation || {};
  const monthlyData = data?.monthlyData || [];
  
  // Debug per vedere i dati ricevuti (rimuovere in produzione)
  console.log('[AndamentoMensile] Data ricevuta:', data);
  console.log('[AndamentoMensile] monthlyData:', monthlyData);

  // Formatta il mese corrente
  const currentMonthFormatted = current.month 
    ? new Date(current.month).toLocaleDateString('it-IT', { 
        month: 'long', 
        year: 'numeric' 
      })
    : 'N/D';

  // Icona e colore per la variazione
  const getTrendIcon = () => {
    if (variation.trend === 'up') return <TrendingUp className="w-4 h-4" />;
    if (variation.trend === 'down') return <TrendingDown className="w-4 h-4" />;
    return <Minus className="w-4 h-4" />;
  };

  const getTrendColor = () => {
    if (variation.trend === 'up') return 'text-green-600';
    if (variation.trend === 'down') return 'text-red-600';
    return 'text-gray-600';
  };

  const getTrendBgColor = () => {
    if (variation.trend === 'up') return 'bg-green-50';
    if (variation.trend === 'down') return 'bg-red-50';
    return 'bg-gray-50';
  };

  return (
    <div className="bg-white rounded-xl shadow-sm ring-1 ring-gray-100 p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold text-gray-900">Andamento Mensile</h3>
        <div className="flex items-center space-x-2 text-blue-600">
          <Calendar className="w-4 h-4" />
          <span className="text-xs">Attivazioni</span>
        </div>
      </div>

      {/* Statistiche principali - solo trend e mese */}
      <div className="mb-3">
        <div className="flex items-center justify-between">
          <div className="text-xs text-gray-600">
            {currentMonthFormatted}
          </div>
          <div className={`flex items-center space-x-1 px-2 py-1 rounded-full text-xs font-medium ${getTrendBgColor()} ${getTrendColor()}`}>
            {getTrendIcon()}
            <span>{Math.abs(variation.percentage || 0)}%</span>
          </div>
        </div>
      </div>

      {/* Breakdown per tipologia */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="text-center p-1.5 bg-blue-50 rounded-lg">
          <div className="flex items-center justify-center mb-0.5">
            <Wifi className="w-3 h-3 text-blue-600" />
          </div>
          <div className="text-xs font-semibold text-blue-900">{current.fisso || 0}</div>
          <div className="text-xs text-blue-700">Fisso</div>
        </div>
        
        <div className="text-center p-1.5 bg-purple-50 rounded-lg">
          <div className="flex items-center justify-center mb-0.5">
            <Smartphone className="w-3 h-3 text-purple-600" />
          </div>
          <div className="text-xs font-semibold text-purple-900">{current.mobile || 0}</div>
          <div className="text-xs text-purple-700">Mobile</div>
        </div>
        
        <div className="text-center p-1.5 bg-green-50 rounded-lg">
          <div className="flex items-center justify-center mb-0.5">
            <Zap className="w-3 h-3 text-green-600" />
          </div>
          <div className="text-xs font-semibold text-green-900">{current.energia || 0}</div>
          <div className="text-xs text-green-700">Energia</div>
        </div>
      </div>

      {/* Mini grafico degli ultimi mesi */}
      <div className="border-t pt-2">
        <div className="text-xs font-medium text-gray-700 mb-1">Ultimi 6 mesi</div>
        {monthlyData.length === 0 ? (
          <div className="text-xs text-gray-500 text-center py-2">
            Nessun dato disponibile
          </div>
        ) : (
          <div className="flex items-end justify-between space-x-1 h-8">
          {(() => {
            // Crea array degli ultimi 6 mesi
            const now = new Date();
            const last6Months = [];
            
            for (let i = 5; i >= 0; i--) {
              const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
              const monthKey = date.toISOString().substring(0, 7); // YYYY-MM
              
              // Trova i dati per questo mese
              const monthData = monthlyData.find(m => {
                if (!m.month) return false;
                const dataMonth = new Date(m.month).toISOString().substring(0, 7);
                return dataMonth === monthKey;
              });
              
              last6Months.push({
                date,
                monthName: date.toLocaleDateString('it-IT', { month: 'short' }),
                totale: monthData ? monthData.totale : 0
              });
            }
            
            const maxValue = Math.max(...last6Months.map(m => m.totale), 1);
            
            return last6Months.map((month, index) => {
              const height = maxValue > 0 ? (month.totale / maxValue) * 100 : 0;
              
              // Debug per ogni mese (rimuovere in produzione)
              console.log(`[AndamentoMensile] ${month.monthName}: totale=${month.totale}, height=${height}%`);
              
              return (
                <div key={index} className="flex-1 flex flex-col items-center">
                  <div 
                    className="w-full bg-blue-500 rounded-t transition-all duration-300 hover:bg-blue-600"
                    style={{ 
                      height: month.totale > 0 ? `${Math.max(height, 10)}%` : '2px',
                      minHeight: month.totale > 0 ? '8px' : '2px'
                    }}
                    title={`${month.monthName}: ${month.totale} attivazioni`}
                  ></div>
                  <div className="text-xs text-gray-500 mt-1">{month.monthName}</div>
                </div>
              );
            });
          })()}
          </div>
        )}
      </div>

      {/* Dettaglio Mobile RA se presente */}
      {current.mobileRa > 0 && (
        <div className="mt-2 pt-2 border-t">
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-600">di cui Mobile RA:</span>
            <span className="font-semibold text-amber-600">{current.mobileRa}</span>
          </div>
        </div>
      )}
    </div>
  );
}
