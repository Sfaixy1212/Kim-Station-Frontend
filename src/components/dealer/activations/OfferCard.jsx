import React from 'react';

function formatPriceEUR(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '€ 0,00';
  // Il valore passato è già in EUR (normalizzato a monte)
  const eur = n;
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(eur);
}

export default function OfferCard({ offer, onSelect }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm hover:shadow-md transition-shadow duration-200">
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-xs font-semibold text-pink-600">{offer.brand || 'Operatore'}</p>
          <h3 className="mt-1 text-sm font-bold text-gray-900 leading-snug">{offer.title}</h3>
        </div>
        {offer.tag && (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">{offer.tag}</span>
        )}
      </div>

      <p className="text-xs text-gray-600 h-16 line-clamp-4">{offer.subtitle}</p>

      <div className="mt-3 flex items-center justify-between">
        <span className="inline-flex items-center justify-center rounded-full bg-blue-50 text-blue-700 border border-blue-200 px-3 py-1 text-sm font-semibold">
          {formatPriceEUR(offer.price)}
        </span>
        <button
          type="button"
          onClick={() => onSelect?.(offer)}
          className="w-28 h-9 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold"
        >
          Attiva
        </button>
      </div>
    </div>
  );
}
