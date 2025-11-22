import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import DashboardLayout from '../components/layout/DashboardLayout';
import { getProtectedData, patchProtectedData } from '../services/api';

// Funzione per determinare il colore del badge Stato Ordine
function getOrderStatusBadgeColor(status) {
  if (!status) return 'bg-gray-100 text-gray-800';
  const statusUpper = status.toString().toUpperCase();
  
  // Badge verdi
  if (statusUpper === 'PAGATO' || statusUpper === 'PAGATO CON CC') {
    return 'bg-green-100 text-green-800';
  }
  
  // Badge gialli
  if (statusUpper === 'IN ATTESA PAGAMENTO') {
    return 'bg-yellow-100 text-yellow-800';
  }
  
  // Badge rossi
  if (statusUpper === 'ANNULLATO') {
    return 'bg-red-100 text-red-800';
  }
  
  // Default grigio
  return 'bg-gray-100 text-gray-800';
}

// Funzione per determinare il colore del badge Stato Spedizione
function getShippingStatusBadgeColor(status) {
  if (!status) return 'bg-gray-100 text-gray-800';
  const statusUpper = status.toString().toUpperCase();
  
  // Badge verdi
  if (statusUpper === 'CONSEGNATO' || statusUpper === 'SPEDITO') {
    return 'bg-green-100 text-green-800';
  }
  
  // Badge gialli
  if (statusUpper === 'DA SPEDIRE') {
    return 'bg-yellow-100 text-yellow-800';
  }
  
  // Badge rossi
  if (statusUpper === 'ANNULLATO') {
    return 'bg-red-100 text-red-800';
  }
  
  // Default grigio
  return 'bg-gray-100 text-gray-800';
}

