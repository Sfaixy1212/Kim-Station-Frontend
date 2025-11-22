import React from 'react';

export default function Chip({ label, onClear }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-blue-50 text-blue-700 px-3 py-1.5 text-sm border border-blue-200">
      {label}
      {onClear && (
        <button
          type="button"
          onClick={onClear}
          className="ml-1 inline-flex h-5 w-5 items-center justify-center rounded-full hover:bg-blue-100 text-blue-700"
          aria-label="Rimuovi"
        >
          ×
        </button>
      )}
    </span>
  );
}
