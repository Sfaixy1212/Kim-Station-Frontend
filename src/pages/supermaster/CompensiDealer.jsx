import { useState, useEffect, useMemo } from 'react';
import {
  Search,
  Calendar,
  FileText,
  Users,
  Euro,
  TrendingUp,
  ChevronDown,
  ChevronRight,
  Info,
  AlertCircle,
  X,
  Loader2
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import SuperMasterTopbar from '../../components/supermaster/Topbar';

export default function CompensiDealer() {
  const { user } = useAuth();
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [selectedDealer, setSelectedDealer] = useState(null);
  const [dealerSearch, setDealerSearch] = useState('');
  const [dealerOptions, setDealerOptions] = useState([]);
  const [showDealerDropdown, setShowDealerDropdown] = useState(false);
  const [compensiData, setCompensiData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [openSegments, setOpenSegments] = useState({});
  const [openCategories, setOpenCategories] = useState({});
  const [drawerState, setDrawerState] = useState({
    open: false,
    bucket: null,
    bucketOriginale: null,
    data: [],
    loading: false,
    error: '',
    page: 1,
    search: '',
    totaleEuro: 0
  });

  const PAGE_SIZE = 50;

  const formatCurrency = (value) => {
    const num = Number(value || 0);
    return num.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });
  };

  const formatDate = (value) => {
    if (!value) return '-';
    try {
      const dt = new Date(value);
      if (!Number.isNaN(dt.getTime())) {
        return dt.toLocaleDateString('it-IT');
      }
      return value;
    } catch {
      return value;
    }
  };

  const getAmbitoBadgeClasses = (ambito, valore) => {
    const negative = Number(valore) < 0;
    switch (ambito) {
      case 'ANTICIPO':
        return 'border-red-200 bg-red-50 text-red-700';
      case 'CESSIONE_SIM':
        return 'border-amber-200 bg-amber-50 text-amber-700';
      default:
        if (negative) return 'border-red-200 bg-red-50 text-red-700';
        return 'border-blue-200 bg-blue-50 text-blue-700';
    }
  };

  const updateUrlSegments = (segmentsMap) => {
    try {
      const params = new URLSearchParams(window.location.search);
      const openSegs = Object.entries(segmentsMap)
        .filter(([, isOpen]) => isOpen)
        .map(([segment]) => segment)
        .join(',');
      if (openSegs) {
        params.set('seg', openSegs);
      } else {
        params.delete('seg');
      }
      const newQuery = params.toString();
      const newUrl = `${window.location.pathname}${newQuery ? `?${newQuery}` : ''}`;
      window.history.replaceState({}, '', newUrl);
    } catch (err) {
      console.warn('Impossibile aggiornare querystring segmenti', err);
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const segParam = params.get('seg');
    if (segParam) {
      const next = {};
      segParam.split(',').forEach((seg) => {
        if (seg) next[seg] = true;
      });
      setOpenSegments(next);
    }
  }, []);

  // Carica lista dealer per autocompletamento
  useEffect(() => {
    const fetchDealers = async () => {
      try {
        const response = await fetch('/api/supermaster/compensi-dealer/dealers', {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        });
        if (response.ok) {
          const data = await response.json();
          setDealerOptions(data.dealers || []);
        }
      } catch (err) {
        console.error('Errore caricamento dealer:', err);
      }
    };
    fetchDealers();
  }, []);

  // Filtra dealer in base alla ricerca
  const filteredDealers = dealerOptions.filter(dealer =>
    dealer.ragioneSociale?.toLowerCase().includes(dealerSearch.toLowerCase()) ||
    dealer.agente?.toLowerCase().includes(dealerSearch.toLowerCase()) ||
    dealer.citta?.toLowerCase().includes(dealerSearch.toLowerCase()) ||
    dealer.provincia?.toLowerCase().includes(dealerSearch.toLowerCase())
  );

  // Seleziona dealer
  const handleDealerSelect = (dealer) => {
    setSelectedDealer(dealer);
    setDealerSearch(dealer.ragioneSociale);
    setShowDealerDropdown(false);
  };

  // Cerca compensi
  const handleSearch = async () => {
    if (!selectedDealer) {
      setError('Seleziona un dealer');
      return;
    }

    setLoading(true);
    setError('');
    
    try {
      const monthStart = `${selectedMonth}-01`;
      const response = await fetch('/api/supermaster/compensi-dealer', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          monthStart,
          dealerId: selectedDealer.idDealer
        })
      });

      if (response.ok) {
        const data = await response.json();
        console.log('[COMPENSI DEALER] Risposta API:', data);
        setCompensiData(data);
        // Reset drawer & accordions
        setDrawerState((prev) => ({
          ...prev,
          open: false,
          bucket: null,
          bucketOriginale: null,
          data: [],
          error: '',
          page: 1,
          search: '',
          totaleEuro: 0
        }));
      } else {
        const errorData = await response.json();
        console.error('[COMPENSI DEALER] Errore API:', errorData);
        setError(errorData.message || 'Errore nel caricamento dei compensi');
      }
    } catch (err) {
      setError('Errore di connessione');
      console.error('Errore ricerca compensi:', err);
    } finally {
      setLoading(false);
    }
  };

  // Genera Invito a Fatturare
  const handleGeneraInvito = async () => {
    if (!compensiData || !selectedDealer) return;

    try {
      setLoading(true);

      // Prepara i dati per l'invito a fatturare
      const legacySegmenti = (compensiData.grouped || []).map((segmento) => ({
        nome: segmento.segmento,
        categorie: segmento.categorie.flatMap((categoria) =>
          categoria.buckets.map((bucket) => ({
            nome: categoria.categoria,
            bucket: bucket.bucket,
            qty: bucket.qtyTotale,
            importoPerPezzo:
              (bucket.rows.find((row) => row.ambito === 'TLC')?.importoPerPezzo ??
                bucket.rows[0]?.importoPerPezzo ??
                0),
            euroCalcolati: bucket.totale,
            note: bucket.rows[0]?.note || ''
          }))
        )
      }));

      const invitoData = {
        dealer: {
          ragioneSociale: selectedDealer.ragioneSociale,
          indirizzo: selectedDealer.indirizzo || '',
          cap: selectedDealer.cap || '',
          citta: selectedDealer.citta || '',
          provincia: selectedDealer.provincia || '',
          piva: selectedDealer.piva || '',
          agente: selectedDealer.agente || ''
        },
        intestatario: {
          ragioneSociale: 'KIM srls',
          indirizzo: 'Via Appia, 322/324',
          cap: '72100',
          citta: 'Brindisi',
          provincia: 'BR',
          piva: '02567150749',
          codiceFiscale: '02567150749',
          codiceDestinatario: 'M5UXCR1'
        },
        compensi: {
          mese: new Date(selectedMonth + '-01').toLocaleDateString('it-IT', { 
            month: 'long', 
            year: 'numeric' 
          }),
          totaleCompensi: compensiData.totaleCompensi,
          totaleAttivazioni: compensiData.totaleAttivazioni,
          segmenti: legacySegmenti,
          dettagli: compensiData.dettagli || []
        },
        dataGenerazione: new Date().toLocaleDateString('it-IT'),
        numeroProgressivo: `INV-${selectedDealer.idDealer}-${selectedMonth.replace('-', '')}`
      };

      // Chiamata API per generare il PDF
      const response = await fetch('/api/supermaster/compensi-dealer/genera-invito', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(invitoData)
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success && result.downloadUrl) {
          // Apre il PDF in una nuova finestra per il download
          window.open(result.downloadUrl, '_blank');
          
          // Mostra messaggio di successo
          console.log('Invito a fatturare generato:', result.filename);
        } else {
          setError(result.message || 'Errore nella generazione dell\'invito');
        }
      } else {
        const errorData = await response.json();
        setError(errorData.message || 'Errore nella generazione dell\'invito');
      }
    } catch (err) {
      setError('Errore di connessione durante la generazione dell\'invito');
      console.error('Errore generazione invito:', err);
    } finally {
      setLoading(false);
    }
  };

  const totalePerAmbito = useMemo(() => compensiData?.totaliPerAmbito || [], [compensiData]);

  useEffect(() => {
    if (!compensiData?.grouped) return;
    setOpenSegments((prev) => {
      const next = { ...prev };
      let dirty = false;
      compensiData.grouped.forEach((segmento) => {
        if (next[segmento.segmento] === undefined) {
          next[segmento.segmento] = true;
          dirty = true;
        }
      });
      if (dirty) updateUrlSegments(next);
      return next;
    });

    setOpenCategories((prev) => {
      const next = { ...prev };
      compensiData.grouped.forEach((segmento) => {
        segmento.categorie.forEach((categoria) => {
          const key = `${segmento.segmento}|${categoria.categoria}`;
          if (next[key] === undefined) {
            next[key] = true;
          }
        });
      });
      return next;
    });
  }, [compensiData]);

  const toggleSegment = (segmento) => {
    setOpenSegments((prev) => {
      const next = { ...prev, [segmento]: !prev[segmento] };
      updateUrlSegments(next);
      return next;
    });
  };

  const toggleCategoria = (segmento, categoria) => {
    const key = `${segmento}|${categoria}`;
    setOpenCategories((prev) => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const openDrawer = async (bucket, bucketOriginale) => {
    if (!selectedDealer) return;
    setDrawerState((prev) => ({
      ...prev,
      open: true,
      bucket,
      bucketOriginale,
      loading: true,
      error: '',
      data: [],
      page: 1,
      search: ''
    }));

    try {
      const params = new URLSearchParams({
        monthStart: `${selectedMonth}-01`,
        dealerId: selectedDealer.idDealer,
        bucket
      });
      const response = await fetch(`/api/supermaster/compensi-dealer/attivazioni?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`
        }
      });
      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.message || 'Errore nel recupero attivazioni');
      }
      const data = await response.json();
      setDrawerState((prev) => ({
        ...prev,
        loading: false,
        data: data.attivazioni || [],
        totaleEuro: data.totaleEuro ?? 0
      }));
    } catch (err) {
      console.error('[COMPENSI DEALER] Drill-down error:', err);
      setDrawerState((prev) => ({
        ...prev,
        loading: false,
        error: err.message || 'Errore inatteso durante il caricamento delle attivazioni'
      }));
    }
  };

  const closeDrawer = () => {
    setDrawerState((prev) => ({
      ...prev,
      open: false,
      bucket: null,
      bucketOriginale: null,
      data: [],
      error: '',
      search: '',
      page: 1,
      totaleEuro: 0
    }));
  };

  const filteredActivations = useMemo(() => {
    if (!drawerState.search) return drawerState.data;
    const query = drawerState.search.toLowerCase();
    return drawerState.data.filter((row) =>
      [
        row.activationKey,
        row.mnpOperator,
        row.numeroPratica,
        row.numeroOrdine,
        row.sottoVoce
      ]
        .filter(Boolean)
        .some((field) => field.toLowerCase().includes(query))
    );
  }, [drawerState.data, drawerState.search]);

  const totalActivationPages = Math.max(1, Math.ceil(filteredActivations.length / PAGE_SIZE));
  const paginatedActivations = filteredActivations.slice(
    (drawerState.page - 1) * PAGE_SIZE,
    drawerState.page * PAGE_SIZE
  );

  useEffect(() => {
    setDrawerState((prev) => ({ ...prev, page: 1 }));
  }, [drawerState.search]);

  const renderBadge = (text, classes) => (
    <span className={`inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full border ${classes}`}>
      {text}
    </span>
  );

  return (
    <>
      <SuperMasterTopbar />
      <div className="min-h-screen bg-gray-50 p-4 sm:p-6 lg:p-8">
        <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Compensi Dealer</h1>
          <p className="text-gray-600">Calcola e visualizza i compensi per dealer specifico</p>
        </div>

        {/* Filtri di ricerca */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Selezione Mese */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Calendar className="inline w-4 h-4 mr-1" />
                Mese
              </label>
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {/* Ricerca Dealer */}
            <div className="relative">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Users className="inline w-4 h-4 mr-1" />
                Dealer
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={dealerSearch}
                  onChange={(e) => {
                    setDealerSearch(e.target.value);
                    setShowDealerDropdown(true);
                    if (!e.target.value) setSelectedDealer(null);
                  }}
                  onFocus={() => setShowDealerDropdown(true)}
                  placeholder="Cerca dealer..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-10"
                />
                <Search className="absolute right-3 top-2.5 w-4 h-4 text-gray-400" />
                
                {/* Dropdown dealer */}
                {showDealerDropdown && filteredDealers.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-auto">
                    {filteredDealers.slice(0, 10).map((dealer) => (
                      <div
                        key={dealer.idDealer}
                        onClick={() => handleDealerSelect(dealer)}
                        className="px-3 py-2 hover:bg-gray-100 cursor-pointer border-b border-gray-100 last:border-b-0"
                      >
                        <div className="font-medium text-gray-900">{dealer.ragioneSociale}</div>
                        <div className="text-sm text-gray-500 flex items-center justify-between">
                          <span>Agente: {dealer.agente || 'N/A'}</span>
                          <span>{dealer.citta} ({dealer.provincia})</span>
                        </div>
                        <div className="text-xs text-gray-400">ID: {dealer.idDealer}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Pulsante Cerca */}
            <div className="flex items-end">
              <button
                onClick={handleSearch}
                disabled={loading || !selectedDealer}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Caricamento...
                  </>
                ) : (
                  <>
                    <Search className="w-4 h-4" />
                    Cerca
                  </>
                )}
              </button>
            </div>
          </div>

          {error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md">
              <p className="text-red-600 text-sm">{error}</p>
            </div>
          )}
        </div>

        {/* Risultati */}
        {compensiData && (
          <div className="space-y-6">
            {/* Header risultati con totale in evidenza */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">
                    Riepilogo Compensi Dealer: {selectedDealer?.ragioneSociale}
                  </h2>
                  <p className="text-gray-600">
                    Mese: {new Date(selectedMonth + '-01').toLocaleDateString('it-IT', { 
                      month: 'long', 
                      year: 'numeric' 
                    })}
                  </p>
                </div>
                <button
                  onClick={handleGeneraInvito}
                  disabled={loading}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  <FileText className="w-4 h-4" />
                  {loading ? 'Generando...' : 'GENERA INVITO'}
                </button>
              </div>
              
              {/* Compenso Totale in evidenza */}
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-l-4 border-blue-500 p-6 rounded-lg mb-6">
                <div className="flex items-center gap-3">
                  <Euro className="w-8 h-8 text-blue-600" />
                  <div>
                    <p className="text-sm font-medium text-blue-900 mb-1">Compenso Totale</p>
                    <p className="text-4xl font-bold text-blue-900">
                      {formatCurrency(compensiData.totaleCompensi)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Stats aggiuntive */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                  <div className="flex items-center gap-2 mb-1">
                    <TrendingUp className="w-5 h-5 text-green-600" />
                    <span className="text-sm font-medium text-green-900">Totale Attivazioni (righe TLC)</span>
                  </div>
                  <p className="text-2xl font-bold text-green-900">{compensiData.totaleAttivazioni || 0}</p>
                  <p className="text-xs text-green-700 mt-1">Qty complessiva TLC: {compensiData.totaleAttivazioniQty || 0}</p>
                </div>

                <div className="bg-white p-4 rounded-lg border border-gray-200">
                  <div className="text-sm font-medium text-gray-600 mb-2 flex items-center gap-2">
                    <Users className="w-4 h-4 text-gray-400" />
                    Agente di riferimento
                  </div>
                  <p className="text-lg font-semibold text-gray-900">{selectedDealer?.agente || 'N/A'}</p>
                  <p className="text-xs text-gray-500 mt-1">Dealer #{selectedDealer?.idDealer ?? '-'}</p>
                </div>

                <div className="bg-white p-4 rounded-lg border border-gray-200">
                  <div className="text-sm font-medium text-gray-600 mb-2 flex items-center gap-2">
                    <Info className="w-4 h-4 text-blue-500" />
                    Totali per Ambito
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {totalePerAmbito.length === 0 && (
                      <span className="text-sm text-gray-500">Nessun ambito disponibile</span>
                    )}
                    {totalePerAmbito.map((item) => (
                      <span
                        key={item.ambito}
                        className={`inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold rounded-full border ${getAmbitoBadgeClasses(item.ambito, item.euro)}`}
                      >
                        <span>{item.ambito}</span>
                        <span>{formatCurrency(item.euro)}</span>
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Dettaglio per segmenti */}
            {compensiData.grouped && compensiData.grouped.length > 0 ? (
              <div className="space-y-4">
                {compensiData.grouped.map((segmento) => {
                  const isSegmentOpen = openSegments[segmento.segmento] ?? true;
                  return (
                    <div key={segmento.segmento} className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
                      <button
                        type="button"
                        onClick={() => toggleSegment(segmento.segmento)}
                        className="w-full flex items-center justify-between px-6 py-4 bg-gray-50 border-b border-gray-200 text-left"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-xl">{segmento.segmento === 'RES' ? '📈' : '🏢'}</span>
                          <div>
                            <p className="text-lg font-semibold text-gray-900">
                              {segmento.segmento === 'RES' ? 'Segmento Residenziale (RES)' : 'Segmento Business (SHP)'}
                            </p>
                            <p className="text-sm text-gray-500">Categorie: {segmento.categorie.length}</p>
                          </div>
                        </div>
                        {isSegmentOpen ? <ChevronDown className="w-5 h-5 text-gray-500" /> : <ChevronRight className="w-5 h-5 text-gray-500" />}
                      </button>

                      {isSegmentOpen && (
                        <div className="divide-y divide-gray-200">
                          {segmento.categorie.map((categoria) => {
                            const catKey = `${segmento.segmento}|${categoria.categoria}`;
                            const isCatOpen = openCategories[catKey] ?? true;
                            const readableCategoria = categoria.categoria.replace(/_/g, ' ');
                            return (
                              <div key={catKey} className="px-6 py-4">
                                <button
                                  type="button"
                                  onClick={() => toggleCategoria(segmento.segmento, categoria.categoria)}
                                  className="w-full flex items-center justify-between text-left"
                                >
                                  <div>
                                    <p className="text-base font-semibold text-gray-800">{readableCategoria}</p>
                                    <p className="text-xs text-gray-500">Bucket: {categoria.buckets.length}</p>
                                  </div>
                                  {isCatOpen ? <ChevronDown className="w-4 h-4 text-gray-500" /> : <ChevronRight className="w-4 h-4 text-gray-500" />}
                                </button>

                                {isCatOpen && (
                                  <div className="mt-4 space-y-4">
                                    {categoria.buckets.map((bucket) => (
                                      <div key={`${catKey}-${bucket.bucket}`} className="border border-gray-200 rounded-lg overflow-hidden">
                                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-gray-50 px-4 py-3 border-b border-gray-200">
                                          <div>
                                            <p className="text-sm uppercase text-gray-500">Bucket</p>
                                            <h4 className="text-lg font-semibold text-gray-900">{bucket.bucket}</h4>
                                            {bucket.bucketOriginale && bucket.bucketOriginale !== bucket.bucket && (
                                              <p className="text-xs text-gray-500">Bucket originale: {bucket.bucketOriginale}</p>
                                            )}
                                          </div>
                                          <div className="flex flex-wrap items-center gap-3">
                                            <div className="text-right">
                                              <p className="text-xs text-gray-500">Totale Bucket</p>
                                              <p className="text-base font-semibold text-gray-900">{formatCurrency(bucket.totale)}</p>
                                            </div>
                                            <div className="text-right">
                                              <p className="text-xs text-gray-500">Qty complessiva</p>
                                              <p className="text-base font-semibold text-gray-900">{bucket.qtyTotale}</p>
                                            </div>
                                            <button
                                              type="button"
                                              onClick={() => openDrawer(bucket.bucket, bucket.bucketOriginale)}
                                              className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md border border-blue-200 text-blue-600 hover:bg-blue-50"
                                            >
                                              <Search className="w-4 h-4" />
                                              Vedi attivazioni
                                            </button>
                                          </div>
                                        </div>

                                        <div className="overflow-x-auto">
                                          <table className="min-w-full text-sm">
                                            <thead className="bg-white">
                                              <tr className="border-b border-gray-200 text-left text-xs uppercase text-gray-500">
                                                <th className="px-4 py-2">Ambito</th>
                                                <th className="px-4 py-2">RuleId</th>
                                                <th className="px-4 py-2">Note</th>
                                                <th className="px-4 py-2 text-right">Importo unitario</th>
                                                <th className="px-4 py-2 text-right">Qty</th>
                                                <th className="px-4 py-2 text-right">Totale</th>
                                              </tr>
                                            </thead>
                                            <tbody>
                                              {bucket.rows.map((row, idx) => (
                                                <tr key={`${bucket.bucket}-${row.ambito}-${idx}`} className="border-b last:border-0 border-gray-100">
                                                  <td className="px-4 py-2 align-top">
                                                    <span className={`inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full border ${getAmbitoBadgeClasses(row.ambito, row.euroCalcolati)}`}>
                                                      {row.ambito}
                                                    </span>
                                                  </td>
                                                  <td className="px-4 py-2 align-top text-sm text-gray-700">
                                                    {row.ruleId ? (
                                                      <span
                                                        className="inline-flex items-center gap-1"
                                                        title={`Soglia min: ${row.sogliaMin ?? '-'} | Soglia max: ${row.sogliaMax ?? '-'}`}
                                                      >
                                                        {row.ruleId}
                                                        <Info className="w-3 h-3 text-gray-400" />
                                                      </span>
                                                    ) : (
                                                      <span className="text-gray-400">-</span>
                                                    )}
                                                  </td>
                                                  <td className="px-4 py-2 align-top text-sm text-gray-700 space-y-1">
                                                    {row.note ? <span>{row.note}</span> : <span className="text-gray-400">-</span>}
                                                    <div className="flex flex-wrap gap-1">
                                                      {row.flags?.esclusoMnpVodafone && renderBadge('Escluso MNP Vodafone', 'border-orange-300 bg-orange-50 text-orange-700')}
                                                      {row.flags?.scontoMnpVodafone && renderBadge('Sconto 10€ MNP Voda', 'border-amber-300 bg-amber-50 text-amber-700')}
                                                      {row.flags?.convergenza && renderBadge('Convergenza', 'border-emerald-300 bg-emerald-50 text-emerald-700')}
                                                    </div>
                                                  </td>
                                                  <td className="px-4 py-2 text-right font-medium text-gray-900">
                                                    {formatCurrency(row.importoPerPezzo)}
                                                  </td>
                                                  <td className="px-4 py-2 text-right text-gray-900 font-medium">{row.qty}</td>
                                                  <td className="px-4 py-2 text-right font-semibold text-gray-900">
                                                    {formatCurrency(row.euroCalcolati)}
                                                  </td>
                                                </tr>
                                              ))}
                                              <tr className="bg-gray-50 border-t border-gray-200">
                                                <td className="px-4 py-2 font-semibold text-gray-700">Totale bucket</td>
                                                <td className="px-4 py-2" colSpan={3}></td>
                                                <td className="px-4 py-2 text-right font-semibold text-gray-900">{bucket.qtyTotale}</td>
                                                <td className="px-4 py-2 text-right font-bold text-gray-900">{formatCurrency(bucket.totale)}</td>
                                              </tr>
                                            </tbody>
                                          </table>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="bg-white border border-gray-200 rounded-lg p-6 text-center text-sm text-gray-500">
                Nessun dettaglio disponibile per il periodo selezionato.
              </div>
            )}

            {/* Totali e scostamenti */}
            <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200 flex items-center gap-2">
                <Info className="w-4 h-4 text-blue-500" />
                <h3 className="text-base font-semibold text-gray-900">Totali per ambito</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 text-xs uppercase text-gray-500 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-2 text-left">Ambito</th>
                      <th className="px-4 py-2 text-right">Totale €</th>
                    </tr>
                  </thead>
                  <tbody>
                    {totalePerAmbito.map((row) => (
                      <tr key={row.ambito} className="border-b border-gray-100">
                        <td className="px-4 py-2 text-sm font-medium text-gray-700">{row.ambito}</td>
                        <td className="px-4 py-2 text-right font-semibold text-gray-900">{formatCurrency(row.euro)}</td>
                      </tr>
                    ))}
                    <tr className="bg-gray-50 border-t border-gray-200">
                      <td className="px-4 py-3 text-sm font-semibold text-gray-900">Totale generale</td>
                      <td className="px-4 py-3 text-right font-bold text-gray-900">{formatCurrency(compensiData.totaleGenerale)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Stato vuoto */}
        {!compensiData && !loading && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
            <Euro className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">Nessun dato disponibile</h3>
            <p className="text-gray-500">Seleziona un dealer e un mese per visualizzare i compensi</p>
          </div>
        )}

        {/* Click outside per chiudere dropdown */}
        {showDealerDropdown && (
          <div
            className="fixed inset-0 z-5"
            onClick={() => setShowDealerDropdown(false)}
          />
        )}
        </div>
      </div>

      {/* Drawer attivazioni */}
      {drawerState.open && (
        <>
          <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40" onClick={closeDrawer} />
          <div className="fixed top-0 right-0 h-full w-full max-w-3xl bg-white shadow-xl z-50 flex flex-col">
            <div className="px-6 py-4 border-b border-gray-200 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase text-gray-500">Dettaglio attivazioni</p>
                <h2 className="text-lg font-semibold text-gray-900">{drawerState.bucket} {drawerState.bucketOriginale && drawerState.bucketOriginale !== drawerState.bucket ? `(${drawerState.bucketOriginale})` : ''}</h2>
                <p className="text-sm text-gray-500">Totale {formatCurrency(drawerState.totaleEuro)} · {drawerState.data.length} righe</p>
              </div>
              <button onClick={closeDrawer} className="p-2 rounded-md border border-gray-200 text-gray-500 hover:bg-gray-100">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-6 py-4 border-b border-gray-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <AlertCircle className="w-4 h-4 text-blue-500" />
                Ricerca locale su ActivationKey, Operatore MNP, Numero pratica/ordine.
              </div>
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={drawerState.search}
                  onChange={(e) => setDrawerState((prev) => ({ ...prev, search: e.target.value }))}
                  placeholder="Cerca..."
                  className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                />
              </div>
            </div>

            <div className="flex-1 overflow-hidden">
              {drawerState.loading ? (
                <div className="h-full flex items-center justify-center text-gray-500">
                  <Loader2 className="w-6 h-6 animate-spin mr-2" /> Caricamento attivazioni...
                </div>
              ) : drawerState.error ? (
                <div className="h-full flex flex-col items-center justify-center text-center text-red-500 px-6">
                  <AlertCircle className="w-6 h-6 mb-2" />
                  <p className="text-sm font-semibold">{drawerState.error}</p>
                </div>
              ) : drawerState.data.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center text-gray-500 px-6">
                  <Euro className="w-10 h-10 text-gray-300 mb-3" />
                  <p className="text-sm">Nessuna attivazione disponibile per questo bucket.</p>
                </div>
              ) : (
                <div className="h-full overflow-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50 text-xs uppercase text-gray-500 border-b border-gray-200">
                      <tr>
                        <th className="px-4 py-2 text-left">Data</th>
                        <th className="px-4 py-2 text-left">Pratica / Ordine</th>
                        <th className="px-4 py-2 text-left">MNP Operator</th>
                        <th className="px-4 py-2 text-left">RA</th>
                        <th className="px-4 py-2 text-left">Convergenza</th>
                        <th className="px-4 py-2 text-left">SottoVoce</th>
                        <th className="px-4 py-2 text-left">Ambito</th>
                        <th className="px-4 py-2 text-right">Importo</th>
                        <th className="px-4 py-2 text-right">Totale riga</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedActivations.map((row, idx) => (
                        <tr key={`${row.activationKey || idx}`} className="border-b border-gray-100">
                          <td className="px-4 py-2 text-sm text-gray-700">{formatDate(row.dataAttivazione)}</td>
                          <td className="px-4 py-2 text-sm text-gray-700">
                            <div className="flex flex-col">
                              <span>{row.numeroPratica || '-'}</span>
                              {row.numeroOrdine && <span className="text-xs text-gray-500">Ordine: {row.numeroOrdine}</span>}
                              {row.activationKey && <span className="text-xs text-gray-400">Key: {row.activationKey}</span>}
                            </div>
                          </td>
                          <td className="px-4 py-2 text-sm text-gray-700">{row.mnpOperator || '-'}</td>
                          <td
                            className={`px-4 py-2 text-sm font-medium ${row.isRA ? 'text-emerald-600' : 'text-gray-500'}`}
                          >
                            {row.isRA ? 'Sì' : 'No'}
                          </td>
                          <td
                            className={`px-4 py-2 text-sm font-medium ${row.inConvergenza ? 'text-emerald-600' : 'text-gray-500'}`}
                          >
                            {row.inConvergenza ? '+30€' : 'No'}
                          </td>
                          <td className="px-4 py-2 text-sm text-gray-700">{row.sottoVoce || '-'}</td>
                          <td className="px-4 py-2 text-sm text-gray-700">{row.ambito}</td>
                          <td className="px-4 py-2 text-right text-sm text-gray-700">{formatCurrency(row.importoPerPezzo)}</td>
                          <td className="px-4 py-2 text-right text-sm font-semibold text-gray-900">{formatCurrency(row.euroCalcolati)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="px-6 py-3 border-t border-gray-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="text-xs text-gray-500">Mostra {paginatedActivations.length} di {filteredActivations.length} attivazioni (totale {drawerState.data.length})</div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setDrawerState((prev) => ({ ...prev, page: Math.max(1, prev.page - 1) }))}
                  disabled={drawerState.page === 1}
                  className="px-3 py-1.5 text-sm rounded-md border border-gray-200 text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Prec.
                </button>
                <span className="text-sm text-gray-700">
                  Pagina {drawerState.page} / {totalActivationPages}
                </span>
                <button
                  type="button"
                  onClick={() => setDrawerState((prev) => ({ ...prev, page: Math.min(totalActivationPages, prev.page + 1) }))}
                  disabled={drawerState.page === totalActivationPages}
                  className="px-3 py-1.5 text-sm rounded-md border border-gray-200 text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Succ.
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
