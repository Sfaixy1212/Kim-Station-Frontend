import { useEffect, useMemo, useState } from 'react';
import { getProtectedData, postProtectedData, postFormData, patchProtectedData } from '../../services/api';
import { formatDateStrict, formatDateTimeStrict } from '../../utils/date';

function statusPill(status) {
  const raw = (status || '').toString();
  // Normalizza: rimuovi accenti, uppercase, sostituisci spazi con underscore
  const u = raw
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .trim().toUpperCase().replace(/\s+/g, '_');

  // Mapping esplicito richiesto
  const GREEN = new Set([
    'ATTIVATO',
    'SIM_SOSTITUITA',
    'RESET_ESEGUITO',
    'RILANCIO_ESEGUITO',
    'TICKET_GESTITO_CON_NOTA',
    'ORDINE_SBLOCCATO',
    'SUBENTRO_EFFETTUATO',
    'PRENOTATO',
    'CLIENTE_ACQUISIBILE',
  ]);
  const RED = new Set([
    'CLIENTE_NON_ACQUISIBILE',
  ]);
  const YELLOW = new Set([
    'TICKET_APERTO',
    'TICKET_IN_LAVORAZIONE',
  ]);

  if (GREEN.has(u)) return 'bg-green-100 text-green-800';
  if (RED.has(u)) return 'bg-red-100 text-red-800';
  if (YELLOW.has(u)) return 'bg-yellow-100 text-yellow-800';

  // Heuristics preesistenti come fallback
  const s = raw.toLowerCase();
  if (s.includes('attiv') || s.includes('success') || s.includes('ok')) return 'bg-green-100 text-green-800';
  if (s.includes('lavor') || s.includes('pend') || s.includes('proc') || s.includes('da_')) return 'bg-blue-100 text-blue-800';
  if (s.includes('rifiut') || s.includes('ko') || s.includes('err') || s.includes('annull')) return 'bg-red-100 text-red-800';
  return 'bg-gray-100 text-gray-800';
}

// Estrae solo le cifre da un valore (es. "1 - In lavorazione" -> "1")
function onlyDigits(val) {
  if (val === null || val === undefined) return '';
  const s = String(val);
  const m = s.match(/\d+/g);
  return m ? m.join('') : '';
}

// Ricerca ricorsiva di un array documenti dentro un oggetto
function findDocsArrayDeep(obj, maxDepth = 3) {
  const urlKeys = ['url','URL','FullPath','fullPath','Url','path','Path','Link','link','Href','href','Percorso'];
  const docKeys = ['TipoFile','tipo','FileUID','fileUID','NomeFile','name','filename'];
  function isDocArray(arr) {
    if (!Array.isArray(arr) || !arr.length) return false;
    const first = arr[0];
    if (!first || typeof first !== 'object') return false;
    const hasUrl = urlKeys.some(p => p in first && typeof first[p] === 'string');
    const hasDoc = docKeys.some(p => p in first);
    return hasUrl || hasDoc;
  }
  function walk(node, depth) {
    if (!node || typeof node !== 'object' || depth > maxDepth) return null;
    // Se node stesso è un array documenti
    if (Array.isArray(node) && isDocArray(node)) return node;
    // Se node è un oggetto: controlla le chiavi
    const keys = Object.keys(node);
    for (const k of keys) {
      const val = node[k];
      if (Array.isArray(val) && isDocArray(val)) return val;
    }
    // Ricorri negli oggetti figli
    for (const k of keys) {
      const val = node[k];
      if (val && typeof val === 'object') {
        const found = walk(val, depth + 1);
        if (found) return found;
      }
    }
    return null;
  }
  return walk(obj, 0);
}

// Compone URL S3 usando NomeFile e DataOrdine (YYYY/MM)
function buildActivationS3UrlFromNomeFile({ nomeFile, dataOrdine }) {
  if (!nomeFile) return '';
  let yyyy = '';
  let mm = '';
  if (dataOrdine) {
    try {
      const d = new Date(dataOrdine);
      if (!isNaN(d.getTime())) {
        yyyy = String(d.getFullYear());
        mm = String(d.getMonth() + 1).padStart(2, '0');
      }
    } catch {}
  }
  const parts = ['contratti'];
  if (yyyy) parts.push(yyyy);
  if (mm) parts.push(mm);
  const key = `${parts.join('/')}/${nomeFile}`;
  return `https://attivazionistation.s3.eu-west-1.amazonaws.com/${key}`;
}

// Costruisce URL S3 da contesto ordine se mancano URL espliciti
function buildActivationS3UrlFromContext({ fileUID, idOrdine, dataOrdine }) {
  if (!fileUID || !idOrdine) return '';
  let yyyy = '';
  let mm = '';
  if (dataOrdine) {
    try {
      const d = new Date(dataOrdine);
      if (!isNaN(d.getTime())) {
        yyyy = String(d.getFullYear());
        mm = String(d.getMonth() + 1).padStart(2, '0');
      }
    } catch {}
  }
  // Se non ricavabili, lascia vuoti: backend preferibile fornisca DataOrdine
  const parts = ['contratti'];
  if (yyyy) parts.push(yyyy);
  if (mm) parts.push(mm);
  parts.push(String(idOrdine));
  const key = `${parts.join('/')}/${fileUID}.pdf`;
  return `https://attivazionistation.s3.eu-west-1.amazonaws.com/${key}`;
}

function formatDate(val) {
  if (!val) return '-';
  // 0) Stringhe: timestamp SQL o pattern con separatori
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
    const m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
    if (m) {
      const a = parseInt(m[1], 10);
      const b = parseInt(m[2], 10);
      const y = m[3];
      if (!a || !b) return '-';
      // Se il secondo valore > 12 e il primo <= 12, presumiamo formato US (MM/DD/YYYY) -> inverti
      if (a <= 12 && b > 12) {
        const dd = String(b).padStart(2, '0');
        const mm = String(a).padStart(2, '0');
        return `${dd}/${mm}/${y}`;
      }
      // Altrimenti considera già DD/MM/YYYY
      const dd = String(a).padStart(2, '0');
      const mm = String(b).padStart(2, '0');
      return `${dd}/${mm}/${y}`;
    }
  }
  // 1) ISO Date / timestamp / Date object -> forza GG/MM/AAAA
  try {
    const d = new Date(val);
    if (!isNaN(d.getTime())) {
      const dd = String(d.getDate()).padStart(2, '0');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const yyyy = d.getFullYear();
      return `${dd}/${mm}/${yyyy}`;
    }
  } catch {}
  return String(val);
}

function formatDateTime(val) {
  if (!val) return '-';
  // Supporto esplicito per timestamp SQL: YYYY-MM-DD HH:mm:ss(.ms)
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
      return `${dd}/${mm}/${yyyy} ${HH}:${MM}`; // senza secondi
    }
  }
  // Fallback: usa Date e poi formatta manualmente HH:mm
  try {
    const d = new Date(val);
    if (!isNaN(d.getTime())) {
      const dd = String(d.getDate()).padStart(2, '0');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const yyyy = d.getFullYear();
      const HH = String(d.getHours()).padStart(2, '0');
      const MM = String(d.getMinutes()).padStart(2, '0');
      return `${dd}/${mm}/${yyyy} ${HH}:${MM}`;
    }
  } catch {}
  return formatDate(val);
}

