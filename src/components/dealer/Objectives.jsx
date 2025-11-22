import { useEffect, useState } from 'react';
import { getProtectedData } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';

export default function Objectives() {
  const [objectives, setObjectives] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [autoScrollEnabled, setAutoScrollEnabled] = useState(true);
  const [lastManualInteraction, setLastManualInteraction] = useState(0);
  const { user } = useAuth();
  const role = (user?.role || '').toString().toLowerCase();
  const isAgent = role === 'agente' || role === 'agent';
  const apiPrefix = isAgent ? '/agente' : '/dealer';

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        setLoading(true);
        const res = await getProtectedData(`${apiPrefix}/obiettivi`);
        const payload = res?.data && !Array.isArray(res.data) ? res.data : res;
        const data = Array.isArray(payload?.data) ? payload.data : (Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : []));

        // Se utente è Agente: aggrega in tre macro-card MOBILE / FISSO / ENERGIA
        if (isAgent) {
          const agg = {
            MOBILE: { current: 0, target: 0, mancano: 0, valore: 0 },
            FISSO: { current: 0, target: 0, mancano: 0, valore: 0 },
            ENERGIA: { current: 0, target: 0, mancano: 0, valore: 0 },
            RIC_RA: { current: 0, target: 0, mancano: 0, valore: 0 },
          };
          const add = (key, cat) => {
            const done = Number(cat.fatto ?? cat.done ?? cat.attuale ?? cat.valore ?? 0) || 0;
            // target: prendi target/obiettivo; altrimenti deriva da mancano se presente
            const hasTarget = cat.target ?? cat.obiettivo ?? cat.prossimoTarget;
            let target = Number(hasTarget) || 0;
            const missing = Number(cat.mancano ?? 0) || 0;
            if (!target && (missing || done)) target = done + missing;
            agg[key].current += done;
            agg[key].target += target;
            agg[key].mancano += Math.max(0, target - done);
            const valore = Number(cat.valore ?? cat.raw ?? cat.extra ?? 0) || 0;
            agg[key].valore = (agg[key].valore || 0) + valore;
          };

          for (const operatore of data) {
            const cats = Array.isArray(operatore.categorie) ? operatore.categorie : [];
            for (const c of cats) {
              const name = (c.categoria || c.nome || c.label || '').toString().toLowerCase();
              if (/ric/.test(name) && /auto/.test(name)) add('RIC_RA', c);
              else if (/mob/i.test(name)) add('MOBILE', c);
              else if (/fiss/i.test(name)) add('FISSO', c);
              else if (/ener/i.test(name)) add('ENERGIA', c);
            }
          }

          const colorMap = {
            MOBILE: 'bg-red-500',
            FISSO: 'bg-orange-500',
            ENERGIA: 'bg-gray-400',
            RIC_RA: 'bg-violet-500',
          };

          const displayOrder = [
            { key: 'MOBILE', title: 'MOBILE', unit: 'attivazioni' },
            { key: 'FISSO', title: 'FISSO', unit: 'attivazioni' },
            { key: 'ENERGIA', title: 'ENERGIA', unit: 'attivazioni' },
            { key: 'RIC_RA', title: '% RIC. AUTOMATICA', unit: 'percentuale' },
          ];

          const mappedObjectives = displayOrder.map((cfg, i) => {
            const dataRow = agg[cfg.key] || { current: 0, target: 0, mancano: 0, valore: 0 };
            let current = dataRow.current;
            let target = dataRow.target || 0;
            let mancano = Math.max(0, target - current);
            let progress = target > 0 ? Math.round((current / target) * 100) : 0;
            let unit = cfg.unit === 'percentuale' ? '%' : 'attivazioni';
            let extra;

            if (cfg.unit === 'percentuale') {
              current = Math.round(current);
              target = 100;
              progress = current;
              mancano = 0;
              extra = {
                ra: Math.round(dataRow.valore || 0),
                mobile: Math.round(agg.MOBILE.current || 0),
              };
            }

            return {
              id: i + 1,
              title: cfg.title,
              current,
              target,
              unit,
              progress,
              color: colorMap[cfg.key] || 'bg-gray-500',
              mancano,
              livello: 0,
              extra,
            };
          });

          if (active) {
            setObjectives(mappedObjectives);
            setPage(1);
          }
        } else {
          // Dealer/Master: fallback al mapping originale per categorie
          const mappedObjectives = [];
          let id = 1;
          for (const operatore of data) {
            for (const categoria of operatore.categorie || []) {
              const colorMap = {
                'SKY': 'bg-blue-500',
                'FASTWEB MOBILE': 'bg-green-500', 
                'FASTWEB FISSO': 'bg-purple-500',
                'FASTWEB ENERGY': 'bg-orange-500'
              };
              const operatoreName = operatore.operatore?.toUpperCase() || '';
              const categoryName = categoria.nome || '';
              let title = categoryName;
              let colorKey = operatoreName;
              if (operatoreName === 'FASTWEB') {
                if (categoryName.includes('MOBILE')) { colorKey = 'FASTWEB MOBILE'; title = categoryName.replace('MOBILE ', ''); }
                else if (categoryName.includes('FISSO')) { colorKey = 'FASTWEB FISSO'; title = categoryName.replace('FISSO ', ''); }
                else if (categoryName.includes('ENERGY')) { colorKey = 'FASTWEB ENERGY'; title = categoryName.replace('ENERGY ', ''); }
              }
              mappedObjectives.push({
                id: id++,
                title: title,
                current: categoria.attuale || 0,
                target: categoria.prossimoTarget || 1,
                unit: 'attivazioni',
                progress: categoria.percentuale || 0,
                color: colorMap[colorKey] || 'bg-gray-500',
                mancano: categoria.mancano || 0,
                livello: categoria.livelloRaggiunto || 0
              });
            }
          }
          if (active) {
            setObjectives(mappedObjectives);
            setPage(1);
          }
        }
      } catch (e) {
        console.error('Errore fetch obiettivi:', e);
        if (active) setError(e.message || 'Errore di caricamento');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  // Paginazione: clamp della pagina quando cambia la lista
  useEffect(() => {
    const pageSize = 4;
    const totalPages = Math.max(1, Math.ceil(objectives.length / pageSize));
    if (page > totalPages) setPage(totalPages);
    if (page < 1) setPage(1);
  }, [objectives]);

  // Autoscroll ogni 2 secondi
  useEffect(() => {
    if (!autoScrollEnabled || loading || objectives.length === 0) return;
    
    const pageSize = 4;
    const totalPages = Math.max(1, Math.ceil(objectives.length / pageSize));
    
    // Se c'è solo una pagina, non fare autoscroll
    if (totalPages <= 1) return;
    
    const interval = setInterval(() => {
      // Se l'utente ha interagito manualmente negli ultimi 10 secondi, pausa l'autoscroll
      const now = Date.now();
      if (now - lastManualInteraction < 10000) return;
      
      setPage(currentPage => {
        const nextPage = currentPage >= totalPages ? 1 : currentPage + 1;
        return nextPage;
      });
    }, 2000); // 2 secondi

    return () => clearInterval(interval);
  }, [autoScrollEnabled, loading, objectives.length, lastManualInteraction]);

  const getProgressColor = (progress) => {
    if (progress >= 80) return 'text-green-600';
    if (progress >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  // Funzioni per gestire l'interazione manuale
  const handleManualPageChange = (newPage) => {
    setLastManualInteraction(Date.now());
    setPage(newPage);
  };

  const toggleAutoScroll = () => {
    setAutoScrollEnabled(!autoScrollEnabled);
    setLastManualInteraction(Date.now());
  };

  // Derivati paginazione
  const pageSize = 4;
  const totalPages = Math.max(1, Math.ceil(objectives.length / pageSize));
  const currentPage = Math.min(Math.max(page, 1), totalPages);
  const startIndex = (currentPage - 1) * pageSize;
  const pageItems = objectives.slice(startIndex, startIndex + pageSize);

  return (
    <div className="bg-white rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 flex items-center">
          Obiettivi del Mese
        </h3>
        {/* Controlli paginazione spostati nell'header */}
        <div className="flex items-center space-x-3 flex-nowrap">
          <div className="text-xs text-gray-500 whitespace-nowrap">Pagina {currentPage} di {totalPages}</div>
          
          {/* Indicatore autoscroll */}
          {totalPages > 1 && (
            <button
              onClick={toggleAutoScroll}
              className={`inline-flex items-center px-2 py-1 rounded-full text-[10px] font-medium transition-colors ${
                autoScrollEnabled 
                  ? 'bg-green-100 text-green-700 hover:bg-green-200' 
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
              title={autoScrollEnabled ? 'Autoscroll attivo (clicca per disattivare)' : 'Autoscroll disattivo (clicca per attivare)'}
            >
              <div className={`w-1.5 h-1.5 rounded-full mr-1 ${autoScrollEnabled ? 'bg-green-500' : 'bg-gray-400'}`}></div>
              Auto
            </button>
          )}
          
          <div className="space-x-2 whitespace-nowrap">
            <button
              aria-label="Pagina precedente"
              className={`inline-flex items-center justify-center px-2 py-1 rounded-full text-[11px] font-medium border transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 shrink-0 ${
                currentPage <= 1
                  ? 'bg-gray-50 text-gray-400 border-gray-200 cursor-not-allowed'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50 hover:border-gray-300 shadow-sm'
              }`}
              disabled={currentPage <= 1}
              onClick={() => handleManualPageChange(Math.max(1, currentPage - 1))}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3">
                <path fillRule="evenodd" d="M12.78 4.22a.75.75 0 010 1.06L8.06 10l4.72 4.72a.75.75 0 11-1.06 1.06l-5.25-5.25a.75.75 0 010-1.06l5.25-5.25a.75.75 0 011.06 0z" clipRule="evenodd" />
              </svg>
            </button>
            <button
              aria-label="Pagina successiva"
              className={`inline-flex items-center justify-center px-2 py-1 rounded-full text-[11px] font-medium border transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 shrink-0 ${
                currentPage >= totalPages
                  ? 'bg-gray-50 text-gray-400 border-gray-200 cursor-not-allowed'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50 hover:border-gray-300 shadow-sm'
              }`}
              disabled={currentPage >= totalPages}
              onClick={() => handleManualPageChange(Math.min(totalPages, currentPage + 1))}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3">
                <path fillRule="evenodd" d="M7.22 15.78a.75.75 0 010-1.06L11.94 10 7.22 5.28a.75.75 0 111.06-1.06l5.25 5.25a.75.75 0 010 1.06l-5.25 5.25a.75.75 0 01-1.06 0z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {loading && (
        <div className="py-6 text-sm text-gray-500 text-center">Caricamento obiettivi...</div>
      )}
      
      {error && !loading && (
        <div className="py-6 text-sm text-red-600 text-center">{error}</div>
      )}

      {!loading && !error && (
        <>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {objectives.length === 0 ? (
            <div className="col-span-full py-6 text-sm text-gray-500 text-center">
              Nessun obiettivo configurato per questo mese
            </div>
          ) : (
            pageItems.map((objective) => (
              <div key={objective.id} className="bg-gray-50 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2.5">
                  <div className="flex items-center">
                    <h4 className="text-base font-medium text-gray-900">{objective.title}</h4>
                  </div>
                  <span className={`text-sm font-semibold ${getProgressColor(objective.progress)}`}>
                    {objective.progress}%
                  </span>
                </div>

                <div className="mb-2.5">
                  <div className="flex justify-between text-sm text-gray-600 mb-1">
                    <span>
                      {objective.unit === '%' ? (
                        <>
                          {objective.current}%
                          {objective.extra ? ` (${objective.extra.ra} su ${objective.extra.mobile})` : ''}
                        </>
                      ) : (
                        <>
                          {objective.current} / {objective.target} {objective.unit}
                        </>
                      )}
                    </span>
                    <span>
                      {objective.mancano > 0 ? `Mancano: ${objective.mancano}` : 'Raggiunto!'}
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-1.5">
                    <div
                      className={`h-1.5 rounded-full transition-all duration-300 ${objective.color}`}
                      style={{ width: `${Math.min(objective.progress, 100)}%` }}
                    ></div>
                  </div>
                </div>

                {objective.title !== '% RIC. AUTOMATICA' && (
                  <div className="text-xs text-gray-500">
                    {objective.progress >= 100 ? (
                      <span className="text-green-600 font-medium">Obiettivo raggiunto!</span>
                    ) : objective.progress >= 80 ? (
                      <span className="text-green-600">Quasi raggiunto</span>
                    ) : objective.progress >= 60 ? (
                      <span className="text-yellow-600">Buon progresso</span>
                    ) : (
                      <span className="text-red-600">Serve più impegno</span>
                    )}
                    {objective.livello > 0 && (
                      <span className="ml-2 text-blue-600 font-medium">
                        Livello {objective.livello}
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
        </>
      )}
    </div>
  );
}
