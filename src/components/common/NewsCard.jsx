import { useEffect, useState } from 'react';
import Card from './Card';
import { getProtectedData } from '../../services/api';

export default function NewsCard({ scope, dealerId, agente, title = 'News', maxItems = 3 }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        setError('');
        const p = new URLSearchParams();
        if (scope) p.set('scope', scope);
        p.set('active', 'true');
        if (scope === 'dealer' && dealerId != null && dealerId !== '') p.set('dealerId', String(dealerId));
        if (scope === 'agente' && agente) p.set('agente', String(agente));
        const data = await getProtectedData(`/supermaster/news?${p.toString()}`);
        if (!mounted) return;
        const list = Array.isArray(data) ? data : [];
        setRows(list.slice(0, maxItems));
      } catch (e) {
        if (mounted) setError(e?.message || 'Errore caricamento news');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [scope, dealerId, agente, maxItems]);

  return (
    <Card title={title} subtitle={scope === 'dealer' ? 'Comunicazioni per il tuo punto vendita' : 'Comunicazioni per l\'agente'}>
      {loading && (
        <div className="space-y-1.5">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-3 bg-gray-200 rounded animate-pulse" />
          ))}
        </div>
      )}
      {!loading && error && <div className="text-xs text-red-600">{error}</div>}
      {!loading && !error && (
        <ul className="space-y-1">
          {rows.slice(0, 2).map((r) => (
            <li key={r.ID} className="border-b last:border-none border-gray-100 pb-1">
              <div className="text-xs font-medium text-gray-800 line-clamp-1">{r.Titolo}</div>
              <div className="text-xs text-gray-500 line-clamp-1">{r.Messaggio}</div>
            </li>
          ))}
          {rows.length === 0 && (
            <li className="text-xs text-gray-500">Nessuna news al momento.</li>
          )}
        </ul>
      )}
    </Card>
  );
}
