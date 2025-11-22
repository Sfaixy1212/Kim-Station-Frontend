import { useEffect, useState } from 'react';
import api from '../../api/client';

export default function useTemplates() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    api.get('/api/templates')
      .then((res) => {
        const list = Array.isArray(res.data) ? res.data : res.data?.data || [];
        if (!active) return;
        setData(list);
      })
      .catch((err) => { if (active) setError(err.normalized || err); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  return { data, loading, error };
}
