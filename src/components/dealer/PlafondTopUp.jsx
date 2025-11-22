import { useEffect, useMemo, useState } from 'react';
import { toast } from 'react-hot-toast';
import api from '../../api/client';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { useAuth } from '../../contexts/AuthContext';

const QUICK_AMOUNTS = [50, 100, 250, 500];

function TopUpForm({ onClose, onSuccess }) {
  const stripe = useStripe();
  const elements = useElements();
  const [amount, setAmount] = useState('50');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { user } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    try {
      setLoading(true);
      setError('');
      // Conferma pagamento con PaymentElement (supporta card + Link).
      // Il clientSecret è già passato a <Elements>.
      const { error: stripeErr } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: window.location.href,
          receipt_email: user?.email,
        },
        redirect: 'if_required',
      });
      if (stripeErr) throw stripeErr;

      // 3) Successo (se non è richiesto redirect)
      onSuccess?.();
      onClose?.();
    } catch (err) {
      setError(err?.message || 'Errore durante il pagamento');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Nessun LinkAuthenticationElement: email è presa dall'utente autenticato */}

      {/* Payment Element (carta + Link) */}
      <div className="rounded-md border border-gray-200 p-3">
        <PaymentElement options={{ layout: 'tabs' }} />
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <div className="flex justify-between gap-2 pt-2">
        <button type="button" onClick={onClose} className="px-4 py-2 rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200">Annulla</button>
        <button disabled={loading || !stripe} type="submit" className="px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
          {loading ? 'Elaborazione…' : 'Procedi al pagamento'}
        </button>
      </div>
    </form>
  );
}

export default function PlafondTopUp() {
  const [open, setOpen] = useState(false);
  const [stripeKey, setStripeKey] = useState('');
  const [amount, setAmount] = useState(50);
  const [clientSecret, setClientSecret] = useState('');
  const [piLoading, setPiLoading] = useState(false);
  const [piError, setPiError] = useState('');
  const { user } = useAuth();

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener('open-plafond-topup', onOpen);
    return () => window.removeEventListener('open-plafond-topup', onOpen);
  }, []);

  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const { data } = await api.get('/api/stripe/public-key');
        setStripeKey(data?.publicKey || '');
      } catch {}
    })();
  }, [open]);

  // Crea o ricrea il PaymentIntent quando la modale è aperta o cambia l'importo
  useEffect(() => {
    if (!open || !stripeKey) return;
    (async () => {
      try {
        setPiLoading(true);
        setPiError('');
        const { data } = await api.post('/api/ricarica-plafond', { amount, emailCliente: user?.email });
        const cs = data?.client_secret;
        if (!cs) throw new Error('Client secret non ricevuto');
        setClientSecret(cs);
      } catch (e) {
        setPiError(e?.response?.data?.error || e?.message || 'Errore creazione pagamento');
      } finally {
        setPiLoading(false);
      }
    })();
  }, [open, stripeKey, amount, user?.email]);

  const stripePromise = useMemo(() => (stripeKey ? loadStripe(stripeKey) : null), [stripeKey]);

  const handleSuccess = () => {
    // Notifica aggiornamento plafond
    window.dispatchEvent(new CustomEvent('plafond-updated'));
    toast.success('Pagamento riuscito! Il tuo plafond sarà aggiornato a breve.', { duration: 3000 });
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-5">
        <div className="mb-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">Ricarica credito plafond</h3>
            {stripeKey?.startsWith('pk_test_') && (
              <span className="text-[11px] px-2 py-0.5 rounded bg-yellow-100 text-yellow-800 border border-yellow-200">TEST MODE</span>
            )}
          </div>
          <p className="text-sm text-gray-600">Dati carta di credito:</p>
        </div>
        {/* Quick amounts in header of modal */}
        <div className="flex flex-wrap gap-2 mb-3">
          {QUICK_AMOUNTS.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setAmount(v)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium ${amount===v ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-700 hover:bg-blue-100'}`}
            >
              {v.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}
            </button>
          ))}
        </div>

        {/* Anteprima importo */}
        <div className="mb-2 text-sm text-gray-700">
          <span className="font-medium">Importo:</span>{' '}
          {Number(amount).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}
        </div>

        {/* Email utente visualizzata, non modificabile */}
        {user?.email ? (
          <div className="mb-2 text-sm text-gray-700"><span className="font-medium">Email:</span> {user.email}</div>
        ) : null}

        {!stripePromise || !clientSecret ? (
          <div className="text-sm text-gray-600">{piLoading ? 'Preparazione pagamento…' : (piError || 'Inizializzazione pagamento…')}</div>
        ) : (
          <Elements key={clientSecret} stripe={stripePromise} options={{ clientSecret, appearance: { theme: 'stripe' }, locale: 'it' }}>
            <TopUpForm onClose={() => setOpen(false)} onSuccess={handleSuccess} />
          </Elements>
        )}
      </div>
    </div>
  );
}
