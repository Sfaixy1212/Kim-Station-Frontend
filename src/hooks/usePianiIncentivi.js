import { useCallback, useMemo, useState } from 'react';
import { getPianiIncentiviWithElevated, getPianiIncentiviBase } from '../services/api';

/**
 * Hook per caricare i Piani Incentivi usando un token elevato.
 */
export function usePianiIncentivi() {
  const [piani, setPiani] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async (elevatedToken) => {
    setLoading(true);
    setError(null);
    try {
      const res = elevatedToken ?
        await getPianiIncentiviWithElevated(elevatedToken) :
        await getPianiIncentiviBase();
      const list = Array.isArray(res) ? res : (Array.isArray(res?.piani) ? res.piani : []);
      setPiani(list);
      return list;
    } catch (e) {
      setError(e?.message || 'Errore nel caricamento dei piani');
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  const operators = useMemo(() => {
    const set = new Set();
    for (const p of piani) {
      if (p?.operatore) set.add(p.operatore);
    }
    return Array.from(set).sort();
  }, [piani]);

  const groupByOperatore = useCallback((list) => {
    return (list || []).reduce((acc, item) => {
      const op = item?.operatore || '—';
      if (!acc[op]) acc[op] = [];
      acc[op].push(item);
      return acc;
    }, {});
  }, []);

  return { piani, loading, error, load, operators, groupByOperatore };
}
