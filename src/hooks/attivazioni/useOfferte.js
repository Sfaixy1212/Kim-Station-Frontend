import { useEffect, useState } from 'react';
import api from '../../api/client';

export default function useOfferte(operatoreId, tipologia) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const toNorm = (list) => list.map((o) => {
    const id = o.IDOfferta ?? o.id ?? o._id ?? o.offertaId;
    // Normalizza prezzo con più varianti
    const rawCrediti = (Object.prototype.hasOwnProperty.call(o, 'Crediti') ? Number(o.Crediti) : undefined);
    const rawPrezzoCentesimi = (Object.prototype.hasOwnProperty.call(o, 'PrezzoCentesimi') ? Number(o.PrezzoCentesimi) : undefined);
    const rawCostoCentesimi = (Object.prototype.hasOwnProperty.call(o, 'CostoCentesimi') ? Number(o.CostoCentesimi) : undefined);
    const rawPrezzo = Number(o.price ?? o.prezzo);

    let price = 0;
    if (Number.isFinite(rawPrezzoCentesimi)) {
      price = rawPrezzoCentesimi / 100;
    } else if (Number.isFinite(rawCostoCentesimi)) {
      price = rawCostoCentesimi / 100;
    } else if (Number.isFinite(rawCrediti)) {
      // Tratta Crediti come EUR di default; se è chiaramente in centesimi (>= 100) converti in EUR
      price = rawCrediti >= 100 ? (rawCrediti / 100) : rawCrediti;
    } else if (Number.isFinite(rawPrezzo)) {
      price = rawPrezzo;
      // Fallback euristico: se è intero e molto grande, probabilmente è in centesimi
      if (Number.isInteger(price) && price >= 100) price = price / 100;
    } else {
      price = 0;
    }

    return {
      // campi originali utili per step successivi (prima, così i nostri override vincono)
      ...o,
      id: String(id),
      brand: o.NomeOperatore ?? o.brand ?? o.operatore ?? o.operatorName ?? 'Operatore',
      title: o.Titolo ?? o.title ?? o.nome ?? o.name ?? '',
      subtitle: o.DescrizioneBreve ?? o.description ?? o.descrizione ?? '',
      price,
      tag: o.categoria ?? o.Tipo ?? o.tag ?? undefined,
    };
  });

  const fetchData = async () => {
    if (!operatoreId || !tipologia) { setData([]); return; }
    setError(null);
    setLoading(true);
    try {
      const res = await api.get('/api/offerte', { params: { operatore: operatoreId, operatoreId, operator: operatoreId, tipologia, tipo: tipologia, from: 'attivazioni' } });
      let list = Array.isArray(res.data) ? res.data : res.data?.data || [];
      if (!list || list.length === 0) {
        try {
          const res2 = await api.get(`/api/offerte/${operatoreId}`, { params: { tipologia, from: 'attivazioni' } });
          list = Array.isArray(res2.data) ? res2.data : res2.data?.data || [];
        } catch (_) {}
      }
      setData(toNorm(list || []));
    } catch (err) {
      if (err?.normalized?.status === 404) {
        try {
          const res2 = await api.get(`/api/offerte/${operatoreId}`, { params: { tipologia, from: 'attivazioni' } });
          const list2 = Array.isArray(res2.data) ? res2.data : res2.data?.data || [];
          setData(toNorm(list2));
          return;
        } catch (_) {}
      }
      setError(err.normalized || err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [operatoreId, tipologia]);

  return { data, loading, error, refetch: fetchData };
}
