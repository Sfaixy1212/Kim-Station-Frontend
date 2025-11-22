import api from './client';

// Endpoints ipotizzati. Se il backend differisce, è sufficiente allinearli qui.
export async function fetchOperators() {
  // Riutilizziamo l'endpoint già usato dalle attivazioni
  // GET /api/operatori -> array di stringhe o oggetti
  const { data } = await api.get('/api/operatori');
  const list = Array.isArray(data) ? data : (data?.data || []);
  // Normalizza in {id, name, code?}
  return list.map((o, idx) => {
    if (typeof o === 'string') {
      const v = String(o);
      return { id: v, name: v, code: v };
    }
    const id = String(o.id ?? o._id ?? o.value ?? o.operatorId ?? o.codice ?? o.code ?? idx);
    const name = String(o.name ?? o.label ?? o.nome ?? o.denominazione ?? o.title ?? id);
    const code = String(o.code ?? o.codice ?? o.sigla ?? id);
    return { id, name, code };
  });
}

export async function fetchOperatorDocs(operatorCode) {
  // Chiama solo le varianti supportate dal backend (query param): evita path-style che generano 404
  const raw = String(operatorCode || '').trim();
  const upper = raw.toUpperCase();
  const lower = raw.toLowerCase();
  const slugDash = upper.replace(/\s+/g, '-');
  const slugUnd = upper.replace(/\s+/g, '_');
  const slugJoin = upper.replace(/\s+/g, '');

  const attempts = [
    // Query param standard
    { url: '/api/dealer/docs', params: { operator: upper } },
    // Param alternativo in italiano
    { url: '/api/dealer/docs', params: { operatore: upper } },
    // Slug varianti sempre via query param (il backend accetta solo whitelist uppercase)
    { url: '/api/dealer/docs', params: { operator: slugDash } },
    { url: '/api/dealer/docs', params: { operator: slugUnd } },
    { url: '/api/dealer/docs', params: { operator: slugJoin } },
    { url: '/api/dealer/docs', params: { operator: lower } },
  ];

  let lastErr;
  for (const a of attempts) {
    try {
      const { data } = a.params
        ? await api.get(a.url, { params: a.params })
        : await api.get(a.url);
      const list = Array.isArray(data)
        ? data
        : (data?.files || data?.documents || data?.data || []);
      if (!Array.isArray(list)) continue;
      return list.map((d, idx) => ({
        id: d.id ?? d.ID ?? d.Id ?? `${idx}-${Math.random().toString(36).slice(2,7)}`,
        title: d.title ?? d.titolo ?? d.nome ?? d.name ?? d.Nome ?? 'Documento',
        fileUrl: d.fileUrl ?? d.url ?? d.link ?? d.href ?? '#',
        thumbUrl: d.thumbUrl ?? d.thumbnail ?? d.thumb ?? null,
        status: d.status ?? d.stato ?? 'Disponibile',
        extension: d.extension ?? d.ext ?? null,
      }));
    } catch (e) {
      lastErr = e;
      // prova la prossima variante
    }
  }
  const err = new Error(`Nessun documento trovato per operatore "${upper}". Verifica che l'endpoint /api/dealer/docs sia raggiungibile e che VITE_API_BASE punti al backend.`);
  err.normalized = { message: err.message, cause: lastErr };
  throw err;
}
