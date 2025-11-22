import { useMemo, useState } from 'react';
import CheckoutStripeModal from './CheckoutStripeModal';
import { useAuth } from '../../contexts/AuthContext';

export default function Cart({
  items,
  onIncrease,
  onDecrease,
  onRemove,
  paymentMethod,
  setPaymentMethod,
  transportMethod,
  setTransportMethod,
  notes,
  setNotes,
  onCheckout,
  hasNonFastwebSim = false, // Indica se ci sono SIM non-Fastweb nel carrello
}) {
  const { user } = useAuth?.() || { user: null };
  const [openStripe, setOpenStripe] = useState(false);

  const shippingCost = useMemo(() => {
    // LOGICA CORRETTA:
    // - DEALER: Spese solo se transportMethod === 'corriere' 
    // - AGENTE: Spese solo se transportMethod === 'Invio da Sede'
    
    const shouldApplyShipping = 
      transportMethod === 'corriere' || // Per dealer
      transportMethod === 'Invio da Sede'; // Per agente
    
    if (!shouldApplyShipping) {
      return 0;
    }
    
    // Verifica se almeno un prodotto richiede spese di trasporto
    const hasShippingRequired = items.some(it => {
      const spese = Number(it.speseSpedizione ?? it.SpeseSpedizione ?? 0);
      return spese > 0;
    });
    
    if (!hasShippingRequired) {
      // Nessun prodotto richiede spese di trasporto
      return 0;
    }
    
    // Se almeno 1 prodotto richiede spese, prendi il massimo
    const maxShip = items.reduce((m, it) => {
      const v = Number(it.speseSpedizione ?? it.SpeseSpedizione ?? 0);
      return Number.isFinite(v) ? Math.max(m, v) : m;
    }, 0);
    
    console.log(`[CART] Metodo: ${transportMethod}, Spese trasporto: €${maxShip}`);
    return maxShip;
  }, [transportMethod, items]);

  const subtotal = useMemo(() => {
    return items.reduce((sum, it) => sum + (it.price || 0) * (it.qty || 1), 0);
  }, [items]);

  const total = useMemo(() => subtotal + shippingCost, [subtotal, shippingCost]);

  const handleCheckout = () => {
    if (paymentMethod === 'card') {
      // Apri modale Stripe elegante
      setOpenStripe(true);
      return;
    }
    // altri metodi (es. SEPA) demandati al parent
    onCheckout?.();
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
          <div key={it.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
            <div className="flex items-center gap-3 flex-1">
              <img src={it.image} alt={it.title} className="w-12 h-12 object-contain rounded" />
              <div className="flex-1">
                <div className="text-sm font-medium text-gray-900 line-clamp-1">{it.title}</div>
                <div className="text-xs text-gray-500">{new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(it.price)}</div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => onDecrease(it.id)} className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-gray-200 text-gray-700 hover:bg-gray-50">-</button>
                <span className="w-6 text-center text-sm font-semibold">{it.qty}</span>
                <button 
                  onClick={() => onIncrease(it.id)} 
                  className={`h-8 w-8 inline-flex items-center justify-center rounded-md border text-sm ${
                    Number(it.idOfferta) === 149 && it.qty >= 1 
                      ? 'border-gray-300 text-gray-400 cursor-not-allowed' 
                      : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                  }`}
                  disabled={Number(it.idOfferta) === 149 && it.qty >= 1}
                >+</button>
              </div>
              <button onClick={() => onRemove(it.id)} className="ml-2 text-red-600 text-sm hover:underline">Rimuovi</button>
            </div>

            {/* Messaggio informativo per SIM ILIAD (IDOfferta 149) */}
            {Number(it.idOfferta) === 149 && (
              <div className="pl-15 sm:pl-16">
                <div className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-md px-2 py-1">
                  ⚠️ SIM ILIAD: massimo 1 pack per ordine
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Metodi pagamento */}
      <div className="mt-5">
        <h4 className="text-sm font-semibold text-gray-900 mb-2">Metodo di pagamento</h4>
        
        {/* Avviso SIM non-Fastweb */}
        {hasNonFastwebSim && (
          <div className="mb-3 p-3 bg-amber-50 border border-amber-300 rounded-lg">
            <div className="flex items-start gap-2">
              <span className="text-amber-600 text-lg">⚠️</span>
              <div className="flex-1">
                <p className="text-xs font-semibold text-amber-900 mb-1">ATTENZIONE</p>
                <p className="text-xs text-amber-800">
                  Il carrello contiene SIM non-Fastweb. Il pagamento è consentito <strong>solo con carta di credito</strong>.
                </p>
              </div>
            </div>
          </div>
        )}
        
        <div className="grid grid-cols-1 gap-2">
          <label className={`flex items-center gap-2 p-3 border rounded-lg cursor-pointer ${paymentMethod==='card' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'}`}>
            <input type="radio" name="payment" value="card" checked={paymentMethod==='card'} onChange={() => setPaymentMethod('card')} />
            <span className="text-sm text-gray-800">Carta di credito</span>
          </label>
          <label 
            className={`flex items-center gap-2 p-3 border rounded-lg ${
              hasNonFastwebSim 
                ? 'opacity-50 cursor-not-allowed bg-gray-100 border-gray-300' 
                : `cursor-pointer ${paymentMethod==='sepa' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'}`
            }`}
            title={hasNonFastwebSim ? 'Bonifico non disponibile per SIM non-Fastweb' : ''}
          >
            <input 
              type="radio" 
              name="payment" 
              value="sepa" 
              checked={paymentMethod==='sepa'} 
              onChange={() => setPaymentMethod('sepa')} 
              disabled={hasNonFastwebSim}
            />
            <span className="text-sm text-gray-800">Bonifico SEPA</span>
            {hasNonFastwebSim && (
              <span className="ml-auto text-xs text-gray-500">(Non disponibile)</span>
            )}
          </label>
        </div>
      </div>

      {/* Trasporto */}
      <div className="mt-5">
        <h4 className="text-sm font-semibold text-gray-900 mb-2">Metodo di trasporto</h4>
        <div className="grid grid-cols-1 gap-2">
          <label className={`flex items-center justify-between p-3 border rounded-lg cursor-pointer ${transportMethod==='corriere' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'}`}>
            <span className="flex items-center gap-2 text-sm text-gray-800">Corriere</span>
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-600">{new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(shippingCost)}</span>
              <input type="radio" name="transport" value="corriere" checked={transportMethod==='corriere'} onChange={() => setTransportMethod('corriere')} />
            </div>
          </label>
        </div>
      </div>

      {/* Codice speciale per prodotti dedicati (mostrato prima delle note) */}
      {items.some((it) => Number(it.idOfferta) === 446) && (
        <div className="mt-5">
          <h4 className="text-sm font-semibold text-gray-900 mb-2">Codice speciale</h4>
          {items
            .filter((it) => Number(it.idOfferta) === 446)
            .map((it) => {
              const isMissingCode = !(it.customCode && it.customCode.trim());
              return (
                <div key={`code-${it.id}`} className="mb-3">
                  <label className="block text-xs font-semibold text-gray-800 mb-1 uppercase tracking-wide">Codice speciale (cim-flora-kim-dXXX)</label>
                  <div className="mb-2 text-xs text-red-600 font-medium flex items-center gap-1">
                    <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-red-100 text-red-600 text-[10px] font-bold">!</span>
                    <span>Campo obbligatorio per completare l'ordine.</span>
                  </div>
                  <input
                    type="text"
                    value={it.customCode || ''}
                    onChange={(e) => {
                      const ev = new CustomEvent('agentcart:updateItem', { detail: { id: it.id, patch: { customCode: e.target.value } } });
                      window.dispatchEvent(ev);
                    }}
                    placeholder="cim-flora-kim-d123"
                    className={`w-full rounded-lg text-sm ${isMissingCode ? 'border-2 border-red-400 focus:border-red-500 focus:ring-red-500' : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500'}`}
                  />
                </div>
              );
            })}
        </div>
      )}

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

      {/* Totali */}
      <div className="mt-5 border-t pt-4 space-y-2 text-sm">
        <div className="flex justify-between"><span className="text-gray-600">Subtotale</span><span className="font-medium">{new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(subtotal)}</span></div>
        <div className="flex justify-between"><span className="text-gray-600">Spedizione</span><span className="font-medium">{new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(shippingCost)}</span></div>
        <div className="flex justify-between text-base pt-2"><span className="font-semibold text-gray-900">Totale</span><span className="font-bold text-gray-900">{new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(total)}</span></div>
      </div>

      <button
        type="button"
        onClick={handleCheckout}
        disabled={items.length === 0}
        className="mt-5 w-full inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-3 text-white text-sm font-semibold shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Procedi all'acquisto
      </button>

      {/* Modale Stripe per pagamento carta */}
      <CheckoutStripeModal
        open={openStripe}
        onClose={() => setOpenStripe(false)}
        onSuccess={() => {
          try {
            const detail = { total, items };
            window.dispatchEvent(new CustomEvent('order-paid', { detail }));
          } catch {}
          setOpenStripe(false);
        }}
        amount={total}
        emailCliente={user?.email}
        cartItems={items}
        shippingCost={shippingCost}
        notes={notes}
      />
    </section>
  );
}
