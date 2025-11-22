import { useState, useEffect } from 'react';
import { getProtectedData } from '../../services/api';
import toast from 'react-hot-toast';
import AdminTopbar from '../../components/admin/Topbar';
import OffertaEditCard from '../../components/admin/OffertaEditCard';
import CreaOffertaModal from '../../components/admin/CreaOffertaModal';

export default function AdminGestioneOfferte() {
  const [operatori, setOperatori] = useState([]);
  const [selectedOperatore, setSelectedOperatore] = useState('');
  const [statoFiltro, setStatoFiltro] = useState('tutte'); // 'tutte' | 'attive' | 'scadute'
  const [offerte, setOfferte] = useState([]);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({ attive: 0, scadute: 0, totali: 0 });
  const [showModal, setShowModal] = useState(false);

  // Carica operatori all'avvio
  useEffect(() => {
    loadOperatori();
  }, []);

  // Carica offerte quando cambiano i filtri
  useEffect(() => {
    if (selectedOperatore) {
      loadOfferte();
    }
  }, [selectedOperatore, statoFiltro]);

  const loadOperatori = async () => {
    try {
      const data = await getProtectedData('/admin/operatori');
      setOperatori(data || []);
      if (data && data.length > 0) {
        setSelectedOperatore(String(data[0].IDOperatore));
      }
    } catch (e) {
      console.error('[LOAD OPERATORI][ERR]', e);
      toast.error('Errore caricamento operatori');
    }
  };

  const loadOfferte = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        operatore: selectedOperatore,
        stato: statoFiltro
      });
      const data = await getProtectedData(`/admin/offerte?${params}`);
      setOfferte(data?.offerte || []);
      setStats(data?.stats || { attive: 0, scadute: 0, totali: 0 });
    } catch (e) {
      console.error('[LOAD OFFERTE][ERR]', e);
      toast.error('Errore caricamento offerte');
    } finally {
      setLoading(false);
    }
  };

  const handleOffertaUpdated = () => {
    // Ricarica offerte dopo modifica
    loadOfferte();
  };

  return (
    <>
      <AdminTopbar />
      <div className="w-full px-4 sm:px-6 lg:px-8 py-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            Gestione Offerte
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Visualizza e modifica le offerte disponibili
          </p>
        </div>

        {/* Filtri */}
        <div className="mb-6 bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            {/* Operatore */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Operatore
              </label>
              <select
                value={selectedOperatore}
                onChange={(e) => setSelectedOperatore(e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 rounded-md px-3 py-2 text-sm"
              >
                {operatori.map((op) => (
                  <option key={op.IDOperatore} value={op.IDOperatore}>
                    {op.Denominazione}
                  </option>
                ))}
              </select>
            </div>

            {/* Stato */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Stato Offerte
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => setStatoFiltro('tutte')}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    statoFiltro === 'tutte'
                      ? 'bg-red-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  Tutte
                </button>
                <button
                  onClick={() => setStatoFiltro('attive')}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    statoFiltro === 'attive'
                      ? 'bg-green-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  Attive
                </button>
                <button
                  onClick={() => setStatoFiltro('scadute')}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    statoFiltro === 'scadute'
                      ? 'bg-gray-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  Scadute
                </button>
              </div>
            </div>

            {/* Stats */}
            <div className="flex items-center gap-4">
              <div className="text-sm">
                <span className="text-gray-500 dark:text-gray-400">Totali:</span>
                <span className="ml-2 font-semibold text-gray-900 dark:text-gray-100">
                  {stats.totali}
                </span>
              </div>
              <div className="text-sm">
                <span className="text-green-600 dark:text-green-400">Attive:</span>
                <span className="ml-2 font-semibold text-green-700 dark:text-green-300">
                  {stats.attive}
                </span>
              </div>
              <div className="text-sm">
                <span className="text-gray-500 dark:text-gray-400">Scadute:</span>
                <span className="ml-2 font-semibold text-gray-600 dark:text-gray-400">
                  {stats.scadute}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Pulsante Crea Nuova Offerta */}
        <div className="mb-6 flex justify-end">
          <button
            onClick={() => setShowModal(true)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md shadow text-sm font-medium"
          >
            + Crea Nuova Offerta
          </button>
        </div>

        {/* Loading */}
        {loading && (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-red-600"></div>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Caricamento offerte...</p>
          </div>
        )}

        {/* Griglia Offerte */}
        {!loading && offerte.length === 0 && (
          <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-lg shadow">
            <p className="text-gray-500 dark:text-gray-400">Nessuna offerta trovata</p>
          </div>
        )}

        {!loading && offerte.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {offerte.map((offerta) => (
              <OffertaEditCard
                key={offerta.IDOfferta}
                offerta={offerta}
                onUpdate={handleOffertaUpdated}
              />
            ))}
          </div>
        )}

        {/* Modale Crea Offerta */}
        <CreaOffertaModal
          isOpen={showModal}
          onClose={() => setShowModal(false)}
          onSuccess={handleOffertaUpdated}
        />
      </div>
    </>
  );
}
