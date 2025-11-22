import { useState, useEffect } from 'react';
import { Search, Calendar, FileText, Users, Euro, TrendingUp } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import DashboardLayout from '../../components/layout/DashboardLayout';

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
          segmenti: compensiData.segmenti || [],
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
      setLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 p-4 sm:p-6 lg:p-8">
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
                      {compensiData.totaleCompensi?.toLocaleString('it-IT', { 
                        style: 'currency', 
                        currency: 'EUR',
                        minimumFractionDigits: 2 
                      }) || '€0,00'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Stats aggiuntive */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-green-50 p-4 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp className="w-5 h-5 text-green-600" />
                    <span className="text-sm font-medium text-green-900">Totale Attivazioni</span>
                  </div>
                  <p className="text-2xl font-bold text-green-900">
                    {compensiData.totaleAttivazioni || 0}
                  </p>
                </div>
                
                <div className="bg-purple-50 p-4 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <Users className="w-5 h-5 text-purple-600" />
                    <span className="text-sm font-medium text-purple-900">Agente di Riferimento</span>
                  </div>
                  <p className="text-lg font-semibold text-purple-900">
                    {selectedDealer?.agente || 'N/A'}
                  </p>
                </div>
              </div>
            </div>

            {/* Dettaglio per segmenti */}
            {compensiData.dettagli && compensiData.dettagli.length > 0 && (
              <div className="space-y-6">
                {compensiData.segmenti?.map((segmento, segIndex) => (
                  <div key={segIndex} className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                    <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
                      <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                        {segmento.nome === 'RES' && <span>📈</span>}
                        {segmento.nome === 'SHP' && <span>🏢</span>}
                        {segmento.nome === 'RES' ? 'Segmento Residenziale (RES)' : 'Segmento Business (SHP)'}
                      </h3>
                    </div>
                    
                    <div className="p-6 space-y-6">
                      {segmento.categorie?.map((categoria, catIndex) => (
                        <div key={catIndex} className="border-l-4 border-gray-200 pl-4">
                          <h4 className="text-lg font-semibold text-gray-800 mb-3">
                            {categoria.nome === 'FISSO' ? 'Prodotti Fissi' : 
                             categoria.bucket === 'FLEX' ? 'ENERGIA' : 'Prodotti Mobile'} - {categoria.bucket}
                          </h4>
                          
                          <div className="bg-gray-50 p-4 rounded-lg">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm font-medium text-gray-700">Dettaglio Calcolo:</span>
                              <span className="text-lg font-bold text-gray-900">
                                {categoria.euroCalcolati?.toLocaleString('it-IT', { 
                                  style: 'currency', 
                                  currency: 'EUR',
                                  minimumFractionDigits: 2 
                                })}
                              </span>
                            </div>
                            
                            <p className="text-gray-800 mb-2">
                              <span className="font-semibold">{categoria.qty}</span> attivazioni × 
                              <span className="font-semibold"> {categoria.importoPerPezzo?.toLocaleString('it-IT', { 
                                style: 'currency', 
                                currency: 'EUR',
                                minimumFractionDigits: 2 
                              })}</span>/cad. = 
                              <span className="font-bold text-blue-600"> {categoria.euroCalcolati?.toLocaleString('it-IT', { 
                                style: 'currency', 
                                currency: 'EUR',
                                minimumFractionDigits: 2 
                              })}</span>
                            </p>
                            
                            {categoria.note && (
                              <p className="text-sm italic text-gray-600">
                                Regola applicata: {categoria.note}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
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
    </DashboardLayout>
  );
}
