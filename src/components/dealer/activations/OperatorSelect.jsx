import React from 'react';

export default function OperatorSelect({ operators = [], value, onChange }) {
  const EXCLUDED = new Set(['KENA MOBILE', 'ASSISTENZA', 'RABONA']);
  const visibleOperators = Array.isArray(operators)
    ? operators
        .filter(op => !EXCLUDED.has(String(op?.name || op?.label || '').toUpperCase()))
        .flatMap(op => {
          const name = String(op?.name || op?.label || '').toUpperCase();
          if (name === 'SKY') {
            // Espandi SKY in 4 varianti
            return [
              { id: `${op.id}::TV`, name: 'SKY TV' },
              { id: `${op.id}::MOBILE`, name: 'SKY MOBILE' },
              { id: `${op.id}::BUSINESS`, name: 'SKY BUSINESS' },
              { id: `${op.id}::BAR`, name: 'SKY BAR' },
            ];
          }
          return [{ id: op.id, name: op.name }];
        })
    : [];
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-gray-700">1. Scegli operatore</label>
      <div className="relative">
        <select
          className="w-full appearance-none rounded-xl border border-gray-200 bg-white py-3 pl-4 pr-10 text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={value || ''}
          onChange={(e) => onChange(e.target.value || null)}
        >
          <option value="">Seleziona...</option>
          {visibleOperators.map((op) => (
            <option key={op.id} value={op.id}>{op.name}</option>
          ))}
        </select>
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-gray-400">▾</span>
      </div>
    </div>
  );
}
