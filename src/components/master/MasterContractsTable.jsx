import { useEffect, useMemo, useState } from 'react';
import { getProtectedData, postProtectedData } from '../../services/api';

function statusPill(stato) {
  const s = String(stato || '').toLowerCase();
  if (s.includes('ok') || s.includes('attivo') || s.includes('valido')) return 'bg-green-100 text-green-800';
  if (s.includes('proc') || s.includes('pend') || s.includes('verifica')) return 'bg-blue-100 text-blue-800';
  if (s.includes('scad') || s.includes('rifiut') || s.includes('annull') || s.includes('ko')) return 'bg-red-100 text-red-800';
  return 'bg-gray-100 text-gray-800';
}

// Risolve l'ID contratto provando varianti comuni provenienti da API eterogenee
function resolveContractId(item) {
  if (!item || typeof item !== 'object') return null;
  const keys = [
    // Priorità a ID da dbo.FilesStorage
    'ID','Id','id',
    'IDContratto','IdContratto','idContratto','ID_Contratto','id_contratto',
    'IDOrdine','IdOrdine','idOrdine','orderId',
    'ContractId','contractId','CONTRACT_ID',
    '_id',
    'NumeroContratto','numeroContratto','NumContratto'
  ];
  for (const k of keys) {
    if (k in item) {
      const v = item[k];
      if (v !== null && v !== undefined && v !== '') return v;
    }
  }
  return null;
}

// Converte percorsi locali (/uploads/...) in URL S3 pubblico desiderato
function resolveContractDocUrl(val) {
  if (!val) return '';
  let raw = String(val).trim();
  // Se è una URL assoluta (già S3 o CDN), restituiscila così com'è
  try {
    const u = new URL(raw);
    if (u.protocol === 'http:' || u.protocol === 'https:') return raw;
  } catch {}

  // Normalizza come path locale/relativo
  try {
    const base = (typeof window !== 'undefined' && window.location?.origin) ? window.location.origin : 'https://station.kimweb.agency';
    const u = new URL(raw, base);
    raw = u.pathname || raw;
  } catch {}

  // Normalizza separatori e prefissi
  let path = raw
    .replace(/\\/g, '/')        // backslash -> slash
    .replace(/^\/+/, '');        // rimuovi slash iniziali
  // Molti nostri oggetti S3 non hanno il prefisso 'uploads/': se presente, rimuovilo
  if (path.startsWith('uploads/')) path = path.replace(/^uploads\//, '');

  // URL-encode per segmenti preservando '+' come nel naming S3 (molti uploader mappano spazi -> '+')
  const encoded = path
    .split('/')
    .filter(Boolean)
    .map(seg => {
      // Se il segmento è già percent-encoded, prova a decodificarlo per evitare doppio encoding
      let s = seg;
      try { s = decodeURIComponent(seg); } catch {}
      // Sostituisci TUTTI i whitespace (anche non-breaking) con '+' senza comprimere
      const withPlus = s.replace(/\s/g, '+');
      // Encoda i caratteri speciali MA lascia '+' letterale
      return encodeURIComponent(withPlus).replace(/%2B/g, '+');
    })
    .join('/');

  return `https://contrattistation.s3.eu-west-1.amazonaws.com/${encoded}`;
}

function formatDate(val) {
  if (!val) return '-';
  if (typeof val === 'string') {
    const s = val.trim();
    // Timestamp SQL: YYYY-MM-DD HH:mm:ss(.ms)
    const mSql = s.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?$/);
    if (mSql) {
      const yyyy = mSql[1];
      const mm = mSql[2];
      const dd = mSql[3];
      if (dd === '00' || mm === '00') return '-';
      return `${dd}/${mm}/${yyyy}`;
    }
    // DD.MM.YYYY o DD/MM/YYYY
    const m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
    if (m) {
      const a = parseInt(m[1], 10);
      const b = parseInt(m[2], 10);
      const y = m[3];
      if (!a || !b) return '-';
      // Se ambiguo MM/DD, inverti
      if (a <= 12 && b > 12) return `${String(b).padStart(2,'0')}/${String(a).padStart(2,'0')}/${y}`;
      return `${String(a).padStart(2,'0')}/${String(b).padStart(2,'0')}/${y}`;
    }
  }
  try {
    const d = new Date(val);
    if (!isNaN(d.getTime())) {
      const dd = String(d.getDate()).padStart(2,'0');
      const mm = String(d.getMonth() + 1).padStart(2,'0');
      const yyyy = d.getFullYear();
      return `${dd}/${mm}/${yyyy}`;
    }
  } catch {}
  return String(val);
}