export default function MasterProdottiDashboard() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [updatingShip, setUpdatingShip] = useState(false);
  const [updatingPaid, setUpdatingPaid] = useState(false);
  const [updatingRecharge, setUpdatingRecharge] = useState(false);
  const [updatingCancel, setUpdatingCancel] = useState(false);

  // Stato badge e modale "Ordini in attesa pagamento"
  const [pendingCount, setPendingCount] = useState(0);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [pendingError, setPendingError] = useState(null);
  const [pendingOrders, setPendingOrders] = useState([]);
  const [pendingModalOpen, setPendingModalOpen] = useState(false);
  const [pendingModalVisible, setPendingModalVisible] = useState(false);
  const [pendingModalLoading, setPendingModalLoading] = useState(false);

  // Stato Movimenti Stripe
  const [movs, setMovs] = useState([]);
  const [movLoading, setMovLoading] = useState(false);
  const [movError, setMovError] = useState(null);
  const [movQuery, setMovQuery] = useState('');
  const [movDebounced, setMovDebounced] = useState('');
  const [days, setDays] = useState(''); // filtro opzionale
  const [limit, setLimit] = useState(100); // default backend

  // Stato modale dettagli Payout
  const [payoutModal, setPayoutModal] = useState({ open: false, visible: false, data: null });
  const [payoutDetails, setPayoutDetails] = useState(null);
  const [payoutLoading, setPayoutLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await getProtectedData('/masterprodotti/ordini');
        if (!mounted) return;
        setOrders(Array.isArray(data) ? data : []);
      } catch (e) {
        if (!mounted) return;
        setError(e.message || 'Errore caricamento ordini');
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => { mounted = false; };
  }, []);

  // Caricamento Movimenti Stripe
  useEffect(() => {
    let mounted = true;
    const fetchMovs = async () => {
      setMovLoading(true);
      setMovError(null);
      try {
        // Normalizza limit secondo vincoli backend (min 1, max 200)
        const lim = Math.max(1, Math.min(200, Number(limit) || 100));
        const params = new URLSearchParams();
        if (lim) params.set('limit', String(lim));
        const dNum = Number(days);
        if (!Number.isNaN(dNum) && dNum > 0) params.set('days', String(dNum));
        const qs = params.toString();
        const data = await getProtectedData(`/stripe/movimenti${qs ? `?${qs}` : ''}`);
        if (!mounted) return;
        // Il backend ritorna { success, data }
        const arr = Array.isArray(data) ? data : (Array.isArray(data?.data) ? data.data : []);
        setMovs(arr);
      } catch (e) {
        if (!mounted) return;
        setMovError(e.message || 'Errore caricamento movimenti Stripe');
      } finally {
        if (mounted) setMovLoading(false);
      }
    };
    fetchMovs();
    return () => { mounted = false; };
  }, [days, limit]);

  const filteredMovs = useMemo(() => {
    if (!movDebounced) return movs;
    return movs.filter((m) => {
      const hay = [
        m?.data,
        m?.dealer,
        m?.tipo,
        m?.importo,
        m?.valuta,
        m?.descrizione,
      ].join(' ').toString().toLowerCase();
      return hay.includes(movDebounced);
    });
  }, [movs, movDebounced]);

  const fmtAmount = (v) => {
    const num = Number(v);
    if (Number.isNaN(num)) return '-';
    return num.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const fmtCurrency = (v) => {
    const num = Number(v);
    if (Number.isNaN(num)) return '-';
    return num.toLocaleString('it-IT', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 });
  };

  // Debounce query
  useEffect(() => {
    const id = setTimeout(() => setDebounced(query.trim().toLowerCase()), 250);
    return () => clearTimeout(id);
  }, [query]);

  // Debounce query movimenti
  useEffect(() => {
    const id = setTimeout(() => setMovDebounced(movQuery.trim().toLowerCase()), 250);
    return () => clearTimeout(id);
  }, [movQuery]);

  const filtered = useMemo(() => {
    if (!debounced) return orders;
    return orders.filter((o) => {
      const hay = [
        o?.Data,
        o?.IDOrdineProdotto,
        o?.RagioneSociale,
        o?.TotaleOrdine,
        o?.StatoEsteso,
        o?.Stato_spedizione || o?.stato_spedizione || o?.StatoSpedizioneEsteso,
        o?.NOTE,
      ].join(' ').toString().toLowerCase();
      return hay.includes(debounced);
    });
  }, [orders, debounced]);

  const openOrderModal = async (id) => {
    if (!id) return;
    try {
      setModalLoading(true);
      setModalOpen(true);
      setTimeout(() => setModalVisible(true), 0);
      const detail = await getProtectedData(`/masterprodotti/ordine/${id}`);
      setSelectedOrder(detail);
    } catch (e) {
      console.error('Errore recupero dettaglio ordine:', e);
      alert('Errore nel caricamento del dettaglio ordine');
    } finally {
      setModalLoading(false);
    }
  };

  const closeModal = () => {
    setModalVisible(false);
    setTimeout(() => {
      setModalOpen(false);
      setSelectedOrder(null);
    }, 200);
  };

  // Helpers azioni MasterProdotti
  const getOrderId = (ord) => ord?.IDOrdine || ord?.IDOrdineProdotto;
  const isOrderPaid = (ord) => {
    const stato = String(ord?.StatoEsteso || '').toUpperCase();
    const idStato = Number(ord?.idStatoOrdineProdotto ?? ord?.IDStatoOrdineProdotto);
    return stato.includes('PAGATO') || idStato === 20 || idStato === 22;
  };
  const getOrderProducts = (ord) => {
    const a = Array.isArray(ord?.prodotti) ? ord.prodotti : [];
    const b = Array.isArray(ord?.Prodotti) ? ord.Prodotti : [];
    return a.length ? a : b;
  };
  const hasOffer446 = (ord) => {
    const prods = getOrderProducts(ord);
    return Array.isArray(prods) && prods.some(p => Number(p?.idOfferta ?? p?.IDOfferta ?? p?.id) === 446);
  };
  const hasOnlyOffer446 = (ord) => {
    const prods = getOrderProducts(ord);
    if (!Array.isArray(prods) || prods.length === 0) return false;
    let has446 = false;
    let hasOthers = false;
    for (const p of prods) {
      const id = Number(p?.idOfferta ?? p?.IDOfferta ?? p?.id);
      if (!id) continue;
      if (id === 446) has446 = true; else hasOthers = true;
      if (hasOthers && has446) break;
    }
    return has446 && !hasOthers;
  };

  // -------- Badge e Modale: Ordini in attesa pagamento --------
  const refreshPendingBadge = async () => {
    setPendingLoading(true);
    setPendingError(null);
    try {
      const res = await getProtectedData('/ordini/in-attesa-pagamento');
      const arr = Array.isArray(res) ? res : (Array.isArray(res?.data) ? res.data : []);
      setPendingCount(arr.length);
    } catch (e) {
      setPendingError(e?.message || 'Errore caricamento badge ordini in attesa');
    } finally {
      setPendingLoading(false);
    }
  };

  useEffect(() => {
    // carica il badge on mount
    refreshPendingBadge();
  }, []);

  // Auto-refresh badge ogni ora
  useEffect(() => {
    const intervalId = setInterval(() => {
      refreshPendingBadge();
    }, 60 * 60 * 1000); // 1 ora
    return () => clearInterval(intervalId);
  }, []);

  // Refresh badge su focus/visibility
  useEffect(() => {
    const onFocus = () => refreshPendingBadge();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refreshPendingBadge();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  const openPendingModal = async () => {
    setPendingModalOpen(true);
    setTimeout(() => setPendingModalVisible(true), 0);
    await loadPendingOrders();
  };

  const closePendingModal = () => {
    setPendingModalVisible(false);
    setTimeout(() => {
      setPendingModalOpen(false);
      setPendingOrders([]);
    }, 200);
  };

  const loadPendingOrders = async () => {
    setPendingModalLoading(true);
    try {
      const res = await getProtectedData('/ordini/in-attesa-pagamento');
      const arr = Array.isArray(res) ? res : (Array.isArray(res?.data) ? res.data : []);
      setPendingOrders(arr);
      setPendingCount(arr.length); // sincronizza badge
    } catch (e) {
      alert(`Errore caricamento ordini in attesa: ${e?.message || e}`);
    } finally {
      setPendingModalLoading(false);
    }
  };

  const handlePendingSegnaPagato = async (id) => {
    try {
      await patchProtectedData(`/ordini/${id}/segna-pagato`, {});
      await loadPendingOrders();
    } catch (e) {
      alert(`Errore segna pagato: ${e?.message || e}`);
    }
  };

  const handlePendingSegnaSpedito = async (id) => {
    try {
      await patchProtectedData(`/ordini/${id}/segna-spedito`, {});
      await loadPendingOrders();
    } catch (e) {
      alert(`Errore segna spedito: ${e?.message || e}`);
    }
  };

  const fmtDaysBadge = (oreAttesa) => {
    const hours = Number(oreAttesa) || 0;
    const days = hours / 24;
    const label = Math.floor(days).toString();
    let cls = 'bg-green-50 text-green-700 ring-green-200';
    if (days >= 3) cls = 'bg-red-50 text-red-700 ring-red-200';
    else if (days >= 1) cls = 'bg-amber-50 text-amber-700 ring-amber-200';
    return { label, cls };
  };

  const handleSegnaSpedito = async () => {
    if (!selectedOrder) return;
    const id = getOrderId(selectedOrder);
    if (!id) return alert('ID ordine mancante');
    try {
      setUpdatingShip(true);
      const note = window.prompt('Note opzionali per il dealer (lascia vuoto per nessuna):') || '';
      // Usa endpoint consolidato
      await patchProtectedData(`/masterprodotti/ordini/${id}/aggiorna-spedizione`, {
        idStatoSpedizione: 3,
        stato_spedizione: 'Spedito',
        noteDealer: note,
      });
      await openOrderModal(id); // refresh contenuto modale
      await refreshPendingBadge(); // sincronizza badge ordini in attesa
    } catch (e) {
      console.error('Errore aggiornamento spedizione:', e);
      alert(`Errore aggiornamento spedizione: ${e?.message || e}`);
    } finally {
      setUpdatingShip(false);
    }
  };

  const handleSegnaPagato = async () => {
    if (!selectedOrder) return;
    const id = getOrderId(selectedOrder);
    if (!id) return alert('ID ordine mancante');
    try {
      setUpdatingPaid(true);
      await patchProtectedData(`/ordini/${id}/segna-pagato`, {});
      await openOrderModal(id); // refresh contenuto modale
      await refreshPendingBadge(); // sincronizza badge ordini in attesa
    } catch (e) {
      console.error('Errore segna pagato:', e);
      alert(`Errore segna pagato: ${e?.message || e}`);
    } finally {
      setUpdatingPaid(false);
    }
  };

  const handleSegnaRicaricato = async () => {
    if (!selectedOrder) return;
    const id = getOrderId(selectedOrder);
    if (!id) return alert('ID ordine mancante');
    try {
      setUpdatingRecharge(true);
      const note = window.prompt('Note opzionali per il dealer (lascia vuoto per nessuna):') || '';
      await patchProtectedData(`/masterprodotti/ordini/${id}/segna-ricaricato`, { noteDealer: note });
      await openOrderModal(id); // refresh contenuto modale
      await refreshPendingBadge(); // sincronizza badge ordini in attesa
    } catch (e) {
      console.error('Errore segna ricaricato:', e);
      alert(`Errore segna ricaricato: ${e?.message || e}`);
    } finally {
      setUpdatingRecharge(false);
    }
  };

  // Verifica se l'ordine può essere annullato (Stato Ordine = 0 e Stato Spedizione = 31)
  const canCancelOrder = (order) => {
    if (!order) return false;
    
    // Verifica per testo (i dati arrivano come testo, non come ID)
    const statoTestoOrdine = (order.StatoEsteso || '').toUpperCase();
    const statoTestoSpedizione = (order.StatoSpedizione || '').toUpperCase();
    
    const isAttesaPagamento = statoTestoOrdine === 'IN ATTESA PAGAMENTO';
    const isDaSpedire = statoTestoSpedizione === 'DA SPEDIRE';
    
    return isAttesaPagamento && isDaSpedire;
  };

  const handleAnnullaOrdine = async () => {
    if (!selectedOrder) return;
    const id = getOrderId(selectedOrder);
    if (!id) return alert('ID ordine mancante');
    
    // Conferma annullamento
    if (!window.confirm('Sei sicuro di voler annullare questo ordine? Questa azione non può essere annullata.')) {
      return;
    }
    
    try {
      setUpdatingCancel(true);
      const note = window.prompt('Note per l\'annullamento (opzionale):') || '';
      await patchProtectedData(`/masterprodotti/ordini/${id}/annulla`, { noteDealer: note });
      await openOrderModal(id); // refresh contenuto modale
      await refreshPendingBadge(); // sincronizza badge ordini in attesa
    } catch (e) {
      console.error('Errore annullamento ordine:', e);
      alert(`Errore annullamento ordine: ${e?.message || e}`);
    } finally {
      setUpdatingCancel(false);
    }
  };

  // Gestione modale Payout
  const openPayoutModal = async (movimento) => {
    if (movimento.tipo !== 'EROGAZIONE' || !movimento.dettagli) return;
    
    setPayoutModal({ open: true, visible: false, data: movimento });
    setPayoutDetails(null);
    setPayoutLoading(true);
    
    setTimeout(() => setPayoutModal(prev => ({ ...prev, visible: true })), 0);
    
    try {
      // Carica i dettagli estesi del payout
      const details = await getProtectedData(`/stripe/payout/${movimento.id}`);
      setPayoutDetails(details);
    } catch (e) {
      console.error('Errore caricamento dettagli payout:', e);
      alert('Errore nel caricamento dei dettagli del payout');
    } finally {
      setPayoutLoading(false);
    }
  };

  const closePayoutModal = () => {
    setPayoutModal(prev => ({ ...prev, visible: false }));
    setTimeout(() => {
      setPayoutModal({ open: false, visible: false, data: null });
      setPayoutDetails(null);
      setPayoutLoading(false);
    }, 200);
  };

  return (
    <DashboardLayout title="Home">
      {/* Contenitore con margini dai bordi */}
      <div className="w-full max-w-[2300px] mx-auto px-1 sm:px-2 lg:px-2 py-2 sm:py-3 lg:py-4">
        <div className="space-y-6">
          {/* Card 1: Ordini */}
          <section className="bg-white rounded-2xl shadow-sm ring-1 ring-gray-100 h-[42vh] flex flex-col">
            {/* Header */}
            <div className="px-5 py-4 border-b border-gray-100">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-gray-900">Ordini</h2>
                <div className="flex items-center gap-3">
                  {/* Results count */}
                  <div className="hidden sm:block text-xs text-gray-500">{filtered.length} risultati</div>
                  {/* Search */}
                  <div className="relative w-[220px] sm:w-[260px]">
                    <div className="pointer-events-none absolute inset-y-0 left-0 pl-3 flex items-center">
                      <svg className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-4.35-4.35m0 0A7.5 7.5 0 103 10.5a7.5 7.5 0 0013.65 6.15z" />
                      </svg>
                    </div>
                    <input
                      type="text"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Cerca ordini..."
                      className="w-full rounded-lg border border-gray-200 pl-9 pr-8 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-login-bg focus:border-transparent placeholder:text-gray-400"
                    />
                    {query && (
                      <button
                        type="button"
                        onClick={() => setQuery('')}
                        className="absolute inset-y-0 right-0 pr-2 flex items-center text-gray-400 hover:text-gray-600"
                        aria-label="Cancella ricerca"
                      >
                        <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M10 8.586l4.95-4.95a1 1 0 111.414 1.415L11.414 10l4.95 4.95a1 1 0 01-1.414 1.415L10 11.414l-4.95 4.95a1 1 0 01-1.414-1.415L8.586 10l-4.95-4.95A1 1 0 115.05 3.636L10 8.586z" clipRule="evenodd" />
                        </svg>
                      </button>
                    )}
          {/* Modale: Ordini in attesa di pagamento */}
          {pendingModalOpen && createPortal(
            (
              <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                <div
                  className={`absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-200 ${pendingModalVisible ? 'opacity-100' : 'opacity-0'}`}
                  onClick={closePendingModal}
                />
                <div className={`relative bg-white rounded-lg max-w-6xl w-full max-h-[90vh] overflow-hidden transition-all duration-200 ease-out transform ${pendingModalVisible ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 translate-y-1'}`}>
                  <div className="p-4 border-b border-gray-200 flex justify-between items-center">
                    <h2 className="text-lg sm:text-xl font-semibold text-gray-900">Ordini in attesa di pagamento</h2>
                    <button onClick={closePendingModal} className="text-gray-400 hover:text-gray-600" aria-label="Chiudi">
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  <div className="p-4 overflow-y-auto max-h-[calc(90vh-120px)]">
                    {pendingModalLoading ? (
                      <div className="py-8 text-center text-gray-500">Caricamento…</div>
                    ) : pendingOrders.length === 0 ? (
                      <div className="py-8 text-center text-gray-500">Nessun ordine in attesa</div>
                    ) : (
                      <div className="space-y-3">
                        <div className="text-sm text-gray-600">Totale ordini in attesa: <span className="font-semibold text-gray-900">{pendingOrders.length}</span></div>
                        <div className="border border-gray-100 rounded">
                          <table className="min-w-full text-xs sm:text-sm">
                            <thead className="bg-gray-50 text-gray-600">
                              <tr>
                                <th className="text-left px-3 py-2">ID</th>
                                <th className="text-left px-3 py-2">Data</th>
                                <th className="text-left px-3 py-2">Dealer</th>
                                <th className="text-right px-3 py-2">Totale</th>
                                <th className="text-center px-3 py-2">Giorni attesa</th>
                                <th className="text-center px-3 py-2">Stato spedizione</th>
                                <th className="text-right px-3 py-2">Azioni</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {pendingOrders.map((r, i) => {
                                const id = r?.IDOrdine || r?.IDOrdineProdotto || r?.ID;
                                const dataStr = r?.DataOrdine || r?.Data || '-';
                                const giorni = fmtDaysBadge(r?.OreAttesa);
                                const shipped = String(r?.stato_spedizione || r?.Stato_spedizione || '').toLowerCase().includes('sped');
                                return (
                                  <tr key={i}>
                                    <td className="px-3 py-2">#{id || '-'}</td>
                                    <td className="px-3 py-2">{dataStr}</td>
                                    <td className="px-3 py-2">{r?.RagioneSociale || '—'}</td>
                                    <td className="px-3 py-2 text-right">{fmtCurrency(r?.Totale || r?.TotaleOrdine)}</td>
                                    <td className="px-3 py-2 text-center">
                                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ring-1 ${giorni.cls}`}>{giorni.label}g</span>
                                    </td>
                                    <td className="px-3 py-2 text-center">
                                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ring-1 ${shipped ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-gray-50 text-gray-700 ring-gray-200'}`}>
                                        {shipped ? 'Spedito' : 'Non spedito'}
                                      </span>
                                    </td>
                                    <td className="px-3 py-2 text-right">
                                      <div className="inline-flex items-center gap-2">
                                        <button
                                          className="px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 text-gray-700"
                                          onClick={() => openOrderModal(id)}
                                        >Dettagli</button>
                                        <button
                                          className="px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white"
                                          onClick={() => handlePendingSegnaPagato(id)}
                                        >Segna pagato</button>
                                        <button
                                          className="px-2 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white"
                                          onClick={() => handlePendingSegnaSpedito(id)}
                                        >Segna spedito</button>
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="p-3 border-t border-gray-100 flex justify-end">
                    <button onClick={closePendingModal} className="px-3 py-1.5 text-sm rounded bg-gray-100 hover:bg-gray-200 text-gray-700">
                      Chiudi
                    </button>
                  </div>
                </div>
              </div>
            ),
            document.body
          )}
                  </div>
                  {/* Alert ordini in attesa pagamento */}
                  <button
                    type="button"
                    onClick={openPendingModal}
                    className="relative inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs sm:text-sm font-medium bg-red-50 text-red-700 ring-1 ring-red-200 hover:bg-red-100"
                    title="Ordini in attesa pagamento"
                  >
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <path d="M12 22a2 2 0 01-2-2h4a2 2 0 01-2 2zm6-6V11a6 6 0 10-12 0v5l-2 2v1h16v-1l-2-2z" />
                    </svg>
                    <span className="inline-flex items-center justify-center min-w-[1.5rem] h-6 px-2 rounded-full bg-red-600 text-white text-xs">
                      {pendingLoading ? '…' : pendingCount}
                    </span>
                  </button>
                </div>
              </div>
            </div>
            {/* Body con tabella scrollabile */}
            <div className="flex-1 overflow-auto">
              {loading ? (
                <div className="p-6 text-sm text-gray-500">Caricamento…</div>
              ) : error ? (
                <div className="p-6 text-sm text-red-600">{error}</div>
              ) : (
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50 sticky top-0 z-10">
                    <tr>
                      <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Data</th>
                      <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID Ordine</th>
                      <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ragione Sociale</th>
                      <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Totale</th>
                      <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Stato Ordine</th>
                      <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Stato Spedizione</th>
                      <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Note</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-100">
                    {filtered.length === 0 ? (
                      <tr>
                        <td className="px-4 py-6 text-sm text-gray-500" colSpan={7}>Nessun ordine trovato.</td>
                      </tr>
                    ) : (
                      filtered.map((o, idx) => (
                        <tr key={idx} className="hover:bg-gray-50" onClick={() => openOrderModal(o?.IDOrdineProdotto)}>
                          <td className="px-4 py-3 text-sm text-gray-700 cursor-pointer">{o?.Data ?? '-'}</td>
                          <td className="px-4 py-3 text-sm text-gray-700 cursor-pointer">{o?.IDOrdineProdotto ?? '-'}</td>
                          <td className="px-4 py-3 text-sm text-gray-700 cursor-pointer">{o?.RagioneSociale ?? 'Sconosciuto'}</td>
                          <td className="px-4 py-3 text-sm text-gray-700 cursor-pointer">{fmtCurrency(o?.TotaleOrdine)}</td>
                          <td className="px-4 py-3 text-sm cursor-pointer">
                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getOrderStatusBadgeColor(o?.StatoEsteso)}`}>
                              {o?.StatoEsteso ?? '-'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm cursor-pointer">
                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getShippingStatusBadgeColor(o?.Stato_spedizione ?? o?.stato_spedizione ?? o?.StatoSpedizioneEsteso)}`}>
                              {o?.Stato_spedizione ?? o?.stato_spedizione ?? o?.StatoSpedizioneEsteso ?? 'Non Spedito'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-700 truncate max-w-[360px] cursor-pointer" title={o?.NOTE || ''}>{o?.NOTE ?? '-'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </section>

          {/* Modale dettaglio ordine (portal to body per coprire header) */}
          {modalOpen && createPortal(
            (
              <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                {/* Overlay con sfocatura */}
                <div
                  className={`absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-200 ${modalVisible ? 'opacity-100' : 'opacity-0'}`}
                  onClick={closeModal}
                />
                {/* Pannello */}
                <div className={`relative bg-white rounded-lg max-w-5xl w-full max-h-[90vh] overflow-hidden transition-all duration-200 ease-out transform ${modalVisible ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 translate-y-1'}`}>
                  <div className="p-4 border-b border-gray-200 flex justify-between items-center gap-3">
                    <h2 className="text-xl font-semibold text-gray-900">
                      Dettaglio Ordine {selectedOrder?.IDOrdine || selectedOrder?.IDOrdineProdotto ? `#${selectedOrder.IDOrdine || selectedOrder.IDOrdineProdotto}` : ''}
                      {selectedOrder?.RagioneSociale && (
                        <span className="text-base font-normal text-gray-600 ml-2">
                          - {selectedOrder.RagioneSociale}
                        </span>
                      )}
                    </h2>
                    <div className="ml-auto flex items-center gap-2" id="mp-action-buttons">
                      {/* SEGNA COME SPEDITO: nascosto se l'ordine contiene SOLO offerta 446 */}
                      {!hasOnlyOffer446(selectedOrder) && (
                        <button
                          id="btn-mp-spedito"
                          onClick={handleSegnaSpedito}
                          disabled={updatingShip || modalLoading}
                          className={`px-3 py-1.5 text-xs sm:text-sm rounded font-medium text-white shadow-sm transition-colors ${updatingShip ? 'bg-gray-400' : 'bg-blue-600 hover:bg-blue-700'}`}
                          title="Aggiorna stato spedizione a Spedito"
                        >
                          {updatingShip ? 'Aggiornamento…' : 'SEGNA COME SPEDITO'}
                        </button>
                      )}
                      {/* SEGNA COME RICARICATO: visibile solo se ordine contiene offerta 446 */}
                      {hasOffer446(selectedOrder) && (
                        <button
                          id="btn-mp-ricaricato"
                          onClick={handleSegnaRicaricato}
                          disabled={updatingRecharge || modalLoading}
                          className={`px-3 py-1.5 text-xs sm:text-sm rounded font-medium text-white shadow-sm transition-colors ${updatingRecharge ? 'bg-gray-400' : 'bg-violet-600 hover:bg-violet-700'}`}
                          title="Imposta stato spedizione a RICARICATO (26)"
                        >
                          {updatingRecharge ? 'Aggiornamento…' : 'SEGNA COME RICARICATO'}
                        </button>
                      )}
                      {/* SEGNA COME PAGATO: visibile solo se non già pagato */}
                      {!isOrderPaid(selectedOrder) && (
                        <button
                          id="btn-mp-pagato"
                          onClick={handleSegnaPagato}
                          disabled={updatingPaid || modalLoading}
                          className={`px-3 py-1.5 text-xs sm:text-sm rounded font-medium text-white shadow-sm transition-colors ${updatingPaid ? 'bg-gray-400' : 'bg-emerald-600 hover:bg-emerald-700'}`}
                          title="Segna ordine come pagato"
                        >
                          {updatingPaid ? 'Aggiornamento…' : 'SEGNA COME PAGATO'}
                        </button>
                      )}
                      {/* ANNULLA ORDINE: visibile solo se Stato Ordine = 0 e Stato Spedizione = 31 */}
                      {canCancelOrder(selectedOrder) && (
                        <button
                          id="btn-mp-annulla"
                          onClick={handleAnnullaOrdine}
                          disabled={updatingCancel || modalLoading}
                          className={`px-3 py-1.5 text-xs sm:text-sm rounded font-medium text-white shadow-sm transition-colors ${updatingCancel ? 'bg-gray-400' : 'bg-red-600 hover:bg-red-700'}`}
                          title="Annulla ordine"
                        >
                          {updatingCancel ? 'Annullamento…' : 'ANNULLA ORDINE'}
                        </button>
                      )}
                      <button onClick={closeModal} className="ml-1 text-gray-400 hover:text-gray-600" aria-label="Chiudi">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </div>
                  <div className="p-4 overflow-y-auto max-h-[calc(90vh-120px)]">
                    {modalLoading ? (
                      <div className="py-8 text-center text-gray-500">Caricamento dettagli...</div>
                    ) : (
                      <div className="space-y-6">
                        {/* Info principali */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                          <div>
                            <div className="text-xs text-gray-500">Data ordine</div>
                            <div className="text-gray-900">{selectedOrder?.Data ?? '-'}</div>
                          </div>
                          <div>
                            <div className="text-xs text-gray-500">Stato</div>
                            <div className="text-gray-900">{selectedOrder?.StatoEsteso ?? '-'}</div>
                          </div>
                          <div>
                            <div className="text-xs text-gray-500">Importo totale</div>
                            <div className="font-semibold text-gray-900">{fmtCurrency(selectedOrder?.ImportoTotale ?? selectedOrder?.TotaleOrdine)}</div>
                          </div>
                          <div>
                            <div className="text-xs text-gray-500">Metodo pagamento</div>
                            <div className="text-gray-900">{selectedOrder?.MetodoPagamento ?? '-'}</div>
                          </div>
                        </div>

                        {/* Prodotti */}
                        {Array.isArray(getOrderProducts(selectedOrder)) && getOrderProducts(selectedOrder).length > 0 && (
                          <div>
                            <div className="text-xs font-medium text-gray-700 mb-2">Prodotti</div>
                            <div className="border border-gray-100 rounded">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="bg-gray-50 text-gray-600">
                                    <th className="text-left px-2 py-1">Prodotto</th>
                                    <th className="text-left px-2 py-1">Quantità</th>
                                    <th className="text-left px-2 py-1">Prezzo Unitario</th>
                                    <th className="text-left px-2 py-1">Totale</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                  {getOrderProducts(selectedOrder).map((p, i) => (
                                    <tr key={i}>
                                      <td className="px-2 py-1">{p?.Titolo || p?.titolo || '-'}</td>
                                      <td className="px-2 py-1">{p?.Quantita ?? p?.quantita ?? '-'}</td>
                                      <td className="px-2 py-1">{fmtCurrency((p?.PrezzoUnitario ?? p?.CostoUnitario ?? p?.prezzo) ?? 0)}</td>
                                      <td className="px-2 py-1">
                                        {fmtCurrency(((p?.PrezzoUnitario ?? p?.CostoUnitario ?? p?.prezzo) ?? 0) * (p?.Quantita ?? p?.quantita ?? 1))}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}

                        {/* Info aggiuntive */}
                        <div>
                          <div className="text-xs font-medium text-gray-700 mb-2">Informazioni aggiuntive</div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                            <div>
                              <div className="text-xs text-gray-500">Ordinato da</div>
                              <div className="text-gray-800">{selectedOrder?.OrdineDA ?? '-'}</div>
                            </div>
                            <div>
                              <div className="text-xs text-gray-500">Stato spedizione</div>
                              <div className="text-gray-800">{selectedOrder?.StatoSpedizione ?? selectedOrder?.stato_spedizione ?? '-'}</div>
                            </div>
                            <div>
                              <div className="text-xs text-gray-500">Spese spedizione</div>
                              <div className="text-gray-800">{fmtCurrency(selectedOrder?.SpeseSpedizione ?? 0)}</div>
                            </div>
                            <div>
                              <div className="text-xs text-gray-500">Totale ordine</div>
                              <div className="text-gray-800">{fmtCurrency(selectedOrder?.TotaleOrdine)}</div>
                            </div>
                          </div>
                        </div>

                        {/* Foto allegate */}
                        {Array.isArray(selectedOrder?.allegati) && selectedOrder.allegati.length > 0 && (
                          <div>
                            <div className="text-xs font-medium text-gray-700 mb-2">Foto allegate</div>
                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                              {selectedOrder.allegati.map((foto, idx) => {
                                const url = foto?.url;
                                if (!url) return null;
                                const titolo = foto?.nome || `Allegato ${idx + 1}`;
                                const key = foto?.id ?? `${idx}-${url}`;
                                return (
                                  <a
                                    key={key}
                                    href={url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="group block overflow-hidden rounded-lg border border-gray-200 hover:border-blue-300 hover:shadow-sm transition"
                                  >
                                    <div className="aspect-[4/3] bg-gray-100">
                                      <img
                                        src={url}
                                        alt={titolo}
                                        className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                                      />
                                    </div>
                                    <div className="px-2 py-2 text-xs text-gray-600 truncate" title={titolo}>
                                      {titolo}
                                    </div>
                                  </a>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Note */}
                        {(selectedOrder?.NOTE) && (
                          <div>
                            <div className="text-xs font-medium text-gray-700 mb-2">Note</div>
                            <div className="text-sm text-gray-800 bg-gray-50 p-3 rounded whitespace-pre-wrap">
                              {selectedOrder.NOTE}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="p-3 border-t border-gray-100 flex justify-end">
                    <button onClick={closeModal} className="px-3 py-1.5 text-sm rounded bg-gray-100 hover:bg-gray-200 text-gray-700">
                      Chiudi
                    </button>
                  </div>
                </div>
              </div>
            ),
            document.body
          )}
          {/* Card 2: Movimenti Stripe */}
          <section className="bg-white rounded-2xl shadow-sm ring-1 ring-gray-100 h-[42vh] flex flex-col">
            {/* Header */}
            <div className="px-5 py-4 border-b border-gray-100">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-gray-900">Movimenti Stripe</h2>
                <div className="flex items-center gap-3">
                  {/* Results count */}
                  <div className="hidden sm:block text-xs text-gray-500">{filteredMovs.length} risultati</div>
                  {/* Filtro days */}
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={365}
                    placeholder="Giorni"
                    value={days}
                    onChange={(e) => setDays(e.target.value)}
                    className="w-[90px] rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-login-bg focus:border-transparent placeholder:text-gray-400"
                    title="Filtra per ultimi N giorni"
                  />
                  {/* Limit */}
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={200}
                    placeholder="Limit"
                    value={limit}
                    onChange={(e) => setLimit(e.target.value)}
                    className="w-[90px] rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-login-bg focus:border-transparent placeholder:text-gray-400"
                    title="Numero massimo di movimenti"
                  />
                  {/* Search */}
                  <div className="relative w-[220px] sm:w-[260px]">
                    <div className="pointer-events-none absolute inset-y-0 left-0 pl-3 flex items-center">
                      <svg className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-4.35-4.35m0 0A7.5 7.5 0 103 10.5a7.5 7.5 0 0013.65 6.15z" />
                      </svg>
                    </div>
                    <input
                      type="text"
                      value={movQuery}
                      onChange={(e) => setMovQuery(e.target.value)}
                      placeholder="Cerca movimenti..."
                      className="w-full rounded-lg border border-gray-200 pl-9 pr-8 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-login-bg focus:border-transparent placeholder:text-gray-400"
                    />
                    {movQuery && (
                      <button
                        type="button"
                        onClick={() => setMovQuery('')}
                        className="absolute inset-y-0 right-0 pr-2 flex items-center text-gray-400 hover:text-gray-600"
                        aria-label="Cancella ricerca"
                      >
                        <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M10 8.586l4.95-4.95a1 1 0 111.414 1.415L11.414 10l4.95 4.95a1 1 0 01-1.414 1.415L10 11.414l-4.95 4.95a1 1 0 01-1.414-1.415L8.586 10l-4.95-4.95A1 1 0 115.05 3.636L10 8.586z" clipRule="evenodd" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
            {/* Body con tabella scrollabile */}
            <div className="flex-1 overflow-auto">
              {movLoading ? (
                <div className="p-6 text-sm text-gray-500">Caricamento…</div>
              ) : movError ? (
                <div className="p-6 text-sm text-red-600">{movError}</div>
              ) : (
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50 sticky top-0 z-10">
                    <tr>
                      <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Data</th>
                      <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Dealer</th>
                      <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tipo</th>
                      <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Importo</th>
                      <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Valuta</th>
                      <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Descrizione</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-100">
                    {filteredMovs.length === 0 ? (
                      <tr>
                        <td className="px-4 py-6 text-sm text-gray-500" colSpan={6}>Nessun movimento trovato.</td>
                      </tr>
                    ) : (
                      filteredMovs.map((m, idx) => {
                        const tipo = (m?.tipo || '').toUpperCase();
                        const isErogazione = tipo === 'EROGAZIONE';
                        const tipoClass =
                          tipo === 'INCASSO' ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' :
                          tipo === 'EROGAZIONE' ? 'bg-amber-50 text-amber-700 ring-amber-200' :
                          'bg-gray-50 text-gray-700 ring-gray-200';
                        return (
                          <tr 
                            key={idx} 
                            className={`hover:bg-gray-50 ${isErogazione ? 'cursor-pointer' : ''}`}
                            onClick={() => isErogazione && openPayoutModal(m)}
                            title={isErogazione ? 'Clicca per vedere i dettagli del payout' : ''}
                          >
                            <td className="px-4 py-3 text-sm text-gray-700">{m?.data ?? '-'}</td>
                            <td className="px-4 py-3 text-sm text-gray-700">{m?.dealer || '—'}</td>
                            <td className="px-4 py-3 text-sm">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ring-1 ${tipoClass}`}>
                                {tipo || '—'}
                                {isErogazione && <span className="ml-1">👁️</span>}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-700">{fmtAmount(m?.importo)}</td>
                            <td className="px-4 py-3 text-sm text-gray-500">{(m?.valuta || '').toUpperCase()}</td>
                            <td className="px-4 py-3 text-sm text-gray-700 truncate max-w-[420px]" title={m?.descrizione || ''}>{m?.descrizione || '—'}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </section>

          {/* Modale dettagli Payout */}
          {payoutModal.open && createPortal(
            (
              <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                <div
                  className={`absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-200 ${payoutModal.visible ? 'opacity-100' : 'opacity-0'}`}
                  onClick={closePayoutModal}
                />
                <div className={`relative bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden transition-all duration-200 ease-out transform ${payoutModal.visible ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 translate-y-1'}`}>
                  <div className="p-4 border-b border-gray-200 flex justify-between items-center">
                    <h2 className="text-lg sm:text-xl font-semibold text-gray-900">Dettagli Payout Stripe</h2>
                    <button onClick={closePayoutModal} className="text-gray-400 hover:text-gray-600" aria-label="Chiudi">
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  <div className="p-4 overflow-y-auto max-h-[calc(90vh-120px)]">
                    {payoutLoading ? (
                      <div className="py-8 text-center text-gray-500">Caricamento dettagli payout...</div>
                    ) : payoutDetails ? (
                      <div className="space-y-6">
                        {/* Header con importo principale */}
                        <div className="text-center bg-gradient-to-r from-blue-50 to-indigo-50 p-6 rounded-lg">
                          <div className="text-3xl font-bold text-gray-900">{fmtCurrency(payoutDetails.payout.amount)} {payoutDetails.payout.currency}</div>
                          <div className="text-sm text-gray-600 mt-1">Bonifico {payoutDetails.payout.status === 'paid' ? 'Completato' : 'In elaborazione'}</div>
                          <div className="text-xs text-gray-500 mt-1">{payoutDetails.payout.created}</div>
                        </div>

                        {/* Tempistiche */}
                        <div>
                          <h3 className="text-sm font-semibold text-gray-900 mb-3">Tempistiche</h3>
                          <div className="space-y-2">
                            <div className="flex justify-between items-center py-2 border-b border-gray-100">
                              <span className="text-sm text-gray-700">Bonifico completato</span>
                              <span className="text-sm font-medium text-gray-900">{payoutDetails.payout.arrival_date || payoutDetails.payout.created}</span>
                            </div>
                            <div className="flex justify-between items-center py-2 border-b border-gray-100">
                              <span className="text-sm text-gray-700">Pagamento disposto in automatico</span>
                              <span className="text-sm font-medium text-gray-900">{payoutDetails.payout.created}</span>
                            </div>
                          </div>
                        </div>

                        {/* Riepilogo */}
                        <div>
                          <h3 className="text-sm font-semibold text-gray-900 mb-3">Riepilogo</h3>
                          <div className="border border-gray-200 rounded-lg overflow-hidden">
                            <table className="w-full text-sm">
                              <thead className="bg-gray-50">
                                <tr>
                                  <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 uppercase">Tipo</th>
                                  <th className="text-center px-3 py-2 text-xs font-medium text-gray-500 uppercase">Conteggio</th>
                                  <th className="text-right px-3 py-2 text-xs font-medium text-gray-500 uppercase">Lordo</th>
                                  <th className="text-right px-3 py-2 text-xs font-medium text-gray-500 uppercase">Commissioni</th>
                                  <th className="text-right px-3 py-2 text-xs font-medium text-gray-500 uppercase">Totale</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100">
                                <tr>
                                  <td className="px-3 py-2 text-gray-900">Addebiti</td>
                                  <td className="px-3 py-2 text-center text-gray-700">{payoutDetails.riepilogo.addebiti.conteggio}</td>
                                  <td className="px-3 py-2 text-right text-gray-900">{fmtCurrency(payoutDetails.riepilogo.addebiti.lordo)}</td>
                                  <td className="px-3 py-2 text-right text-red-600">-{fmtCurrency(payoutDetails.riepilogo.addebiti.commissioni)}</td>
                                  <td className="px-3 py-2 text-right text-gray-900">{fmtCurrency(payoutDetails.riepilogo.addebiti.totale)}</td>
                                </tr>
                                <tr>
                                  <td className="px-3 py-2 text-gray-900">Rimborsi</td>
                                  <td className="px-3 py-2 text-center text-gray-700">{payoutDetails.riepilogo.rimborsi.conteggio}</td>
                                  <td className="px-3 py-2 text-right text-gray-900">{payoutDetails.riepilogo.rimborsi.lordo}</td>
                                  <td className="px-3 py-2 text-right text-gray-700">{fmtCurrency(payoutDetails.riepilogo.rimborsi.commissioni)}</td>
                                  <td className="px-3 py-2 text-right text-gray-900">{payoutDetails.riepilogo.rimborsi.totale}</td>
                                </tr>
                                <tr>
                                  <td className="px-3 py-2 text-gray-900">Rettifiche</td>
                                  <td className="px-3 py-2 text-center text-gray-700">{payoutDetails.riepilogo.rettifiche.conteggio}</td>
                                  <td className="px-3 py-2 text-right text-gray-900">{fmtCurrency(payoutDetails.riepilogo.rettifiche.lordo)}</td>
                                  <td className="px-3 py-2 text-right text-gray-700">{fmtCurrency(payoutDetails.riepilogo.rettifiche.commissioni)}</td>
                                  <td className="px-3 py-2 text-right text-gray-900">{fmtCurrency(payoutDetails.riepilogo.rettifiche.totale)}</td>
                                </tr>
                                <tr className="bg-blue-50 font-semibold">
                                  <td className="px-3 py-2 text-gray-900">Bonifici</td>
                                  <td className="px-3 py-2 text-center">-</td>
                                  <td className="px-3 py-2 text-right">-</td>
                                  <td className="px-3 py-2 text-right">-</td>
                                  <td className="px-3 py-2 text-right text-blue-700">{fmtCurrency(payoutDetails.payout.amount)}</td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        </div>

                        {/* Transazioni dettagliate */}
                        <div>
                          <h3 className="text-sm font-semibold text-gray-900 mb-3">Transazioni ({payoutDetails.transazioni.length})</h3>
                          <div className="border border-gray-200 rounded-lg overflow-hidden">
                            <table className="w-full text-sm">
                              <thead className="bg-gray-50">
                                <tr>
                                  <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 uppercase">Tipo</th>
                                  <th className="text-right px-3 py-2 text-xs font-medium text-gray-500 uppercase">Lordo</th>
                                  <th className="text-right px-3 py-2 text-xs font-medium text-gray-500 uppercase">Commissione</th>
                                  <th className="text-right px-3 py-2 text-xs font-medium text-gray-500 uppercase">Totale</th>
                                  <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 uppercase">Descrizione</th>
                                  <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 uppercase">Giorno</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100">
                                {payoutDetails.transazioni.map((tx, i) => (
                                  <tr key={i}>
                                    <td className="px-3 py-2">
                                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ring-1 ${
                                        tx.tipo === 'Pagamento' ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' :
                                        tx.tipo === 'Rimborso' ? 'bg-red-50 text-red-700 ring-red-200' :
                                        'bg-gray-50 text-gray-700 ring-gray-200'
                                      }`}>
                                        {tx.tipo}
                                      </span>
                                    </td>
                                    <td className="px-3 py-2 text-right text-gray-900">{fmtCurrency(tx.lordo)}</td>
                                    <td className="px-3 py-2 text-right text-red-600">-{fmtCurrency(tx.commissione)}</td>
                                    <td className="px-3 py-2 text-right text-gray-900">{fmtCurrency(tx.totale)}</td>
                                    <td className="px-3 py-2 text-gray-700 truncate max-w-[200px]" title={tx.descrizione}>{tx.descrizione}</td>
                                    <td className="px-3 py-2 text-gray-500">{tx.data}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>

                        {/* Dettagli tecnici */}
                        <div>
                          <h3 className="text-sm font-semibold text-gray-900 mb-3">Dettagli Tecnici</h3>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                            <div className="bg-gray-50 p-3 rounded">
                              <div className="text-xs text-gray-500 mb-1">ID Payout</div>
                              <div className="font-mono text-gray-900 break-all">{payoutDetails.payout.id}</div>
                            </div>
                            <div className="bg-gray-50 p-3 rounded">
                              <div className="text-xs text-gray-500 mb-1">Metodo</div>
                              <div className="text-gray-900 capitalize">{payoutDetails.payout.method || 'standard'}</div>
                            </div>
                            <div className="bg-gray-50 p-3 rounded">
                              <div className="text-xs text-gray-500 mb-1">Automatico</div>
                              <div className="text-gray-900">{payoutDetails.payout.automatic ? 'Sì' : 'No'}</div>
                            </div>
                            <div className="bg-gray-50 p-3 rounded">
                              <div className="text-xs text-gray-500 mb-1">Tipo</div>
                              <div className="text-gray-900 capitalize">{payoutDetails.payout.type || 'bank_account'}</div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="py-8 text-center text-gray-500">Errore nel caricamento dei dettagli</div>
                    )}
                  </div>
                  <div className="p-3 border-t border-gray-100 flex justify-end">
                    <button onClick={closePayoutModal} className="px-3 py-1.5 text-sm rounded bg-gray-100 hover:bg-gray-200 text-gray-700">
                      Chiudi
                    </button>
                  </div>
                </div>
              </div>
            ),
            document.body
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
