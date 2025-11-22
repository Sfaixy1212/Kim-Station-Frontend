import { useEffect, useState, useCallback } from 'react';
import api from '../../api/client';

export default function useAgenteDealers() {
  const [dealers, setDealers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [idAgente, setIdAgente] = useState(null);

  const fetchDealers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/api/agente/miei-dealer');
      const data = res?.data || {};
      const list = Array.isArray(data.dealers) ? data.dealers : [];
      setDealers(list.map(d => ({ id: String(d.id), ragioneSociale: d.ragioneSociale, email: d.email, telefono: d.telefono })));
      if (data.idAgente) setIdAgente(data.idAgente);
    } catch (err) {
      setError(err.normalized || err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchDealers(); }, [fetchDealers]);

  return { dealers, idAgente, loading, error, refetch: fetchDealers };
}
