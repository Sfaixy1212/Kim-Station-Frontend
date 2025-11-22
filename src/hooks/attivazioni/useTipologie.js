import { useEffect, useState } from 'react';
import api from '../../api/client';

export default function useTipologie(operatoreId) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const toCode = (s) => {
    const up = String(s).toUpperCase();
    if (up === 'RESIDENZIALE') return 'RES';
    if (up === 'BUSINESS') return 'BUS';
    return up; // già "RES"/"BUS" o altro codice
  };
  const toNorm = (list) => list.map((t) => {
    if (typeof t === 'string') {
      const code = toCode(t);
      return { id: code, label: t };
    }
    const label = t.label ?? t.nome ?? t.name ?? t.tipologia ?? t.tipo ?? t.id;
    const code = toCode(t.code ?? t.codice ?? t.id ?? t.value ?? t.tipoId ?? label);
    return { id: String(code), label: String(label) };
  });

  const fetchData = () => {
    if (!operatoreId) { setData([]); return; }
    setError(null);
    setLoading(true);
    return api.get('/api/tipologie', { params: { operatore: operatoreId } })
      .then((res) => {
        const list = Array.isArray(res.data) ? res.data : res.data?.data || [];
        setData(toNorm(list || []));
      })
      .catch((err) => { setError(err.normalized || err); })
      .finally(() => { setLoading(false); });
  };

  useEffect(() => {
    fetchData();
  }, [operatoreId]);

  return { data, loading, error, refetch: fetchData };
}
