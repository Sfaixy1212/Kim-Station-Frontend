import { useState } from 'react';
import Card from '../components/common/Card';
import { apiCall } from '../services/api';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      // Usa alias backend già presente: /api/reset-password (inoltra a /api/password-reset-request)
      await apiCall('/reset-password', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      setSent(true);
    } catch (err) {
      // Fallback: mostra istruzioni di supporto
      setSent(false);
      setError('Impossibile inviare il link di reset. Verifica l\'email o riprova più tardi.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-gray-50 flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-lg">
        <Card title="Recupero password" subtitle="Inserisci la tua email per ricevere le istruzioni di reset">
          {sent ? (
            <div className="p-3 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm">
              Se l'email è registrata, riceverai a breve un messaggio con il link per reimpostare la password. Controlla anche in Spam.
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              {error && (
                <div className="p-3 rounded-md bg-amber-50 border border-amber-200 text-amber-700 text-sm">
                  {error}
                </div>
              )}
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-500">Email</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nome@azienda.it"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                />
              </div>
              <div className="flex items-center gap-2">
                <button disabled={loading} className="px-3 py-2 rounded-md bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-60">
                  {loading ? 'Invio…' : 'Invia link di reset'}
                </button>
                <a href="/login" className="text-sm text-gray-600 hover:text-gray-800">Torna al login</a>
              </div>
              <div className="text-xs text-gray-500">
                In alternativa, scrivi a <a href="mailto:support@kimweb.it" className="text-indigo-600">support@kimweb.it</a> indicando la tua email di accesso.
              </div>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
}
