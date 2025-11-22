import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import usePerformanceSettimanale from '../../hooks/dealer/usePerformanceSettimanale';

export default function PerformanceSettimanale() {
  const { data, loading, error } = usePerformanceSettimanale();

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm ring-1 ring-gray-100 p-4">
        <div className="flex items-center space-x-3">
          <div className="flex-shrink-0">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <div className="animate-pulse w-6 h-6 bg-blue-300 rounded"></div>
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="animate-pulse">
              <div className="h-4 bg-gray-200 rounded mb-2"></div>
              <div className="h-6 bg-gray-200 rounded mb-1"></div>
              <div className="h-3 bg-gray-200 rounded w-2/3"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-xl shadow-sm ring-1 ring-gray-100 p-4">
        <div className="flex items-center space-x-3">
          <div className="flex-shrink-0">
            <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
              <span className="text-lg">📊</span>
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-medium text-gray-900">Performance Settimanale</h3>
            <p className="text-2xl font-bold text-gray-400">--</p>
            <p className="text-xs text-red-500">Errore caricamento</p>
          </div>
        </div>
      </div>
    );
  }

  // Dati dalla API o fallback
  const weeklyData = data?.weeklyData || [];
  const totalWeek = data?.totalWeek || 0;
  const previousWeek = data?.previousWeek || 0;
  const trend = data?.trend || 'stable';
  const trendValue = data?.trendValue || 0;

  // Se non ci sono dati reali, mostra dati di esempio
  const hasRealData = weeklyData.length > 0;
  const displayTotal = hasRealData ? totalWeek : 12;
  const displayTrend = hasRealData ? trend : 'up';
  const displayTrendValue = hasRealData ? Math.abs(trendValue) : 3;

  // Icona trend
  const getTrendIcon = () => {
    if (displayTrend === 'up') return <TrendingUp className="w-3 h-3" />;
    if (displayTrend === 'down') return <TrendingDown className="w-3 h-3" />;
    return <Minus className="w-3 h-3" />;
  };

  // Colore trend
  const getTrendColor = () => {
    if (displayTrend === 'up') return 'text-green-600';
    if (displayTrend === 'down') return 'text-red-600';
    return 'text-gray-600';
  };

  // Mini grafico a barre (ultimi 7 giorni)
  const renderMiniChart = () => {
    if (!hasRealData) {
      // Dati di esempio per il mini grafico
      const exampleData = [2, 1, 3, 0, 2, 1, 3];
      const maxValue = Math.max(...exampleData, 1);
      
      return (
        <div className="flex items-end space-x-0.5 h-6 mt-2">
          {exampleData.map((value, index) => (
            <div
              key={index}
              className="flex-1 bg-blue-200 rounded-t"
              style={{ 
                height: `${(value / maxValue) * 100}%`,
                minHeight: value > 0 ? '4px' : '2px'
              }}
              title={`Giorno ${index + 1}: ${value} attivazioni`}
            ></div>
          ))}
        </div>
      );
    }

    // Grafico con dati reali
    const maxValue = Math.max(...weeklyData, 1);
    return (
      <div className="flex items-end space-x-0.5 h-6 mt-2">
        {weeklyData.map((value, index) => (
          <div
            key={index}
            className="flex-1 bg-blue-500 rounded-t"
            style={{ 
              height: `${(value / maxValue) * 100}%`,
              minHeight: value > 0 ? '4px' : '2px'
            }}
            title={`Giorno ${index + 1}: ${value} attivazioni`}
          ></div>
        ))}
      </div>
    );
  };

  return (
    <div className="bg-white rounded-xl shadow-sm ring-1 ring-gray-100 p-4">
      <div className="flex items-start justify-between">
        <div className="flex items-center space-x-3">
          <div className="flex-shrink-0">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <span className="text-lg">📊</span>
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-medium text-gray-900">Performance Settimanale</h3>
            <div className="flex items-baseline space-x-2">
              <p className="text-2xl font-bold text-gray-900">{displayTotal}</p>
              <div className={`flex items-center space-x-1 ${getTrendColor()}`}>
                {getTrendIcon()}
                <span className="text-sm font-medium">+{displayTrendValue}</span>
              </div>
            </div>
            <p className="text-xs text-gray-500">Ultimi 7 giorni</p>
          </div>
        </div>
      </div>
      
      {/* Mini grafico */}
      <div className="mt-3">
        {renderMiniChart()}
        <div className="flex justify-between text-xs text-gray-400 mt-1">
          <span>7gg fa</span>
          <span>Oggi</span>
        </div>
      </div>
      
      {!hasRealData && (
        <div className="mt-2 text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded">
          Dati di esempio - In attesa di integrazione API
        </div>
      )}
    </div>
  );
}
