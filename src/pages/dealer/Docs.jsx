import { useEffect, useMemo, useState } from 'react';
import { getPdfThumbnail } from '../../utils/pdfThumb';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { fetchOperators, fetchOperatorDocs } from '../../api/docs';

export default function Docs() {
  // Whitelist e ordine visualizzazione
  const OP_WHITELIST = [
    '1MOBILE',
    'ENI PLENITUDE',
    'FASTWEB',
    'FASTWEB ENERGIA',
    'ILIAD',
    'KENA MOBILE',
    'SKY',
    'WEEDOO',
  ];

  const [operators, setOperators] = useState([]);
  const [loadingOps, setLoadingOps] = useState(true);
  const [errorOps, setErrorOps] = useState(null);
  const [selectedOp, setSelectedOp] = useState(null);

  const [docs, setDocs] = useState([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [errorDocs, setErrorDocs] = useState(null);

  // Carica operatori all'avvio
  useEffect(() => {
    let mounted = true;
    setLoadingOps(true);
    setErrorOps(null);
    fetchOperators()
      .then((list) => {
        if (!mounted) return;
        const arr = Array.isArray(list) ? list : [];
        // Filtra e ordina secondo whitelist, match case-insensitive su name
        const byName = new Map(
          arr.map((o) => [String(o.name || '').toUpperCase().trim(), o])
        );
        const filtered = OP_WHITELIST
          .map((label) => byName.get(label.toUpperCase()))
          .filter(Boolean)
          .map((o) => ({ id: o.id, name: o.name, code: o.code }));
        setOperators(filtered);
        // Auto selezione primo operatore della whitelist disponibile
        if (filtered.length && !selectedOp) {
          setSelectedOp(filtered[0].name);
        }
      })
      .catch((e) => {
        if (!mounted) return;
        setErrorOps(e?.normalized?.message || e?.message || 'Errore caricamento operatori');
      })
      .finally(() => mounted && setLoadingOps(false));
    return () => { mounted = false; };
  }, []);

  // Carica documenti al cambio operatore
  useEffect(() => {
    if (!selectedOp) return;
    let mounted = true;
    setLoadingDocs(true);
    setErrorDocs(null);
    fetchOperatorDocs(selectedOp)
      .then((list) => { if (mounted) setDocs(list || []); })
      .catch((e) => { if (mounted) setErrorDocs(e?.normalized?.message || e?.message || 'Errore caricamento documenti'); })
      .finally(() => { if (mounted) setLoadingDocs(false); });
    return () => { mounted = false; };
  }, [selectedOp]);

  const selectedOpObj = useMemo(() => operators.find(o => o.name === selectedOp), [operators, selectedOp]);

  return (
    <DashboardLayout title="Documentazione">
      <div className="rounded-2xl bg-white p-6 sm:p-8 shadow-sm h-[calc(100vh-160px)] mt-4 overflow-hidden flex flex-col">
        {/* Header card, stile coerente con Attivazioni */}
        <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Documenti Operatori</h1>
            <p className="text-sm text-gray-600">Consulta e scarica rapidamente i materiali aggiornati degli operatori.</p>
          </div>
          <div className="flex items-center gap-2">
            {!!docs?.length && (
              <span className="inline-flex items-center rounded-full bg-blue-50 text-blue-700 px-3 py-1 text-xs font-semibold">
                {docs.length} documenti
              </span>
            )}
          </div>
        </div>

        {/* Selettore Operatore: pills + select responsive */}
        <div className="mb-5">
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-gray-700">Seleziona Operatore</label>
            {!loadingDocs && selectedOpObj && (
              <span className="text-xs text-gray-500">{selectedOpObj.name || selectedOpObj.label || selectedOp}</span>
            )}
          </div>

          {/* Pills scrollabili */}
          <div className="hidden sm:block">
            <div className="flex gap-2 overflow-x-auto no-scrollbar py-1 pr-1">
              {(loadingOps ? Array.from({ length: 4 }) : operators).map((op, idx) => {
                if (loadingOps) {
                  return <div key={idx} className="h-9 w-28 rounded-full bg-gray-100 animate-pulse" />;
                }
                const key = op.name;
                const active = key === selectedOp;
                return (
                  <button
                    key={key}
                    onClick={() => setSelectedOp(key)}
                    className={`shrink-0 inline-flex items-center gap-2 h-9 rounded-full border px-4 text-sm font-medium transition-colors ${
                      active
                        ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                        : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                    }`}
                    title={op.name || key}
                  >
                    <span className="inline-block h-2.5 w-2.5 rounded-full bg-blue-300" />
                    {op.name || key}
                  </button>
                );
              })}
            </div>
            {!loadingOps && !errorOps && operators.length === 0 && (
              <div className="mt-2 text-xs text-gray-500">Nessun operatore disponibile.</div>
            )}
            {errorOps && (
              <div className="mt-2 text-xs text-red-600 flex items-center justify-between">
                <span>{errorOps}</span>
                <button
                  onClick={() => {
                    setLoadingOps(true);
                    setErrorOps(null);
                    fetchOperators()
                      .then((list)=> setOperators(Array.isArray(list)? list: []))
                      .catch((e)=> setErrorOps(e?.normalized?.message || e?.message || 'Errore caricamento operatori'))
                      .finally(()=> setLoadingOps(false));
                  }}
                  className="ml-3 px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 text-gray-700"
                >
                  Riprova
                </button>
              </div>
            )}
          </div>

          {/* Select fallback mobile */}
          <div className="sm:hidden">
            <select
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={selectedOp || ''}
              onChange={(e) => setSelectedOp(e.target.value || null)}
              disabled={loadingOps}
            >
              <option value="" disabled>
                {loadingOps ? 'Caricamento operatori…' : 'Scegli operatore'}
              </option>
              {operators.map((op) => (
                <option key={op.name} value={op.name}>
                  {op.name}
                </option>
              ))}
            </select>
            {errorOps && (
              <div className="mt-2 text-xs text-red-600 flex items-center justify-between">
                <span>{errorOps}</span>
                <button onClick={() => {
                  setLoadingOps(true);
                  setErrorOps(null);
                  fetchOperators().then(setOperators).catch((e)=>setErrorOps(e?.normalized?.message||e?.message||'Errore')).finally(()=>setLoadingOps(false));
                }} className="ml-3 px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 text-gray-700">Riprova</button>
              </div>
            )}
          </div>
        </div>

        {/* Corpo scrollabile: solo la lista documenti deve scrollare */}
        <div className="mt-2 flex-1 min-h-0">
          <div className="h-full overflow-y-auto overscroll-contain pr-1">
            {/* Stato caricamento / errore documenti */}
            {loadingDocs && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="rounded-xl border border-gray-100 p-4">
                    <div className="h-28 rounded-md bg-gray-100 animate-pulse mb-3" />
                    <div className="h-4 w-2/3 bg-gray-100 animate-pulse rounded mb-2" />
                    <div className="h-3 w-1/3 bg-gray-100 animate-pulse rounded" />
                  </div>
                ))}
              </div>
            )}

            {errorDocs && !loadingDocs && (
              <div className="py-6 text-sm text-red-600 flex items-center justify-between">
                <span>{errorDocs}</span>
                <button
                  onClick={() => setSelectedOp((v) => v)}
                  className="ml-3 px-3 py-1.5 rounded bg-gray-100 hover:bg-gray-200 text-gray-700"
                >
                  Riprova
                </button>
              </div>
            )}

            {/* Elenco documenti */}
            {!loadingDocs && !errorDocs && (
              docs.length === 0 ? (
                <div className="py-10 text-center text-sm text-gray-500">Nessun documento disponibile per questo operatore.</div>
              ) : (
                <div className="space-y-4">
                  <div className="text-sm font-semibold text-gray-800">
                    Documenti {selectedOpObj?.name || selectedOp}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {docs.map((d) => (
                      <DocCard key={d.id} doc={d} />
                    ))}
                  </div>
                </div>
              )
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

function DocCard({ doc }) {
  const [thumbSrc, setThumbSrc] = useState(doc.thumbUrl || null);
  const [isWeb, setIsWeb] = useState(false);

  useEffect(() => {
    let canceled = false;
    const url = doc.fileUrl;
    const ext = String(doc.extension || '').toLowerCase();

    async function run() {
      // Se già ho una thumb fornita dal backend, mantienila
      if (doc.thumbUrl) {
        setThumbSrc(doc.thumbUrl);
        setIsWeb(false);
        return;
      }
      // Se è un'immagine, usa direttamente l'URL
      const isImage = /\.(png|jpe?g|gif|webp|bmp|svg)(?:\?.*)?$/i.test(url) || ['png','jpg','jpeg','gif','webp','bmp','svg'].includes(ext);
      if (isImage) {
        setThumbSrc(url);
        setIsWeb(false);
        return;
      }
      // Se è un link a una pagina web, usa favicon come anteprima
      const isHttp = /^https?:\/\//i.test(url);
      const looksLikePdf = ext === 'pdf' || /\.pdf(?:\?.*)?$/i.test(url);
      if (isHttp && !looksLikePdf) {
        try {
          const { hostname } = new URL(url);
          const favicon = `https://www.google.com/s2/favicons?sz=128&domain=${hostname}`;
          setThumbSrc(favicon);
          setIsWeb(true);
        } catch {
          setThumbSrc(null);
          setIsWeb(true);
        }
        return;
      }
      // Se è un PDF, genera thumbnail dalla prima pagina
      if (ext === 'pdf' || /\.pdf(?:\?.*)?$/i.test(url)) {
        const thumb = await getPdfThumbnail(url, { width: 512, pageNumber: 1 });
        if (!canceled) setThumbSrc(thumb);
        setIsWeb(false);
        return;
      }
      // Altrimenti lascia placeholder
      setThumbSrc(null);
      setIsWeb(false);
    }
    run();
    return () => { canceled = true; };
  }, [doc.fileUrl, doc.extension, doc.thumbUrl]);
  const handleOpen = () => {
    try {
      window.open(doc.fileUrl, '_blank', 'noopener,noreferrer');
    } catch {}
  };

  return (
    <div className="group rounded-xl border border-gray-100 bg-white p-4 hover:shadow-md transition-shadow">
      <div className="relative mb-3">
        {thumbSrc ? (
          <img src={thumbSrc} alt={doc.title} className="h-28 w-full object-cover rounded-md border border-gray-100" />
        ) : (
          <div className="h-28 w-full rounded-md bg-gray-50 border border-dashed border-gray-200 flex items-center justify-center text-gray-400">
            <span className="text-sm">Anteprima</span>
          </div>
        )}
        {isWeb && (
          <span className="absolute top-2 left-2 inline-flex items-center rounded-full bg-blue-50/90 text-blue-700 text-[11px] font-medium px-2 py-0.5 border border-blue-100 shadow-sm">
            Link
          </span>
        )}
        <span className="absolute top-2 right-2 inline-flex items-center rounded-full bg-white/90 text-green-700 text-[11px] font-medium px-2 py-0.5 border border-green-100 shadow-sm">
          ✓ Disponibile
        </span>
      </div>
      <div className="mb-2 line-clamp-2 text-sm font-medium text-gray-900 min-h-[2rem]">{doc.title}</div>
      <div className="flex items-center justify-between">
        <button
          onClick={handleOpen}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
        >
          <span>Apri</span>
        </button>
        <a
          href={doc.fileUrl}
          download
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700"
        >
          Scarica
        </a>
      </div>
    </div>
  );
}