// Converte percorsi locali (/uploads/...) in URL S3 pubblico desiderato
function resolveActivationDocUrl(val) {
  if (!val) return '';
  const raw = String(val).trim();
  // Se è già un URL assoluto verso il bucket corretto, restituiscilo
  try {
    const abs = new URL(raw);
    if (abs.hostname.includes('attivazionistation.s3')) return raw;
  } catch {}
  // Altrimenti normalizza path e costruisci URL S3 corretto
  let path = raw;
  try {
    const base = (typeof window !== 'undefined' && window.location?.origin) ? window.location.origin : 'https://station.kimweb.agency';
    const u = new URL(path, base);
    path = u.pathname || path;
  } catch {}
  if (path.startsWith('/uploads/')) path = path.replace(/^\/uploads\//, '');
  path = path.replace(/^\/+/, '');
  return `https://attivazionistation.s3.eu-west-1.amazonaws.com/${path}`;
}

export default function MasterActivationsTable() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [q, setQ] = useState('');
  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(null);
  const [detailDocs, setDetailDocs] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  // Action state (Master)
  const [actionNote, setActionNote] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState('');
  const [pdaFile, setPdaFile] = useState(null);
  const [pdaUploading, setPdaUploading] = useState(false);
  const [pdaError, setPdaError] = useState('');
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelError, setCancelError] = useState('');
  // Conferma inline per ANNULLA ORDINE (evita window.confirm bloccato)
  const [confirmCancel, setConfirmCancel] = useState(false);
  // Toast feedback
  const [toast, setToast] = useState({ message: '', type: 'success' });
  const notify = (message, type = 'success') => {
    try { setToast({ message, type }); } catch {}
    try {
      clearTimeout(notify._t);
    } catch {}
    notify._t = setTimeout(() => setToast({ message: '', type }), 3000);
  };

  // Rilevazione per template speciali (CERTIFICAZIONE_INDIRIZZO, INFO_PRATICA)
  const isCertificazioneIndirizzo = useMemo(() => {
    try {
      const normalize = (v) => (v || '')
        .toString()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .trim().toUpperCase().replace(/\s+/g, '_');
      const code = normalize(detail?.TemplateCodice) || normalize(detail?.Template?.template || detail?.Template);
      return code === 'CERTIFICAZIONE_INDIRIZZO';
    } catch {
      return false;
    }
  }, [detail]);


  // Rilevazione template RESET CREDENZIALI DEALER FASTWEB
  const isResetCredenzialiDealerFastweb = useMemo(() => {
    try {
      const normalize = (v) => (v || '')
        .toString()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .trim().toUpperCase().replace(/\s+/g, '_');
      const code = normalize(detail?.TemplateCodice) || normalize(detail?.Template?.template || detail?.Template);
      return code === 'RESET_CREDENZIALI_DEALER_FASTWEB';
    } catch {
      return false;
    }
  }, [detail]);

  // Rilevazione template TICKET CLIENTE NON ACQUISIBILE
  const isTicketClienteNonAcquisibile = useMemo(() => {
    try {
      const normalize = (v) => (v || '')
        .toString()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .trim().toUpperCase().replace(/\s+/g, '_');
      const code = normalize(detail?.TemplateCodice) || normalize(detail?.Template?.template || detail?.Template);
      return code === 'TICKET_CLIENTE_NON_ACQUISIBILE';
    } catch {
      return false;
    }
  }, [detail]);

  // Rilevazione template RILANCIO_MNP_FASTWEB
  const isRilancioMnpFastweb = useMemo(() => {
    try {
      const normalize = (v) => (v || '')
        .toString()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .trim().toUpperCase().replace(/\s+/g, '_');
      const code = normalize(detail?.TemplateCodice) || normalize(detail?.Template?.template || detail?.Template);
      return code === 'RILANCIO_MNP_FASTWEB';
    } catch {
      return false;
    }
  }, [detail]);

  // Rilevazione template RICONTATTO_CLIENTE
  const isRicontattoCliente = useMemo(() => {
    try {
      const normalize = (v) => (v || '')
        .toString()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .trim().toUpperCase().replace(/\s+/g, '_');
      const code = normalize(detail?.TemplateCodice) || normalize(detail?.Template?.template || detail?.Template);
      return code === 'RICONTATTO_CLIENTE';
    } catch {
      return false;
    }
  }, [detail]);

  // Rilevazione template NON_ACQUISIBILE
  const isNonAcquisibile = useMemo(() => {
    try {
      const normalize = (v) => (v || '')
        .toString()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .trim().toUpperCase().replace(/\s+/g, '_');
      const code = normalize(detail?.TemplateCodice) || normalize(detail?.Template?.template || detail?.Template);
      return code === 'NON_ACQUISIBILE';
    } catch {
      return false;
    }
  }, [detail]);

  // Rilevazione template MOBILE_CONSUMER_RESET_CREDENZIALI
  const isMobileConsumerResetCredenziali = useMemo(() => {
    try {
      const normalize = (v) => (v || '')
        .toString()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .trim().toUpperCase().replace(/\s+/g, '_');
      const code = normalize(detail?.TemplateCodice) || normalize(detail?.Template?.template || detail?.Template);
      return code === 'MOBILE_CONSUMER_RESET_CREDENZIALI';
    } catch {
      return false;
    }
  }, [detail]);

  // Rilevazione template SOSTITUZIONE GUASTO O CAMBIO FORMATO
  const isSostituzioneGuastoOCambioFormato = useMemo(() => {
    try {
      const normalize = (v) => (v || '')
        .toString()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .trim().toUpperCase().replace(/\s+/g, '_');
      const code = normalize(detail?.TemplateCodice) || normalize(detail?.Template?.template || detail?.Template);
      return code === 'SOSTITUZIONE_GUASTO_O_CAMBIO_FORMATO';
    } catch {
      return false;
    }
  }, [detail]);

  // Rilevazione template FURTO_SMARRIMENTO
  const isFurtoSmarrimento = useMemo(() => {
    try {
      const normalize = (v) => (v || '')
        .toString()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .trim().toUpperCase().replace(/\s+/g, '_');
      const code = normalize(detail?.TemplateCodice) || normalize(detail?.Template?.template || detail?.Template);
      return code === 'FURTO_SMARRIMENTO';
    } catch {
      return false;
    }
  }, [detail]);

  // Rilevazione template SUBENTRO 1MOBILE
  const isSubentro1Mobile = useMemo(() => {
    try {
      const normalize = (v) => (v || '')
        .toString()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .trim().toUpperCase().replace(/\s+/g, '_');
      const code = normalize(detail?.TemplateCodice) || normalize(detail?.Template?.template || detail?.Template);
      return code === 'SUBENTRO_1MOBILE';
    } catch {
      return false;
    }
  }, [detail]);

  // Rilevazione template TICKET ORDINE FISSO PARCHEGGIATO
  const isTicketOrdineFissoParcheggiato = useMemo(() => {
    try {
      const normalize = (v) => (v || '')
        .toString()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .trim().toUpperCase().replace(/\s+/g, '_');
      const code = normalize(detail?.TemplateCodice) || normalize(detail?.Template?.template || detail?.Template);
      return code === 'TICKET_ORDINE_FISSO_PARCHEGGIATO';
    } catch {
      return false;
    }
  }, [detail]);

  // Rilevazione template SKY_MOBILE_PORTABILITA
  const isSkyMobilePortabilita = useMemo(() => {
    try {
      const normalize = (v) => (v || '')
        .toString()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .trim().toUpperCase().replace(/\s+/g, '_');
      const code = normalize(detail?.TemplateCodice) || normalize(detail?.Template?.template || detail?.Template);
      return code === 'SKY_MOBILE_PORTABILITA';
    } catch {
      return false;
    }
  }, [detail]);

  // Rilevazione template SKY_MOBILE_NUOVO_NUMERO
  const isSkyMobileNuovoNumero = useMemo(() => {
    try {
      const normalize = (v) => (v || '')
        .toString()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .trim().toUpperCase().replace(/\s+/g, '_');
      const code = normalize(detail?.TemplateCodice) || normalize(detail?.Template?.template || detail?.Template);
      return code === 'SKY_MOBILE_NUOVO_NUMERO';
    } catch {
      return false;
    }
  }, [detail]);

  // Rilevazione template SKY_WIFI_3P_4P
  const isSkyWifi3p4p = useMemo(() => {
    try {
      const normalize = (v) => (v || '')
        .toString()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .trim().toUpperCase().replace(/\s+/g, '_');
      const code = normalize(detail?.TemplateCodice) || normalize(detail?.Template?.template || detail?.Template);
      return code === 'SKY_WIFI_3P_4P';
    } catch {
      return false;
    }
  }, [detail]);

  // Rilevazione template ONLY_TV
  const isOnlyTv = useMemo(() => {
    try {
      const normalize = (v) => (v || '')
        .toString()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .trim().toUpperCase().replace(/\s+/g, '_');
      const code = normalize(detail?.TemplateCodice) || normalize(detail?.Template?.template || detail?.Template);
      return code === 'ONLY_TV';
    } catch {
      return false;
    }
  }, [detail]);

  // Rilevazione template INFO_PRATICA
  const isInfoPratica = useMemo(() => {
    try {
      const normalize = (v) => (v || '')
        .toString()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .trim().toUpperCase().replace(/\s+/g, '_');
      const code = normalize(detail?.TemplateCodice) || normalize(detail?.Template?.template || detail?.Template);
      return code === 'INFO_PRATICA';
    } catch {
      return false;
    }
  }, [detail]);

  // Rilevazione offerte ENI PLENITUDE (idOperatore = 16)
  const isEniPlenitude = useMemo(() => {
    try {
      const idOp = detail?.IDOperatore || detail?.idOperatore || detail?.IdOperatore || detail?.Offerta?.idOperatore || detail?.Offerta?.IDOperatore;
      console.log('[ENI DEBUG] idOperatore:', idOp, 'isEni:', idOp === 16 || idOp === '16', 'detail:', detail);
      return idOp === 16 || idOp === '16';
    } catch {
      return false;
    }
  }, [detail]);

  // Rilevazione template TICKET INFO PRATICA
  const isTicketInfoPratica = useMemo(() => {
    try {
      const normalize = (v) => (v || '')
        .toString()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .trim().toUpperCase().replace(/\s+/g, '_');
      const code = normalize(detail?.TemplateCodice) || normalize(detail?.Template?.template || detail?.Template);
      return code === 'TICKET_INFO_PRATICA';
    } catch {
      return false;
    }
  }, [detail]);


  const fetchAll = async () => {
    setLoading(true);
    setError(null);
    try {
      // Endpoint esclusivi per ruolo master
      const endpoints = [
        '/master/attivazioni',
        '/master/ultime-attivazioni',
      ];
      let data = null, lastErr = null;
      for (const ep of endpoints) {
        try {
          const res = await getProtectedData(ep);
          const list = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : (res?.items || res?.rows || []);
          if (Array.isArray(list) && list.length >= 0) {
            data = list;
            break;
          }
        } catch (e) { lastErr = e; }
      }
      if (!data) throw lastErr || new Error('Nessun endpoint valido per attivazioni master');

      // Scegli la data migliore per la lista: preferisci un timestamp SQL se presente
      const sqlRe = /^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?$/;
      const pickBestDate = (obj) => {
        const candidates = [obj.DataOra, obj.DataOrdinamento, obj.DataOrdine, obj.Data, obj.date, obj.createdAt, obj.data]
          .filter(v => v != null && v !== '');
        const sql = candidates.find(v => typeof v === 'string' && sqlRe.test(v.trim()));
        if (sql) return sql;
        const sep = candidates.find(v => typeof v === 'string' && /(\d{1,2})[./-](\d{1,2})[./-](\d{4})/.test(String(v).trim()));
        if (sep) return sep;
        return candidates[0] || '-';
      };

      const mapped = data.map((item) => {
        const id = item.IDOrdine ?? item.id ?? item.orderId ?? item.ID ?? null;
        const dateRaw = pickBestDate(item);
        const date = formatDateStrict(dateRaw);
        const offerta = item.Offerta ?? item.TitoloOfferta ?? item.Titolo ?? item.title ?? item.Valore ?? '-';
        const dealer = item.Dealer ?? item.NomeDealer ?? item.dealer ?? item.nomeDealer ?? item.RagioneSociale ?? '-';
        const cliente = item.Cliente ?? item.NomeCliente ?? item.cliente ?? item.nomeCliente ?? item.Intestatario ?? '-';
        const stato = item.Stato ?? item.StatoEsteso ?? item.status ?? '-';
        return { id, date, offerta, dealer, cliente, stato, raw: item };
      });

      // Ordina per data desc se disponibile, altrimenti per id desc
      const sorted = [...mapped].sort((a, b) => {
        const da = a.raw?.DataOrdinamento ? new Date(a.raw.DataOrdinamento) : (a.date ? new Date(a.date) : null);
        const db = b.raw?.DataOrdinamento ? new Date(b.raw.DataOrdinamento) : (b.date ? new Date(b.date) : null);
        if (da && db && !isNaN(da) && !isNaN(db)) return db - da;
        if (a.id && b.id) return (parseInt(b.id, 10) || 0) - (parseInt(a.id, 10) || 0);
        return 0;
      });

      setRows(sorted);
    } catch (e) {
      setError(e?.message || 'Errore di caricamento');
    } finally {
      setLoading(false);
    }
  };

  // Master: cambio stato con invio email template opzionale
  const handleChangeStateWithEmail = async ({ targetState, emailTemplateId, requireNote = false }) => {
    if (!selectedId) return;
    setActionError('');
    if (requireNote && !actionNote.trim()) {
      setActionError('La nota è obbligatoria per questa azione.');
      return;
    }
    setActionLoading(true);
    try {
      // Normalizza stato: default 0 se non presente; consenti anche stringhe valide
      const normalizeState = (s) => {
        if (s === undefined || s === null) return 0;
        if (typeof s === 'string') {
          const t = s.trim();
          if (t === '') return 0;
          const n = parseInt(t, 10);
          return Number.isFinite(n) ? n : t; // se non numerico, passa stringa
        }
        if (typeof s === 'number' && !Number.isFinite(s)) return 0;
        return s;
      };
      const statoNorm = normalizeState(targetState);
      await postProtectedData(`/master/attivazione/${selectedId}/stato`, {
        stato: statoNorm,
        nota: actionNote.trim() || undefined,
        emailTemplateId: emailTemplateId || undefined,
      });
      await openDetail(selectedId);
      await fetchAll();
      notify('Stato aggiornato con successo');
    } catch (e) {
      setActionError(e?.message || 'Errore durante il cambio stato');
    } finally {
      setActionLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const openDetail = async (id) => {
    if (!id) return;
    setSelectedId(id);
    setIsModalOpen(true);
    setTimeout(() => setModalVisible(true), 0);
    setDetail(null);
    setDetailError(null);
    setDetailLoading(true);
    setPreviewUrl('');
    try {
      const res = await getProtectedData(`/master/attivazione/${id}`);
      setDetail(res);
      setActionNote('');
      setActionError('');
      setPdaFile(null);
      setPdaError('');
      
      // Rileva documenti embedded su più proprietà o in modo euristico
      let embeddedDocs = res?.Documenti || res?.FileOrdine || res?.tbFileOrdine || res?.DocumentiOrdine;
      if (!Array.isArray(embeddedDocs)) {
        // Scansione euristica: cerca array con elementi che hanno TipoFile o FileUID
        const candidateKeys = Object.keys(res || {}).filter(k => Array.isArray(res[k]));
        for (const k of candidateKeys) {
          const arr = res[k];
          if (arr && arr.length && typeof arr[0] === 'object') {
            const first = arr[0] || {};
            const urlKeys = ['url','URL','FullPath','fullPath','Url','path','Path','Link','link','Href','href','Percorso'];
            const hasUrlField = urlKeys.some(p => p in first && typeof first[p] === 'string' && /^(https?:\/\/|\/)/i.test(first[p]));
            const hasDocShape = hasUrlField || ['TipoFile','tipo','FileUID','fileUID','NomeFile','name','filename'].some(p => p in first);
            if (hasDocShape) { embeddedDocs = arr; break; }
          }
        }
        // Se ancora non trovato, ricerca ricorsiva in oggetti annidati (es. Payload.Documenti)
        if (!Array.isArray(embeddedDocs)) {
          try {
            const deep = findDocsArrayDeep(res, 3);
            if (Array.isArray(deep)) {
              embeddedDocs = deep;
            }
          } catch {}
        }
      }
      if (Array.isArray(embeddedDocs) && embeddedDocs.length > 0) {
        setDetailDocs(embeddedDocs);
        // Anteprima di default: prima PDF, altrimenti prima immagine supportata
        try {
          const urls = embeddedDocs.map(d => {
            const payloadUrl = d?.Payload?.s3Url || d?.payload?.s3Url || '';
            if (payloadUrl) return resolveActivationDocUrl(payloadUrl);
            const payloadKey = d?.Payload?.s3Key || d?.payload?.s3Key || '';
            if (payloadKey) return resolveActivationDocUrl(`https://attivazionistation.s3.eu-west-1.amazonaws.com/${payloadKey}`);
            const explicit = d.url || d.URL || d.FullPath || d.fullPath || d.Url || d.path || d.Path || d.Link || d.link || d.Href || d.href || d.Percorso || '';
            if (explicit) return resolveActivationDocUrl(explicit);
            const nome = d.NomeFile || d.nome || d.filename || '';
            return buildActivationS3UrlFromNomeFile({ nomeFile: nome, dataOrdine: res?.DataOrdine });
          });
          const firstPdf = urls.find(u => /\.pdf($|\?)/i.test(u));
          const firstImg = urls.find(u => /\.(png|jpe?g|gif|webp)($|\?)/i.test(u));
          const defPreview = firstPdf || firstImg || '';
          if (defPreview) setPreviewUrl(defPreview);
        } catch {}
      } else {
        // Nessun documento embedded: niente chiamate HTTP. Atteso embedding DB (tbFileOrdine) nel dettaglio.
        setDetailDocs([]);
      }
    } catch (e) {
      setDetailError(e?.message || 'Errore di caricamento dettaglio');
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
    setActionNote('');
    setActionError('');
    setPdaFile(null);
    setPdaError('');
  };

  // Master: cambio stato ordine
  const handleChangeState = async (targetState) => {
    if (!selectedId) return;
    setActionError('');
    // Nota obbligatoria solo per stato 3 (ATTESA INTEGRAZIONE)
    if ((targetState === 3) && !actionNote.trim()) {
      setActionError('La nota è obbligatoria per questo stato.');
      return;
    }
    setActionLoading(true);
    try {
      const normalizeState = (s) => {
        if (s === undefined || s === null) return 0;
        if (typeof s === 'string') {
          const t = s.trim();
          if (t === '') return 0;
          const n = parseInt(t, 10);
          return Number.isFinite(n) ? n : t;
        }
        if (typeof s === 'number' && !Number.isFinite(s)) return 0;
        return s;
      };
      const statoNorm = normalizeState(targetState);
      await postProtectedData(`/master/attivazione/${selectedId}/stato`, {
        stato: statoNorm,
        nota: actionNote.trim() || undefined,
      });
      // refresh dettaglio e lista
      await openDetail(selectedId);
      await fetchAll();
      notify('Stato aggiornato con successo');
    } catch (e) {
      setActionError(e?.message || 'Errore durante il cambio stato');
    } finally {
      setActionLoading(false);
    }
  };

  // Master: upload PDA (PDF o immagini, max 10MB)
  const handleSelectPda = (file) => {
    setPdaError('');
    if (!file) { setPdaFile(null); return; }
    
    // Accetta PDF e immagini comuni
    const allowedTypes = [
      'application/pdf',
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/webp'
    ];
    
    if (!allowedTypes.includes(file.type)) {
      setPdaError('Sono consentiti solo PDF e immagini (JPG, PNG, WEBP).');
      setPdaFile(null);
      return;
    }
    
    if (file.size > 10 * 1024 * 1024) {
      setPdaError('Dimensione massima 10MB.');
      setPdaFile(null);
      return;
    }
    setPdaFile(file);
  };

  const handleUploadPda = async () => {
    if (!selectedId) return;
    setPdaError('');
    if (!pdaFile) { setPdaError('Seleziona un file PDF prima di caricare.'); return; }
    setPdaUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', pdaFile);
      await postFormData(`/master/attivazione/${selectedId}/upload-pda`, fd);
      // refresh dettaglio
      await openDetail(selectedId);
    } catch (e) {
      setPdaError(e?.message || 'Errore durante l\'upload del PDA');
    } finally {
      setPdaUploading(false);
    }
  };

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter(r =>
      (r.id + '').toLowerCase().includes(term) ||
      (r.date + '').toLowerCase().includes(term) ||
      (r.offerta + '').toLowerCase().includes(term) ||
      (r.dealer + '').toLowerCase().includes(term) ||
      (r.cliente + '').toLowerCase().includes(term) ||
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
          <table className="min-w-[920px] w-full table-fixed">
            <colgroup>
              <col style={{ width: '16%' }} />
              <col style={{ width: '12%' }} />
              <col style={{ width: '36%' }} />
              <col style={{ width: '20%' }} />
              <col style={{ width: '120px' }} />
            </colgroup>
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left py-2 px-2 text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Data Ordine</th>
                <th className="text-left py-2 px-2 text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">ID Ordine</th>
                <th className="text-left py-2 px-2 text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Offerta</th>
                <th className="text-left py-2 px-2 text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Dealer</th>
                <th className="text-left py-2 px-2 text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Stato</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-sm text-gray-500">Nessun risultato</td>
                </tr>
              ) : (
                filtered.map((r, i) => (
                  <tr
                    key={(r.id ?? i) + ''}
                    className={`transition-colors ${r.id ? 'hover:bg-gray-50 cursor-pointer' : 'opacity-70 cursor-not-allowed'}`}
                    onClick={() => r.id && openDetail(r.id)}
                    title={r.id ? 'Apri dettagli attivazione' : 'Dettaglio non disponibile'}
                  >
                    <td className="py-2 px-2 text-sm text-gray-900 whitespace-nowrap">{r.date}</td>
                    <td className="py-2 px-2 text-sm text-gray-700 whitespace-nowrap">{r.id ?? '-'}</td>
                    <td className="py-2 px-2 text-sm text-gray-900 truncate" title={r.offerta}>{r.offerta}</td>
                    <td className="py-2 px-2 text-sm text-gray-700 truncate" title={r.dealer}>{r.dealer}</td>
                    <td className="py-2 px-2 text-sm text-right whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusPill(r.stato)}`}>{r.stato}</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal Dettaglio Attivazione (Master) */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className={`absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-200 ${modalVisible ? 'opacity-100' : 'opacity-0'}`}
            onClick={closeModal}
          />
          <div className={`relative bg-white rounded-lg shadow-xl w-full max-w-3xl mx-4 transition-all duration-200 ease-out transform ${modalVisible ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 translate-y-1'}`}>
            {/* Toast */}
            {toast.message && (
              <div className="absolute right-3 top-3 z-10">
                <div className={`px-3 py-2 text-xs rounded shadow ${toast.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
                  {toast.message}
                </div>
              </div>
            )}
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <h4 className="text-base font-semibold text-gray-900">
                {(() => {
                  const offer = (detail?.TitoloOfferta || detail?.Offerta || '').toString().trim();
                  // Recupera operatore da più fonti possibili
                  const payload = detail?.Payload || detail?.payload || detail?.Dati || {};
                  const operator = (detail?.Operatore || detail?.OPERATORE || payload?.OPERATORE || payload?.operatore || '').toString().trim();
                  const idPart = selectedId ? ` #${selectedId}` : '';
                  const offerPart = offer ? ` - ${offer}` : '';
                  const opPart = operator ? ` (${operator})` : '';
                  return `Dettaglio Attivazione${idPart}${offerPart}${opPart}`;
                })()}
              </h4>
              <div className="flex items-center gap-2">
                {/* Pulsante ANNULLA ORDINE (prioritario): forza STATO 2 con email */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    title={(!actionNote || !actionNote.trim()) ? "Aggiungi una nota: è obbligatoria per ANNULLARE (stato 2)" : "Imposta stato ANNULLATO (2) e invia l'email al Dealer. Nota obbligatoria."}
                    onClick={async () => {
                      if (!selectedId || cancelLoading) return;
                      setCancelError('');
                      // Se già armato, il secondo click conferma direttamente
                      if (confirmCancel) {
                        setCancelLoading(true);
                        try {
                          await handleChangeStateWithEmail({ targetState: 2, emailTemplateId: undefined, requireNote: true });
                          setConfirmCancel(false);
                          notify('Ordine annullato (stato 2) e email inviata');
                        } catch (e) {
                          setCancelError(e?.message || 'Errore durante annullamento');
                        } finally {
                          setCancelLoading(false);
                        }
                        return;
                      }
                      // Primo click: arma conferma e mostra istruzioni
                      setConfirmCancel(true);
                      notify('Conferma annullamento: premi di nuovo o clicca su Conferma');
                      try { console.log('[MASTER][UI] Annulla ordine armato per ID', selectedId); } catch {}
                    }}
                    className="px-3 py-1.5 text-xs rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-60"
                    disabled={cancelLoading || !actionNote || !actionNote.trim()}
                  >
                    {cancelLoading ? 'Annullo...' : 'ANNULLA ORDINE'}
                  </button>
                  {confirmCancel && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={async () => {
                          if (!selectedId || cancelLoading) return;
                          setCancelError('');
                          setCancelLoading(true);
                          try {
                            await handleChangeStateWithEmail({ targetState: 2, emailTemplateId: undefined, requireNote: true });
                            setConfirmCancel(false);
                            notify('Ordine annullato (stato 2) e email inviata');
                          } catch (e) {
                            setCancelError(e?.message || 'Errore durante annullamento');
                          } finally {
                            setCancelLoading(false);
                          }
                        }}
                        className="px-2 py-1 text-xs rounded bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-60"
                        disabled={cancelLoading}
                      >
                        Conferma
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmCancel(false)}
                        className="px-2 py-1 text-xs rounded bg-gray-100 text-gray-700 hover:bg-gray-200"
                      >
                        Annulla
                      </button>
                    </div>
                  )}
                </div>
              </div>
              {cancelError && (
                <div className="mt-2 text-xs text-red-600">{cancelError}</div>
              )}
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
                  {(() => {
                    // Pre-calcolo: risolve la Ragione Sociale del POINT/Dealer da più possibili sorgenti
                    const safeParse = (v) => { try { return typeof v === 'string' ? JSON.parse(v) : (v || {}); } catch { return v || {}; } };
                    const payload = safeParse(detail?.Payload);
                    const intestatario = safeParse(detail?.PayloadIntestario);
                    const dati = safeParse(detail?.Dati);
                    const firstNonEmpty = (...vals) => vals.find(v => v !== undefined && v !== null && String(v).trim() !== '');
                    const dealerName = firstNonEmpty(
                      detail?.NomeDealer,
                      detail?.Dealer,
                      detail?.RagioneSociale,
                      detail?.ragioneSociale,
                      detail?.NomePoint,
                      detail?.Point,
                      payload?.RAGIONE_SOCIALE_DEALER,
                      payload?.DEALER,
                      payload?.POINT,
                      intestatario?.RAGIONE_SOCIALE_DEALER,
                      dati?.RAGIONE_SOCIALE_DEALER
                    );
                    try { detail.__DealerResolved = dealerName ? String(dealerName).toUpperCase() : ''; } catch {}
                    return null;
                  })()}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {[
                      { label: 'Data ordine', value: formatDateStrict(detail.DataOrdine || detail.DataOra) },
                      { label: 'Stato', value: detail.StatoEsteso, isStatus: true },
                      { label: 'Offerta', value: detail.TitoloOfferta },
                      { label: 'POINT', value: (detail.__DealerResolved || detail.NomeDealer) }
                    ].filter(item => item.value && item.value !== '-').map((item, index) => (
                      <div key={index}>
                        <div className="text-xs text-gray-500">{item.label}</div>
                        {item.isStatus ? (
                          <div className={`inline-block mt-0.5 px-2 py-0.5 rounded-full text-xs ${statusPill(item.value)} uppercase`}>{item.value}</div>
                        ) : (
                          <div className="text-sm text-gray-900 uppercase">{item.value}</div>
                        )}
                      </div>
                    ))}
                  </div>

                  {(detail.Intestatario || detail.PayloadIntestario || detail.Payload) && (
                    <div>
                      <div className="text-xs font-medium text-gray-700 mb-2">Intestatario</div>
                      {(() => {
                        const i = detail.Intestatario || {};
                        // Effettua il parse sicuro dei payload se sono stringhe JSON e unisce più sorgenti
                        const rawP = detail?.Payload ?? detail?.payload ?? {};
                        const rawPI = detail?.PayloadIntestario ?? detail?.payloadIntestario ?? {};
                        const rawD = detail?.Dati ?? detail?.dati ?? {};
                        let parsedP = {};
                        let parsedPI = {};
                        let parsedD = {};
                        try { parsedP = typeof rawP === 'string' ? JSON.parse(rawP) : (rawP || {}); } catch { parsedP = rawP || {}; }
                        try { parsedPI = typeof rawPI === 'string' ? JSON.parse(rawPI) : (rawPI || {}); } catch { parsedPI = rawPI || {}; }
                        try { parsedD = typeof rawD === 'string' ? JSON.parse(rawD) : (rawD || {}); } catch { parsedD = rawD || {}; }
                        // Priorità MASTER: mostrare SEMPRE le coppie key:value del PAYLOAD di tbDatiIntestario
                        // Usa direttamente PayloadIntestario (con eventuale Payload annidato), senza rimappare etichette
                        const innerPIPayload = (parsedPI && typeof parsedPI.Payload === 'object') ? parsedPI.Payload : {};
                        const piObj = Object.keys(innerPIPayload).length ? innerPIPayload : parsedPI;
                        const piEntries = Object.entries(piObj || {}).filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== '');
                        if (piEntries.length > 0) {
                          return (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                              {piEntries.map(([k, v], idx) => {
                                let displayValue = String(v);
                                // Formatta le date se il campo contiene "NASCITA" e il valore è in formato AAAA-MM-GG
                                if (k.toUpperCase().includes('NASCITA') && typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.trim())) {
                                  const [year, month, day] = v.trim().split('-');
                                  displayValue = `${day}/${month}/${year}`;
                                }
                                // Rimuovi spazi dai numeri di telefono
                                const keyUpper = k.toUpperCase();
                                if ((keyUpper.includes('TELEFONO') || keyUpper.includes('RECAPITO') || keyUpper.includes('NUMERO')) && typeof v === 'string') {
                                  displayValue = String(v).replace(/\s+/g, '');
                                }
                                return (
                                  <div key={idx}>
                                    <div className="text-xs text-gray-500">{k}</div>
                                    <div className="text-gray-800 break-words uppercase">{displayValue}</div>
                                  </div>
                                );
                              })}
                            </div>
                          );
                        }
                        // Fallback: vecchio rendering se il PayloadIntestario fosse vuoto
                        const innerPayload = (parsedP && typeof parsedP.Payload === 'object') ? parsedP.Payload : {};
                        const p = { ...parsedP, ...parsedD, ...innerPayload };
                        const nomeCompleto = (i.RagioneSociale)
                          || [i.Nome, i.Cognome].filter(Boolean).join(' ').trim()
                          || (p.NOME_E_COGNOME_INTESTATARIO_CONTRATTO || '').trim()
                          || [p.NOME, p.COGNOME].filter(Boolean).join(' ').trim();
                        const fallbackCampi = [
                          { label: 'Nome e Cognome / Ragione sociale', value: nomeCompleto },
                          { label: 'Codice Fiscale', value: i.CodiceFiscale || p.CODICE_FISCALE_INTESTATARIO || p.CODICE_FISCALE_NUOVO_INTESTATARIO || p.CF || p.CODICE_FISCALE || p.CodiceFiscale },
                          { label: 'Recapito di riferimento', value: i.Telefono || p.TELEFONO || p.NUMERO_TELEFONO || p.RECAPITO_DI_RIFERIMENTO },
                        ].filter(item => {
                          const val = item.value;
                          return val && val !== '' && val !== '-' && val !== null && val !== undefined && String(val).trim() !== '';
                        });
                        return fallbackCampi.length > 0 ? (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                            {fallbackCampi.map((item, index) => (
                              <div key={index}>
                                <div className="text-xs text-gray-500">{item.label}</div>
                                <div className="text-gray-800 break-words uppercase">{item.value}</div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-sm text-gray-500">Nessun dato intestatario disponibile</div>
                        );
                      })()}
                    </div>
                  )}

                  <div>
                    <div className="text-xs font-medium text-gray-700 mb-2">
                      Dati Attivazione {detail.Template?.template ? `(${detail.Template.template})` : ''}
                    </div>
                    {detail.Template?.campi ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                        {detail.Template.campi
                          .map((campo, index) => {
                            const payload = { ...(detail.Payload || {}) };
                            // cerca key in modo case-insensitive nel payload se non esatta
                            let valore = payload[campo.key];
                            if (valore === undefined) {
                              const k = Object.keys(payload).find(k => k.toLowerCase() === String(campo.key).toLowerCase());
                              if (k) valore = payload[k];
                            }
                            if (campo.tipo === 'date' && valore) {
                              try {
                                // Se è già in formato AAAA-MM-GG, convertilo in GG/MM/AAAA
                                if (typeof valore === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valore.trim())) {
                                  const [year, month, day] = valore.trim().split('-');
                                  valore = `${day}/${month}/${year}`;
                                } else {
                                  // Altrimenti usa il parsing normale
                                  const date = new Date(valore);
                                  if (!isNaN(date.getTime())) {
                                    const dd = String(date.getDate()).padStart(2, '0');
                                    const mm = String(date.getMonth() + 1).padStart(2, '0');
                                    const yyyy = date.getFullYear();
                                    valore = `${dd}/${mm}/${yyyy}`;
                                  }
                                }
                              } catch {}
                            }
                            return { campo, valore, index };
                          })
                          .filter(item => item.valore && item.valore !== '' && item.valore !== '-')
                          .map(({ campo, valore, index }) => {
                            let displayValue = valore;
                            // Rimuovi spazi dai numeri di telefono
                            const keyUpper = (campo.key || '').toUpperCase();
                            const labelUpper = (campo.label || '').toUpperCase();
                            if ((keyUpper.includes('TELEFONO') || keyUpper.includes('RECAPITO') || keyUpper.includes('NUMERO') ||
                                 labelUpper.includes('TELEFONO') || labelUpper.includes('RECAPITO') || labelUpper.includes('NUMERO')) && 
                                typeof valore === 'string') {
                              displayValue = String(valore).replace(/\s+/g, '');
                            }
                            return (
                              <div key={index}>
                                <div className="text-xs text-gray-500">{campo.label}</div>
                                <div className="text-gray-800 break-words uppercase">{displayValue}</div>
                              </div>
                            );
                          })}
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                        {Object.entries(detail.Payload || {})
                          .filter(([_, v]) => v !== null && v !== undefined && String(v).trim() !== '')
                          .map(([k, v], i) => {
                            let displayValue = String(v);
                            // Formatta le date se il campo contiene "NASCITA" e il valore è in formato AAAA-MM-GG
                            if (k.toUpperCase().includes('NASCITA') && typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.trim())) {
                              const [year, month, day] = v.trim().split('-');
                              displayValue = `${day}/${month}/${year}`;
                            }
                            // Rimuovi spazi dai numeri di telefono
                            const keyUpper = k.toUpperCase();
                            if ((keyUpper.includes('TELEFONO') || keyUpper.includes('RECAPITO') || keyUpper.includes('NUMERO')) && typeof v === 'string') {
                              displayValue = String(v).replace(/\s+/g, '');
                            }
                            return (
                              <div key={i}>
                                <div className="text-xs text-gray-500">{k.replaceAll('_', ' ')}</div>
                                <div className="text-gray-800 break-words uppercase">{displayValue}</div>
                              </div>
                            );
                          })}
                      </div>
                    )}
                  </div>

                  <div>
                    {(() => {
                      const docs = (detail?.Documenti && detail.Documenti.length > 0) ? detail.Documenti : (detailDocs || []);
                      return (
                        <>
                          <div className="text-xs font-medium text-gray-700 mb-2">
                            Documenti {docs?.length ? `(${docs.length})` : ''}
                          </div>
                          {docs && docs.length > 0 ? (
                            <div className="space-y-2">
                              {docs.map((doc, index) => {
                                const tipo = doc.tipo || doc.TipoFile || 'documento';
                                // preferisci URL in Payload
                                const payloadUrl = doc?.Payload?.s3Url || doc?.payload?.s3Url || '';
                                const payloadKey = doc?.Payload?.s3Key || doc?.payload?.s3Key || '';
                                const rawUrl = doc.url || doc.URL || doc.FullPath || doc.fullPath || doc.Url || doc.path || doc.Path || doc.Link || doc.link || doc.Href || doc.href || doc.Percorso || '';
                                let href = '';
                                if (payloadUrl) {
                                  href = resolveActivationDocUrl(payloadUrl);
                                } else if (payloadKey) {
                                  href = resolveActivationDocUrl(`https://attivazionistation.s3.eu-west-1.amazonaws.com/${payloadKey}`);
                                } else if (rawUrl) {
                                  href = resolveActivationDocUrl(rawUrl);
                                } else {
                                  const nome = doc.NomeFile || doc.nome || doc.filename || '';
                                  href = buildActivationS3UrlFromNomeFile({ nomeFile: nome, dataOrdine: detail?.DataOrdine });
                                }
                                return (
                                  <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                                    <div className="flex-1">
                                      <div className="text-sm text-gray-700 font-medium">{tipo}</div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      {href && (
                                        <button
                                          type="button"
                                          onClick={() => setPreviewUrl(href)}
                                          className="text-xs px-2 py-1 rounded bg-amber-100 text-amber-800 hover:bg-amber-200 transition-colors"
                                          title="Mostra anteprima"
                                        >
                                          Anteprima
                                        </button>
                                      )}
                                      {href ? (
                                        <a
                                          href={href}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-xs px-2 py-1 rounded bg-blue-100 text-blue-800 hover:bg-blue-200 transition-colors"
                                        >
                                          APRI FILE
                                        </a>
                                      ) : (
                                        <span className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-600">
                                          Non disponibile
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="text-sm text-gray-500">Nessun documento allegato</div>
                          )}
                        </>
                      );
                    })()}
                  </div>

                  {/* Anteprima documento (PDF o immagini) */}
                  {previewUrl && (
                    <div>
                      <div className="text-xs font-medium text-gray-700 mb-2">Anteprima documento</div>
                      <div className="border border-gray-200 rounded overflow-hidden bg-gray-50">
                        {/\.pdf($|\?)/i.test(previewUrl) ? (
                          <iframe
                            src={previewUrl}
                            title="Anteprima documento"
                            className="w-full h-[520px] bg-white"
                          />
                        ) : (/\.(png|jpe?g|gif|webp)($|\?)/i.test(previewUrl) ? (
                          <div className="w-full bg-white flex items-center justify-center">
                            <img
                              src={previewUrl}
                              alt="Anteprima documento"
                              className="max-h-[520px] w-auto object-contain"
                              loading="lazy"
                            />
                          </div>
                        ) : (
                          <div className="p-4 text-sm text-gray-600">Tipo di file non supportato per l'anteprima</div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <div className="text-xs font-medium text-gray-700 mb-1">Storico</div>
                    {Array.isArray(detail.Storico) && detail.Storico.length > 0 ? (
                      <div className="space-y-2">
                        {detail.Storico.map((s, i) => {
                          const data = s.DataOra || s.Data || s.data || s.createdAt || '';
                          const utente = s.Utente || s.user || s.Username || '';
                          const da = (s.StatoPrecedenteNome ?? s.StatoPrecedente ?? s.from ?? s.da ?? '');
                          const a = (s.StatoNuovoNome ?? s.StatoNuovo ?? s.to ?? s.a ?? '');
                          const nota = s.Nota || s.note || '';
                          return (
                            <div key={i} className="border border-gray-100 rounded p-2 text-xs bg-white">
                              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                                <div>
                                  <div className="text-[10px] text-gray-500">Data</div>
                                  <div className="text-gray-800 whitespace-nowrap">{formatDateTime(data)}</div>
                                </div>
                                <div>
                                  <div className="text-[10px] text-gray-500">Utente</div>
                                  <div className="text-gray-800 break-all uppercase">{utente || '-'}</div>
                                </div>
                                <div>
                                  <div className="text-[10px] text-gray-500">Da</div>
                                  <div className="text-gray-800 uppercase">{da || '-'}</div>
                                </div>
                                <div>
                                  <div className="text-[10px] text-gray-500">A</div>
                                  <div className="text-gray-800 uppercase">{a || '-'}</div>
                                </div>
                                <div className="sm:col-span-1 col-span-2">
                                  <div className="text-[10px] text-gray-500">Nota</div>
                                  <div className="text-gray-800 break-words uppercase">{nota || '-'}</div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-sm text-gray-500">Nessuno storico disponibile</div>
                    )}
                  </div>

                  {/* Azioni Master: Stato + PDA */}
                  <div className="border border-gray-200 rounded p-3 bg-gray-50">
                    <div className="text-xs font-semibold text-gray-700 mb-2">Azioni</div>
                    {/* Note obbligatorie per 2/3 */}
                    <div className="mb-2">
                      <label className="block text-xs text-gray-600 mb-1">Nota per Dealer (obbligatoria per Rimanda e "Ticket Gestito con Nota")</label>
                      <textarea
                        value={actionNote}
                        onChange={(e) => setActionNote(e.target.value)}
                        rows={3}
                        className="w-full text-sm border border-gray-200 rounded p-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Inserisci una nota chiara e completa..."
                      />
                      {actionError && (
                        <div className="text-xs text-red-600 mt-1">{actionError}</div>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 mb-3">
                      {(['1MOBILE_CONSUMER','1MOBILE_CONSUMER_NOMNP'].includes(String(detail?.Template?.template || ''))) ? (
                        <>
                          <button
                            type="button"
                            disabled={actionLoading || !actionNote || !actionNote.trim()}
                            onClick={() => handleChangeState(3)}
                            className="px-3 py-1.5 text-sm rounded bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-60"
                            title="Imposta ATTESA INTEGRAZIONE (stato 3). Nota obbligatoria"
                          >
                            {actionLoading ? 'Attendo...' : 'ATTESA INTEGRAZIONE'}
                          </button>
                          <button
                            type="button"
                            disabled={actionLoading}
                            onClick={() => handleChangeStateWithEmail({ targetState: 9, emailTemplateId: 16, requireNote: false })}
                            className="px-3 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
                            title="Imposta stato 9 (PDA IN ATTESA FIRMA) e invia email (template 16)"
                          >
                            {actionLoading ? 'Attendo...' : 'PDA IN ATTESA FIRMA'}
                          </button>
                          <button
                            type="button"
                            disabled={actionLoading}
                            onClick={() => handleChangeStateWithEmail({ targetState: 1, emailTemplateId: 11, requireNote: false })}
                            className="px-3 py-1.5 text-sm rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-60"
                            title="Imposta stato 1 (ATTIVATO) e invia email (template 11)"
                          >
                            {actionLoading ? 'Attendo...' : 'ATTIVATO'}
                          </button>
                        </>
                      ) : isCertificazioneIndirizzo ? (
                        <>
                          {/* Template CERTIFICAZIONE_INDIRIZZO/INFO_PRATICA: bottoni speciali */}
                          <button
                            type="button"
                            disabled={actionLoading}
                            onClick={() => handleChangeState(3)}
                            className="px-3 py-1.5 text-sm rounded bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-60"
                            title="ATTESA INTEGRAZIONE (stato 3). Nota obbligatoria"
                          >
                            {actionLoading ? 'Attendo...' : 'ATTESA INTEGRAZIONE'}
                          </button>
                          <button
                            type="button"
                            disabled={actionLoading}
                            onClick={() => handleChangeStateWithEmail({ targetState: 25, emailTemplateId: 20, requireNote: false })}
                            className="px-3 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
                            title="Imposta stato 25 e invia email TICKET IN LAVORAZIONE (template 20)"
                          >
                            {actionLoading ? 'Attendo...' : 'TICKET IN LAVORAZIONE'}
                          </button>
                          <button
                            type="button"
                            disabled={actionLoading}
                            onClick={() => handleChangeStateWithEmail({ targetState: 22, emailTemplateId: 21, requireNote: true })}
                            className="px-3 py-1.5 text-sm rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60"
                            title="Imposta stato 22 e invia email TICKET GESTITO CON NOTA (template 21). Nota obbligatoria"
                          >
                            {actionLoading ? 'Attendo...' : 'TICKET GESTITO CON NOTA'}
                          </button>
                        </>
                      ) : isRicontattoCliente ? (
                        <>
                          {/* Template RICONTATTO_CLIENTE: solo PRENOTATO */}
                          <button
                            type="button"
                            disabled={actionLoading}
                            onClick={() => handleChangeStateWithEmail({ targetState: 31, emailTemplateId: 26, requireNote: false })}
                            className="px-3 py-1.5 text-sm rounded bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-60"
                            title="Imposta stato 31 e invia email template 26 (PRENOTATO)"
                          >
                            {actionLoading ? 'Attendo...' : 'PRENOTATO'}
                          </button>
                        </>
                      ) : isRilancioMnpFastweb ? (
                        <>
                          {/* Template RILANCIO_MNP_FASTWEB: due pulsanti esclusivi */}
                          <button
                            type="button"
                            disabled={actionLoading}
                            onClick={() => handleChangeStateWithEmail({ targetState: 15, emailTemplateId: 22, requireNote: false })}
                            className="px-3 py-1.5 text-sm rounded bg-green-700 text-white hover:bg-green-800 disabled:opacity-60"
                            title="RILANCIO ESEGUITO CONFERMARE MNP (stato 15 + email 22)"
                          >
                            {actionLoading ? 'Attendo...' : 'RILANCIO ESEGUITO CONFERMARE MNP'}
                          </button>
                          <button
                            type="button"
                            disabled={actionLoading}
                            onClick={() => handleChangeStateWithEmail({ targetState: 3, emailTemplateId: 7, requireNote: true })}
                            className="px-3 py-1.5 text-sm rounded bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-60"
                            title="ATTESA INTEGRAZIONE (stato 3 + email 7). Nota obbligatoria"
                          >
                            {actionLoading ? 'Attendo...' : 'ATTESA INTEGRAZIONE'}
                          </button>
                        </>
                      ) : isMobileConsumerResetCredenziali ? (
                        <>
                          {/* Template MOBILE_CONSUMER_RESET_CREDENZIALI: due pulsanti */}
                          <button
                            type="button"
                            disabled={actionLoading}
                            onClick={() => handleChangeStateWithEmail({ targetState: 6, emailTemplateId: 23, requireNote: false })}
                            className="px-3 py-1.5 text-sm rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-60"
                            title="RESET ESEGUITO (stato 6 + email 23)"
                          >
                            {actionLoading ? 'Attendo...' : 'RESET ESEGUITO'}
                          </button>
                          <button
                            type="button"
                            disabled={actionLoading}
                            onClick={() => handleChangeStateWithEmail({ targetState: 17, emailTemplateId: 24, requireNote: false })}
                            className="px-3 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
                            title="RESET IN GESTIONE (stato 17 + email 24)"
                          >
                            {actionLoading ? 'Attendo...' : 'RESET IN GESTIONE'}
                          </button>
                        </>
                      ) : isResetCredenzialiDealerFastweb ? (
                        <>
                          {/* Template RESET CREDENZIALI DEALER FASTWEB: due pulsanti */}
                          <button
                            type="button"
                            disabled={actionLoading}
                            onClick={() => handleChangeStateWithEmail({ targetState: 16, emailTemplateId: 23, requireNote: false })}
                            className="px-3 py-1.5 text-sm rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-60"
                            title="RESET ESEGUITO (stato 16 + email 23)"
                          >
                            {actionLoading ? 'Attendo...' : 'RESET ESEGUITO'}
                          </button>
                          <button
                            type="button"
                            disabled={actionLoading}
                            onClick={() => handleChangeStateWithEmail({ targetState: 17, emailTemplateId: 24, requireNote: false })}
                            className="px-3 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
                            title="RESET IN GESTIONE (stato 17 + email 24)"
                          >
                            {actionLoading ? 'Attendo...' : 'RESET IN GESTIONE'}
                          </button>
                        </>
                      ) : isFurtoSmarrimento ? (
                        <>
                          {/* Template FURTO_SMARRIMENTO: tre pulsanti */}
                          <button
                            type="button"
                            disabled={actionLoading}
                            onClick={() => handleChangeStateWithEmail({ targetState: 3, emailTemplateId: 7, requireNote: true })}
                            className="px-3 py-1.5 text-sm rounded bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-60"
                            title="ATTESA INTEGRAZIONE (stato 3 + email 7). Nota obbligatoria"
                          >
                            {actionLoading ? 'Attendo...' : 'ATTESA INTEGRAZIONE'}
                          </button>
                          <button
                            type="button"
                            disabled={actionLoading}
                            onClick={() => handleChangeStateWithEmail({ targetState: 10, emailTemplateId: 17, requireNote: false })}
                            className="px-3 py-1.5 text-sm rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60"
                            title="ATTESA MODULO (stato 10 + email 17)"
                          >
                            {actionLoading ? 'Attendo...' : 'ATTESA MODULO'}
                          </button>
                          <button
                            type="button"
                            disabled={actionLoading}
                            onClick={() => handleChangeStateWithEmail({ targetState: 11, emailTemplateId: 18, requireNote: false })}
                            className="px-3 py-1.5 text-sm rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-60"
                            title="SIM SOSTITUITA (stato 11 + email 18)"
                          >
                            {actionLoading ? 'Attendo...' : 'SIM SOSTITUITA'}
                          </button>
                        </>
                      ) : isSostituzioneGuastoOCambioFormato ? (
                        <>
                          {/* Template SOSTITUZIONE GUASTO O CAMBIO FORMATO: tre pulsanti */}
                          <button
                            type="button"
                            disabled={actionLoading}
                            onClick={() => handleChangeStateWithEmail({ targetState: 3, emailTemplateId: 7, requireNote: true })}
                            className="px-3 py-1.5 text-sm rounded bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-60"
                            title="ATTESA INTEGRAZIONE (stato 3 + email 7). Nota obbligatoria"
                          >
                            {actionLoading ? 'Attendo...' : 'ATTESA INTEGRAZIONE'}
                          </button>
                          <button
                            type="button"
                            disabled={actionLoading}
                            onClick={() => handleChangeStateWithEmail({ targetState: 10, emailTemplateId: 10, requireNote: false })}
                            className="px-3 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
                            title="ATTESA MODULO (stato 10 + email 10)"
                          >
                            {actionLoading ? 'Attendo...' : 'ATTESA MODULO'}
                          </button>
                          <button
                            type="button"
                            disabled={actionLoading}
                            onClick={() => handleChangeStateWithEmail({ targetState: 11, emailTemplateId: 11, requireNote: false })}
                            className="px-3 py-1.5 text-sm rounded bg-green-700 text-white hover:bg-green-800 disabled:opacity-60"
                            title="SIM SOSTITUITA (stato 11 + email 11)"
                          >
                            {actionLoading ? 'Attendo...' : 'SIM SOSTITUITA'}
                          </button>
                        </>
                      ) : isFurtoSmarrimento ? (
                        <>
                          {/* Template FURTO_SMARRIMENTO: tre pulsanti */}
                          <button
                            type="button"
                            disabled={actionLoading}
                            onClick={() => handleChangeStateWithEmail({ targetState: 3, emailTemplateId: 7, requireNote: true })}
                            className="px-3 py-1.5 text-sm rounded bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-60"
                            title="ATTESA INTEGRAZIONE (stato 3 + email 7). Nota obbligatoria"
                          >
                            {actionLoading ? 'Attendo...' : 'ATTESA INTEGRAZIONE'}
                          </button>
                          <button
                            type="button"
                            disabled={actionLoading}
                            onClick={() => handleChangeStateWithEmail({ targetState: 10, emailTemplateId: 10, requireNote: false })}
                            className="px-3 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
                            title="ATTESA MODULO (stato 10 + email 10)"
                          >
                            {actionLoading ? 'Attendo...' : 'ATTESA MODULO'}
                          </button>
                          <button
                            type="button"
                            disabled={actionLoading}
                            onClick={() => handleChangeStateWithEmail({ targetState: 11, emailTemplateId: 11, requireNote: false })}
                            className="px-3 py-1.5 text-sm rounded bg-green-700 text-white hover:bg-green-800 disabled:opacity-60"
                            title="SIM SOSTITUITA (stato 11 + email 11)"
                          >
                            {actionLoading ? 'Attendo...' : 'SIM SOSTITUITA'}
                          </button>
                        </>
                      ) : isSubentro1Mobile ? (
                        <>
                          {/* Template SUBENTRO 1MOBILE: due pulsanti */}
                          <button
                            type="button"
                            disabled={actionLoading}
                            onClick={() => handleChangeStateWithEmail({ targetState: 3, emailTemplateId: 7, requireNote: true })}
                            className="px-3 py-1.5 text-sm rounded bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-60"
                            title="ATTESA INTEGRAZIONE (stato 3 + email 7). Nota obbligatoria"
                          >
                            {actionLoading ? 'Attendo...' : 'ATTESA INTEGRAZIONE'}
                          </button>
                          <button
                            type="button"
                            disabled={actionLoading}
                            onClick={() => handleChangeStateWithEmail({ targetState: 27, emailTemplateId: 34, requireNote: false })}
                            className="px-3 py-1.5 text-sm rounded bg-green-700 text-white hover:bg-green-800 disabled:opacity-60"
                            title="SUBENTRO EFFETTUATO (stato 27 + email 34)"
                          >
                            {actionLoading ? 'Attendo...' : 'SUBENTRO EFFETTUATO'}
                          </button>
                        </>
                      ) : isTicketOrdineFissoParcheggiato ? (
                        <>
                          {/* Template TICKET ORDINE FISSO PARCHEGGIATO: tre pulsanti */}
                          <button
                            type="button"
                            disabled={actionLoading}
                            onClick={() => handleChangeStateWithEmail({ targetState: 3, emailTemplateId: 7, requireNote: true })}
                            className="px-3 py-1.5 text-sm rounded bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-60"
                            title="ATTESA INTEGRAZIONE (stato 3 + email 7). Nota obbligatoria"
                          >
                            {actionLoading ? 'Attendo...' : 'ATTESA INTEGRAZIONE'}
                          </button>
                          <button
                            type="button"
                            disabled={actionLoading}
                            onClick={() => handleChangeStateWithEmail({ targetState: 25, emailTemplateId: 20, requireNote: false })}
                            className="px-3 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
                            title="TICKET IN LAVORAZIONE (stato 25 + email 20)"
                          >
                            {actionLoading ? 'Attendo...' : 'TICKET IN LAVORAZIONE'}
                          </button>
                          <button
                            type="button"
                            disabled={actionLoading}
                            onClick={() => handleChangeStateWithEmail({ targetState: 22, emailTemplateId: 21, requireNote: true })}
                            className="px-3 py-1.5 text-sm rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60"
                            title="TICKET GESTITO CON NOTA (stato 22 + email 21). Nota obbligatoria"
                          >
                            {actionLoading ? 'Attendo...' : 'TICKET GESTITO CON NOTA'}
                          </button>
                        </>
                      ) : isTicketClienteNonAcquisibile ? (
                        <>
                          {/* Template TICKET CLIENTE NON ACQUISIBILE: quattro pulsanti */}
                          <button
                            type="button"
                            disabled={actionLoading}
                            onClick={() => handleChangeStateWithEmail({ targetState: 3, emailTemplateId: 7, requireNote: true })}
                            className="px-3 py-1.5 text-sm rounded bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-60"
                            title="ATTESA INTEGRAZIONE (stato 3 + email 7). Nota obbligatoria"
                          >
                            {actionLoading ? 'Attendo...' : 'ATTESA INTEGRAZIONE'}
                          </button>
                          <button
                            type="button"
                            disabled={actionLoading}
                            onClick={() => handleChangeStateWithEmail({ targetState: 6, emailTemplateId: 13, requireNote: false })}
                            className="px-3 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
                            title="TICKET APERTO (stato 6 + email 13)"
                          >
                            {actionLoading ? 'Attendo...' : 'TICKET APERTO'}
                          </button>
                          <button
                            type="button"
                            disabled={actionLoading}
                            onClick={() => handleChangeStateWithEmail({ targetState: 12, emailTemplateId: 19, requireNote: false })}
                            className="px-3 py-1.5 text-sm rounded bg-green-700 text-white hover:bg-green-800 disabled:opacity-60"
                            title="CLIENTE ACQUISIBILE (stato 12 + email 19)"
                          >
                            {actionLoading ? 'Attendo...' : 'CLIENTE ACQUISIBILE'}
                          </button>
                          <button
                            type="button"
                            disabled={actionLoading}
                            onClick={() => handleChangeStateWithEmail({ targetState: 20, emailTemplateId: 27, requireNote: true })}
                            className="px-3 py-1.5 text-sm rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-60"
                            title="CLIENTE NON ACQUISIBILE (stato 20 + email 27). Nota obbligatoria"
                          >
                            {actionLoading ? 'Attendo...' : 'CLIENTE NON ACQUISIBILE'}
                          </button>
                        </>
                      ) : isInfoPratica ? (
                        <>
                          {/* Template INFO_PRATICA: tre pulsanti */}
                          <button
                            type="button"
                            disabled={actionLoading}
                            onClick={() => handleChangeStateWithEmail({ targetState: 3, emailTemplateId: 7, requireNote: true })}
                            className="px-3 py-1.5 text-sm rounded bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-60"
                            title="ATTESA INTEGRAZIONE (stato 3 + email 7). Nota obbligatoria"
                          >
                            {actionLoading ? 'Attendo...' : 'ATTESA INTEGRAZIONE'}
                          </button>
                          <button
                            type="button"
                            disabled={actionLoading}
                            onClick={() => handleChangeStateWithEmail({ targetState: 21, emailTemplateId: 13, requireNote: false })}
                            className="px-3 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
                            title="TICKET IN LAVORAZIONE (stato 21 + email 13)"
                          >
                            {actionLoading ? 'Attendo...' : 'TICKET IN LAVORAZIONE'}
                          </button>
                          <button
                            type="button"
                            disabled={actionLoading}
                            onClick={() => handleChangeStateWithEmail({ targetState: 22, emailTemplateId: 21, requireNote: true })}
                            className="px-3 py-1.5 text-sm rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60"
                            title="TICKET GESTITO CON NOTA (stato 22 + email 21). Nota obbligatoria"
                          >
                            {actionLoading ? 'Attendo...' : 'TICKET GESTITO CON NOTA'}
                          </button>
                        </>
                      ) : isSkyMobilePortabilita ? (
                        <>
                          {/* Template SKY_MOBILE_PORTABILITA: due pulsanti */}
                          <button
                            type="button"
                            disabled={actionLoading}
                            onClick={() => handleChangeStateWithEmail({ targetState: 3, emailTemplateId: 7, requireNote: true })}
                            className="px-3 py-1.5 text-sm rounded bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-60"
                            title="ATTESA INTEGRAZIONE (stato 3 + email 7). Nota obbligatoria"
                          >
                            {actionLoading ? 'Attendo...' : 'ATTESA INTEGRAZIONE'}
                          </button>
                          <button
                            type="button"
                            disabled={actionLoading}
                            onClick={() => handleChangeStateWithEmail({ targetState: 1, emailTemplateId: 11, requireNote: false })}
                            className="px-3 py-1.5 text-sm rounded bg-green-700 text-white hover:bg-green-800 disabled:opacity-60"
                            title="ATTIVATO (stato 1 + email 11)"
                          >
                            {actionLoading ? 'Attendo...' : 'ATTIVATO'}
                          </button>
                        </>
                      ) : isSkyMobileNuovoNumero ? (
                        <>
                          {/* Template SKY_MOBILE_NUOVO_NUMERO: due pulsanti */}
                          <button
                            type="button"
                            disabled={actionLoading}
                            onClick={() => handleChangeStateWithEmail({ targetState: 3, emailTemplateId: 7, requireNote: true })}
                            className="px-3 py-1.5 text-sm rounded bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-60"
                            title="ATTESA INTEGRAZIONE (stato 3 + email 7). Nota obbligatoria"
                          >
                            {actionLoading ? 'Attendo...' : 'ATTESA INTEGRAZIONE'}
                          </button>
                          <button
                            type="button"
                            disabled={actionLoading}
                            onClick={() => handleChangeStateWithEmail({ targetState: 1, emailTemplateId: 11, requireNote: false })}
                            className="px-3 py-1.5 text-sm rounded bg-green-700 text-white hover:bg-green-800 disabled:opacity-60"
                            title="ATTIVATO (stato 1 + email 11)"
                          >
                            {actionLoading ? 'Attendo...' : 'ATTIVATO'}
                          </button>
                        </>
                      ) : isSkyWifi3p4p ? (
                        <>
                          {/* Template SKY_WIFI_3P_4P: due pulsanti */}
                          <button
                            type="button"
                            disabled={actionLoading}
                            onClick={() => handleChangeStateWithEmail({ targetState: 3, emailTemplateId: 7, requireNote: true })}
                            className="px-3 py-1.5 text-sm rounded bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-60"
                            title="ATTESA INTEGRAZIONE (stato 3 + email 7). Nota obbligatoria"
                          >
                            {actionLoading ? 'Attendo...' : 'ATTESA INTEGRAZIONE'}
                          </button>
                          <button
                            type="button"
                            disabled={actionLoading}
                            onClick={() => handleChangeStateWithEmail({ targetState: 1, emailTemplateId: 11, requireNote: false })}
                            className="px-3 py-1.5 text-sm rounded bg-green-700 text-white hover:bg-green-800 disabled:opacity-60"
                            title="ATTIVATO (stato 1 + email 11)"
                          >
                            {actionLoading ? 'Attendo...' : 'ATTIVATO'}
                          </button>
                        </>
                      ) : isOnlyTv ? (
                        <>
                          {/* Template ONLY_TV: due pulsanti */}
                          <button
                            type="button"
                            disabled={actionLoading}
                            onClick={() => handleChangeStateWithEmail({ targetState: 3, emailTemplateId: 7, requireNote: true })}
                            className="px-3 py-1.5 text-sm rounded bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-60"
                            title="ATTESA INTEGRAZIONE (stato 3 + email 7). Nota obbligatoria"
                          >
                            {actionLoading ? 'Attendo...' : 'ATTESA INTEGRAZIONE'}
                          </button>
                          <button
                            type="button"
                            disabled={actionLoading}
                            onClick={() => handleChangeStateWithEmail({ targetState: 1, emailTemplateId: 11, requireNote: false })}
                            className="px-3 py-1.5 text-sm rounded bg-green-700 text-white hover:bg-green-800 disabled:opacity-60"
                            title="ATTIVATO (stato 1 + email 11)"
                          >
                            {actionLoading ? 'Attendo...' : 'ATTIVATO'}
                          </button>
                        </>
                      ) : isTicketInfoPratica ? (
                        <>
                          {/* Template TICKET INFO PRATICA: due pulsanti */}
                          <button
                            type="button"
                            disabled={actionLoading}
                            onClick={() => handleChangeStateWithEmail({ targetState: 3, emailTemplateId: 7, requireNote: true })}
                            className="px-3 py-1.5 text-sm rounded bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-60"
                            title="ATTESA INTEGRAZIONE (stato 3 + email 7). Nota obbligatoria"
                          >
                            {actionLoading ? 'Attendo...' : 'ATTESA INTEGRAZIONE'}
                          </button>
                          <button
                            type="button"
                            disabled={actionLoading}
                            onClick={() => handleChangeStateWithEmail({ targetState: 14, emailTemplateId: 21, requireNote: true })}
                            className="px-3 py-1.5 text-sm rounded bg-blue-700 text-white hover:bg-blue-800 disabled:opacity-60"
                            title="GESTITO CON NOTA (stato 14 + email 21). Nota obbligatoria"
                          >
                            {actionLoading ? 'Attendo...' : 'GESTITO CON NOTA'}
                          </button>
                        </>
                      ) : isRicontattoCliente ? (
                        <>
                          {/* Template RICONTATTO_CLIENTE: due pulsanti */}
                          <button
                            type="button"
                            disabled={actionLoading}
                            onClick={() => handleChangeStateWithEmail({ targetState: 3, emailTemplateId: 7, requireNote: true })}
                            className="px-3 py-1.5 text-sm rounded bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-60"
                            title="ATTESA INTEGRAZIONE (stato 3 + email 7). Nota obbligatoria"
                          >
                            {actionLoading ? 'Attendo...' : 'ATTESA INTEGRAZIONE'}
                          </button>
                          <button
                            type="button"
                            disabled={actionLoading}
                            onClick={() => handleChangeStateWithEmail({ targetState: 31, emailTemplateId: 26, requireNote: false })}
                            className="px-3 py-1.5 text-sm rounded bg-indigo-700 text-white hover:bg-indigo-800 disabled:opacity-60"
                            title="PRENOTATO (stato 31 + email 26)"
                          >
                            {actionLoading ? 'Attendo...' : 'PRENOTATO'}
                          </button>
                        </>
                      ) : isNonAcquisibile ? (
                        <>
                          {/* Template NON_ACQUISIBILE: quattro pulsanti dedicati */}
                          <button
                            type="button"
                            disabled={actionLoading}
                            onClick={() => handleChangeStateWithEmail({ targetState: 3, emailTemplateId: 7, requireNote: true })}
                            className="px-3 py-1.5 text-sm rounded bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-60"
                            title="ATTESA INTEGRAZIONE (stato 3 + email 7). Nota obbligatoria"
                          >
                            {actionLoading ? 'Attendo...' : 'ATTESA INTEGRAZIONE'}
                          </button>
                          <button
                            type="button"
                            disabled={actionLoading}
                            onClick={() => handleChangeStateWithEmail({ targetState: 6, emailTemplateId: 13, requireNote: false })}
                            className="px-3 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
                            title="TICKET APERTO (stato 6 + email 13)"
                          >
                            {actionLoading ? 'Attendo...' : 'TICKET APERTO'}
                          </button>
                          <button
                            type="button"
                            disabled={actionLoading}
                            onClick={() => handleChangeStateWithEmail({ targetState: 12, emailTemplateId: 19, requireNote: false })}
                            className="px-3 py-1.5 text-sm rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-60"
                            title="CLIENTE ACQUISIBILE (stato 12 + email 19)"
                          >
                            {actionLoading ? 'Attendo...' : 'CLIENTE ACQUISIBILE'}
                          </button>
                          <button
                            type="button"
                            disabled={actionLoading}
                            onClick={() => handleChangeStateWithEmail({ targetState: 24, emailTemplateId: 27, requireNote: true })}
                            className="px-3 py-1.5 text-sm rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60"
                            title="CLIENTE NON ACQUISIBILE CON NOTA (stato 24 + email 27). Nota obbligatoria"
                          >
                            {actionLoading ? 'Attendo...' : 'CLIENTE NON ACQUISIBILE CON NOTA'}
                          </button>
                        </>
                      ) : isEniPlenitude ? (
                        <>
                          {/* Template ENI PLENITUDE: INSERITO, IN ATTESA DI INTEGRAZIONE, IN LAVORAZIONE */}
                          <button
                            type="button"
                            disabled={actionLoading}
                            onClick={() => handleChangeState(1)}
                            className="px-3 py-1.5 text-sm rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-60"
                            title="Imposta stato INSERITO (stato 1 - ATTIVATO)"
                          >
                            {actionLoading ? 'Attendo...' : 'INSERITO'}
                          </button>
                          <button
                            type="button"
                            disabled={actionLoading}
                            onClick={() => handleChangeState(3)}
                            className="px-3 py-1.5 text-sm rounded bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-60"
                            title="IN ATTESA DI INTEGRAZIONE (stato 3)"
                          >
                            {actionLoading ? 'Attendo...' : 'IN ATTESA DI INTEGRAZIONE'}
                          </button>
                          <button
                            type="button"
                            disabled={actionLoading}
                            onClick={() => handleChangeState(32)}
                            className="px-3 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
                            title="IN LAVORAZIONE (stato 32)"
                          >
                            {actionLoading ? 'Attendo...' : 'IN LAVORAZIONE'}
                          </button>
                        </>
                      ) : (
                        <>
                          {/* Template standard: ATTIVA, ATTESA INTEGRAZIONE, RIFIUTA */}
                          <button
                            type="button"
                            disabled={actionLoading}
                            onClick={() => handleChangeState(1)}
                            className="px-3 py-1.5 text-sm rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-60"
                            title="Imposta stato ATTIVATO"
                          >
                            {actionLoading ? 'Attendo...' : 'ATTIVA'}
                          </button>
                          <button
                            type="button"
                            disabled={actionLoading}
                            onClick={() => handleChangeState(3)}
                            className="px-3 py-1.5 text-sm rounded bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-60"
                            title="ATTESA INTEGRAZIONE (stato 3)"
                          >
                            {actionLoading ? 'Attendo...' : 'ATTESA INTEGRAZIONE'}
                          </button>
                          <button
                            type="button"
                            disabled={actionLoading}
                            onClick={() => handleChangeState(2)}
                            className="px-3 py-1.5 text-sm rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-60"
                            title="Rifiuta ordine (stato 2)"
                          >
                            {actionLoading ? 'Attendo...' : 'RIFIUTA'}
                          </button>
                        </>
                      )}
                    </div>

                    <div className="border-t border-gray-200 pt-3">
                      <div className="text-xs text-gray-600 mb-1">{isCertificazioneIndirizzo ? 'Carica FILE (PDF o immagini, max 10MB)' : 'Carica PDA (PDF o immagini, max 10MB)'}</div>
                      <div className="flex items-center gap-2">
                        <input
                          type="file"
                          accept="application/pdf,image/jpeg,image/jpg,image/png,image/webp"
                          onChange={(e) => handleSelectPda(e.target.files?.[0] || null)}
                          className="text-sm"
                        />
                        <button
                          type="button"
                          onClick={handleUploadPda}
                          disabled={pdaUploading || !pdaFile}
                          className="px-3 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
                        >
                          {pdaUploading ? 'Caricamento...' : (isCertificazioneIndirizzo ? 'Carica FILE' : 'Carica PDA')}
                        </button>
                      </div>
                      {pdaError && (
                        <div className="text-xs text-red-600 mt-1">{pdaError}</div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="p-3 border-t border-gray-100 flex justify-end">
              <button onClick={closeModal} className="px-3 py-1.5 text-sm rounded bg-gray-100 hover:bg-gray-200 text-gray-700">Chiudi</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
