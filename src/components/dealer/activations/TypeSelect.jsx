import React from 'react';

export default function TypeSelect({ types = [], value, onChange }) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-gray-700">2. Scegli tipologia</label>
      <div className="flex flex-wrap gap-2">
        {types.map((t) => {
          const active = value === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onChange(t.id)}
              className={`px-3 py-2 rounded-xl border text-sm transition-all duration-200 ${
                active
                  ? 'bg-blue-50 text-blue-700 border-blue-200 shadow-sm'
                  : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
