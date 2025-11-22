import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/client';
import { getProtectedData } from '../../services/api';

const currency = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });

export default function PlafondNewsCard({ dealerId }) {
  const navigate = useNavigate();
  
  // Plafond state
  const [loadingPlafond, setLoadingPlafond] = useState(true);
  const [errorPlafond, setErrorPlafond] = useState('');
  const [credito, setCredito] = useState(0);

  // News state
  const [loadingNews, setLoadingNews] = useState(true);
  const [errorNews, setErrorNews] = useState('');
  const [news, setNews] = useState([]);

  const fetchCredito = async () => {
    try {
      setLoadingPlafond(true);
      setErrorPlafond('');
      const res = await api.get('/api/plafond');
      setCredito(Number(res.data?.credito || 0));
    } catch (e) {
      setErrorPlafond(e?.response?.data?.error || 'Errore caricamento credito');
    } finally {
      setLoadingPlafond(false);
    }
  };

  const fetchNews = async () => {
    try {
      setLoadingNews(true);
      setErrorNews('');
      const p = new URLSearchParams();
      p.set('scope', 'dealer');
      p.set('active', 'true');
      if (dealerId != null && dealerId !== '') p.set('dealerId', String(dealerId));
      const data = await getProtectedData(`/supermaster/news?${p.toString()}`);
      const list = Array.isArray(data) ? data : [];
      setNews(list.slice(0, 2));
    } catch (e) {
      setErrorNews(e?.message || 'Errore caricamento news');
    } finally {
      setLoadingNews(false);
    }
  };

  useEffect(() => {
    fetchCredito();
    const onUpdated = () => fetchCredito();
    window.addEventListener('plafond-updated', onUpdated);
    return () => window.removeEventListener('plafond-updated', onUpdated);
  }, []);

  useEffect(() => {
    fetchNews();
  }, [dealerId]);

  return (
    <div className="bg-white rounded-xl shadow-sm ring-1 ring-gray-100 p-4 flex flex-col gap-3">
      {/* Sezione Plafond */}
      <div className="pb-3 border-b border-gray-200">
        <p className="text-xs text-gray-600 mb-1">Credito plafond</p>
        <p className="text-lg font-bold text-gray-900 mb-2">
          {loadingPlafond ? '…' : currency.format(credito)}
        </p>
        {errorPlafond && <span className="text-xs text-red-600 block mb-2">{errorPlafond}</span>}
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('open-plafond-topup'))}
          className="w-full px-3 py-1.5 rounded-md bg-blue-600 text-white text-xs hover:bg-blue-700 transition-colors"
          type="button"
        >
          Ricarica
        </button>
      </div>

      {/* Sezione News */}
      <div className="pt-1">
        <div className="mb-2">
          <h3 className="text-sm font-semibold text-gray-800">News</h3>
          <p className="text-xs text-gray-500">Comunicazioni per il tuo punto vendita</p>
        </div>
        
        {loadingNews && (
          <div className="space-y-1.5">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="h-3 bg-gray-200 rounded animate-pulse" />
            ))}
          </div>
        )}
        
        {!loadingNews && errorNews && (
          <div className="text-xs text-red-600">{errorNews}</div>
        )}
        
        {!loadingNews && !errorNews && (
          <div className="space-y-2">
            {/* Card Highlight ENI PLENITUDE */}
            <div 
              onClick={() => navigate('/dealer/products')}
              className="bg-gradient-to-r from-yellow-50 to-amber-50 border-l-4 border-yellow-400 rounded-lg p-3 cursor-pointer hover:shadow-md transition-all group"
            >
              <div className="flex items-start gap-2">
                <span className="text-lg">⚡</span>
                <div className="flex-1">
                  <div className="text-xs font-bold text-yellow-900 mb-0.5">
                    Nuovo operatore disponibile!
                  </div>
                  <div className="text-xs text-yellow-800 mb-1">
                    Da oggi puoi attivare le offerte <span className="font-semibold">ENI Plenitude</span> Luce & Gas con condizioni esclusive.
                  </div>
                  <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-300 rounded px-2 py-1.5 mb-1.5">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] font-bold text-green-800">🌐 Fibra Ultraveloce</span>
                      <span className="text-[9px] bg-red-500 text-white font-bold px-1.5 py-0.5 rounded-full">OFFERTA</span>
                    </div>
                    <div className="text-[10px] text-green-700 mb-1">
                      Se sei cliente Eni Plenitude Luce: fino a 2,5 Gbps download e 1 Gbps upload
                    </div>
                    <div className="flex items-center gap-1.5 bg-white rounded px-2 py-1 border border-green-400">
                      <span className="text-base font-black text-green-700">16,90€</span>
                      <span className="text-[9px] text-gray-600">/mese per <span className="font-semibold text-green-700">3 anni</span></span>
                    </div>
                  </div>
                  <div className="text-xs text-yellow-700 font-medium group-hover:text-yellow-900 flex items-center gap-1">
                    🔗 Scopri di più
                    <svg className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              </div>
            </div>

            {/* News normali */}
            <ul className="space-y-1">
              {news.map((r) => (
                <li key={r.ID} className="border-b last:border-none border-gray-100 pb-1">
                  <div className="text-xs font-medium text-gray-800 line-clamp-1">{r.Titolo}</div>
                  <div className="text-xs text-gray-500 line-clamp-1">{r.Messaggio}</div>
                </li>
              ))}
              {news.length === 0 && (
                <li className="text-xs text-gray-500">Nessuna news al momento.</li>
              )}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
