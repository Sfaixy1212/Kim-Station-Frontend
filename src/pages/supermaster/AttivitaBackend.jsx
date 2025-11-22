import { useEffect, useState } from 'react';
import SuperMasterTopbar from '../../components/supermaster/Topbar';
import Card from '../../components/common/Card';
import StatsCard from '../../components/common/StatsCard';
import { getProtectedData, postProtectedData } from '../../services/api';
import toast from 'react-hot-toast';

const formatDateTime = (dateStr) => {
  if (!dateStr) return 'N/A';
  try {
    return new Date(dateStr).toLocaleString('it-IT', {
      day: '2-digit',
      month: '2-digit', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return 'N/A';
  }
};

const getOperatorName = (email) => {
  switch (email) {
    case 'attivazioni@kimweb.it':
      return 'Savana';
    case 'c.loiacono@kimweb.it':
      return 'Chicca';
    default:
      return email;
  }
};

const getActionIcon = (action) => {
  switch (action) {
    case 'APPROVE': return '✅';
    case 'REJECT': return '❌';
    case 'CHANGE_STATUS': return '🔄';
    default: return '📝';
  }
};

const getActionText = (action) => {
  switch (action) {
    case 'APPROVE': return 'Approvato';
    case 'REJECT': return 'Rifiutato';
    case 'CHANGE_STATUS': return 'Cambio Stato';
    default: return action;
  }
};

const getEntityIcon = (entityType) => {
  switch (entityType) {
    case 'CONTRATTO': return '📄';
    case 'ATTIVAZIONE': return '📱';
    default: return '📋';
  }
};

export default function AttivitaBackend() {
  const [data, setData] = useState({ targets: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadData = async ({ skipLoader } = {}) => {
    const useLoader = !skipLoader;
    if (useLoader) {
      setLoading(true);
    }
    setError('');
    try {
      const response = await getProtectedData('/supermaster/backend-activity');
      setData(response || { targets: [] });
      return true;
    } catch (err) {
      console.error('[ATTIVITA-BACKEND] Errore:', err);
      setError('Errore nel caricamento delle attività backend');
      toast.error('Errore nel caricamento dati');
      return false;
    } finally {
      if (useLoader) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleRefresh = async () => {
    setLoading(true);
    setError('');
    try {
      await postProtectedData('/supermaster/backend-activity/refresh', {
        daysBack: 60,
        dryRun: false,
      });
      const ok = await loadData({ skipLoader: true });
      if (ok) {
        try { toast.success('Attività aggiornate'); } catch {}
      }
    } catch (err) {
      console.error('[ATTIVITA-BACKEND][REFRESH] Errore:', err);
      setError('Errore durante il refresh delle attività backend');
      try { toast.error('Errore durante il refresh delle attività backend'); } catch {}
    } finally {
      setLoading(false);
    }
  };

  const totalActivities = data.targets.reduce((sum, target) => sum + target.totalActivities, 0);
  const activeTargets = data.targets.filter(target => target.totalActivities > 0).length;

  return (
    <>
      <SuperMasterTopbar />
      <div className="w-full px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Attività Backoffice</h1>
          <button
            onClick={handleRefresh}
            disabled={loading}
            className={`px-4 py-2 text-sm rounded-md text-white ${
              loading ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                </svg>
                Aggiornamento...
              </span>
            ) : (
              'Aggiorna'
            )}
          </button>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatsCard
            title="Account Monitorati"
            value={data.targets.length.toString()}
            icon="👥"
            trend="flat"
          />
          <StatsCard
            title="Account Attivi"
            value={activeTargets.toString()}
            icon="🟢"
            trend="flat"
          />
          <StatsCard
            title="Attività Totali"
            value={totalActivities.toString()}
            icon="📊"
            trend="flat"
          />
          <StatsCard
            title="Ultimo Aggiornamento"
            value={new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
            icon="🕐"
            trend="flat"
          />
        </div>

        {/* Barra di caricamento */}
        {loading && (
          <div className="w-full h-1 bg-gray-200 rounded overflow-hidden">
            <div className="h-1 bg-blue-600 animate-[progress_1.2s_ease-in-out_infinite]" style={{ width: '40%' }} />
          </div>
        )}

        {/* Errore */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-md p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">Errore</h3>
                <div className="mt-2 text-sm text-red-700">{error}</div>
              </div>
            </div>
          </div>
        )}

        {/* Cards per ogni account */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {data.targets.map((target, index) => (
            <Card key={target.email} title={`OPERATORE: ${getOperatorName(target.email)}`}>
              <div className="space-y-4">
                {/* Header con statistiche */}
                <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg">
                  <div>
                    <div className="text-xs text-gray-500 uppercase tracking-wide">Attività Totali</div>
                    <div className="text-lg font-semibold text-gray-900">{target.totalActivities}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 uppercase tracking-wide">Ultima Attività</div>
                    <div className="text-sm text-gray-700">
                      {target.lastActivityPretty || 'Nessuna attività'}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 uppercase tracking-wide">Ultima Azione</div>
                    <div className="text-sm text-gray-700 flex items-center gap-1">
                      {target.lastAction ? (
                        <>
                          {getActionIcon(target.lastAction)}
                          {getActionText(target.lastAction)}
                        </>
                      ) : (
                        'N/A'
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 uppercase tracking-wide">Master ID</div>
                    <div className="text-sm text-gray-700 font-mono">
                      {target.masterId || 'N/A'}
                    </div>
                  </div>
                </div>

                {/* Lista attività recenti */}
                {target.rows && target.rows.length > 0 ? (
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium text-gray-900">Attività Recenti (ultime 20)</h4>
                    <div className="max-h-96 overflow-y-auto space-y-2">
                      {target.rows.map((activity, actIndex) => (
                        <div key={actIndex} className="border rounded-lg p-3 bg-white hover:bg-gray-50 transition-colors">
                          <div className="flex items-start justify-between">
                            <div className="flex items-center gap-2">
                              {getEntityIcon(activity.entityType)}
                              <div className="flex flex-col">
                                <span className="text-sm font-medium text-gray-900">
                                  {activity.entityType} #{activity.entityId}
                                </span>
                                {activity.titoloOfferta && activity.entityType === 'ATTIVAZIONE' && (
                                  <span className="text-xs text-gray-500 italic">
                                    {activity.titoloOfferta}
                                  </span>
                                )}
                              </div>
                              {getActionIcon(activity.action)}
                              <span className="text-sm text-gray-600">{getActionText(activity.action)}</span>
                            </div>
                            <div className="text-xs text-gray-500">
                              {formatDateTime(activity.createdAt)}
                            </div>
                          </div>
                          
                          {(activity.statoPrecedente || activity.statoSuccessivo) && (
                            <div className="mt-2 text-xs text-gray-600">
                              Stato: {activity.statoPrecedenteDesc || activity.statoPrecedente || 'N/A'} → {activity.statoSuccessivoDesc || activity.statoSuccessivo || 'N/A'}
                            </div>
                          )}
                          
                          {activity.motivazione && (
                            <div className="mt-2 text-xs text-gray-600">
                              <span className="font-medium">Motivazione:</span> {activity.motivazione.substring(0, 100)}
                              {activity.motivazione.length > 100 && '...'}
                            </div>
                          )}
                          
                          {activity.ipAddress && (
                            <div className="mt-2 text-xs text-gray-500 font-mono">
                              IP: {activity.ipAddress}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <div className="text-4xl mb-2">📭</div>
                    <div className="text-sm">Nessuna attività registrata</div>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>

        {/* Messaggio se nessun dato */}
        {!loading && data.targets.length === 0 && (
          <div className="text-center py-12">
            <div className="text-6xl mb-4">🔍</div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">Nessun account monitorato</h3>
            <p className="text-gray-500">Non sono stati trovati account da monitorare.</p>
          </div>
        )}
      </div>
    </>
  );
}
