import { useMemo, useState } from 'react';
import Card from '../components/common/Card';
import { apiCall } from '../services/api';

export default function ResetPassword() {
  const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
  const token = params.get('token') || '';
  const email = decodeURIComponent(params.get('email') || '');

  const [pwd1, setPwd1] = useState('');
  const [pwd2, setPwd2] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const strong = useMemo(() => {
    // Policy base: almeno 8 char, 1 maiuscola, 1 minuscola, 1 numero
    const okLen = pwd1.length >= 8;
    const up = /[A-Z]/.test(pwd1);
    const low = /[a-z]/.test(pwd1);
    const num = /\d/.test(pwd1);
    return okLen && up && low && num;
  }, [pwd1]);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!token || !email) { setError('Link non valido: token o email mancanti.'); return; }
    if (pwd1 !== pwd2) { setError('Le password non coincidono.'); return; }
    if (!strong) { setError('La password non rispetta i requisiti minimi.'); return; }
    setLoading(true);
    try {
      await apiCall('/password-reset-confirm', {
        method: 'POST',
        body: JSON.stringify({ token, email, newPassword: pwd1 })
      });
      setDone(true);
    } catch (err) {
      setError('Token non valido o scaduto. Richiedi un nuovo reset.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-gray-50 flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-lg">
        <Card title="Imposta nuova password" subtitle={`Account: ${email || '—'}`}>
          {done ? (
            <div className="space-y-3">
              <div className="p-3 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm">
                Password aggiornata con successo.
              </div>
              <a href="/login" className="inline-block px-3 py-2 rounded-md bg-blue-600 text-white text-sm hover:bg-blue-700">Vai al login</a>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              {error && <div className="p-3 rounded-md bg-rose-50 border border-rose-200 text-rose-700 text-sm">{error}</div>}
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-500">Nuova password</label>
                <input type="password" value={pwd1} onChange={(e)=>setPwd1(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
                <div className="text-[11px] text-gray-500">Min 8 caratteri, almeno 1 maiuscola, 1 minuscola, 1 numero.</div>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-500">Conferma password</label>
                <input type="password" value={pwd2} onChange={(e)=>setPwd2(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
              </div>
              <div className="flex items-center gap-2">
                <button disabled={loading} className="px-3 py-2 rounded-md bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-60">{loading ? 'Salvataggio…' : 'Salva password'}</button>
                <a href="/login" className="text-sm text-gray-600 hover:text-gray-800">Annulla</a>
              </div>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
}
