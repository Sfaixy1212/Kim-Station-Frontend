import { useEffect, useState, useCallback } from 'react';
import { getProtectedData } from '../../services/api';
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
      s.includes('PAGATO') || 
      s.includes('CONSEGNATO') || 
      s.includes('SUCCESS')) {
    return 'bg-green-100 text-green-800';
  }
  
  // Stati ROSSI
  if (s.includes('CLIENTE_NON_ACQUISIBILE') || 
      s.includes('ANNULLATO') ||
      s.includes('ERRORE') || 
      s.includes('KO') || 
      s.includes('FAILED') ||
      s.includes('RIFIUTATO')) {
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
      s.includes('ATTESA') || 
      s.includes('PREPARAZIONE') || 
      s.includes('PENDING') || 
      s.includes('PROCESS')) {
    return 'bg-yellow-100 text-yellow-800';
  }
  
  return 'bg-gray-100 text-gray-800';
}

function formatDate(val) {
  if (!val) return '-';
  try {
    const d = new Date(val);
    if (!isNaN(d.getTime())) {
      const dd = String(d.getDate()).padStart(2, '0');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const yyyy = d.getFullYear();
      return `${dd}/${mm}/${yyyy}`;
    }
  } catch {}
  if (typeof val === 'string') {
    const s = val.trim();
    const m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
    if (m) {
      const a = parseInt(m[1], 10);
      const b = parseInt(m[2], 10);
      const y = m[3];
      if (a <= 12 && b > 12) return `${String(b).padStart(2, '0')}/${String(a).padStart(2, '0')}/${y}`;
      return `${String(a).padStart(2, '0')}/${String(b).padStart(2, '0')}/${y}`;
    }
  }
  return String(val);
}

