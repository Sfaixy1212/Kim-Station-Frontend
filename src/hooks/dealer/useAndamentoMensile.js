import { useState, useEffect } from 'react';
import api from '../../api/client';

export default function useAndamentoMensile() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await api.get('/api/dealer/andamento-mensile');
      setData(response.data);
    } catch (err) {
      console.error('[useAndamentoMensile] Errore:', err);
      setError(err.response?.data?.error || err.message || 'Errore nel caricamento dati');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  return {
    data,
    loading,
    error,
    refetch: fetchData
  };
}
