import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DashboardLayout from '../../components/layout/DashboardLayout';
import api, { upload as apiUpload } from '../../api/client';

export default function Upload() {
  const [files, setFiles] = useState([]); // {file, progress, status}
  const inputRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const historyRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Form fields
  const [fullName, setFullName] = useState('');
  const [orderNumber, setOrderNumber] = useState('');
  const [month, setMonth] = useState('');
  const [year, setYear] = useState(String(new Date().getFullYear()));

  const months = useMemo(() => [
    'Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'
  ], []);
  const years = useMemo(() => {
    const y = new Date().getFullYear();
    return Array.from({ length: 6 }, (_, i) => String(y - i));
  }, []);

  const scrollToHistory = useCallback(() => {
    // Scroll only when layout è impilato (sotto xl)
    if (typeof window !== 'undefined' && !window.matchMedia('(min-width: 1280px)').matches) {
      historyRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  const onFilesSelected = useCallback((fileList) => {
    const incoming = Array.from(fileList).map((f) => ({ file: f, progress: 0, status: 'pending' }));
    setFiles((prev) => [...prev, ...incoming]);
  }, []);

  const onDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer?.files?.length) onFilesSelected(e.dataTransfer.files);
  }, [onFilesSelected]);

  const onDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const onDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const monthToNumber = useCallback((m) => {
    const mLower = (m || '').toLowerCase();
    const map = {
      gennaio: '01', febbraio: '02', marzo: '03', aprile: '04', maggio: '05', giugno: '06',
      luglio: '07', agosto: '08', settembre: '09', ottobre: '10', novembre: '11', dicembre: '12'
    };
    if (map[mLower]) return map[mLower];
    // Se già numero 1-12 o stringa '01'..'12'
    const n = String(m).padStart(2, '0');
    if (/^(0[1-9]|1[0-2])$/.test(n)) return n;
    return '';
  }, []);

  const startUpload = useCallback(async () => {
    setErrorMsg('');
    // Validazioni
    if (!fullName || !orderNumber || !month || !year) {
      setErrorMsg('Compila tutti i campi obbligatori.');
      return;
    }
    if (files.length === 0) {
      setErrorMsg('Seleziona almeno un file.');
      return;
    }
    const monthNum = monthToNumber(month);
    if (!monthNum) {
      setErrorMsg('Mese non valido.');
      return;
    }
    try {
      setUploading(true);
      // setup progress bar unificata: aggiorna tutti gli item
      setFiles((prev) => prev.map((it) => ({ ...it, status: 'uploading', progress: 0 })));
      const fd = new FormData();
      files.forEach((it) => fd.append('files', it.file));
      fd.append('orderNumber', orderNumber.trim());
      fd.append('contractMonth', monthNum);
      fd.append('contractYear', String(year));
      fd.append('customerName', fullName.trim());
      // notes opzionali in futuro

      const res = await apiUpload('/api/contratti/upload', fd, {
        onUploadProgress: (evt) => {
          if (!evt.total) return;
          const p = Math.round((evt.loaded * 100) / evt.total);
          setFiles((prev) => prev.map((it) => ({ ...it, progress: p })));
        },
      });

      // completato
      setFiles((prev) => prev.map((it) => ({ ...it, status: 'done', progress: 100 })));
      // aggiorna storico subito
      await fetchHistory();
      // reset selezione file
      setTimeout(() => setFiles([]), 600);
    } catch (err) {
      const n = err.normalized || err;
      setErrorMsg(n?.message || 'Errore upload');
      // marca errori sugli item
      setFiles((prev) => prev.map((it) => ({ ...it, status: 'pending' })));
    } finally {
      setUploading(false);
    }
  }, [files, fullName, orderNumber, month, year, monthToNumber]);

  const clearAll = useCallback(() => setFiles([]), []);
  const removeItem = useCallback((idx) => setFiles((prev) => prev.filter((_, i) => i !== idx)), []);

  // Storico caricamenti
  const [history, setHistory] = useState([]);
  const [histLoading, setHistLoading] = useState(false);
  const [histError, setHistError] = useState('');

  const fetchHistory = useCallback(async () => {
    try {
      setHistError('');
      setHistLoading(true);
      const res = await api.get('/api/contratti');
      const list = Array.isArray(res.data) ? res.data : [];
      setHistory(list);
    } catch (err) {
      const n = err.normalized || err;
      setHistError(n?.message || 'Errore caricamento storico');
    } finally {
      setHistLoading(false);
    }
  }, []);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  return (
    <DashboardLayout title="Upload">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Card 1: Carica Contratti */}
        <section className="bg-white rounded-xl p-4 sm:p-6 mt-2 h-[calc(100vh-140px)] flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-gray-900">Carica Contratti</h3>
            <button
              type="button"
              onClick={scrollToHistory}
              className="xl:hidden inline-flex items-center rounded-lg bg-gray-900 text-white px-3 py-1.5 text-xs sm:text-sm hover:bg-black/80 transition"
              title="Visualizza Storico"
            >
              Visualizza Storico
            </button>
          </div>
          {/* Scrollable body */}
          <div className="flex-1 min-h-0 overflow-y-auto pr-1 sm:pr-2 flex flex-col gap-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="sm:col-span-2">
                <label className="text-sm font-medium text-gray-700">Nome e Cognome Intestatario Contratto *</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Mario Rossi"
                  className="mt-1 w-full rounded-lg border-gray-300 focus:border-blue-600 focus:ring-blue-600 text-sm"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="text-sm font-medium text-gray-700">Numero Ordine (es. OR-00123) *</label>
                <input
                  type="text"
                  value={orderNumber}
                  onChange={(e) => setOrderNumber(e.target.value)}
                  placeholder="OR-00123"
                  className="mt-1 w-full rounded-lg border-gray-300 focus:border-blue-600 focus:ring-blue-600 text-sm"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Mese Contratto *</label>
                <select
                  value={month}
                  onChange={(e) => setMonth(e.target.value)}
                  className="mt-1 w-full rounded-lg border-gray-300 focus:border-blue-600 focus:ring-blue-600 text-sm"
                >
                  <option value="">Seleziona mese</option>
                  {months.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Anno Contratto *</label>
                <select
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                  className="mt-1 w-full rounded-lg border-gray-300 focus:border-blue-600 focus:ring-blue-600 text-sm"
                >
                  {years.map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="text-xs text-blue-700 bg-blue-50 border border-blue-100 rounded-md px-3 py-2">
              Info: Seleziona uno o più file PDF o immagini (JPG, PNG). Altri formati non sono ammessi. Max 10MB ciascuno.
            </div>

            <div
              onDrop={onDrop}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              className={[
                'border-2 border-dashed rounded-xl p-8 sm:p-10 text-center transition min-h-[300px] flex-1 flex items-center justify-center',
                isDragging ? 'border-blue-500 bg-blue-50/40' : 'border-gray-200 hover:border-gray-300'
              ].join(' ')}
            >
              <div className="mx-auto max-w-md">
                <div className="text-4xl mb-3">📤</div>
                <h4 className="text-base font-semibold text-gray-900 mb-1">Trascina qui i file PDF e/o immagini</h4>
                <p className="text-sm text-gray-500 mb-4">Oppure clicca per selezionare dal dispositivo</p>
                <div className="flex items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-white text-sm hover:bg-blue-700 transition"
                  >
                    Scegli file
                  </button>
                  {files.length > 0 && (
                    <button
                      type="button"
                      onClick={startUpload}
                      disabled={uploading}
                      className="inline-flex items-center rounded-lg bg-emerald-600 px-4 py-2 text-white text-sm hover:bg-emerald-700 transition disabled:opacity-60"
                    >
                      {uploading ? 'Caricamento…' : 'Avvia upload'}
                    </button>
                  )}
                  {files.length > 0 && (
                    <button
                      type="button"
                      onClick={clearAll}
                      className="inline-flex items-center rounded-lg bg-gray-100 px-4 py-2 text-gray-700 text-sm hover:bg-gray-200 transition"
                    >
                      Pulisci
                    </button>
                  )}
                </div>
                {errorMsg && (
                  <div className="mt-3 text-xs text-red-600">{errorMsg}</div>
                )}
                <input
                  ref={inputRef}
                  type="file"
                  multiple
                  accept="application/pdf,image/jpeg,image/png"
                  className="hidden"
                  onChange={(e) => onFilesSelected(e.target.files)}
                />
              </div>
            </div>

            {/* Lista file selezionati */}
            {files.length > 0 && (
              <div>
                <h5 className="text-sm font-semibold text-gray-800 mb-3">File selezionati</h5>
                <ul className="space-y-3">
                  {files.map((it, idx) => (
                    <li key={idx} className="flex items-center justify-between gap-3 bg-gray-50 rounded-lg p-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{it.file.name}</p>
                        <p className="text-xs text-gray-500">{(it.file.size / 1024).toFixed(1)} KB</p>
                      </div>
                      <div className="flex-1 mx-3">
                        <div className="h-2 bg-white rounded-full overflow-hidden border border-gray-200">
                          <div
                            className="h-full bg-blue-600 transition-all"
                            style={{ width: `${Math.round(it.progress)}%` }}
                          />
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {it.status === 'done' && <span className="text-xs text-emerald-600">Completato</span>}
                        {it.status === 'uploading' && <span className="text-xs text-blue-600 animate-pulse">Caricamento…</span>}
                        {it.status === 'pending' && <span className="text-xs text-gray-500">In attesa</span>}
                        <button
                          type="button"
                          onClick={() => removeItem(idx)}
                          className="text-gray-400 hover:text-red-600 text-sm"
                          title="Rimuovi"
                        >
                          ✕
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>

        {/* Card 2: Storico caricamenti */}
        <section ref={historyRef} className="bg-white rounded-xl p-4 sm:p-6 mt-2 h-[calc(100vh-140px)] flex flex-col scroll-mt-24">
          <h3 className="text-base font-semibold text-gray-900 mb-4">Storico Caricamenti</h3>
          <div className="flex-1 overflow-y-auto pr-1 sm:pr-2">
            {histLoading && (
              <div className="h-full flex items-center justify-center text-sm text-gray-500">Caricamento storico…</div>
            )}
            {histError && (
              <div className="text-sm text-red-600 mb-2">{histError} <button onClick={fetchHistory} className="ml-2 text-gray-700 underline">Riprova</button></div>
            )}
            {!histLoading && !histError && history.length === 0 ? (
              <div className="h-full flex items-center justify-center text-sm text-gray-500">Nessun caricamento effettuato</div>
            ) : !histLoading && !histError ? (
              <ul className="divide-y divide-gray-100">
                {history.map((h, i) => (
                  <li key={i} className="py-3 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{h.NomeCliente || h.nomeCliente || h.CognomeCliente} · {h.NumeroOrdine || h.CodiceProposta}</p>
                      <p className="text-xs text-gray-500 truncate">{h.MeseContratto}/{h.AnnoContratto} · {h.NomeFile || h.nomeFile}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-700">
                          Stato: {h.StatoEsteso || (h.Stato != null ? `Stato ${h.Stato}` : 'N/D')}
                        </span>
                        {h.Note ? (
                          <span title={h.Note} className="inline-flex max-w-[420px] items-center rounded-full bg-amber-50 px-2 py-0.5 text-[11px] text-amber-700 truncate">
                            Note: {h.Note}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <a
                      href={
                        h.S3PublicUrl ||
                        h.S3Url ||
                        (h.FullPath && String(h.FullPath).startsWith('/contratti')
                          ? `https://contrattistation.s3.eu-west-1.amazonaws.com${h.FullPath}`
                          : h.FullPath)
                      }
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs rounded-full px-2 py-1 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                    >
                      Apri PDF
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </section>
      </div>
    </DashboardLayout>
  );
}
