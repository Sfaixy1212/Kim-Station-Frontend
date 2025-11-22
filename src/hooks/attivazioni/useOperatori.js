import { useEffect, useState } from 'react';
import api from '../../api/client';

export default function useOperatori() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchData = () => {
    setError(null);
    setLoading(true);
    return api.get('/api/operatori')
      .then((res) => {
        const list = Array.isArray(res.data) ? res.data : res.data?.data || [];
        console.log('🔍 Operatori ricevuti dal backend:', list);
        // Normalizza in {id, name, logo, skyVariants}. Supporta array di stringhe (es. ["SKY"]) e array di oggetti
        const norm = list.map((o) => {
          if (typeof o === 'string') {
            return { id: o, name: o, logo: null };
          }
          const id = o.id ?? o._id ?? o.value ?? o.operatorId ?? o.codice ?? o.code ?? String(o.id || o.value || o.operatorId || '');
          const name = o.name ?? o.label ?? o.nome ?? o.denominazione ?? o.title ?? String(o.name || o.label || id);
          const logo = o.logo ?? o.logoLink ?? o.LogoLink ?? o.image ?? null;
          const skyVariants = o.skyVariants || null;
          return { id: String(id), name: String(name), logo, skyVariants };
        });
        const EXCLUDED = new Set(['KENA MOBILE', 'ASSISTENZA', 'RABONA']);
        const filtered = norm.filter(op => !EXCLUDED.has(op.name.toUpperCase()));
        console.log('✅ Operatori dopo filtro EXCLUDED:', filtered);
        setData(filtered);
      })
      .catch((err) => { setError(err.normalized || err); })
      .finally(() => { setLoading(false); });
  };

  useEffect(() => {
    fetchData();
  }, []);

  return { data, loading, error, refetch: fetchData };
}
