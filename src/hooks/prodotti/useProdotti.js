import { useEffect, useState, useCallback } from 'react';
import api from '../../api/client';

// segmento: 'SIM' (schede/SIM), 'FIN' (telefoni), 'ASS' (assistenza) ...
export default function useProdotti(segmento = 'SIM', idOperatore = 11) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const toNorm = (list) => (list || []).map((p) => {
    const idOfferta = Number(p.IDOfferta ?? p.id ?? p.ID ?? 0) || 0;
    const rawPriceCents = Number(p.prezzo ?? p.Crediti ?? p.price ?? 0) || 0; // nel DB in centesimi
    const rawPriceEuro = rawPriceCents / 100;
    const discountPctRaw = Number(p.FixedDiscountPct ?? p.fixedDiscountPct ?? 0) || 0;
    const discountPct = Math.min(Math.max(discountPctRaw, 0), 100);
    const priceCents = Math.round(rawPriceCents * (100 - discountPct) / 100);
    const priceEuro = priceCents / 100; // per visualizzazione
    return {
      id: String(idOfferta || p._id || ''),
      idOfferta, // numerico, utile per backend
      title: String(p.nome ?? p.name ?? p.titolo ?? p.Titolo ?? 'Prodotto'),
      description: String(p.descrizione ?? p.description ?? ''),
      price: priceEuro, // UI usa euro già scontati
      priceCents, // backend usa centesimi scontati
      originalPrice: rawPriceEuro,
      originalPriceCents: rawPriceCents,
      discountPct,
      image: p.LogoLink || '/vite.svg',
      speseSpedizione: Number(p.SpeseSpedizione ?? p.speseSpedizione ?? 0),
      raw: p,
    };
  });

  const fetchData = useCallback(async () => {
    if (!segmento) { setData([]); return; }
    setError(null);
    setLoading(true);
    try {
      // Backend richiede anche idOperatore per i prodotti (11 = PRODOTTI, 10 = ASSISTENZA, ...)
      const res = await api.get('/api/prodotti', { params: { segmento, idOperatore } });
      const list = Array.isArray(res.data) ? res.data : res.data?.data || [];
      setData(toNorm(list));
    } catch (err) {
      setError(err.normalized || err);
    } finally {
      setLoading(false);
    }
  }, [segmento, idOperatore]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}
