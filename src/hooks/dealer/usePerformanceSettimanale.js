import { useState, useEffect } from 'react';
import { getProtectedData } from '../../services/api';

export default function usePerformanceSettimanale() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Chiamata API per performance settimanale
      const response = await getProtectedData('/dealer/performance-settimanale');
      setData(response.data);
    } catch (err) {
      console.error('[usePerformanceSettimanale] Errore:', err);
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
