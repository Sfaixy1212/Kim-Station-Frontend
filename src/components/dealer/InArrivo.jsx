import React from 'react';
import { Clock, Sparkles } from 'lucide-react';

export default function InArrivo({ title = "Fatturato del Mese", icon = "💰" }) {
  return (
    <div className="bg-white rounded-xl shadow-sm ring-1 ring-gray-100 p-4">
      <div className="flex items-center space-x-3">
        <div className="flex-shrink-0">
          <div className="w-10 h-10 bg-gradient-to-br from-purple-100 to-blue-100 rounded-lg flex items-center justify-center">
            <span className="text-lg">{icon}</span>
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium text-gray-900">{title}</h3>
          <div className="flex items-center space-x-2 mt-1">
            <Clock className="w-4 h-4 text-purple-500" />
            <p className="text-lg font-semibold text-purple-600">In Arrivo</p>
          </div>
          <p className="text-xs text-gray-500">Funzionalità in sviluppo</p>
        </div>
        <div className="flex-shrink-0">
          <Sparkles className="w-5 h-5 text-purple-400 animate-pulse" />
        </div>
      </div>
      
      {/* Barra di progresso animata */}
      <div className="mt-3">
        <div className="w-full bg-gray-200 rounded-full h-1.5">
          <div className="bg-gradient-to-r from-purple-500 to-blue-500 h-1.5 rounded-full animate-pulse" style={{ width: '60%' }}></div>
        </div>
        <div className="flex justify-between text-xs text-gray-400 mt-1">
          <span>Sviluppo</span>
          <span>60%</span>
        </div>
      </div>
      
      <div className="mt-2 text-xs text-purple-600 bg-purple-50 px-2 py-1 rounded">
        🚀 Presto disponibile con dati reali
      </div>
    </div>
  );
}
