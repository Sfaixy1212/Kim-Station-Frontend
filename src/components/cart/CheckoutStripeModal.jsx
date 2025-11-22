import { useEffect, useMemo, useState } from 'react';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import { toast } from 'react-hot-toast';
import api from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';

function CheckoutForm({ onClose, onSuccess }) {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    if (!stripe || !elements) return;
    try {
      setLoading(true);
      const { error } = await stripe.confirmPayment({ elements, redirect: 'if_required' });
      if (error) throw error;
      toast.success('Pagamento completato!');
      onSuccess?.();
      onClose?.();
    } catch (err) {
      toast.error(err?.message || 'Errore durante il pagamento');
    } finally {
      setLoading(false);
    }
  };
  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="rounded-md border border-gray-200 p-3">
        <PaymentElement options={{ layout: 'tabs' }} />
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className="px-3 py-1.5 rounded-md border">Annulla</button>
        <button type="submit" disabled={loading || !stripe} className="px-3 py-1.5 rounded-md bg-blue-600 text-white disabled:opacity-60">
          {loading ? 'Elaborazione…' : 'Paga ora'}
        </button>
      </div>
    </form>
  );
}

export default function CheckoutStripeModal({ open, onClose, onSuccess, amount, emailCliente, cartItems = [], shippingCost = 0, notes = '' }) {
  const { user } = useAuth();
  const [stripeKey, setStripeKey] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [loadingPI, setLoadingPI] = useState(false);
  const total = useMemo(() => Number(amount || 0), [amount]);

  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const { data } = await api.get('/api/stripe/public-key');
        setStripeKey(data?.publicKey || '');
      } catch {
        setStripeKey('');
      }
    })();
  }, [open]);

  useEffect(() => {
    if (!open || !stripeKey) return;
    (async () => {
      try {
        setLoadingPI(true);
        const safeCart = cartItems.map(it => ({ id: it.id, quantita: it.qty || 1 }));
        const payload = {
          amount: total,
          userId: user?.idDealer || user?.dealerId || user?.id,
          dealerId: user?.dealerId || user?.idDealer || undefined,
          carrello: safeCart,
          emailCliente: emailCliente || user?.email,
          speseSpedizione: shippingCost,
          noteOrdine: notes || '',
          metadata: { orderType: 'PROD', dealerId: String(user?.dealerId || user?.idDealer || '') }
        };
        const { data } = await api.post('/api/stripe/create-product-payment-intent', payload);
        const cs = data?.client_secret;
        if (!cs) throw new Error('client_secret non ricevuto');
        setClientSecret(cs);
      } catch (e) {
        toast.error(e?.response?.data?.error || e?.message || 'Errore creazione pagamento');
        onClose?.();
      } finally {
        setLoadingPI(false);
      }
    })();
  }, [open, stripeKey, total, emailCliente, cartItems, shippingCost, notes, user?.dealerId, user?.idDealer, user?.id, user?.email]);

  const stripePromise = useMemo(() => (stripeKey ? loadStripe(stripeKey) : null), [stripeKey]);
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">Pagamento Ordine</h3>
          {stripeKey?.startsWith('pk_test_') && (
            <span className="text-[11px] px-2 py-0.5 rounded bg-yellow-100 text-yellow-800 border border-yellow-200">TEST MODE</span>
          )}
        </div>
        <div className="text-sm text-gray-700 mb-2">
          Totale da pagare: <span className="font-semibold">{new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR'}).format(total)}</span>
        </div>
        {!stripePromise || !clientSecret ? (
          <div className="text-sm text-gray-600">{loadingPI ? 'Preparazione pagamento…' : 'Inizializzazione…'}</div>
        ) : (
          <Elements key={clientSecret} stripe={stripePromise} options={{ clientSecret, appearance: { theme: 'stripe' }, locale: 'it' }}>
            <CheckoutForm onClose={onClose} onSuccess={onSuccess} />
          </Elements>
        )}
      </div>
    </div>
  );
}
