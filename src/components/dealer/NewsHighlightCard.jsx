import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getProtectedData } from '../../services/api';

export default function NewsHighlightCard({ dealerId }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [news, setNews] = useState([]);

  const fetchNews = async () => {
    try {
      setLoading(true);
      setError('');
      const p = new URLSearchParams();
      p.set('scope', 'dealer');
      p.set('active', 'true');
      if (dealerId != null && dealerId !== '') p.set('dealerId', String(dealerId));
      const data = await getProtectedData(`/supermaster/news?${p.toString()}`);
      const list = Array.isArray(data) ? data : [];
      setNews(list.slice(0, 2));
    } catch (e) {
      setError(e?.message || 'Errore caricamento news');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNews();
  }, [dealerId]);

  return (
    <div className="bg-white rounded-xl shadow-sm ring-1 ring-gray-100 p-4 flex flex-col h-full">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-gray-800">News</h3>
        <p className="text-xs text-gray-500">Comunicazioni per il tuo punto vendita</p>
      </div>
      
      {loading && (
        <div className="space-y-2 flex-1">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-4 bg-gray-200 rounded animate-pulse" />
          ))}
        </div>
      )}
      
      {!loading && error && (
        <div className="text-xs text-red-600">{error}</div>
      )}
      
      {!loading && !error && (
        <div className="space-y-3 flex-1">
          {/* Card Highlight ENI PLENITUDE */}
          <div 
            onClick={() => navigate('/dealer/activations')}
            className="bg-gradient-to-r from-yellow-50 to-amber-50 border-l-4 border-yellow-400 rounded-lg p-3 cursor-pointer hover:shadow-md transition-all group"
          >
            <div className="flex items-start gap-3">
              {/* Logo ENI Plenitude */}
              <div className="flex-shrink-0 w-12 h-12 bg-white rounded-lg p-1.5 shadow-sm">
                <img 
                  src="https://kimweb.agency/wp-content/uploads/2024/11/Eni_Plenitude_logo.svg.png" 
                  alt="ENI Plenitude"
                  className="w-full h-full object-contain"
                />
              </div>
              
              <div className="flex-1">
                <div className="text-xs font-bold text-yellow-900 mb-1">
                  Nuovo operatore disponibile!
                </div>
                <div className="text-xs text-yellow-800 mb-1.5">
                  Da oggi puoi attivare le offerte <span className="font-semibold">ENI Plenitude</span> Luce & Gas con condizioni esclusive.
                </div>
                <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-300 rounded px-2 py-1.5 mb-2">
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
          <ul className="space-y-2">
            {news.map((r) => (
              <li key={r.ID} className="border-b last:border-none border-gray-100 pb-2">
                <div className="text-xs font-medium text-gray-800 line-clamp-1">{r.Titolo}</div>
                <div className="text-xs text-gray-500 line-clamp-2">{r.Messaggio}</div>
              </li>
            ))}
            {news.length === 0 && (
              <li className="text-xs text-gray-500">Nessuna news al momento.</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
