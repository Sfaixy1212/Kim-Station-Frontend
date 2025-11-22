import { useEffect, useState } from 'react';
import api from '../../api/client';

export default function useCredito(enable) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchData = () => {
    if (!enable) { setData(null); return; }
    setLoading(true);
    return api.get('/api/credito-plafond')
      .then((res) => setData(res.data))
      .catch((err) => setError(err.normalized || err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    let active = true;
    if (!enable) { setData(null); return; }
    setLoading(true);
    api.get('/api/credito-plafond')
      .then((res) => { if (active) setData(res.data); })
      .catch((err) => { if (active) setError(err.normalized || err); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [enable]);

  return { data, loading, error, refetch: fetchData };
}
