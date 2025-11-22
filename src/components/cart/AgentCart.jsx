import { useMemo, useRef } from 'react';

export default function AgentCart({
  items,
  onIncrease,
  onDecrease,
  onRemove,
  transportMethod,
  setTransportMethod,
  notes,
  setNotes,
  onCheckout,
  photos = [],
  onAddPhotos,
  onRemovePhoto,
}) {
  // Stima spedizione per UI
  // - "Invio da Sede": massimo SpeseSpedizione tra gli articoli (se tutti 0 => 0)
  // - "Consegna a Mano": 0
  const shippingCost = useMemo(() => {
    if (transportMethod === 'Consegna a Mano') return 0;
    // Invio da Sede
    const values = items
      .map((it) => Number(it.speseSpedizione ?? it.SpeseSpedizione ?? 0))
      .filter((v) => Number.isFinite(v) && v >= 0);
    if (values.length === 0) return 0;
    return Math.max(0, ...values);
  }, [transportMethod, items]);

  const subtotal = useMemo(() => {
    // items.price è in EUR per UI; backend userà priceCents
    return items.reduce((sum, it) => sum + (it.price || 0) * (it.qty || 1), 0);
  }, [items]);

  const total = useMemo(() => subtotal + shippingCost, [subtotal, shippingCost]);

  const displayShipping = useMemo(() => {
    if (!items || items.length === 0) return '—';
    return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(shippingCost);
  }, [items, shippingCost]);

  const fileInputRef = useRef(null);

  const handleAttachClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event) => {
    const files = event.target.files;
    if (files && files.length && typeof onAddPhotos === 'function') {
      onAddPhotos(files);
    }
    if (event.target) {
      event.target.value = '';
    }
  };

  const handleRemovePhoto = (id) => {
    if (typeof onRemovePhoto === 'function') {
      onRemovePhoto(id);
    }
  };

  return (
    <section className="bg-white rounded-xl p-4 sm:p-6 sticky top-24">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Carrello</h3>

      {/* Lista articoli */}
      <div className="divide-y divide-gray-100 border border-gray-100 rounded-xl overflow-hidden">
        {items.length === 0 && (
          <div className="p-4 text-sm text-gray-500 text-center">Il carrello è vuoto</div>
        )}
        {items.map((it) => (
          <div key={`${it.id}`} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
            <div className="flex items-center gap-3 flex-1">
              <img src={it.image} alt={it.title} className="w-12 h-12 object-contain rounded" />
              <div className="flex-1">
                <div className="text-sm font-medium text-gray-900 line-clamp-1">{it.title}</div>
                <div className="text-xs text-gray-500">
                  {new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(it.price)}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => onDecrease(it.id)} className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-gray-200 text-gray-700 hover:bg-gray-50">-</button>
                <span className="w-6 text-center text-sm font-semibold">{it.qty}</span>
                <button onClick={() => onIncrease(it.id)} className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-gray-200 text-gray-700 hover:bg-gray-50">+</button>
              </div>
              <button onClick={() => onRemove(it.id)} className="ml-2 text-red-600 text-sm hover:underline">Rimuovi</button>
            </div>

            {/* Caso speciale OFFERTA 446: input codice */}
            {Number(it.idOfferta) === 446 && (
              <div className="pl-15 sm:pl-16">
                <label className="block text-xs font-medium text-gray-700 mb-1">Codice speciale (cim-flora-kim-dXXX)</label>
                <input
                  type="text"
                  value={it.customCode || ''}
                  onChange={(e) => {
                    // Propaga modificando la quantità via decrease/increase non aiuta; qui usiamo onRemove + re-add no
                    // In mancanza di un updater dedicato, usiamo un custom event sul window per semplicità
                    const ev = new CustomEvent('agentcart:updateItem', { detail: { id: it.id, patch: { customCode: e.target.value } } });
                    window.dispatchEvent(ev);
                  }}
                  placeholder="cim-flora-kim-d123"
                  className="w-full rounded-lg border-gray-300 focus:border-blue-500 focus:ring-blue-500 text-sm"
                />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Trasporto */}
      <div className="mt-5">
        <h4 className="text-sm font-semibold text-gray-900 mb-2">Metodo di trasporto</h4>
        <div className="grid grid-cols-1 gap-2">
          <label className={`flex items-center justify-between p-3 border rounded-lg cursor-pointer ${transportMethod==='Invio da Sede' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'}`}>
            <span className="flex items-center gap-2 text-sm text-gray-800">Invio da Sede</span>
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-600">{displayShipping}</span>
              <input type="radio" name="transport" value="Invio da Sede" checked={transportMethod==='Invio da Sede'} onChange={() => setTransportMethod('Invio da Sede')} />
            </div>
          </label>
          <label className={`flex items-center justify-between p-3 border rounded-lg cursor-pointer ${transportMethod==='Consegna a Mano' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'}`}>
            <span className="flex items-center gap-2 text-sm text-gray-800">Consegna a Mano</span>
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-600">{new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(0)}</span>
              <input type="radio" name="transport" value="Consegna a Mano" checked={transportMethod==='Consegna a Mano'} onChange={() => setTransportMethod('Consegna a Mano')} />
            </div>
          </label>
        </div>
      </div>

      {/* Note ordine */}
      <div className="mt-5">
        <h4 className="text-sm font-semibold text-gray-900 mb-2">Note per l'ordine</h4>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Aggiungi eventuali indicazioni per la spedizione o la fatturazione..."
          className="w-full rounded-lg border-gray-300 focus:border-blue-500 focus:ring-blue-500 text-sm"
        />
      </div>

      {/* Foto consegna */}
      <div className="mt-5">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-semibold text-gray-900">Foto consegna</h4>
          <button
            type="button"
            onClick={handleAttachClick}
            className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100"
          >
            📷 Allega foto
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          className="hidden"
          onChange={handleFileChange}
        />
        {photos.length === 0 ? (
          <p className="text-xs text-gray-500">Nessuna foto allegata. Puoi caricare immagini da galleria o scattarle ora.</p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {photos.map((photo) => (
              <div key={photo.id} className="relative h-20 w-20 overflow-hidden rounded-lg border border-gray-200">
                <img
                  src={photo.preview}
                  alt={photo.file?.name || 'Foto consegna'}
                  className="h-full w-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => handleRemovePhoto(photo.id)}
                  className="absolute top-1 right-1 rounded-full bg-white/80 px-1 text-[10px] text-red-600 shadow"
                  aria-label="Rimuovi foto"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Totali */}
      <div className="mt-5 border-t pt-4 space-y-2 text-sm">
        <div className="flex justify-between"><span className="text-gray-600">Subtotale</span><span className="font-medium">{new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(subtotal)}</span></div>
        <div className="flex justify-between"><span className="text-gray-600">Spedizione</span><span className="font-medium">{displayShipping}</span></div>
        <div className="flex justify-between text-base pt-2"><span className="font-semibold text-gray-900">Totale</span><span className="font-bold text-gray-900">{new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(total)}</span></div>
      </div>

      <button
        type="button"
        onClick={onCheckout}
        disabled={items.length === 0}
        className="mt-5 w-full inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-3 text-white text-sm font-semibold shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition disabled:opacity-50 disabled:cursor-not-allowed"
      >
        INSERISCI ORDINE
      </button>
    </section>
  );
}