function formatDateTime(val) {
  if (!val) return '-';
  if (typeof val === 'string') {
    const s = val.trim();
    const mSql = s.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?$/);
    if (mSql) {
      const yyyy = mSql[1];
      const mm = mSql[2];
      const dd = mSql[3];
      const HH = mSql[4];
      const MM = mSql[5];
      if (dd === '00' || mm === '00') return '-';
      return `${dd}/${mm}/${yyyy} ${HH}:${MM}`;
    }
  }
  try {
    const d = new Date(val);
    if (!isNaN(d.getTime())) {
      const dd = String(d.getDate()).padStart(2,'0');
      const mm = String(d.getMonth() + 1).padStart(2,'0');
      const yyyy = d.getFullYear();
      const HH = String(d.getHours()).padStart(2,'0');
      const MM = String(d.getMinutes()).padStart(2,'0');
      return `${dd}/${mm}/${yyyy} ${HH}:${MM}`;
    }
  } catch {}
  return formatDate(val);
}

export default function MasterContractsTable() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [q, setQ] = useState('');
  const [dealerMap, setDealerMap] = useState({}); // idDealer -> RagioneSociale
  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [refuseNote, setRefuseNote] = useState('');

  const fetchAll = async () => {
    setLoading(true);
    setError(null);
    try {
      // Endpoint esclusivi per ruolo Master
      const endpoints = [
        '/master/contratti',
        '/master/contratti-upload',
        '/master/contratti/tutti',
      ];
      let data = null, lastErr = null;
      for (const ep of endpoints) {
        try {
          const res = await getProtectedData(ep);
          const list = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : (res?.items || res?.rows || []);
          if (Array.isArray(list)) { data = list; break; }
        } catch (e) { lastErr = e; }
      }
      if (!data) throw lastErr || new Error('Nessun endpoint valido per contratti master');

      const mapped = data.map((item, idx) => {
        const id = resolveContractId(item);
        if (!id && typeof window !== 'undefined') {
          try { console.log('MasterContractsTable: elemento senza id, chiavi:', Object.keys(item)); } catch {}
        }

        // Data: preferisci DataOra da FilesStorage
        const dateRaw = item.DataOra ?? item.DataUpload ?? item.Data ?? item.createdAt ?? item.data ?? '-';
        const date = formatDate(dateRaw);

        // Dealer: preferisci NOME dealer. Fallback a idDealer o Utente. Mai usare FullPath/NomeFile
        const dealerName =
          item.NomeDealer ?? item.Dealer ?? item.DealerName ?? item.nomeDealer ?? item.dealerName ??
          item.RagioneSocialeDealer ?? item.DenominazioneDealer ?? item.nome_dealer ?? null;
        const dealer = dealerName
          ? String(dealerName)
          : (item.idDealer != null && item.idDealer !== '')
            ? `Dealer #${item.idDealer}`
            : (item.Utente || '-');

        // Cognome cliente: preferisci campo dedicato; evita costruirlo da NomeFile
        const nomeCliente = item.Cliente ?? item.NomeCliente ?? item.cliente ?? item.nomeCliente ?? item.RagioneSociale ?? item.ragioneSociale ?? null;
        const cognomeField = item.CognomeCliente ?? item.Cognome ?? item.cognome ?? null;
        let cognome = '-';
        if (cognomeField) {
          cognome = String(cognomeField);
        } else if (nomeCliente) {
          const parts = String(nomeCliente).trim().split(/\s+/);
          cognome = parts.length > 1 ? parts[parts.length - 1] : parts[0];
        }

        // Mese/Anno: usa direttamente MeseContratto/AnnoContratto se presenti, altrimenti calcola da data
        let mese = item.MeseContratto ?? '-';
        let anno = item.AnnoContratto ?? '-';
        if ((mese === '-' || anno === '-') && date && date !== '-') {
          const d = new Date(date);
          if (!isNaN(d)) {
            if (mese === '-') {
              try { mese = d.toLocaleDateString('it-IT', { month: 'long' }); }
              catch { mese = String(d.getMonth() + 1).padStart(2, '0'); }
            }
            if (anno === '-') anno = String(d.getFullYear());
          }
        }

        const stato = item.Stato ?? item.status ?? '-';
        // Non includere NomeFile o FullPath nel rendering della tabella (restano solo in raw)
        return { id, date, dealer, cognome, mese, anno, stato, raw: item };
      });

      const sorted = [...mapped].sort((a, b) => {
        const da = a.raw?.DataOrdinamento ? new Date(a.raw.DataOrdinamento) : (a.date ? new Date(a.date) : null);
        const db = b.raw?.DataOrdinamento ? new Date(b.raw.DataOrdinamento) : (b.date ? new Date(b.date) : null);
        if (da && db && !isNaN(da) && !isNaN(db)) return db - da;
        if (a.id && b.id) return (parseInt(b.id, 10) || 0) - (parseInt(a.id, 10) || 0);
        return 0;
      });

      setRows(sorted);

      // Risolvi i nomi dealer incrociando idDealer con tbDealers (RagioneSociale)
      try {
        const ids = Array.from(new Set(sorted
          .map(r => r?.raw?.idDealer)
          .filter(v => v !== null && v !== undefined && v !== '')));
        if (ids.length > 0) {
          await resolveDealerNames(ids);
        }
      } catch {}
    } catch (e) {
      setError(e?.message || 'Errore di caricamento');
    } finally {
      setLoading(false);
    }
  };

  // Costruttore URL S3 per due modalità di encoding: 'percent' (spazi -> %20) e 'plus' (spazi -> '+')
  const buildS3UrlFromFullPath = (fullPath, { mode = 'percent', keepUploadsPrefix = true } = {}) => {
    if (!fullPath) return '';
    let raw = String(fullPath).trim();
    try {
      const u = new URL(raw);
      if (u.protocol === 'http:' || u.protocol === 'https:') return raw;
    } catch {}
    try {
      const base = (typeof window !== 'undefined' && window.location?.origin) ? window.location.origin : 'https://station.kimweb.agency';
      const u = new URL(raw, base);
      raw = u.pathname || raw;
    } catch {}
    let path = raw.replace(/\\/g, '/').replace(/^\/+/, '');
    // Opzionalmente mantieni o rimuovi il prefisso uploads/
    if (!keepUploadsPrefix && path.startsWith('uploads/')) path = path.replace(/^uploads\//, '');
    const encoded = path.split('/')
      .filter(Boolean)
      .map(seg => {
        let s = seg;
        try { s = decodeURIComponent(seg); } catch {}
        if (mode === 'plus') {
          const withPlus = s.replace(/ /g, '+');
          // Non sostituire %2B: mantieni il '+' encodato per evitare conversioni a spazio da proxy
          return encodeURIComponent(withPlus);
        } else {
          // percent-encoding standard (spazi -> %20, '+' -> %2B)
          return encodeURIComponent(s);
        }
      })
      .join('/');
    return `https://contrattistation.s3.eu-west-1.amazonaws.com/${encoded}`;
  };

  // Tenta di risolvere un URL valido facendo HEAD su percent, poi plus
  const resolveAndOpenS3Url = async (fullPath) => {
    const candidates = [
      buildS3UrlFromFullPath(fullPath, { mode: 'percent', keepUploadsPrefix: true }),
      buildS3UrlFromFullPath(fullPath, { mode: 'plus', keepUploadsPrefix: true }),
      buildS3UrlFromFullPath(fullPath, { mode: 'percent', keepUploadsPrefix: false }),
      buildS3UrlFromFullPath(fullPath, { mode: 'plus', keepUploadsPrefix: false }),
    ].filter(Boolean);
    for (const url of candidates) {
      try {
        const resp = await fetch(url, { method: 'HEAD' });
        if (resp.ok) {
          window.open(url, '_blank', 'noopener,noreferrer');
          return;
        }
      } catch {}
    }
    alert('Documento non trovato su S3 (NoSuchKey).');
  };

  // Risolve l'URL migliore per l'anteprima (iframe) usando HEAD come per il bottone
  useEffect(() => {
    let aborted = false;
    const run = async () => {
      if (!detail) { setPreviewUrl(''); return; }
      const raw = detail.FullPath || detail.DocumentoUrl || detail.Url || '';
      if (!raw) { setPreviewUrl(''); return; }
      const candidates = [
        buildS3UrlFromFullPath(raw, { mode: 'percent', keepUploadsPrefix: true }),
        buildS3UrlFromFullPath(raw, { mode: 'plus', keepUploadsPrefix: true }),
        buildS3UrlFromFullPath(raw, { mode: 'percent', keepUploadsPrefix: false }),
        buildS3UrlFromFullPath(raw, { mode: 'plus', keepUploadsPrefix: false }),
      ];
      for (const url of candidates) {
        try {
          const resp = await fetch(url, { method: 'HEAD' });
          if (resp.ok) {
            if (!aborted) setPreviewUrl(url);
            return;
          }
        } catch {}
      }
      if (!aborted) setPreviewUrl('');
    };
    run();
    return () => { aborted = true; };
  }, [detail]);

  // Azioni MASTER: ACCETTA / RIFIUTA
  const handleAccept = async () => {
    if (!selectedId) return;
    try {
      await postProtectedData(`/master/contratti/${selectedId}/accetta`, {});
      // aggiorna lista e dettaglio (stato locale)
      await fetchAll();
      // aggiorna stato in detail se presente
      setDetail(prev => prev ? { ...prev, Stato: 'ACCETTATO' } : prev);
    } catch (e) {
      alert(`Errore durante ACCETTA: ${e?.message || e}`);
    }
  };

  const handleRefuse = async () => {
    if (!selectedId) return;
    const nota = (refuseNote || '').trim();
    if (!nota) {
      alert('Inserisci una motivazione/nota prima di rifiutare il contratto.');
      return;
    }
    try {
      await postProtectedData(`/master/contratti/${selectedId}/rifiuta`, { nota });
      await fetchAll();
      setDetail(prev => prev ? { ...prev, Stato: 'RIFIUTATO', Note: nota } : prev);
      setRefuseNote('');
    } catch (e) {
      alert(`Errore durante RIFIUTA: ${e?.message || e}`);
    }
  };

  // Prova endpoint Master per ottenere elenco dealers e creare una mappa idDealer -> RagioneSociale
  const resolveDealerNames = async (idsWanted = []) => {
    const endpoints = [
      '/master/dealers',
      '/master/dealer-list',
      '/master/dealers/tutti'
    ];
    let list = null;
    let lastErr = null;
    for (const ep of endpoints) {
      try {
        const res = await getProtectedData(ep);
        const arr = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : (res?.items || res?.rows || []);
        if (Array.isArray(arr) && arr.length) { list = arr; break; }
      } catch (e) { lastErr = e; }
    }
    if (!list) return;

    const map = {};
    for (const d of list) {
      const id = d.idDealer ?? d.IDDealer ?? d.IdDealer ?? d.ID ?? d.Id ?? d._id;
      const name = d.RagioneSociale ?? d.NomeDealer ?? d.Denominazione ?? d.DenominazioneDealer ?? d.Nome ?? d.nome ?? null;
      if (id != null && name) map[String(id)] = String(name);
    }
    if (Object.keys(map).length === 0) return;
    setDealerMap(prev => ({ ...prev, ...map }));

    // Aggiorna le righe con il nome dealer se disponibile
    setRows(prev => prev.map(r => {
      const id = r?.raw?.idDealer;
      if (id != null && map[String(id)]) {
        return { ...r, dealer: map[String(id)] };
      }
      return r;
    }));
  };

  useEffect(() => { fetchAll(); }, []);

  const openDetail = async (id, raw = null) => {
    if (!id && !raw) return;
    const sel = id || raw?.ID || raw?.idContratto || raw?.Id || raw?.id;
    setSelectedId(sel);
    setIsModalOpen(true);
    setTimeout(() => setModalVisible(true), 0);
    setDetail(null);
    setDetailError(null);
    setDetailLoading(true);
    try {
      // Recupera dettaglio completo dal backend per includere Storico e URL documento
      const res = await getProtectedData(`/master/contratti/${sel}`);
      if (res && (res.ID || res.id || res.Id)) {
        setDetail(res);
      } else {
        // Fallback: usa i dati raw già disponibili
        setDetail(raw || {});
      }
    } catch (e) {
      // Fallback a raw se disponibile, altrimenti mostra errore
      if (raw) setDetail(raw);
      else setDetailError(e?.message || 'Errore di caricamento dettaglio');
    } finally {
      setDetailLoading(false);
    }
  };

  const closeModal = () => {
    setModalVisible(false);
    setTimeout(() => setIsModalOpen(false), 200);
    setSelectedId(null);
    setDetail(null);
    setDetailError(null);
    setDetailLoading(false);
    setPreviewUrl('');
    setRefuseNote('');
  };

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter(r =>
      (r.date + '').toLowerCase().includes(term) ||
      (r.dealer + '').toLowerCase().includes(term) ||
      (r.cognome + '').toLowerCase().includes(term) ||
      (r.mese + '').toLowerCase().includes(term) ||
      (r.anno + '').toLowerCase().includes(term) ||
      (r.stato + '').toLowerCase().includes(term)
    );
  }, [q, rows]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-end mb-2">
        <div className="text-xs text-gray-500">{filtered.length} record</div>
      </div>
      <div className="mb-3">
        <input
          type="text"
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Cerca..."
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {loading && (
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-5 bg-gray-100 rounded animate-pulse" />
          ))}
        </div>
      )}

      {!loading && error && (
        <div className="text-sm text-red-600 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={fetchAll} className="ml-3 px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 text-gray-700">Riprova</button>
        </div>
      )}

      {!loading && !error && (
        <div className="overflow-x-auto -mx-2 sm:mx-0">
          <table className="min-w-[900px] w-full table-fixed">
            <colgroup>
              <col style={{ width: '20%' }} />
              <col style={{ width: '24%' }} />
              <col style={{ width: '24%' }} />
              <col style={{ width: '12%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '120px' }} />
            </colgroup>
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left py-2 px-2 text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Data</th>
                <th className="text-left py-2 px-2 text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Dealer</th>
                <th className="text-left py-2 px-2 text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Cognome Cliente</th>
                <th className="text-left py-2 px-2 text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Mese</th>
                <th className="text-left py-2 px-2 text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Anno</th>
                <th className="text-left py-2 px-2 text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Stato</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-sm text-gray-500">Nessun risultato</td>
                </tr>
              ) : (
                filtered.map((r, i) => {
                  const hasId = !!r.id;
                  const title = hasId ? 'Apri dettagli contratto' : 'Dettaglio non disponibile';
                  return (
                    <tr
                      key={(r.id ?? i) + ''}
                      className={`transition-colors ${hasId ? 'hover:bg-gray-50 cursor-pointer' : 'opacity-70 cursor-not-allowed'}`}
                      title={title}
                      onClick={hasId ? () => openDetail(r.id, r.raw) : undefined}
                      data-id={hasId ? String(r.id) : ''}
                    >
                      <td className="py-2 px-2 text-sm text-gray-900 whitespace-nowrap">{r.date}</td>
                      <td className="py-2 px-2 text-sm text-gray-700 truncate" title={r.dealer}>{r.dealer}</td>
                      <td className="py-2 px-2 text-sm text-gray-900 truncate" title={r.cognome}>{r.cognome}</td>
                      <td className="py-2 px-2 text-sm text-gray-700 whitespace-nowrap">{r.mese}</td>
                      <td className="py-2 px-2 text-sm text-gray-700 whitespace-nowrap">{r.anno}</td>
                      <td className="py-2 px-2 text-sm text-right whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusPill(r.stato)}`}>{r.stato}</span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal Dettaglio Contratto (Master) */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className={`absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-200 ${modalVisible ? 'opacity-100' : 'opacity-0'}`}
            onClick={closeModal}
          />
          <div className={`relative bg-white rounded-lg shadow-xl w-full max-w-3xl mx-4 transition-all duration-200 ease-out transform ${modalVisible ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 translate-y-1'}`}>
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <h4 className="text-base font-semibold text-gray-900">Dettaglio Contratto{selectedId ? ` #${selectedId}` : ''}</h4>
              <button onClick={closeModal} className="text-gray-500 hover:text-gray-700" aria-label="Chiudi">✕</button>
            </div>
            <div className="p-4 max-h-[70vh] overflow-auto">
              {detailLoading && (
                <div className="space-y-2">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="h-4 bg-gray-100 rounded animate-pulse" />
                  ))}
                </div>
              )}
              {detailError && !detailLoading && (
                <div className="text-sm text-red-600">{detailError}</div>
              )}
              {!detailLoading && !detailError && detail && (
                <div className="space-y-4">
                  {/* Dettagli contratto dal DB (raw) */}
                  <div>
                    <div className="text-xs font-medium text-gray-700 mb-2">Dettagli contratto (DB)</div>
                    {(() => {
                      const fields = [
                        { key: 'ID', label: 'ID', value: detail.ID ?? detail.Id ?? detail.id ?? detail.idContratto },
                        { key: 'idDealer', label: 'idDealer', value: detail.idDealer ?? detail.IDDealer },
                        { key: 'DataOra', label: 'DataOra', value: formatDateTime(detail.DataOra ?? detail.DataUpload ?? detail.Data) },
                        { key: 'NomeFile', label: 'NomeFile', value: detail.NomeFile ?? detail.FileName },
                        { key: 'FileUID', label: 'FileUID', value: detail.FileUID ?? detail.fileUid },
                        { key: 'CognomeCliente', label: 'CognomeCliente', value: detail.CognomeCliente ?? detail.Cognome },
                        { key: 'CodiceProposta', label: 'CodiceProposta', value: detail.CodiceProposta ?? detail.Codice ?? detail.CodiceOfferta },
                        { key: 'FullPath', label: 'FullPath', value: detail.FullPath ?? detail.DocumentoUrl ?? detail.Url },
                        { key: 'Utente', label: 'Utente', value: detail.Utente ?? detail.User },
                        { key: 'MeseContratto', label: 'MeseContratto', value: detail.MeseContratto ?? detail.Mese },
                        { key: 'AnnoContratto', label: 'AnnoContratto', value: detail.AnnoContratto ?? detail.Anno },
                        { key: 'Stato', label: 'Stato', value: detail.Stato ?? detail.status },
                        { key: 'Note', label: 'Note', value: detail.Note ?? detail.note },
                      ].filter(f => f.value !== null && f.value !== undefined && String(f.value).trim() !== '');
                      if (fields.length === 0) {
                        return <div className="text-sm text-gray-500">Nessun dettaglio disponibile</div>;
                      }
                      return (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {fields.map((f, idx) => (
                            <div key={idx} className={f.key === 'FullPath' ? 'sm:col-span-2' : ''}>
                              <div className="text-xs text-gray-500">{f.label}</div>
                              {f.key === 'Stato' ? (
                                <div className={`inline-block mt-0.5 px-2 py-0.5 rounded-full text-xs ${statusPill(f.value)}`}>{f.value}</div>
                              ) : f.key === 'FullPath' && typeof f.value === 'string' && f.value ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    // Usa prima l'URL già risolto usato anche per VISUALIZZA (se disponibile)
                                    try {
                                      const raw = detail.DocumentoUrl || detail.FullPath || detail.Url || f.value;
                                      const resolved = raw ? resolveContractDocUrl(raw) : '';
                                      const finalUrl = resolved || previewUrl || '';
                                      if (finalUrl) {
                                        window.open(finalUrl, '_blank', 'noopener,noreferrer');
                                        return;
                                      }
                                    } catch {}
                                    // Fallback: mantieni la vecchia logica basata su FullPath
                                    resolveAndOpenS3Url(f.value);
                                  }}
                                  className="inline-flex items-center text-xs font-medium px-2 py-1 rounded bg-blue-100 text-blue-800 hover:bg-blue-200 transition-colors"
                                >
                                  APRI FILE
                                </button>
                              ) : (
                                <div className="text-sm text-gray-900 break-words">{String(f.value)}</div>
                              )}
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>

                  {/* Anteprima documento (se PDF o visualizzabile) */}
                  {(() => {
                    const docUrl = previewUrl;
                    // Mostra anteprima solo se abbiamo un URL
                    if (!docUrl) return null;
                    const isPdf = /\.pdf($|\?)/i.test(docUrl);
                    return (
                      <div>
                        <div className="text-xs font-medium text-gray-700 mb-2">Anteprima documento</div>
                        {isPdf ? (
                          <div className="border border-gray-200 rounded overflow-hidden bg-gray-50">
                            <iframe
                              src={docUrl}
                              title="Anteprima documento"
                              className="w-full h-[520px] bg-white"
                            />
                          </div>
                        ) : (
                          <div className="text-sm text-gray-500">
                            Anteprima non disponibile per questo formato. Usa "APRI FILE" per visualizzare.
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* Intestatario (se presente) */}
                  {(detail.Intestatario || detail.PayloadIntestario || detail.Payload) && (
                    <div>
                      <div className="text-xs font-medium text-gray-700 mb-2">Intestatario</div>
                      {(() => {
                        const i = detail.Intestatario || {};
                        const p = { ...(detail.Payload || {}), ...(detail.PayloadIntestario || {}) };
                        const nomeCompleto = (i.RagioneSociale)
                          || [i.Nome, i.Cognome].filter(Boolean).join(' ').trim()
                          || (p.NOME_E_COGNOME_INTESTATARIO_CONTRATTO || '').trim()
                          || [p.NOME, p.COGNOME].filter(Boolean).join(' ').trim();
                        const cf = i.CodiceFiscale || p.CODICE_FISCALE_INTESTATARIO || p.CodiceFiscale || p.CODICE_FISCALE || p.CF;
                        const campi = [
                          { label: 'Nome e Cognome / Ragione sociale', value: nomeCompleto },
                          { label: 'Codice Fiscale', value: cf },
                          { label: 'Data di nascita', value: i.DataNascita || p.DATA_DI_NASCITA },
                          { label: 'Luogo di nascita', value: i.LuogoNascita || p.LUOGO_DI_NASCITA },
                          { label: 'Indirizzo', value: i.Indirizzo || p.INDIRIZZO_E_CIVICO_ATTIVAZIONE },
                          { label: 'CAP', value: i.CAP || p.CAP },
                          { label: 'Città', value: i.Citta || p.CITTA },
                          { label: 'Provincia', value: i.Provincia || p.PROVINCIA },
                          { label: 'P.IVA', value: i.PIVA || p.PARTITA_IVA },
                          { label: 'Email', value: i.Email || p.EMAIL },
                          { label: 'Telefono', value: i.Telefono || p.TELEFONO || p.RECAPITO_DI_RIFERIMENTO },
                        ].filter(item => {
                          const val = item.value;
                          return val && val !== '' && val !== '-' && val !== null && val !== undefined && String(val).trim() !== '';
                        });
                        return campi.length > 0 ? (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                            {campi.map((item, idx) => (
                              <div key={idx} className={item.label.startsWith('Indirizzo') ? 'sm:col-span-2' : ''}>
                                <div className="text-xs text-gray-500">{item.label}</div>
                                <div className="text-gray-800 break-words">{item.value}</div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-sm text-gray-500">Nessun dato intestatario disponibile</div>
                        );
                      })()}
                    </div>
                  )}

                  {/* Documenti allegati (con fallback al documento principale) */}
                  <div>
                    <div className="text-xs font-medium text-gray-700 mb-2">
                      Documenti {detail.Documenti?.length ? `(${detail.Documenti.length})` : ''}
                    </div>
                    {(() => {
                      const rawUrl = detail.DocumentoUrl || detail.FullPath || detail.Url || '';
                      const mainUrl = rawUrl ? resolveContractDocUrl(rawUrl) : '';
                      const docsArr = Array.isArray(detail.Documenti) ? detail.Documenti : [];
                      const hasDocs = docsArr.length > 0;
                      const list = hasDocs ? docsArr : (mainUrl ? [{ tipo: 'Contratto', nomeOriginale: detail.NomeFile || 'Documento contratto', url: mainUrl }] : []);
                      if (list.length === 0) {
                        return <div className="text-sm text-gray-500">Nessun documento allegato</div>;
                      }
                      return (
                        <div className="space-y-2">
                          {list.map((doc, index) => (
                            <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                              <div className="flex-1">
                                <div className="text-sm text-gray-700 font-medium">{doc.tipo || doc.nome || 'Documento'}</div>
                                <div className="text-xs text-gray-500">{doc.nomeOriginale || doc.filename || detail.NomeFile || ''}</div>
                              </div>
                              {doc.url ? (
                                <a
                                  href={doc.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs px-2 py-1 rounded bg-blue-100 text-blue-800 hover:bg-blue-200 transition-colors"
                                >
                                  Visualizza
                                </a>
                              ) : (
                                <span className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-600">
                                  Non disponibile
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>

                  {/* Storico (se presente) */}
                  <div>
                    <div className="text-xs font-medium text-gray-700 mb-1">Storico</div>
                    {Array.isArray(detail.Storico) && detail.Storico.length > 0 ? (
                      <div className="border border-gray-100 rounded">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="bg-gray-50 text-gray-600">
                              <th className="text-left px-2 py-1">Data</th>
                              <th className="text-left px-2 py-1">Utente</th>
                              <th className="text-left px-2 py-1">Da</th>
                              <th className="text-left px-2 py-1">A</th>
                              <th className="text-left px-2 py-1">Nota</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {detail.Storico.map((s, i) => (
                              <tr key={i}>
                                <td className="px-2 py-1 whitespace-nowrap">{formatDateTime(s.DataOra)}</td>
                                <td className="px-2 py-1">{s.Utente}</td>
                                <td className="px-2 py-1">{s.StatoPrecedenteNome || s.StatoPrecedente}</td>
                                <td className="px-2 py-1">{s.StatoNuovoNome || s.StatoNuovo}</td>
                                <td className="px-2 py-1">{s.Nota}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="text-sm text-gray-500">Nessuno storico disponibile</div>
                    )}
                  </div>

                  {/* Nota per il dealer (usata in caso di RIFIUTO) */}
                  <div>
                    <div className="text-xs font-medium text-gray-700 mb-1">Nota per il dealer (obbligatoria per rifiutare)</div>
                    <textarea
                      value={refuseNote}
                      onChange={e => setRefuseNote(e.target.value)}
                      rows={3}
                      className="w-full text-sm border border-gray-200 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 resize-none"
                      placeholder="Inserisci la motivazione del rifiuto. Sarà inviata al dealer e salvata nello storico."
                    />
                  </div>
                </div>
              )}
            </div>
            <div className="p-3 border-t border-gray-100 flex justify-end gap-2">
              {/* Pulsanti visibili solo per MASTER (il componente è nella sezione Master, quindi li mostriamo sempre) */}
              <button
                onClick={handleAccept}
                className="px-3 py-1.5 text-sm rounded bg-emerald-600 hover:bg-emerald-700 text-white"
                title="Accetta il contratto (stato 10)"
              >
                ACCETTA
              </button>
              <button
                onClick={handleRefuse}
                className="px-3 py-1.5 text-sm rounded bg-red-600 hover:bg-red-700 text-white"
                title="Rifiuta il contratto (stato 11) e invia email"
              >
                RIFIUTA
              </button>
              <button onClick={closeModal} className="px-3 py-1.5 text-sm rounded bg-gray-100 hover:bg-gray-200 text-gray-700">Chiudi</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
