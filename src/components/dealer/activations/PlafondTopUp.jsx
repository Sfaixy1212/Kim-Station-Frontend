import React, { useEffect, useRef, useState } from 'react';
import { toast } from 'react-hot-toast';
import { loadStripe } from '@stripe/stripe-js';
import api from '../../../api/client';

export default function PlafondTopUp({ onClose, onSuccess }) {
  const [publicKey, setPublicKey] = useState(null);
  const [stripe, setStripe] = useState(null);
  const elementsRef = useRef(null);
  const cardRef = useRef(null);
  const [amount, setAmount] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get('/api/stripe/public-key');
        const pk = data?.publicKey || data?.public_key || data;
        if (!pk) throw new Error('Stripe public key missing');
        setPublicKey(pk);
        const stripeInstance = await loadStripe(pk);
        setStripe(stripeInstance);
        const elements = stripeInstance.elements();
        elementsRef.current = elements;
        const card = elements.create('card');
        card.mount('#card-element');
        cardRef.current = card;
      } catch (e) {
        toast.error(e?.message || 'Impossibile inizializzare Stripe');
        onClose?.();
      }
    })();
    return () => {
      try { cardRef.current?.destroy(); } catch {}
    };
  }, [onClose]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!stripe || !elementsRef.current) return;
    const euro = parseFloat(amount);
    if (!euro || euro <= 0) {
      toast.error('Importo non valido');
      return;
    }
    if (!email) {
      toast.error('Email richiesta');
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.post('/api/ricarica-plafond', {
        amount: euro,
        emailCliente: email,
      });
      const clientSecret = data?.client_secret || data?.clientSecret;
      if (!clientSecret) throw new Error('client_secret mancante');
      const { error, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
        payment_method: {
          card: cardRef.current,
          billing_details: { email },
        },
      });
      if (error) throw error;
      toast.success('Pagamento completato');
      onSuccess?.(paymentIntent);
      onClose?.();
    } catch (err) {
      toast.error(err?.message || 'Errore pagamento');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-lg">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">Ricarica Plafond</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm text-gray-700">Importo (EUR)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-3"
              placeholder="Es. 50.00"
              required
            />
          </div>
          <div>
            <label className="text-sm text-gray-700">Email cliente</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-3"
              placeholder="cliente@example.com"
              required
            />
          </div>
          <div>
            <label className="text-sm text-gray-700">Carta</label>
            <div id="card-element" className="mt-1 rounded-xl border border-gray-200 p-3" />
          </div>
          <div className="pt-2 flex items-center justify-end gap-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-gray-200 px-4 py-2 text-sm">Annulla</button>
            <button type="submit" disabled={loading} className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50">
              {loading ? 'Elaborazione…' : 'Paga e ricarica'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