export default function RecentOrders() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const { user } = useAuth();
  const role = (user?.role || '').toString().toLowerCase();
  const isAgent = role === 'agente' || role === 'agent';
  const apiPrefix = isAgent ? '/agente' : '/dealer';

  // Modale elenco completo per Agente ("Vedi tutti")
  const [listOpen, setListOpen] = useState(false);
  const [listVisible, setListVisible] = useState(false);
  const [listRows, setListRows] = useState([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState('');
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  const fetchOrders = useCallback(async () => {
    try {
      setLoading(true);
      const listPath = isAgent ? `${apiPrefix}/ultimi-ordini-agente` : `${apiPrefix}/ultimi-ordini`;
      const res = await getProtectedData(listPath);
      // Normalizza varie forme di risposta
      const raw = res?.data?.data ?? res?.data?.items ?? res?.data ?? res?.items ?? res;
      const data = Array.isArray(raw) ? raw : [];
      try { console.debug('[UltimiOrdini] path:', listPath, 'items:', data.length, 'keys:', data[0] ? Object.keys(data[0]) : []); } catch {}
      const fmtEUR = (n) => typeof n === 'number' ? new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(n) : (n ?? '-');
      const mapped = data.map((item, idx) => {
        if (isAgent) {
          return {
            id: item.IDOrdine ?? item.IDOrdineProdotto ?? item.id ?? null,
            date: item.Data ?? '-',
            product: item.Dealer ?? item.Inserimento ?? '-',
            type: item.TipoProdotto ?? '-',
            amount: fmtEUR(item.Importo),
            status: item.Stato ?? '-',
          };
        }
        return {
          id: item.IDOrdine ?? item.IDOrdineProdotto ?? item.id ?? idx,
          date: formatDate(item.Data ?? item.DataOra ?? item.date ?? '-'),
          product: item.Prodotto ?? item.Titolo ?? item.product ?? '-',
          type: item.Tipo ?? item.type ?? '-',
          amount: fmtEUR(item.Importo ?? item.ImportoTotale ?? item.amount),
          status: item.Stato ?? item.StatoEsteso ?? item.status ?? '-',
        };
      });
      setRows(mapped.slice(0, 10));
    } catch (e) {
      console.error('Errore fetch ultimi ordini:', e);
      setError(e.message || 'Errore di caricamento');
    } finally {
      setLoading(false);
    }
  }, [apiPrefix, isAgent]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // Refetch automatico dopo un pagamento concluso
  useEffect(() => {
    const onPaid = () => fetchOrders();
    window.addEventListener('order-paid', onPaid);
    return () => window.removeEventListener('order-paid', onPaid);
  }, [fetchOrders]);

  const handleRowClick = async (orderId) => {
    try {
      setModalLoading(true);
      setModalOpen(true);
      // attiva animazione dopo il mount
      setTimeout(() => setModalVisible(true), 0);
      const detail = await getProtectedData(`${apiPrefix}/ordine-prodotto/${orderId}`);
      setSelectedOrder(detail);
    } catch (e) {
      console.error('Errore recupero dettaglio ordine:', e);
      alert('Errore nel caricamento del dettaglio ordine');
    } finally {
      setModalLoading(false);
    }
  };

  const closeModal = () => {
    // anima chiusura e poi smonta e pulisci stato
    setModalVisible(false);
    setTimeout(() => {
      setModalOpen(false);
      setSelectedOrder(null);
    }, 200);
  };

  // Apertura modale elenco ordini filtrati per mese (solo Agente)
  const openAgentOrdersList = useCallback(async (month = selectedMonth) => {
    if (!isAgent) return;
    setListOpen(true);
    setTimeout(() => setListVisible(true), 0);
    setListError('');
    setListLoading(true);
    try {
      const agentName = (user?.agentenome || user?.name || '').toString();
      const [year, monthNum] = month.split('-');
      const qs = new URLSearchParams({ 
        year, 
        month: monthNum,
        ...(agentName ? { agentenome: agentName } : {}) 
      }).toString();
      // Endpoint principale per agente con filtro mese
      let res = await getProtectedData(`${apiPrefix}/ultimi-ordini-agente?${qs}`);
      // La risposta è direttamente un array
      let data = Array.isArray(res) ? res : (Array.isArray(res?.data) ? res.data : []);
      console.log('[RecentOrders] Ordini ricevuti per', month, ':', data.length);
      // Fallback generico
      if (!data || data.length === 0) {
        try {
          res = await getProtectedData(`${apiPrefix}/ultimi-ordini?${qs}`);
          data = Array.isArray(res) ? res : (Array.isArray(res?.data) ? res.data : []);
        } catch {}
      }
      const fmtEUR = (n) => typeof n === 'number' ? new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(n) : (n ?? '-');
      const findByRegexKey = (obj, reArr) => {
        if (!obj) return undefined;
        const keys = Object.keys(obj);
        for (const re of reArr) {
          const k = keys.find((kk) => re.test(kk));
          if (k && obj[k] != null) return obj[k];
        }
        return undefined;
      };
      const mapped = (data || []).map((item, idx) => {
        const id = item.IDOrdine ?? item.IDOrdineProdotto ?? item.id ?? idx;
        // Usa DataOraCompleta (ISO) per evitare ambiguità nel formato data
        const date = formatDate(item.DataOraCompleta ?? item.DataOra ?? item.Data ?? item.createdAt ?? findByRegexKey(item, [/^data/i, /data.?ordine/i, /created/i]));
        const dealer = item.Dealer ?? item.RagioneSociale ?? item.OrdineDA ?? findByRegexKey(item, [/dealer|ragione.?sociale|ordinato.?da/i]) ?? '-';
        const product = item.Prodotto ?? item.Titolo ?? item.NomeProdotto ?? item.Inserimento ?? '-';
        const type = item.TipoProdotto ?? item.Tipo ?? item.type ?? '-';
        const amount = fmtEUR(item.Importo ?? item.ImportoTotale ?? item.amount);
        const status = item.Stato ?? item.StatoEsteso ?? item.status ?? '-';
        return { id, date, dealer, product, type, amount, status };
      });
      const finalRows = mapped.slice(0, 100);
      console.log('[RecentOrders] Settando listRows con', finalRows.length, 'elementi');
      console.log('[RecentOrders] Primi 3:', finalRows.slice(0, 3));
      setListRows(finalRows);
    } catch (e) {
      setListError(e?.message || 'Errore nel caricamento');
    } finally {
      setListLoading(false);
    }
  }, [apiPrefix, isAgent, user?.agentenome, user?.name, selectedMonth]);

  const closeAgentOrdersList = () => {
    setListVisible(false);
    setTimeout(() => setListOpen(false), 200);
    setListRows([]);
    setListError('');
    setListLoading(false);
  };

  return (
    <div className="bg-white rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 flex items-center">
          Ultimi Ordini
        </h3>
        <button
          className="text-sm text-primary-600 hover:text-primary-700 font-medium"
          onClick={() => { if (isAgent) { openAgentOrdersList(); } }}
          aria-label="Vedi tutti gli ordini"
        >
          Vedi tutti
        </button>
      </div>

      {loading && (
        <div className="py-6 text-sm text-gray-500">Caricamento…</div>
      )}
      {error && !loading && (
        <div className="py-6 text-sm text-red-600">{error}</div>
      )}
      {!loading && !error && (
        <div className="overflow-x-auto -mx-4 sm:mx-0">
          <table className="min-w-[760px] sm:min-w-full table-fixed">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left py-2 px-2 text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                  Data
                </th>
                <th className="text-left py-2 px-2 text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                  {isAgent ? 'Dealer' : 'Prodotto'}
                </th>
                <th className="text-left py-2 px-2 text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                  Tipo
                </th>
                <th className="text-left py-2 px-2 text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                  Importo
                </th>
                <th className="text-left py-2 px-2 text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                  Stato
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-sm text-gray-500">Nessun ordine trovato</td>
                </tr>
              ) : (
                rows.map((order) => {
                  const clickable = Boolean(order.id);
                  return (
                    <tr
                      key={order.id ?? `${order.date}-${order.product}-${order.amount}`}
                      className={`hover:bg-gray-50 transition-colors ${clickable ? 'cursor-pointer' : 'cursor-default'}`}
                      onClick={() => clickable && handleRowClick(order.id)}
                    >
                      <td className="py-2 px-2 text-sm text-gray-900 whitespace-nowrap">
                        {order.date}
                      </td>
                      <td className="py-2 px-2 text-sm text-gray-900 max-w-[220px] truncate">
                        {order.product}
                      </td>
                      <td className="py-2 px-2 text-sm text-gray-600 whitespace-nowrap">
                        <span className="bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap">
                          {order.type}
                        </span>
                      </td>
                      <td className="py-2 px-2 text-sm font-semibold text-gray-900 whitespace-nowrap">
                        {order.amount}
                      </td>
                      <td className="py-2 px-2 text-sm whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${getStatusColor(order.status)}`}>
                          {order.status}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Modale Dettaglio Ordine con animazione e blur */}
      {/* Modale elenco ultimi 20 ordini (solo Agente) */}
      {listOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
          <div
            className={`absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-200 ${listVisible ? 'opacity-100' : 'opacity-0'}`}
            onClick={closeAgentOrdersList}
          />
          <div className={`relative bg-white rounded-lg max-w-5xl w-full max-h-[90vh] overflow-hidden transition-all duration-200 ease-out transform ${listVisible ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 translate-y-1'}`}>
            <div className="p-4 border-b border-gray-200">
              <div className="flex justify-between items-center mb-3">
                <h2 className="text-base font-semibold text-gray-900">Ordini Scuderia Agente</h2>
                <button onClick={closeAgentOrdersList} className="text-gray-400 hover:text-gray-600" aria-label="Chiudi">✕</button>
              </div>
              <div className="flex items-center gap-2">
                <label htmlFor="month-filter" className="text-sm text-gray-600">Filtra per mese:</label>
                <select
                  id="month-filter"
                  value={selectedMonth}
                  onChange={(e) => {
                    setSelectedMonth(e.target.value);
                    openAgentOrdersList(e.target.value);
                  }}
                  className="px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {(() => {
                    const options = [];
                    const now = new Date();
                    for (let i = 0; i < 12; i++) {
                      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                      const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                      const label = d.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
                      options.push(<option key={value} value={value}>{label.charAt(0).toUpperCase() + label.slice(1)}</option>);
                    }
                    return options;
                  })()}
                </select>
              </div>
            </div>
            <div className="p-4 overflow-y-auto max-h-[calc(90vh-120px)]">
              {listLoading && (
                <div className="space-y-2">{[...Array(4)].map((_, i) => (<div key={i} className="h-5 bg-gray-100 rounded animate-pulse" />))}</div>
              )}
              {listError && !listLoading && (
                <div className="text-sm text-red-600 flex items-center justify-between">
                  <span>{listError}</span>
                  <button onClick={openAgentOrdersList} className="ml-3 px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs">Riprova</button>
                </div>
              )}
              {!listLoading && !listError && (
                <div className="overflow-x-auto">
                  {console.log('[RecentOrders RENDER] listRows.length:', listRows.length, 'listLoading:', listLoading, 'listError:', listError)}
                  <table className="min-w-[880px] sm:min-w-full table-fixed">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="text-left py-2 px-2 text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Data</th>
                        <th className="text-left py-2 px-2 text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Dealer</th>
                        <th className="text-left py-2 px-2 text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Prodotto</th>
                        <th className="text-left py-2 px-2 text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Tipo</th>
                        <th className="text-left py-2 px-2 text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Importo</th>
                        <th className="text-left py-2 px-2 text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Stato</th>
                        <th className="py-2 px-2 text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Azione</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {listRows.length === 0 ? (
                        <tr><td colSpan={7} className="py-6 text-center text-sm text-gray-500">Nessun ordine trovato</td></tr>
                      ) : (
                        listRows.map((r, idx) => (
                          <tr key={(r.id ?? idx) + ''}>
                            <td className="py-2 px-2 text-sm text-gray-900 whitespace-nowrap">{r.date}</td>
                            <td className="py-2 px-2 text-sm text-gray-700 whitespace-nowrap">{r.dealer}</td>
                            <td className="py-2 px-2 text-sm text-gray-900 truncate max-w-[260px]">{r.product}</td>
                            <td className="py-2 px-2 text-sm text-gray-600 whitespace-nowrap">{r.type}</td>
                            <td className="py-2 px-2 text-sm font-semibold text-gray-900 whitespace-nowrap">{r.amount}</td>
                            <td className="py-2 px-2 text-sm whitespace-nowrap"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(r.status)}`}>{r.status}</span></td>
                            <td className="py-2 px-2 text-sm whitespace-nowrap">
                              {r.id ? (
                                <button
                                  type="button"
                                  className="px-2 py-1 rounded bg-blue-600 text-white text-xs hover:bg-blue-700"
                                  onClick={() => { closeAgentOrdersList(); handleRowClick(r.id); }}
                                >
                                  Apri
                                </button>
                              ) : (
                                <span className="text-gray-400 text-xs">—</span>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div className="p-3 border-t border-gray-100 flex justify-end">
              <button onClick={closeAgentOrdersList} className="px-3 py-1.5 text-sm rounded bg-gray-100 hover:bg-gray-200 text-gray-700">Chiudi</button>
            </div>
          </div>
        </div>
      )}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Overlay con sfocatura */}
          <div
            className={`absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-200 ${modalVisible ? 'opacity-100' : 'opacity-0'}`}
            onClick={closeModal}
          />
          {/* Pannello con transizione */}
          <div className={`relative bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden transition-all duration-200 ease-out transform ${modalVisible ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 translate-y-1'}`}>
            <div className="p-4 border-b border-gray-200 flex justify-between items-center">
              <h2 className="text-xl font-semibold text-gray-900">
                Dettaglio Ordine {selectedOrder?.IDOrdine ? `#${selectedOrder.IDOrdine}` : ''}
              </h2>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-4 overflow-y-auto max-h-[calc(90vh-120px)]">
              {modalLoading ? (
                <div className="py-8 text-center text-gray-500">Caricamento dettagli...</div>
              ) : (
                <div className="space-y-6">
                  {/* Informazioni principali */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div>
                      <div className="text-xs text-gray-500">Data ordine</div>
                      <div className="text-sm text-gray-900">{formatDate(selectedOrder.DataOra)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">Stato</div>
                      <div className="text-sm text-gray-900">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(selectedOrder.StatoEsteso)}`}>
                          {selectedOrder.StatoEsteso || '-'}
                        </span>
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">Importo totale</div>
                      <div className="text-sm font-semibold text-gray-900">
                        {typeof selectedOrder.ImportoTotale === 'number' 
                          ? new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(selectedOrder.ImportoTotale)
                          : (selectedOrder.ImportoTotale || '-')}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">Metodo pagamento</div>
                      <div className="text-sm text-gray-900">{selectedOrder.MetodoPagamento || '-'}</div>
                    </div>
                  </div>

                  {/* Prodotti */}
                  {Array.isArray(selectedOrder.Prodotti) && selectedOrder.Prodotti.length > 0 && (
                    <div>
                      <div className="text-xs font-medium text-gray-700 mb-2">Prodotti</div>
                      <div className="border border-gray-100 rounded">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="bg-gray-50 text-gray-600">
                              <th className="text-left px-2 py-1">Prodotto</th>
                              <th className="text-left px-2 py-1">Tipo</th>
                              <th className="text-left px-2 py-1">Quantità</th>
                              <th className="text-left px-2 py-1">Prezzo Unitario</th>
                              <th className="text-left px-2 py-1">Totale</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {selectedOrder.Prodotti.map((p, i) => (
                              <tr key={i}>
                                <td className="px-2 py-1">{p.Titolo || p.Nome || '-'}</td>
                                <td className="px-2 py-1">{p.Tipo || '-'}</td>
                                <td className="px-2 py-1">{p.Quantita || 1}</td>
                                <td className="px-2 py-1">
                                  {typeof p.PrezzoUnitario === 'number' 
                                    ? new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(p.PrezzoUnitario)
                                    : (p.CostoUnitario ? new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(p.CostoUnitario) : '-')}
                                </td>
                                <td className="px-2 py-1">
                                  {typeof p.PrezzoUnitario === 'number' && typeof p.Quantita === 'number'
                                    ? new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(p.PrezzoUnitario * p.Quantita)
                                    : (p.CostoUnitario && p.Quantita ? new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(p.CostoUnitario * p.Quantita) : '-')}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Dati spedizione */}
                  <div>
                    <div className="text-xs font-medium text-gray-700 mb-2">Informazioni aggiuntive</div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                      <div>
                        <div className="text-xs text-gray-500">Ordinato da</div>
                        <div className="text-gray-800">{selectedOrder.OrdineDA || '-'}</div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-500">Stato spedizione</div>
                        <div className="text-gray-800">{selectedOrder.stato_spedizione || '-'}</div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-500">Spese spedizione</div>
                        <div className="text-gray-800">
                          {typeof selectedOrder.SpeseSpedizione === 'number' 
                            ? new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(selectedOrder.SpeseSpedizione)
                            : (selectedOrder.SpeseSpedizione || '0,00 €')}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-500">Totale ordine</div>
                        <div className="text-gray-800">
                          {typeof selectedOrder.TotaleOrdine === 'number' 
                            ? new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(selectedOrder.TotaleOrdine)
                            : (selectedOrder.TotaleOrdine || '-')}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Note */}
                  {(selectedOrder.NoteOrdine || selectedOrder.Note4Dealer || selectedOrder.NoteInterne) && (
                    <div>
                      <div className="text-xs font-medium text-gray-700 mb-2">Note</div>
                      <div className="text-sm text-gray-800 bg-gray-50 p-3 rounded space-y-2">
                        {selectedOrder.NoteOrdine && (
                          <div>
                            <div className="text-xs font-medium text-gray-600">Note ordine:</div>
                            <div>{selectedOrder.NoteOrdine}</div>
                          </div>
                        )}
                        {selectedOrder.Note4Dealer && (
                          <div>
                            <div className="text-xs font-medium text-gray-600">Note per dealer:</div>
                            <div>{selectedOrder.Note4Dealer}</div>
                          </div>
                        )}
                        {selectedOrder.NoteInterne && (
                          <div>
                            <div className="text-xs font-medium text-gray-600">Note interne:</div>
                            <div>{selectedOrder.NoteInterne}</div>
                          </div>
                        )}
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
      )}
    </div>
  );
}
