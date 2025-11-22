export default function ProductCard({ image, title, price, originalPrice, discountPct, onSelect, idOfferta }) {
  const hasDiscount = Number(discountPct) > 0 && Number.isFinite(discountPct);
  const formattedPrice = typeof price === 'number'
    ? new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(price)
    : price;
  const formattedOriginal = typeof originalPrice === 'number'
    ? new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(originalPrice)
    : null;

  return (
    <div className="group relative bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all duration-200 hover:-translate-y-0.5">
      {hasDiscount && (
        <div className="absolute top-3 right-3 z-10">
          <span className="inline-flex items-center rounded-full bg-red-500 px-2 py-1 text-xs font-semibold text-white shadow-sm">
            -{Number(discountPct).toFixed(0)}%
          </span>
        </div>
      )}
      <div className="p-5 sm:p-6 flex flex-col h-full">
        <div className="flex-1 flex items-center justify-center">
          <img
            src={image}
            alt={title}
            className="h-16 sm:h-20 object-contain drop-shadow-sm transition-transform duration-200 group-hover:scale-[1.03]"
            loading="lazy"
          />
        </div>

        <div className="mt-5 text-center">
          <h3 className="text-sm sm:text-base font-semibold text-gray-900 leading-snug">
            {title}
          </h3>
          {hasDiscount && formattedOriginal && (
            <div className="mt-1 text-xs text-gray-400 line-through">
              {formattedOriginal}
            </div>
          )}
          <p className="mt-0.5 text-blue-700 font-bold">
            {formattedPrice}
          </p>
          {/* Avviso limite per SIM ILIAD */}
          {Number(idOfferta) === 149 && (
            <div className="mt-2 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-md px-2 py-1">
              Max 1 pack per ordine
            </div>
          )}
        </div>

        <button
          onClick={onSelect}
          className="mt-5 inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2.5 text-white text-sm font-semibold shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition"
          type="button"
        >
          Seleziona
        </button>
      </div>

      <div className="absolute inset-0 rounded-2xl ring-1 ring-transparent group-hover:ring-blue-100/80 pointer-events-none transition" />
    </div>
  );
}
