import React from 'react';

export default function CreditWidget({ value, loading, onRefresh, onTopUp }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div>
        <div className="text-xs uppercase tracking-wide text-gray-500">Credito Plafond</div>
        <div className="text-xl font-semibold text-gray-900">
          {loading ? '…' : (typeof value === 'number' ? value.toFixed(2) : value?.credito ?? '—')} €
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onRefresh}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
        >
          Aggiorna
        </button>
        <button
          type="button"
          onClick={onTopUp}
          className="rounded-lg bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700"
        >
          Ricarica
        </button>
      </div>
    </div>
  );
}
