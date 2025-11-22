import React from 'react';

export default function Tabs({ tabs = [], current, onChange }) {
  return (
    <div className="mb-6 border-b border-gray-200">
      <nav className="-mb-px flex flex-wrap gap-2" aria-label="Tabs">
        {tabs.map((t) => {
          const active = t.id === current;
          return (
            <button
              key={t.id}
              onClick={() => onChange?.(t.id)}
              className={
                (active
                  ? 'border-indigo-500 text-indigo-600 bg-indigo-50'
                  : 'border-transparent text-gray-600 hover:text-gray-800 hover:bg-gray-50') +
                ' whitespace-nowrap rounded-t-md border px-4 py-2 text-sm font-medium transition-colors'
              }
            >
              {t.icon && <span className="mr-2">{t.icon}</span>}
              {t.label}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
