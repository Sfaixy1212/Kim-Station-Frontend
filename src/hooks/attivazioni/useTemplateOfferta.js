import { useEffect, useState } from 'react';
import api from '../../api/client';

export default function useTemplateOfferta(idOfferta) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!idOfferta) { setData(null); return; }
    let active = true;
    setLoading(true);
    api.get(`/api/template-offerta/${idOfferta}`)
      .then((res) => { if (active) setData(res.data); })
      .catch((err) => { if (active) setError(err.normalized || err); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [idOfferta]);

  return { data, loading, error };
}
