import { useEffect, useMemo, useRef, useState } from 'react';
import { getProtectedData, patchProtectedData, postFormData } from '../../services/api';
import { useNavigate, useSearchParams, useParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

function getStatusColor(status) {
  const s = (status || '').toString().toUpperCase().replace(/\s+/g, '_');
  
  // Stati VERDI
  if (s.includes('ATTIVATO') || 
      s.includes('SUBENTRO_EFFETTUATO') || 
      s.includes('SIM_SOSTITUITA') || 
      s.includes('RESET_ESEGUITO') || 
      s.includes('CLIENTE_ACQUISIBILE') || 
      s.includes('PRENOTATO') || 
      s.includes('CONFERMATO') || 
      s.includes('CLIENTE_SBLOCCATO') || 
      s.includes('TICKET_GESTITO_CON_NOTA') ||
      s.includes('SUCCESS')) {
    return 'bg-green-100 text-green-800';
  }
  
  // Stati ROSSI
  if (s.includes('CLIENTE_NON_ACQUISIBILE') || 
      s.includes('ANNULLATO') ||
      s.includes('ERRORE') || 
      s.includes('KO') || 
      s.includes('FAILED')) {
    return 'bg-red-100 text-red-800';
  }
  
  // Stati GIALLI
  if (s.includes('ATTESA_INTEGRAZIONE') || 
      s.includes('ATTESA_MODULO') || 
      s.includes('PDA_DA_FIRMARE') || 
      s.includes('TICKET_APERTO') || 
      s.includes('MODULO_INVIATO') || 
      s.includes('PDA_FIRMATA') || 
      s.includes('IN_LAVORAZIONE') || 
      s.includes('TICKET_IN_LAVORAZIONE') ||
      s.includes('PENDING') || 
      s.includes('PROCESS')) {
    return 'bg-yellow-100 text-yellow-800';
  }
  
  return 'bg-gray-100 text-gray-800';
}

function formatDateTime(val) {
  if (!val) return '-';
  // Supporto diretto per timestamp SQL: YYYY-MM-DD HH:mm:ss(.ms)
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

function formatDate(val) {
  if (!val) return '-';
  // 0) Timestamp SQL: YYYY-MM-DD HH:mm:ss(.ms)
  if (typeof val === 'string') {
    const s0 = val.trim();
    const mSql = s0.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?$/);
    if (mSql) {
      const yyyy = mSql[1];
      const mm = mSql[2];
      const dd = mSql[3];
      if (dd === '00' || mm === '00') return '-';
      return `${dd}/${mm}/${yyyy}`;
    }
  }
  // 1) ISO/Date/timestamp -> forza GG/MM/AAAA
  try {
    const d = new Date(val);
    if (!isNaN(d.getTime())) {
      const dd = String(d.getDate()).padStart(2, '0');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const yyyy = d.getFullYear();
      if (dd === '00' || mm === '00') return '-';
      return `${dd}/${mm}/${yyyy}`;
    }
  } catch {}
  // 2) Stringhe DD/MM/YYYY o MM/DD/YYYY
  if (typeof val === 'string') {
    const s = val.trim();
    // Scarta placeholder o valori non numerici evidenti (es. GG/MM/AAAA, 00GGAAAA)
    if (/gg|mm|aaaa/i.test(s) || /[a-zA-Z]/.test(s)) return '-';
    const m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
    if (m) {
      const a = parseInt(m[1], 10);
      const b = parseInt(m[2], 10);
      const y = m[3];
      if (!a || !b) return '-';
      if (a <= 12 && b > 12) {
        // MM/DD/YYYY -> DD/MM/YYYY
        return `${String(b).padStart(2, '0')}/${String(a).padStart(2, '0')}/${y}`;
      }
      // Già DD/MM/YYYY
      return `${String(a).padStart(2, '0')}/${String(b).padStart(2, '0')}/${y}`;
    }
    // Formati senza separatori ma con 8 cifre (es. YYYYMMDD): prova a parsare
    if (/^\d{8}$/.test(s)) {
      const yyyy = s.slice(0,4);
      const mm = s.slice(4,6);
      const dd = s.slice(6,8);
      if (dd === '00' || mm === '00') return '-';
      return `${dd}/${mm}/${yyyy}`;
    }
    // Se contiene '00' senza separatori riconoscibili (es. 00GGAAAA), restituisci '-'
    if (/00/.test(s)) return '-';
  }
  return String(val);
}

function resolveDealerDocUrl(doc) {
  try {
    // 1) URL esplicito
    const explicit = doc?.url || doc?.URL || doc?.FullPath || doc?.fullPath || doc?.Link || doc?.Href || '';
    if (explicit && /^(https?:\/\/|\/.+)/i.test(String(explicit))) return explicit;

    // 2) Nuovo sistema S3: s3Url o s3Key nel payload
    const payload = doc?.Payload || doc?.payload || {};
    if (payload?.s3Url) return String(payload.s3Url);
    if (payload?.s3Key) return `https://attivazionistation.s3.eu-west-1.amazonaws.com/${payload.s3Key}`;

    // 3) Caso PDA: costruzione URL da NomeFile
    const tipo = (doc?.TipoFile || doc?.tipo || '').toString().trim().toUpperCase();
    const nome = doc?.NomeFile || doc?.nomeFile || doc?.FileName || doc?.filename || '';
    if (tipo === 'PDA' && nome) {
      return `https://attivazionistation.s3.eu-west-1.amazonaws.com/PDA/${nome}`;
    }
  } catch {}
  return '';
}

export default function RecentActivations() {
  const [rows, setRows] = useState([]);
  const [aggRows, setAggRows] = useState([]); // dati aggregati per tabella riassuntiva
  const [isAggregated, setIsAggregated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const params = useParams?.() || {};
  const { user } = useAuth();
  const role = (user?.role || '').toString().toLowerCase();
  const isAgent = role === 'agente' || role === 'agent';
  const apiPrefix = isAgent ? '/agente' : '/dealer';
  const routeBase = isAgent ? '/agente' : '/dealer';

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalVisible, setModalVisible] = useState(false); // per animazione
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(null);
  const [resubmitLoading, setResubmitLoading] = useState(false);
  const [resubmitError, setResubmitError] = useState('');
  const [dealerNote, setDealerNote] = useState('');
  const [dealerNoteError, setDealerNoteError] = useState('');
  // Upload stato
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadType, setUploadType] = useState('allegato');
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  // Upload PDA (Stato 28)
  const [pdaFile, setPdaFile] = useState(null);
  const [pdaLoading, setPdaLoading] = useState(false);
  const [pdaError, setPdaError] = useState('');
  // Upload MODULO (Stato 10)
  const [moduloFile, setModuloFile] = useState(null);
  const [moduloLoading, setModuloLoading] = useState(false);
  const [moduloError, setModuloError] = useState('');
  // Edit payload (Stato 3)
  const [editPayload, setEditPayload] = useState({});
  const [editErrors, setEditErrors] = useState({});
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveError, setSaveError] = useState('');

  // Modale elenco completo (solo Agente -> "Dettagli")
  const [isListOpen, setIsListOpen] = useState(false);
  const [listVisible, setListVisible] = useState(false);
  const [listRows, setListRows] = useState([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState('');
  const [listSearchQuery, setListSearchQuery] = useState('');
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  // Rilevazione template SOSTITUZIONE GUASTO O CAMBIO FORMATO (solo Dealer UI)
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

  // Rilevazione template FURTO_SMARRIMENTO (solo Dealer UI)
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

  // Rileva eventuale "Documento inviato da KIM" tra i documenti
  const masterModuleDoc = useMemo(() => {
    try {
      const docs = Array.isArray(detail?.Documenti) ? detail.Documenti : [];
      const isModulo = (d) => {
        const tipo = (d?.tipo || d?.TipoFile || '').toString().toUpperCase();
        const nome = (d?.nomeOriginale || d?.NomeFile || d?.filename || '').toString().toUpperCase();
        return /MODULO/.test(tipo) || /MODULO/.test(nome);
      };

      const isPda = (d) => {
        const tipo = (d?.tipo || d?.TipoFile || '').toString().toUpperCase();
        const nome = (d?.nomeOriginale || d?.NomeFile || d?.filename || '').toString().toUpperCase();
        return /PDA/.test(tipo) || /PDA/.test(nome);
      };

      return docs.find(isModulo) || docs.find(isPda) || (docs[0] || null);
    } catch { return null; }
  }, [detail?.Documenti]);

  // Apre la modale elenco attivazioni (Agente: scuderia; Dealer: proprie)
  const openListModal = async () => {
    setIsListOpen(true);
    setTimeout(() => setListVisible(true), 0);
    setListError('');
    setListLoading(true);
    try {
      const agentName = (user?.agentenome || user?.name || '').toString();
      const qsAgent = new URLSearchParams({ ...(agentName ? { agentenome: agentName } : {}) }).toString();
      const qsDealer = new URLSearchParams({}).toString();
      let data = [];
      if (isAgent) {
        // Usa endpoint /attivazioni-dettaglio per dettagli singole attivazioni
        try {
          const [year, month] = selectedMonth.split('-');
          const qsWithMonth = new URLSearchParams({ 
            ...(agentName ? { agentenome: agentName } : {}),
            anno: year,
            mese: month
          }).toString();
          const res = await getProtectedData(`${apiPrefix}/attivazioni-dettaglio?${qsWithMonth}`);
          data = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
        } catch (err) {
          console.error('Errore caricamento dettagli attivazioni agente:', err);
          data = [];
        }
      } else {
        // Dealer: ultime attivazioni proprie
        try {
          const res = await getProtectedData(`${apiPrefix}/ultime-attivazioni?${qsDealer}`);
          data = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
        } catch {}
      }

      // Normalizzazione
      const findByRegexKey = (obj, reArr) => {
        if (!obj) return undefined;
        const keys = Object.keys(obj);
        for (const re of reArr) {
          const k = keys.find((kk) => re.test(kk));
          if (k && obj[k] != null) return obj[k];
        }
        return undefined;
      };
      
      // Mappatura diversa per agenti e dealer
      const mapped = (data || []).map((item) => {
        if (isAgent) {
          // Agenti: dettagli attivazioni da /attivazioni-dettaglio
          return {
            data: formatDate(item.BatchDate || item.DataOra || item.DataInserimento || item.Data),
            point: item.Point || '-',
            tipo: item.TIPO || '-',
            convergenza: item.IsConvergenzaMobile === 1 ? 'SI' : '',
            tipoRicarica: item.TipoRicaNorm || '-',
            offertaFisso: item.ValoreFisso || '-',
            offertaMobile: item.Offerta || '-'
          };
        } else {
          // Dealer: ultime attivazioni da /ultime-attivazioni (stesso formato della tabella principale)
          return {
            id: item.ID || item.IDOrdine || '-',
            data: formatDate(item.Data || item.DataOra || item.DataInserimento),
            titolo: item.Titolo || item.ValoreFisso || '-',
            tipo: item.Tipo || item.TIPO || '-',
            segmento: item.Segmento || item.TipoRicaNorm || '-',
            stato: item.Stato || '-'
          };
        }
      });
      setListRows(mapped);
    } catch (e) {
      setListError(e?.message || 'Errore nel caricamento');
    } finally {
      setListLoading(false);
    }
  };

  // Chiude la modale elenco ultime attivazioni (usata da overlay e bottone Chiudi)
  const closeAgentListModal = () => {
    setListVisible(false);
    setTimeout(() => setIsListOpen(false), 200);
    setListRows([]);
    setListError('');
    setListLoading(false);
  };

  // Rileva se lo stato corrente richiede upload PDA: 28 (PDA DA FIRMARE) o 9 (IN ATTESA FIRMA)
  const isPdaDaFirmare = useMemo(() => {
    try {
      const n = Number(detail?.Stato);
      if (!isNaN(n) && (n === 28 || n === 9)) return true;
      const name = (detail?.StatoEsteso || '').toString().toUpperCase();
      return (/PDA/.test(name) && /FIRMA/.test(name)) || /ATTESTA FIRMA|IN ATTESA FIRMA/.test(name);
    } catch {
      return false;
    }
  }, [detail?.Stato, detail?.StatoEsteso]);

  // Rilevazione template speciale: CERTIFICAZIONE_INDIRIZZO o INFO_PRATICA
  const isCertificazioneIndirizzo = useMemo(() => {
    try {
      const normalize = (v) => (v || '')
        .toString()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .trim().toUpperCase().replace(/\s+/g, '_');
      const code = normalize(detail?.TemplateCodice) || normalize(detail?.Template?.template || detail?.Template);
      return code === 'CERTIFICAZIONE_INDIRIZZO' || code === 'INFO_PRATICA';
    } catch {
      return false;
    }
  }, [detail]);

  const filteredListRows = useMemo(() => {
    const term = listSearchQuery.trim().toLowerCase();
    if (!term) return listRows;
    return listRows.filter((row) => {
      const include = (value) => (value || '').toString().toLowerCase().includes(term);
      if (isAgent) {
        return [row.data, row.point, row.tipo, row.offertaFisso, row.offertaMobile, row.tipoRicarica]
          .some(include);
      }
      return [row.id, row.titolo, row.tipo, row.segmento, row.stato]
        .some(include);
    });
  }, [listRows, listSearchQuery, isAgent]);

  const fetchRows = async () => {
    try {
      setError(null);
      setLoading(true);
      // Costruisci URL con filtro agentenome quando l'utente è un agente
      // Per gli agenti prova prima endpoint aggregato, poi fallback alla lista semplice
      let data = [];
      if (isAgent) {
        const baseAgg = `${apiPrefix}/ultime-attivazioni-agente`;
        const baseRaw = `${apiPrefix}/ultime-attivazioni`;
        const agentName = (user?.agentenome || user?.name || '').toString();
        const withQS = agentName ? `?${new URLSearchParams({ agentenome: agentName }).toString()}` : '';
        try {
          const resAgg = await getProtectedData(`${baseAgg}${withQS}`);
          const arrAgg = Array.isArray(resAgg?.data) ? resAgg.data : Array.isArray(resAgg) ? resAgg : [];
          try { console.debug('[UltimeAttivazioni][AGG] items:', arrAgg.length, 'keys:', arrAgg[0] ? Object.keys(arrAgg[0]) : []); } catch {}
          if (arrAgg && arrAgg.length > 0) {
            data = arrAgg;
          } else {
            // fallback per vuoto/non utile
            const resRaw = await getProtectedData(`${baseRaw}${withQS}`);
            const arrRaw = Array.isArray(resRaw?.data) ? resRaw.data : Array.isArray(resRaw) ? resRaw : [];
            try { console.debug('[UltimeAttivazioni][RAW] items:', arrRaw.length, 'keys:', arrRaw[0] ? Object.keys(arrRaw[0]) : []); } catch {}
            data = arrRaw;
          }
        } catch (e1) {
          // errore sul primo endpoint: tenta il secondo
          try {
            const resRaw = await getProtectedData(`${baseRaw}${withQS}`);
            const arrRaw = Array.isArray(resRaw?.data) ? resRaw.data : Array.isArray(resRaw) ? resRaw : [];
            try { console.debug('[UltimeAttivazioni][RAW-after-error] items:', arrRaw.length, 'keys:', arrRaw[0] ? Object.keys(arrRaw[0]) : []); } catch {}
            data = arrRaw;
          } catch (e2) {
            throw e2; // sarà gestito più sotto
          }
        }
      } else {
        // Dealer/Master: endpoint standard
        const res = await getProtectedData(`${apiPrefix}/ultime-attivazioni`);
        data = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
        try { console.debug('[UltimeAttivazioni] items:', data.length, 'keys:', data[0] ? Object.keys(data[0]) : []); } catch {}
      }

      // Funzioni utili
      const getKey = (obj, keys, def = undefined) => {
        for (const k of keys) {
          if (obj[k] !== undefined && obj[k] !== null) return obj[k];
        }
        return def;
      };

      const tryMapAggregated = (arr) => {
        if (!Array.isArray(arr) || arr.length === 0) return [];
        return arr.map(r => {
          // Dealer: cerca chiavi comuni o con regex generica
          let dealer = getKey(r, ['Dealer', 'dealer', 'NomeDealer', 'nomeDealer', 'nome_dealer', 'RagioneSociale', 'ragione_sociale'], undefined);
          if (!dealer) {
            const dk = Object.keys(r).find(k => /dealer|ragione.?sociale|nome.?cliente/i.test(k));
            dealer = dk ? r[dk] : '-';
          }
          // Conteggi: prova chiavi note, altrimenti scansiona per regex
          const asNum = (v) => {
            const n = Number(v);
            return isNaN(n) ? 0 : n;
          };
          const fissi = asNum(getKey(r, ['FWFissi', 'fw_fissi', 'FW_FISSI', 'Fissi', 'fissi', 'FW Fissi'], undefined));
          const mobili = asNum(getKey(r, ['FWMobili', 'fw_mobili', 'FW_MOBILI', 'Mobili', 'mobili', 'FW Mobili'], undefined));
          const energy = asNum(getKey(r, ['FWEnergy', 'fw_energy', 'FW_ENERGY', 'Energy', 'energy', 'FW Energy'], undefined));
          const eni = asNum(getKey(r, ['ENI', 'eni', 'Eni'], undefined));
          const sky = asNum(getKey(r, ['Sky', 'SKY', 'sky'], undefined));
          const hasAllKnown = [fissi, mobili, energy, eni, sky].some(v => v !== 0);
          if (!hasAllKnown) {
            // fallback regex-based
            const keys = Object.keys(r);
            const sumBy = (re) => keys
              .filter(k => re.test(k))
              .map(k => asNum(r[k]))
              .reduce((a, b) => a + b, 0);
            const rfissi = sumBy(/fiss/i);
            const rmobili = sumBy(/mob/i);
            const renergy = sumBy(/ener/i);
            const reni = asNum(r.ENI || r.eni || r.Eni || 0);
            const rsky = sumBy(/sky/i);
            return { dealer, fissi: rfissi, mobili: rmobili, energy: renergy, eni: reni, sky: rsky };
          }
          return { dealer, fissi, mobili, energy, eni, sky };
        });
      };

      // Preferisci aggregato per ruolo Agente, con fallback alla lista dettagliata
      if (isAgent) {
        const mappedAgg = tryMapAggregated(data).filter(r => r.dealer && r.dealer !== '-');
        const hasMeaningful = mappedAgg.some(r => (r.fissi + r.mobili + r.energy + r.eni + r.sky) > 0) || mappedAgg.length > 0;
        if (hasMeaningful) {
          setIsAggregated(true);
          setAggRows(mappedAgg.slice(0, 10));
          setRows([]);
          return;
        }
        // Heuristica: se gli oggetti hanno almeno una chiave tipo dealer, forza vista aggregata con zeri
        const looksDealerish = data.length > 0 && Object.keys(data[0]).some(k => /dealer|ragione.?sociale/i.test(k));
        if (looksDealerish) {
          const mappedAgg2 = tryMapAggregated(data).filter(r => r.dealer && r.dealer !== '-');
          setIsAggregated(true);
          setAggRows(mappedAgg2.slice(0, 10));
          setRows([]);
          return;
        }
        // se non sembra aggregato, prosegui con lista dettagliata
      } else {
        // Non-agente: tenta rilevazione automatica aggregato
        const looksAggregated = data.length > 0 && (
          Object.keys(data[0]).some(k => /dealer|nomedealer/i.test(k)) &&
          Object.keys(data[0]).some(k => /(fw\s*_?fissi|fissi)/i.test(k))
        );
        if (looksAggregated) {
          const mappedAgg = tryMapAggregated(data);
          setIsAggregated(true);
          setAggRows(mappedAgg.slice(0, 10));
          setRows([]);
          return;
        }
      }

      // Default: lista attivazioni standard (dealer/master) con fallback regex
      setIsAggregated(false);
      const findByRegexKey = (obj, reArr) => {
        if (!obj) return undefined;
        const keys = Object.keys(obj);
        for (const re of reArr) {
          const k = keys.find((kk) => re.test(kk));
          if (k && obj[k] != null) return obj[k];
        }
        return undefined;
      };
      const mapped = data.map((item) => {
        const id = item.IDOrdine ?? item.id ?? item.ID ?? null;
        const dateRaw = item.Data ?? item.date ?? item.createdAt ?? item.DataOrdine ?? findByRegexKey(item, [/^data/i, /data.?ordine/i, /created/i]);
        const titleRaw = item.Titolo ?? item.title ?? item.Valore ?? item.RagioneSociale ?? findByRegexKey(item, [/titolo/i, /valore/i, /ragione.?sociale/i, /cliente/i, /offerta/i]);
        const typeRaw = item.Tipo ?? item.type ?? item.TipoOrdine ?? findByRegexKey(item, [/tipo/i, /categoria/i]);
        const segRaw = item.Segmento ?? item.segment ?? findByRegexKey(item, [/segment/i]);
        const statusRaw = item.Stato ?? item.status ?? item.StatoEsteso ?? item.StatoNome ?? findByRegexKey(item, [/stato/i, /status/i]);
        return {
          id,
          date: formatDate(dateRaw),
          title: titleRaw || '-',
          type: typeRaw || '-',
          segment: segRaw || '-',
          status: statusRaw || '-',
          raw: item,
        };
      });
      // Metti in cima gli elementi con id per garantire righe cliccabili
      const prioritized = [...mapped].sort((a, b) => {
        const ai = a.id ? 0 : 1;
        const bi = b.id ? 0 : 1;
        if (ai !== bi) return ai - bi;
        // fallback: ordina per data se disponibile
        const da = a.raw?.DataOrdinamento ? new Date(a.raw.DataOrdinamento) : null;
        const db = b.raw?.DataOrdinamento ? new Date(b.raw.DataOrdinamento) : null;
        if (da && db) return db - da;
        return 0;
      });
      setRows(prioritized.slice(0, 10));
    } catch (e) {
      console.error('Errore fetch ultime attivazioni:', e);
      setError(e.message || 'Errore di caricamento');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRows();
  }, []);

  // Apertura diretta via query string: ?attivazione=3612 | ?id=3612 | ?open=3612
  useEffect(() => {
    const qp = searchParams;
    const val = qp.get('attivazione') || qp.get('id') || qp.get('open');
    if (val) {
      const id = parseInt(val, 10) || val;
      if (id) {
        openDetail(id);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Apertura via route dedicata: /dealer|/agente/activations/:id
  useEffect(() => {
    const rid = params?.id;
    if (rid) {
      const id = parseInt(rid, 10) || rid;
      if (id) {
        openDetail(id);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params?.id]);

  const openDetail = async (id) => {
    if (!id) return; // non cliccabile
    setSelectedId(id);
    setIsModalOpen(true);
    // attiva animazione dopo il mount
    setTimeout(() => setModalVisible(true), 0);
    setDetail(null);
    setDetailError(null);
    setDetailLoading(true);
    try {
      const res = await getProtectedData(`${apiPrefix}/attivazione/${id}`);
      console.log('[Dettaglio attivazione] payload ricevuto:', res);
      setDetail(res);
      setResubmitError('');
      setDealerNote('');
      setDealerNoteError('');
      setEditPayload({});
      setEditErrors({});
      setSaveError('');
    } catch (e) {
      console.error('Errore caricamento dettaglio attivazione:', e);
      setDetailError(e?.message || 'Errore di caricamento dettaglio');
    } finally {
      setDetailLoading(false);
    }
  };

  const closeModal = () => {
    // anima chiusura e poi smonta
    setModalVisible(false);
    setTimeout(() => setIsModalOpen(false), 200);
    setSelectedId(null);
    setDetail(null);
    setDetailError(null);
    setDetailLoading(false);
    setResubmitError('');
    setResubmitLoading(false);
  };

  // Prepara payload editabile una volta caricato il dettaglio (parse sicuro se stringhe JSON)
  useEffect(() => {
    if (!detail) return;
    try {
      const rawP = detail?.Payload ?? detail?.payload ?? {};
      const rawPI = detail?.PayloadIntestario ?? detail?.payloadIntestario ?? {};
      let parsedP = {};
      let parsedPI = {};
      try { parsedP = typeof rawP === 'string' ? JSON.parse(rawP) : (rawP || {}); } catch { parsedP = rawP || {}; }
      try { parsedPI = typeof rawPI === 'string' ? JSON.parse(rawPI) : (rawPI || {}); } catch { parsedPI = rawPI || {}; }
      // Alcuni backend annidano Payload dentro Payload
      const inner = (parsedP && typeof parsedP.Payload === 'object') ? parsedP.Payload : {};
      const merged = { ...parsedP, ...parsedPI, ...inner };
      setEditPayload(merged);
      setEditErrors({});
    } catch {}
  }, [detail]);

  // Dealer: upload MODULO su Stato=10 (PDF o immagini) => Stato passa a 30
  const handleUploadModulo = async () => {
    if (!selectedId) return;
    setModuloError('');
    if (!moduloFile) {
      setModuloError('Seleziona il file MODULO (PDF/JPEG/PNG).');
      return;
    }
    const allowedModulo = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
    if (!allowedModulo.includes(moduloFile.type)) {
      setModuloError('Formato non consentito. Ammessi: PDF, JPEG, PNG');
      return;
    }
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (moduloFile.size > maxSize) {
      setModuloError('Il file supera i 10MB consentiti.');
      return;
    }
    setModuloLoading(true);
    try {
      const fd = new FormData();
      fd.append('file', moduloFile);
      await postFormData(`/dealer/attivazione/${selectedId}/upload-modulo`, fd);
      setModuloFile(null);
      await openDetail(selectedId);
    } catch (e) {
      setModuloError(e?.message || 'Errore durante l\'upload del MODULO');
    } finally {
      setModuloLoading(false);
    }
  };

  // Dealer: invio nota per il Master (con reset stato a 0)
  const handleSendDealerNote = async () => {
    if (!selectedId) return;
    setDealerNoteError('');
    if (!dealerNote.trim()) {
      setDealerNoteError('La nota è obbligatoria.');
      return;
    }
    setResubmitLoading(true);
    try {
      // Tutte le modifiche in Stato 3 devono resettare lo stato a 0
      await patchProtectedData(`/dealer/ordine/${selectedId}/modifica-integrazione`, {
        payloadAggiornato: {},
        resetState: true,
        nota: dealerNote.trim(),
      });
      await openDetail(selectedId);
      await fetchRows();
    } catch (e) {
      setResubmitError(e?.message || 'Errore durante l\'invio della nota');
    } finally {
      setResubmitLoading(false);
    }
  };

  // Dealer: upload file aggiuntivo su Stato=3
  const handleUploadFile = async () => {
    if (!selectedId) return;
    setUploadError('');
    if (!uploadFile) {
      setUploadError('Seleziona un file da allegare.');
      return;
    }
    // Validazioni lato client: tipo e dimensione
    const allowed = ['application/pdf', 'image/jpeg', 'image/png'];
    if (!allowed.includes(uploadFile.type)) {
      setUploadError('Formato non consentito. Ammessi: PDF, JPEG, PNG');
      return;
    }
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (uploadFile.size > maxSize) {
      setUploadError('Il file supera i 10MB consentiti.');
      return;
    }
    setUploadLoading(true);
    try {
      const fd = new FormData();
      fd.append('file', uploadFile);
      // Prova a inviare sia "tipo" che "TipoFile" per compatibilità backend
      fd.append('tipo', uploadType || 'allegato');
      fd.append('TipoFile', uploadType || 'allegato');
      await postFormData(`/dealer/ordine/${selectedId}/file`, fd);
      // Dopo upload, come da requisito: resetta stato a 0
      try {
        await patchProtectedData(`/dealer/ordine/${selectedId}/modifica-integrazione`, {
          payloadAggiornato: {},
          resetState: true,
        });
      } catch {}
      setUploadFile(null);
      await openDetail(selectedId);
    } catch (e) {
      setUploadError(e?.message || 'Errore durante l\'upload del file');
    } finally {
      setUploadLoading(false);
    }
  };

  // Dealer: upload PDA firmata su Stato=28 (PDF) => Stato passa a 29
  const handleUploadPda = async () => {
    if (!selectedId) return;
    setPdaError('');
    if (!pdaFile) { setPdaError('Seleziona il file PDA (PDF).'); return; }
    if (pdaFile.type !== 'application/pdf') { setPdaError('Sono consentiti solo file PDF.'); return; }
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (pdaFile.size > maxSize) { setPdaError('Il file supera i 10MB consentiti.'); return; }
    setPdaLoading(true);
    try {
      const fd = new FormData();
      fd.append('file', pdaFile);
      await postFormData(`/dealer/attivazione/${selectedId}/upload-pda`, fd);
      setPdaFile(null);
      await openDetail(selectedId);
      await fetchRows();
    } catch (e) {
      setPdaError(e?.message || 'Errore durante l\'upload della PDA');
    } finally {
      setPdaLoading(false);
    }
  };

  // Dealer: reinvio ordine quando Stato=3 (rimandato per integrazione)
  const handleResubmit = async () => {
    if (!selectedId) return;
    setResubmitError('');
    setResubmitLoading(true);
    try {
      await patchProtectedData(`/dealer/ordine/${selectedId}/modifica-integrazione`, {
        payloadAggiornato: {},
        resetState: true,
      });
      await openDetail(selectedId);
      await fetchRows();
    } catch (e) {
      setResubmitError(e?.message || 'Errore durante il reinvio dell\'ordine');
    } finally {
      setResubmitLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 flex items-center">
          Ultime Attivazioni
        </h3>
        <button
          type="button"
          onClick={openListModal}
          className="text-sm text-primary-600 hover:text-primary-700 font-medium"
          aria-label="Vedi dettagli attivazioni"
        >
          Espandi
        </button>
      </div>

      {loading && (
        <div className="py-2 space-y-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-5 bg-gray-100 rounded animate-pulse" />
          ))}
        </div>
      )}

      {/* Modal elenco attivazioni */}
      {isListOpen && (
        <div className="fixed inset-0 z-[49] flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/30 transition-opacity duration-200"
            style={{ opacity: listVisible ? 1 : 0 }}
            onClick={closeAgentListModal}
          />
          <div
            className={`relative bg-white rounded-2xl shadow-2xl w-full mx-4 flex flex-col transition-all duration-200 ease-out transform ${listVisible ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 translate-y-1'}`}
            style={{ maxWidth: 'min(1200px, calc(100vw - 32px))', maxHeight: '90vh' }}
          >
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <h4 className="text-base font-semibold text-gray-900">{isAgent ? 'Dettaglio Attivazioni' : 'Attivazioni'}</h4>
              <button onClick={closeAgentListModal} className="text-gray-500 hover:text-gray-700" aria-label="Chiudi">✕</button>
            </div>
            <div className="p-4 flex-1 overflow-auto">
              {/* Filtro mese e barra di ricerca */}
              {!listLoading && !listError && (
                <div className="mb-3 space-y-3">
                  {isAgent && (
                    <div className="flex items-center gap-2">
                      <label className="text-sm font-medium text-gray-700">Filtro per mese:</label>
                      <input
                        type="month"
                        value={selectedMonth}
                        onChange={(e) => {
                          setSelectedMonth(e.target.value);
                          // Ricarica i dati con il nuovo mese
                          setTimeout(() => openListModal(), 100);
                        }}
                        className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  )}
                  <input
                    type="text"
                    value={listSearchQuery}
                    onChange={e => setListSearchQuery(e.target.value)}
                    placeholder="Cerca per point, tipo, offerta..."
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}
              {listLoading && (
                <div className="space-y-2">
                  {[...Array(4)].map((_, i) => (<div key={i} className="h-5 bg-gray-100 rounded animate-pulse" />))}
                </div>
              )}
              {listError && !listLoading && (
                <div className="text-sm text-red-600 flex items-center justify-between">
                  <span>{listError}</span>
                  <button onClick={openListModal} className="ml-3 px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs">Riprova</button>
                </div>
              )}
              {!listLoading && !listError && (
                <>
                  <div className="hidden md:block overflow-x-auto">
                    <table className="min-w-[900px] w-full table-auto">
                      <thead>
                        <tr className="border-b border-gray-100">
                          {isAgent ? (
                            <>
                              <th className="text-left py-2 px-2 text-xs font-medium text-gray-500 uppercase tracking-wider">Data</th>
                              <th className="text-left py-2 px-2 text-xs font-medium text-gray-500 uppercase tracking-wider">Point</th>
                              <th className="text-center py-2 px-2 text-xs font-medium text-gray-500 uppercase tracking-wider">Tipo</th>
                              <th className="text-center py-2 px-2 text-xs font-medium text-gray-500 uppercase tracking-wider">Convergenza</th>
                              <th className="text-center py-2 px-2 text-xs font-medium text-gray-500 uppercase tracking-wider">Tipo Ricarica</th>
                              <th className="text-left py-2 px-2 text-xs font-medium text-gray-500 uppercase tracking-wider">Offerta Fisso</th>
                              <th className="text-left py-2 px-2 text-xs font-medium text-gray-500 uppercase tracking-wider">Offerta Mobile</th>
                            </>
                          ) : (
                            <>
                              <th className="text-left py-2 px-2 text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
                              <th className="text-left py-2 px-2 text-xs font-medium text-gray-500 uppercase tracking-wider">Data</th>
                              <th className="text-left py-2 px-2 text-xs font-medium text-gray-500 uppercase tracking-wider">Titolo</th>
                              <th className="text-center py-2 px-2 text-xs font-medium text-gray-500 uppercase tracking-wider">Tipo</th>
                              <th className="text-center py-2 px-2 text-xs font-medium text-gray-500 uppercase tracking-wider">Segmento</th>
                              <th className="text-center py-2 px-2 text-xs font-medium text-gray-500 uppercase tracking-wider">Stato</th>
                            </>
                          )}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {(() => {
                          const colSpan = isAgent ? 7 : 6;
                          return filteredListRows.length === 0 ? (
                            <tr>
                              <td colSpan={colSpan} className="py-6 text-center text-sm text-gray-500">
                                {listSearchQuery ? 'Nessun risultato trovato' : 'Nessuna attivazione trovata'}
                              </td>
                            </tr>
                          ) : (
                            filteredListRows.map((row, idx) => (
                              <tr
                                key={idx}
                                className="hover:bg-gray-50 cursor-pointer"
                                onClick={() => {
                                  if (!isAgent && row.id) {
                                    openDetail(row.id);
                                    closeAgentListModal();
                                  }
                                }}
                              >
                                {isAgent ? (
                                  <>
                                    <td className="py-2 px-2 text-sm text-gray-600">{row.data}</td>
                                    <td className="py-2 px-2 text-sm text-gray-900">{row.point}</td>
                                    <td className="py-2 px-2 text-sm text-gray-900 text-center">{row.tipo}</td>
                                    <td className="py-2 px-2 text-sm text-center">
                                      {row.convergenza && (
                                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                                          {row.convergenza}
                                        </span>
                                      )}
                                    </td>
                                    <td className="py-2 px-2 text-sm text-gray-900 text-center">{row.tipoRicarica}</td>
                                    <td className="py-2 px-2 text-sm text-gray-900">{row.offertaFisso}</td>
                                    <td className="py-2 px-2 text-sm text-gray-900">{row.offertaMobile}</td>
                                  </>
                                ) : (
                                  <>
                                    <td className="py-2 px-2 text-sm text-gray-600">{row.id}</td>
                                    <td className="py-2 px-2 text-sm text-gray-600">{row.data}</td>
                                    <td className="py-2 px-2 text-sm text-gray-900">{row.titolo}</td>
                                    <td className="py-2 px-2 text-sm text-center">
                                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                                        {row.tipo}
                                      </span>
                                    </td>
                                    <td className="py-2 px-2 text-sm text-gray-900 text-center">{row.segmento}</td>
                                    <td className="py-2 px-2 text-sm text-center">
                                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getStatusColor(row.stato)}`}>
                                        {row.stato}
                                      </span>
                                    </td>
                                  </>
                                )}
                              </tr>
                            ))
                          );
                        })()}
                      </tbody>
                    </table>
                  </div>
                  <div className="md:hidden space-y-3">
                    {filteredListRows.length === 0 ? (
                      <div className="py-6 text-center text-sm text-gray-500">
                        {listSearchQuery ? 'Nessun risultato trovato' : 'Nessuna attivazione trovata'}
                      </div>
                    ) : (
                      filteredListRows.map((row, idx) => (
                        <div key={idx} className="rounded-xl border border-gray-100 bg-gray-50 p-3 text-sm space-y-1">
                          <div className="flex items-center justify-between text-xs text-gray-500">
                            <span>{row.data || row.id}</span>
                            {!isAgent && row.id && (
                              <button
                                type="button"
                                onClick={() => {
                                  openDetail(row.id);
                                  closeAgentListModal();
                                }}
                                className="text-[11px] font-semibold text-primary-600"
                              >
                                Apri
                              </button>
                            )}
                          </div>
                          {isAgent ? (
                            <>
                              <div className="font-medium text-gray-900">{row.point}</div>
                              <div className="flex flex-wrap gap-2 text-xs text-gray-700">
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 uppercase text-[11px]">
                                  {row.tipo}
                                </span>
                                {row.tipoRicarica && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-gray-200 text-gray-800 text-[11px]">
                                    {row.tipoRicarica}
                                  </span>
                                )}
                                {row.convergenza && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-green-100 text-green-800 text-[11px]">
                                    {row.convergenza}
                                  </span>
                                )}
                              </div>
                              {row.offertaFisso && (
                                <div className="text-gray-700">Fisso: <span className="font-medium">{row.offertaFisso}</span></div>
                              )}
                              {row.offertaMobile && (
                                <div className="text-gray-700">Mobile: <span className="font-medium">{row.offertaMobile}</span></div>
                              )}
                            </>
                          ) : (
                            <>
                              <div className="font-medium text-gray-900">{row.titolo}</div>
                              <div className="flex flex-wrap gap-2 text-xs">
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 uppercase text-[11px]">
                                  {row.tipo}
                                </span>
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-gray-200 text-gray-800 text-[11px]">
                                  {row.segmento}
                                </span>
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${getStatusColor(row.stato)}`}>
                                  {row.stato}
                                </span>
                              </div>
                            </>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </>
              )}
            </div>
            <div className="p-3 border-t border-gray-100 flex justify-end">
              <button onClick={closeAgentListModal} className="px-3 py-1.5 text-sm rounded bg-gray-100 hover:bg-gray-200 text-gray-700">Chiudi</button>
            </div>
          </div>
        </div>
      )}
      {error && !loading && (
        <div className="py-4 text-sm flex items-center justify-between">
          <span className="text-red-600">{error}</span>
          <button
            type="button"
            onClick={fetchRows}
            className="ml-4 px-3 py-1.5 text-xs rounded bg-gray-100 hover:bg-gray-200 text-gray-700"
          >
            Riprova
          </button>
        </div>
      )}
      {!loading && !error && (
        <div className="overflow-x-auto -mx-4 sm:mx-0">
          {isAggregated ? (
            <table className="min-w-[640px] sm:min-w-full table-fixed">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-2 px-2 text-xs font-medium text-gray-500 uppercase tracking-wider">Dealer</th>
                  <th className="text-center py-2 px-2 text-xs font-medium text-gray-500 uppercase tracking-wider">FW Fissi</th>
                  <th className="text-center py-2 px-2 text-xs font-medium text-gray-500 uppercase tracking-wider">FW Mobili</th>
                  <th className="text-center py-2 px-2 text-xs font-medium text-gray-500 uppercase tracking-wider">FW Energy</th>
                  <th className="text-center py-2 px-2 text-xs font-medium text-gray-500 uppercase tracking-wider">ENI</th>
                  <th className="text-center py-2 px-2 text-xs font-medium text-gray-500 uppercase tracking-wider">Sky</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {aggRows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-sm text-gray-500">Nessun dato disponibile</td>
                  </tr>
                ) : (
                  aggRows.map((r, i) => (
                    <tr key={i}>
                      <td className="py-2 px-2 text-sm text-gray-900">{r.dealer}</td>
                      <td className="py-2 px-2 text-sm text-center text-gray-900">{r.fissi}</td>
                      <td className="py-2 px-2 text-sm text-center text-gray-900">{r.mobili}</td>
                      <td className="py-2 px-2 text-sm text-center text-gray-900">{r.energy}</td>
                      <td className="py-2 px-2 text-sm text-center text-gray-900">{r.eni || 0}</td>
                      <td className="py-2 px-2 text-sm text-center text-gray-900">{r.sky}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          ) : (
            <table className="min-w-[800px] sm:min-w-full table-fixed">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-2 px-2 text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap w-20">
                    ID
                  </th>
                  <th className="text-left py-2 px-2 text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap w-24">
                    Data
                  </th>
                  <th className="text-left py-2 px-2 text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                    Titolo
                  </th>
                  <th className="text-left py-2 px-2 text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap w-20">
                    Tipo
                  </th>
                  <th className="text-left py-2 px-2 text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap w-20">
                    Segmento
                  </th>
                  <th className="text-left py-2 px-2 text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap w-28">
                    Stato
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-sm text-gray-500">Nessuna attivazione trovata</td>
                  </tr>
                ) : (
                  rows.map((activation) => (
                    <tr
                      key={(activation.id ?? activation.title) + ''}
                      className={`transition-colors ${activation.id ? 'hover:bg-gray-50 cursor-pointer' : 'opacity-70 cursor-not-allowed'}`}
                      onClick={() => activation.id && openDetail(activation.id)}
                      title={activation.id ? 'Apri dettagli attivazione' : 'Dettaglio non disponibile (fonte esterna, nessun ID ordine)'}
                    >
                      <td className="py-2 px-2 text-sm text-gray-600 whitespace-nowrap font-mono text-xs">
                        {activation.id || '-'}
                      </td>
                      <td className="py-2 px-2 text-sm text-gray-900 whitespace-nowrap">
                        {activation.date}
                      </td>
                      <td className="py-2 px-2 text-sm text-gray-900 max-w-[200px] truncate">
                        {activation.title}
                      </td>
                      <td className="py-2 px-2 text-sm text-gray-600 whitespace-nowrap">
                        <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap">
                          {activation.type}
                        </span>
                      </td>
                      <td className="py-2 px-2 text-sm text-gray-600 whitespace-nowrap">
                        <span className="bg-gray-100 text-gray-800 px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap">
                          {activation.segment}
                        </span>
                      </td>
                      <td className={`py-2 px-2 text-sm whitespace-nowrap`}>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${getStatusColor(activation.status)}`}>
                          {activation.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Modal Dettaglio Attivazione */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Overlay con sfocatura */}
          <div
            className={`absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-200 ${modalVisible ? 'opacity-100' : 'opacity-0'}`}
            onClick={closeModal}
          />
          {/* Pannello con transizione */}
          <div className={`relative bg-white rounded-lg shadow-xl w-full max-w-3xl mx-4 transition-all duration-200 ease-out transform ${modalVisible ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 translate-y-1'}`}>
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <h4 className="text-base font-semibold text-gray-900">Dettaglio Attivazione{selectedId ? ` #${selectedId}` : ''}</h4>
              <button onClick={closeModal} className="text-gray-500 hover:text-gray-700" aria-label="Chiudi">✕</button>
            </div>
            <div className="p-4 max-h-[70vh] overflow-auto">
              {detailError && !detailLoading && (
                <div className="text-sm text-red-600">{detailError}</div>
              )}
              {!detailLoading && !detailError && detail && (
                <div className="space-y-4">
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {[
                      { label: 'Data ordine', value: formatDateTime(detail.DataOrdine) },
                      { label: 'Stato', value: detail.StatoEsteso, isStatus: true },
                      { label: 'Offerta', value: detail.TitoloOfferta },
                      { label: 'Dealer', value: detail.NomeDealer }
                    ].filter(item => item.value && item.value !== '-').map((item, index) => (
                      <div key={index}>
                        <div className="text-xs text-gray-500">{item.label}</div>
                        {item.isStatus ? (
                          <div className={`inline-block mt-0.5 px-2 py-0.5 rounded-full text-xs ${getStatusColor(item.value)}`}>{item.value}</div>
                        ) : (
                          <div className="text-sm text-gray-900">{item.value}</div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Intestatario */}
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
                        
                        const cf = i.CodiceFiscale
                          || p.CODICE_FISCALE_INTESTATARIO
                          || p.CODICE_FISCALE_NUOVO_INTESTATARIO
                          || p.CodiceFiscale
                          || p.CODICE_FISCALE
                          || p.CF;
                        
                        const campiIntestatario = [
                          { label: 'Nome e Cognome / Ragione sociale', value: nomeCompleto },
                          { label: 'Codice Fiscale', value: cf },
                          { label: 'Data di nascita', value: i.DataNascita || p.DATA_DI_NASCITA },
                          { label: 'Luogo di nascita', value: i.LuogoNascita || p.LUOGO_DI_NASCITA },
                          { label: 'Indirizzo e civico attivazione', value: i.Indirizzo || p.INDIRIZZO_E_CIVICO_ATTIVAZIONE },
                          { label: 'CAP', value: i.CAP || p.CAP },
                          { label: 'Città', value: i.Citta || p.CITTA },
                          { label: 'Provincia', value: i.Provincia || p.PROVINCIA },
                          { label: 'P.IVA', value: i.PIVA || p.PARTITA_IVA },
                          { label: 'Email', value: i.Email || p.EMAIL },
                          { label: 'Recapito di riferimento', value: i.Telefono || p.TELEFONO || p.NUMERO_TELEFONO || p.RECAPITO_DI_RIFERIMENTO }
                        ].filter(item => {
                          const val = item.value;
                          return val && val !== '' && val !== '-' && val !== null && val !== undefined && String(val).trim() !== '';
                        });

                        return campiIntestatario.length > 0 ? (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                            {campiIntestatario.map((item, index) => (
                              <div key={index} className={item.label === 'Indirizzo e civico attivazione' ? 'sm:col-span-2' : ''}>
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

                  {/* Dati principali da payload */}
                  {/* Dati Template Dinamici */}
                  <div>
                    <div className="text-xs font-medium text-gray-700 mb-2">
                      Dati Attivazione {detail.Template?.template ? `(${detail.Template.template})` : ''}
                    </div>
                    
                    {/* Renderizza campi dinamici basati su template */}
                    {detail.Template?.campi ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                        {detail.Template.campi.map((campo, index) => {
                          const isState3 = String(detail?.Stato ?? detail?.stato ?? '') === '3';
                          const key = campo.key;
                          const rawVal = editPayload?.[key] ?? (detail.Intestatario || {})[key] ?? '';
                          const onChange = (v) => setEditPayload(prev => ({ ...prev, [key]: v }));
                          const err = editErrors?.[key];

                          if (!isState3) {
                            // Read-only rendering (come prima, con formattazione date)
                            let valore = rawVal;
                            if (campo.tipo === 'date' && valore) {
                              valore = formatDate(valore);
                            }
                            if (!valore || valore === '-') return null;
                            return (
                              <div key={index}>
                                <div className="text-xs text-gray-500">{campo.label}</div>
                                <div className="text-gray-800 break-words">{String(valore)}</div>
                              </div>
                            );
                          }

                          // Stato 3: input editabile
                          return (
                            <div key={index}>
                              <label className="block text-xs text-gray-600 mb-1">{campo.label}</label>
                              {campo.tipo === 'date' ? (
                                <input
                                  type="date"
                                  value={(() => {
                                    try {
                                      if (!rawVal) return '';
                                      // Se rawVal è nel formato DD/MM/YYYY o MM/DD/YYYY
                                      const m = String(rawVal).trim().match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
                                      if (m) {
                                        let a = parseInt(m[1], 10); // primo
                                        let b = parseInt(m[2], 10); // secondo
                                        const y = m[3];
                                        if (!a || !b) return '';
                                        // Se appare MM/DD/YYYY (secondo > 12), inverti
                                        let dd = a;
                                        let mm = b;
                                        if (a <= 12 && b > 12) { dd = b; mm = a; }
                                        return `${y}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
                                      }
                                      // Altrimenti prova a parsare come data
                                      const d = new Date(rawVal);
                                      if (isNaN(d.getTime())) return '';
                                      const yyyy = d.getFullYear();
                                      const mm = String(d.getMonth() + 1).padStart(2, '0');
                                      const dd = String(d.getDate()).padStart(2, '0');
                                      return `${yyyy}-${mm}-${dd}`;
                                    } catch { return String(rawVal || ''); }
                                  })()}
                                  onChange={(e) => onChange(e.target.value)}
                                  className="w-full rounded border border-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                              ) : (
                                <input
                                  type="text"
                                  value={rawVal ?? ''}
                                  onChange={(e) => onChange(e.target.value)}
                                  className={`w-full border border-gray-200 rounded p-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 ${err ? 'border-red-400' : ''}`}
                                />
                              )}
                              {err && <div className="text-xs text-red-600 mt-1">{err}</div>}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      /* Fallback per template mancante - usa dati intestatario standard */
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                        {[
                          { label: 'Nome e Cognome', value: intestatario.nome && intestatario.cognome ? `${intestatario.nome} ${intestatario.cognome}` : intestatario.nomeCompleto },
                          { label: 'Ragione sociale', value: intestatario.ragioneSociale },
                          { label: 'Codice Fiscale', value: intestatario.codiceFiscale },
                          { label: 'Data di nascita', value: intestatario.dataNascita },
                          { label: 'Luogo di nascita', value: intestatario.luogoNascita },
                          { label: 'Indirizzo e civico attivazione', value: intestatario.indirizzoAttivazione },
                          { label: 'CAP', value: intestatario.cap },
                          { label: 'Città', value: intestatario.citta },
                          { label: 'Provincia', value: intestatario.provincia },
                          { label: 'P.IVA', value: intestatario.partitaIva },
                          { label: 'Email', value: intestatario.email },
                          { label: 'Recapito di riferimento', value: intestatario.telefono }
                        ].filter(item => item.value && item.value !== '' && item.value !== '-').map((item, index) => (
                          <div key={index}>
                            <div className="text-xs text-gray-500">{item.label}</div>
                            <div className="text-gray-800 break-words">{item.value}</div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Stato 28: PDA DA FIRMARE -> consenti upload PDA che porta stato a 29 (visibile anche fuori da stato 3) */}
                    {isPdaDaFirmare && (
                      <div className="mt-3 p-4 bg-red-50 border-2 border-red-300 rounded-lg">
                        <div className="flex items-start gap-2 mb-3">
                          <span className="text-2xl">⚠️</span>
                          <div className="flex-1">
                            <div className="text-sm font-bold text-red-900 mb-1">
                              ATTENZIONE: PDA da firmare
                            </div>
                            <div className="text-xs text-red-800 leading-relaxed">
                              📥 <strong>Scarica la PDA</strong> dall'elenco documenti qui sotto<br/>
                              ✍️ <strong>Falla firmare</strong> dal cliente<br/>
                              📤 <strong>Ricaricala qui</strong> firmata (PDF, max 10MB)
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="file"
                            accept="application/pdf"
                            onChange={(e) => setPdaFile(e.target.files?.[0] || null)}
                            className="text-sm flex-1"
                          />
                          <button
                            type="button"
                            onClick={handleUploadPda}
                            disabled={pdaLoading || !pdaFile}
                            className="px-4 py-2 text-sm font-semibold rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-60 disabled:cursor-not-allowed shadow-md"
                          >
                            {pdaLoading ? 'Caricamento...' : 'Carica PDA'}
                          </button>
                        </div>
                        {pdaError && (
                          <div className="text-xs text-red-700 mt-2 font-medium bg-red-100 p-2 rounded">
                            ❌ {pdaError}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Documenti - Dinamici basati su template */}
                  <div>
                    <div className="text-xs font-medium text-gray-700 mb-2">
                      Documenti {detail.Documenti?.length ? `(${detail.Documenti.length})` : ''}
                    </div>
                    {detail.Documenti && detail.Documenti.length > 0 ? (
                      <div className="space-y-2">
                        {detail.Documenti.map((doc, index) => {
                          const href = resolveDealerDocUrl(doc);
                          const isPDA = (doc.tipo || '').toUpperCase().includes('PDA');
                          return (
                            <div 
                              key={index} 
                              className={`flex items-center justify-between p-3 rounded border-2 transition-all ${
                                isPDA 
                                  ? 'bg-green-50 border-green-300 shadow-md' 
                                  : 'bg-gray-50 border-transparent'
                              }`}
                            >
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <div className={`text-sm font-semibold ${isPDA ? 'text-green-900' : 'text-gray-700'}`}>
                                    {doc.tipo}
                                  </div>
                                  {isPDA && (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-green-600 text-white animate-pulse">
                                      ⭐ IMPORTANTE
                                    </span>
                                  )}
                                </div>
                                <div className={`text-xs ${isPDA ? 'text-green-700' : 'text-gray-500'}`}>
                                  {doc.nomeOriginale}
                                </div>
                              </div>
                              {href ? (
                                <a 
                                  href={href} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className={`text-xs px-3 py-1.5 rounded font-medium transition-colors ${
                                    isPDA
                                      ? 'bg-green-600 text-white hover:bg-green-700 shadow-sm'
                                      : 'bg-blue-100 text-blue-800 hover:bg-blue-200'
                                  }`}
                                >
                                  Visualizza
                                </a>
                              ) : (
                                <span className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-600">
                                  Non disponibile
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-sm text-gray-500">Nessun documento allegato</div>
                    )}
                  </div>

                  {/* Storico */}
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
                                <td className="px-2 py-1 whitespace-nowrap">{s.DataOra}</td>
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

                  {/* Note Dealer/Master e azioni stato 3 */}
                  <div className="border border-gray-200 rounded p-3 bg-gray-50">
                    <div className="text-xs font-semibold text-gray-700 mb-2">Note</div>
                    {detail?.note_dealer || detail?.NoteDealer ? (
                      <div className="text-sm whitespace-pre-line bg-white border border-gray-200 rounded p-2 text-gray-800">{detail.note_dealer || detail.NoteDealer}</div>
                    ) : (
                      <div className="text-sm text-gray-500">Nessuna nota</div>
                    )}
                    {/* Stato = 3: textarea nota + azioni */}
                    {String(detail?.Stato ?? detail?.stato ?? '') === '3' && (
                      <div className="mt-3 space-y-3">
                        {/* Nota per il Master */}
                        <div>
                          <label className="block text-xs text-gray-600 mb-1" htmlFor="dealer-note">Nota per il Master</label>
                          <textarea
                            id="dealer-note"
                            value={dealerNote}
                            onChange={(e) => setDealerNote(e.target.value)}
                            rows={3}
                            className="w-full text-sm border border-gray-200 rounded p-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                            placeholder="Inserisci la nota da inviare al Master..."
                          />
                          {dealerNoteError && (
                            <div className="text-xs text-red-600 mt-1">{dealerNoteError}</div>
                          )}
                          <div className="mt-2 flex items-center gap-2">
                            <button
                              type="button"
                              onClick={handleSendDealerNote}
                              disabled={resubmitLoading}
                              className="px-3 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
                            >
                              {resubmitLoading ? 'Invio...' : 'Invia Nota (reset a 0)'}
                            </button>
                          </div>
                          {resubmitError && (
                            <div className="text-xs text-red-600 mt-1">{resubmitError}</div>
                          )}
                        </div>

                        {/* Upload file aggiuntivo */}
                        <div className="border-t border-gray-200 pt-3">
                          <div className="text-xs text-gray-600 mb-1">Allega File</div>
                          <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                            <input
                              type="file"
                              accept="application/pdf,image/jpeg,image/png"
                              onChange={(e) => setUploadFile(e.target.files && e.target.files[0] ? e.target.files[0] : null)}
                              className="text-sm"
                            />
                            <input
                              type="text"
                              value={uploadType}
                              onChange={(e) => setUploadType(e.target.value)}
                              placeholder="Tipo file (es. tessera, documento, allegato)"
                              className="w-full sm:w-60 text-sm border border-gray-200 rounded p-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                            />
                            <button
                              type="button"
                              onClick={handleUploadFile}
                              disabled={uploadLoading}
                              className="px-3 py-1.5 text-sm rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
                            >
                              {uploadLoading ? 'Caricamento...' : 'Allega File'}
                            </button>
                          </div>
                          {uploadError && (
                            <div className="text-xs text-red-600 mt-1">{uploadError}</div>
                          )}
                        </div>

                        {/* Salva modifiche payload (reset a 0) */}
                        <div className="border-t border-gray-200 pt-3">
                          <button
                            type="button"
                            onClick={async () => {
                              if (!selectedId) return;
                              setSaveError('');
                              setEditErrors({});
                              // Validazioni: CF, email, date
                              const errors = {};
                              try {
                                const campi = detail?.Template?.campi || [];
                                campi.forEach(c => {
                                  const key = c.key;
                                  const label = (c.label || '').toString().toLowerCase();
                                  const val = (editPayload?.[key] ?? '').toString().trim();
                                  if (!val) return;
                                  // CF
                                  if (/codice\s*fiscale|\bcf\b/i.test(label) || /CF|CODICE_FISCALE/i.test(key)) {
                                    if (!/^[A-Z0-9]{16}$/i.test(val)) {
                                      errors[key] = 'Codice Fiscale non valido (16 caratteri alfanumerici).';
                                    }
                                  }
                                  // Email
                                  if (/email/i.test(label) || /EMAIL/i.test(key)) {
                                    if (!/^\S+@\S+\.[\w]{2,}$/i.test(val)) {
                                      errors[key] = 'Email non valida.';
                                    }
                                  }
                                  // Date
                                  if (c.tipo === 'date') {
                                    const d = new Date(val);
                                    if (isNaN(d.getTime())) {
                                      errors[key] = 'Data non valida.';
                                    }
                                  }
                                });
                              } catch {}
                              if (Object.keys(errors).length > 0) {
                                setEditErrors(errors);
                                setSaveError('Correggi i campi evidenziati prima di salvare.');
                                return;
                              }
                              setSaveLoading(true);
                              try {
                                await patchProtectedData(`/dealer/ordine/${selectedId}/modifica-integrazione`, {
                                  payloadAggiornato: editPayload,
                                  resetState: true,
                                });
                                await openDetail(selectedId);
                              } catch (e) {
                                setSaveError(e?.message || 'Errore durante il salvataggio delle modifiche');
                              } finally {
                                setSaveLoading(false);
                              }
                            }}
                            disabled={saveLoading}
                            className="px-3 py-1.5 text-sm rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60"
                          >
                            {saveLoading ? 'Salvataggio...' : 'Salva modifiche (reset a 0)'}
                          </button>
                          {saveError && <div className="text-xs text-red-600 mt-1">{saveError}</div>}
                        </div>

                        <div className="border-t border-gray-200 pt-3">
                          <button
                            type="button"
                            onClick={handleResubmit}
                            disabled={resubmitLoading}
                            className="px-3 py-1.5 text-sm rounded bg-gray-800 text-white hover:bg-gray-900 disabled:opacity-60"
                          >
                            {resubmitLoading ? 'Invio...' : 'Reinvia (reset a stato 0)'}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Stato = 10 e Template SOSTITUZIONE_GUASTO_O_CAMBIO_FORMATO o FURTO_SMARRIMENTO: mostra Documento KIM + Upload Modulo */}
                    {(isSostituzioneGuastoOCambioFormato || isFurtoSmarrimento) && String(detail?.Stato ?? detail?.stato ?? '') === '10' && (
                      <div className="mt-3 space-y-3 border-t border-gray-200 pt-3">
                        {/* Documento inviato da KIM (download) */}
                        {masterModuleDoc ? (
                          <div className="rounded border border-blue-200 bg-blue-50 p-3">
                            <div className="text-sm font-medium text-blue-900 mb-1">Documento inviato da KIM</div>
                            <div className="flex items-center justify-between gap-2">
                              <div className="text-xs text-blue-900/80 truncate">{masterModuleDoc.nomeOriginale || masterModuleDoc.NomeFile || masterModuleDoc.filename || 'Documento'}</div>
                              {(() => {
                                const href = resolveDealerDocUrl(masterModuleDoc);
                                return href ? (
                                  <a
                                    href={href}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                                  >
                                    Scarica Documento
                                  </a>
                                ) : (
                                  <span className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-600">Non disponibile</span>
                                );
                              })()}
                            </div>
                          </div>
                        ) : (
                          <div className="rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                            In attesa del documento inviato da KIM.
                          </div>
                        )}

                        {/* Upload del modulo compilato dal Dealer */}
                        <div className="space-y-2">
                          <div className="text-xs text-gray-600">Carica MODULO compilato (PDF/JPEG/PNG)</div>
                          <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                            <input
                              type="file"
                              accept="application/pdf,image/jpeg,image/png,image/jpg"
                              onChange={(e) => setModuloFile(e.target.files && e.target.files[0] ? e.target.files[0] : null)}
                              className="text-sm"
                            />
                            <button
                              type="button"
                              onClick={handleUploadModulo}
                              disabled={moduloLoading}
                              className="px-3 py-1.5 text-sm rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60"
                            >
                              {moduloLoading ? 'Caricamento...' : 'Allega MODULO (stato 30)'}
                            </button>
                          </div>
                          {moduloError && (
                            <div className="text-xs text-red-600 mt-1">{moduloError}</div>
                          )}
                        </div>
                      </div>
                    )}
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
