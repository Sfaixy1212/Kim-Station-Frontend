import { useState, useEffect } from 'react';
import { Search, Wallet, Users, TrendingUp, RefreshCw } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import DashboardLayout from '../../components/layout/DashboardLayout';
import toast from 'react-hot-toast';

export default function Plafond() {
  const { user } = useAuth();
  const [selectedDealer, setSelectedDealer] = useState(null);
  const [dealerSearch, setDealerSearch] = useState('');
  const [dealerOptions, setDealerOptions] = useState([]);
  const [showDealerDropdown, setShowDealerDropdown] = useState(false);
  const [plafondData, setPlafondData] = useState(null);
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
    // Carica automaticamente il plafond quando si seleziona un dealer
    handleSearch(dealer);
  };

  // Cerca plafond
  const handleSearch = async (dealer = selectedDealer) => {
    if (!dealer) {
      setError('Seleziona un dealer');
      return;
    }

    setLoading(true);
    setError('');
    
    try {
      const response = await fetch(`/api/masterprodotti/plafond/${dealer.idDealer}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        console.log('[PLAFOND] Risposta API:', data);
        setPlafondData(data);
      } else {
        const errorData = await response.json();
        console.error('[PLAFOND] Errore API:', errorData);
        setError(errorData.error || 'Errore nel caricamento del plafond');
        setPlafondData(null);
      }
    } catch (err) {
      setError('Errore di connessione');
      console.error('Errore ricerca plafond:', err);
      setPlafondData(null);
    } finally {
      setLoading(false);
    }
  };

  // Ricarica plafond
  const handleRefresh = () => {
    if (selectedDealer) {
      handleSearch();
      toast.success('Plafond aggiornato');
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 p-4 sm:p-6 lg:p-8">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Plafond Dealer</h1>
            <p className="text-gray-600">Visualizza il credito disponibile per ogni dealer</p>
          </div>

          {/* Filtri di ricerca */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Ricerca Dealer */}
              <div className="relative">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Users className="inline w-4 h-4 mr-1" />
                  Cerca Dealer
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={dealerSearch}
                    onChange={(e) => {
                      setDealerSearch(e.target.value);
                      setShowDealerDropdown(true);
                      if (!e.target.value) {
                        setSelectedDealer(null);
                        setPlafondData(null);
                      }
                    }}
                    onFocus={() => setShowDealerDropdown(true)}
                    placeholder="Cerca per nome, agente, città..."
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

              {/* Pulsante Ricarica */}
              <div className="flex items-end">
                <button
                  onClick={handleRefresh}
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
                      <RefreshCw className="w-4 h-4" />
                      Aggiorna
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
          {plafondData && (
            <div className="space-y-6">
              {/* Card Plafond */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">
                      {selectedDealer?.ragioneSociale}
                    </h2>
                    <p className="text-gray-600">
                      Agente: {selectedDealer?.agente || 'N/A'} • {selectedDealer?.citta} ({selectedDealer?.provincia})
                    </p>
                  </div>
                </div>
                
                {/* Credito Plafond in evidenza */}
                <div className="bg-gradient-to-r from-green-50 to-emerald-50 border-l-4 border-green-500 p-6 rounded-lg">
                  <div className="flex items-center gap-3">
                    <Wallet className="w-8 h-8 text-green-600" />
                    <div>
                      <p className="text-sm font-medium text-green-900 mb-1">Credito Plafond Disponibile</p>
                      <p className="text-4xl font-bold text-green-900">
                        {plafondData.credito?.toLocaleString('it-IT', { 
                          style: 'currency', 
                          currency: 'EUR',
                          minimumFractionDigits: 2 
                        }) || '€0,00'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Info aggiuntive */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                  <div className="bg-blue-50 p-4 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <Users className="w-5 h-5 text-blue-600" />
                      <span className="text-sm font-medium text-blue-900">ID Dealer</span>
                    </div>
                    <p className="text-2xl font-bold text-blue-900">
                      {plafondData.dealerId || selectedDealer?.idDealer}
                    </p>
                  </div>
                  
                  <div className="bg-purple-50 p-4 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <TrendingUp className="w-5 h-5 text-purple-600" />
                      <span className="text-sm font-medium text-purple-900">Stato</span>
                    </div>
                    <p className="text-lg font-semibold text-purple-900">
                      {plafondData.credito > 0 ? '✅ Credito Disponibile' : '⚠️ Nessun Credito'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Note informative */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex gap-3">
                  <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-sm font-medium text-blue-900 mb-1">Informazioni sul Plafond</h3>
                    <p className="text-sm text-blue-700">
                      Il credito plafond rappresenta il saldo disponibile per questo dealer, calcolato dalla somma di tutte le transazioni registrate nel sistema.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Stato vuoto */}
          {!plafondData && !loading && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
              <Wallet className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">Nessun dato disponibile</h3>
              <p className="text-gray-500">Cerca un dealer per visualizzare il credito plafond disponibile</p>
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
