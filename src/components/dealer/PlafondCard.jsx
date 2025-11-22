import { useEffect, useState } from 'react';
import api from '../../api/client';

const currency = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });

export default function PlafondCard() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [credito, setCredito] = useState(0);

  const fetchCredito = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await api.get('/api/plafond');
      setCredito(Number(res.data?.credito || 0));
    } catch (e) {
      setError(e?.response?.data?.error || 'Errore caricamento credito');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCredito();
    const onUpdated = () => fetchCredito();
    window.addEventListener('plafond-updated', onUpdated);
    return () => window.removeEventListener('plafond-updated', onUpdated);
  }, []);

  return (
    <div className="relative bg-gradient-to-br from-blue-500 via-blue-600 to-indigo-700 rounded-xl shadow-lg p-6 h-full flex flex-col overflow-hidden group hover:shadow-xl transition-all duration-300">
      {/* Decorative circles */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-white opacity-5 rounded-full -mr-16 -mt-16" />
      <div className="absolute bottom-0 left-0 w-24 h-24 bg-white opacity-5 rounded-full -ml-12 -mb-12" />
      
      {/* Header with icon and badge */}
      <div className="flex items-start justify-between mb-4 relative z-10">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 bg-white bg-opacity-20 rounded-lg flex items-center justify-center backdrop-blur-sm">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
            </svg>
          </div>
        </div>
        <div className="bg-green-400 text-green-900 text-[10px] font-bold px-2 py-1 rounded-full shadow-sm">
          DISPONIBILE
        </div>
      </div>

      {/* Credit amount */}
      <div className="flex-1 flex flex-col justify-center relative z-10">
        <p className="text-sm text-blue-100 mb-1 font-medium">Credito plafond</p>
        <p className="text-4xl font-black text-white mb-1 tracking-tight">
          {loading ? '…' : currency.format(credito)}
        </p>
        {error && (
          <span className="text-xs text-red-200 bg-red-500 bg-opacity-20 px-2 py-1 rounded mt-2 inline-block">
            {error}
          </span>
        )}
      </div>

      {/* Button */}
      <button
        onClick={() => window.dispatchEvent(new CustomEvent('open-plafond-topup'))}
        className="w-full px-4 py-2.5 rounded-lg bg-white text-blue-600 text-sm font-bold hover:bg-blue-50 transition-all shadow-md hover:shadow-lg transform hover:scale-105 relative z-10"
        type="button"
      >
        💳 Ricarica
      </button>
    </div>
  );
}
