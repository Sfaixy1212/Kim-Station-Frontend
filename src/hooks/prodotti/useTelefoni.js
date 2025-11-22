import { useEffect, useState, useCallback } from 'react';
import api from '../../api/client';

export default function useTelefoni() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const toNorm = (list) => (list || []).map((p) => {
    const idTelefono = Number(p.id ?? p.IDTelefono ?? 0) || 0;
    const priceCents = Number(p.priceCents ?? p.price * 100 ?? 0) || 0;
    const priceEuro = Number(p.price ?? priceCents / 100 ?? 0);
    return {
      id: String(idTelefono || p._id || ''),
      idOfferta: idTelefono, // Per compatibilità con il carrello esistente
      title: String(p.title ?? p.Titolo ?? 'Telefono'),
      description: String(p.description ?? p.Descrizione ?? ''),
      price: priceEuro, // UI usa euro
      priceCents, // backend usa centesimi per compatibilità
      image: p.image || p.ImmagineURL || '/vite.svg',
      speseSpedizione: Number(p.speseSpedizione ?? p.SpeseSpedizione ?? 0),
      marca: p.Marca || '',
      modello: p.Modello || '',
      specifiche: p.specifiche || null,
      type: 'telefono',
      raw: p,
    };
  });

  const fetchData = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await api.get('/api/telefoni');
      const list = Array.isArray(res.data) ? res.data : res.data?.data || [];
      setData(toNorm(list));
    } catch (err) {
      // Se l'errore è 403 (accesso negato), non è un errore critico
      if (err.response?.status === 403) {
        setData([]);
        setError(null); // Non mostrare errore per accesso negato
      } else {
        setError(err.normalized || err);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}
