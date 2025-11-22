import { useEffect, useMemo, useState } from 'react';
import DashboardLayout from '../../components/layout/DashboardLayout';
import Stepper from '../../components/dealer/activations/Stepper';
import OperatorLogos from '../../components/dealer/activations/OperatorLogos';
import OperatorSelect from '../../components/dealer/activations/OperatorSelect';
import TypeSelect from '../../components/dealer/activations/TypeSelect';
import Chip from '../../components/dealer/activations/Chip';
import OfferCard from '../../components/dealer/activations/OfferCard';
import useOperatori from '../../hooks/attivazioni/useOperatori';
import useTipologie from '../../hooks/attivazioni/useTipologie';
import useOfferte from '../../hooks/attivazioni/useOfferte';
import useTemplateOfferta from '../../hooks/attivazioni/useTemplateOfferta';
import DynamicForm from '../../components/dealer/activations/DynamicForm';
import useCredito from '../../hooks/attivazioni/useCredito';
// CreditWidget e modale TopUp rimossi da questa pagina: presenti in Home
import { toast } from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

export default function Activations() {
  const { user } = useAuth();
  const normalize = (s) => (s || '').toString().trim().toLowerCase().replace(/[^a-z]/g, '');
  const role = normalize(user?.role);
  const ruoloUtente = (() => { try { return normalize(localStorage.getItem('ruoloUtente')); } catch { return null; } })();
  const isDealer = role === 'dealer' || ruoloUtente === 'dealer';
  const navigate = useNavigate();
  // API data
  const { data: operators = [], loading: loadingOps, error: errorOps, refetch: refetchOps } = useOperatori();
  const [selectedOperator, setSelectedOperator] = useState(null);
  // Supporto sottocategorie SKY: id nel formato "<baseId>::<SUB>"
  const skyInfo = useMemo(() => {
    if (!selectedOperator || typeof selectedOperator !== 'string') return { baseId: selectedOperator, sub: null };
    const parts = selectedOperator.split('::');
    if (parts.length === 2) {
      return { baseId: parts[0], sub: parts[1] };
    }
    return { baseId: selectedOperator, sub: null };
  }, [selectedOperator]);

  const { data: types = [], loading: loadingTypes, error: errorTypes, refetch: refetchTypes } = useTipologie(skyInfo.baseId);
  const [selectedType, setSelectedType] = useState(null);
  const { data: offers = [], loading: loadingOffers, error: errorOffers, refetch: refetchOffers } = useOfferte(skyInfo.baseId, selectedType);
  const [selectedOfferId, setSelectedOfferId] = useState(null);
  const { data: template, loading: loadingTemplate, error: errorTemplate, refetch: refetchTemplate } = useTemplateOfferta(selectedOfferId);
  // Credito (dealer)
  const { data: credito, loading: loadingCredito, refetch: refetchCredito } = useCredito(isDealer);

  // State aggiuntivi gestiti sopra insieme agli hook
  // Filtra le tipologie visualizzate in base alla sottocategoria SKY
  const displayedTypes = useMemo(() => {
    if (!Array.isArray(types)) return [];
    const sub = (skyInfo.sub || '').toUpperCase();
    if (!sub) return types;
    if (sub === 'TV' || sub === 'MOBILE') {
      // Solo RESIDENZIALE
      return types.filter(t => String(t.id).toUpperCase().includes('RES'));
    }
    if (sub === 'BUSINESS' || sub === 'BAR') {
      // Solo BUSINESS
      return types.filter(t => String(t.id).toUpperCase().includes('BUS'));
    }
    return types;
  }, [types, skyInfo.sub]);

  // Auto-seleziona la tipologia se dopo il filtro rimane una sola opzione
  useEffect(() => {
    if (selectedOperator && !selectedType && Array.isArray(displayedTypes) && displayedTypes.length === 1) {
      setSelectedType(displayedTypes[0].id);
    }
    // Se la tipologia selezionata non è più disponibile dopo il filtro, resettala
    if (selectedType && Array.isArray(displayedTypes) && displayedTypes.length > 0) {
      const stillExists = displayedTypes.some(t => t.id === selectedType);
      if (!stillExists) setSelectedType(null);
    }
  }, [selectedOperator, selectedType, displayedTypes]);

  // Step index per lo stepper
  const stepIndex = useMemo(() => {
    if (!selectedOperator) return 0; // Operatore
    if (!selectedType) return 1; // Tipologia
    if (!selectedOfferId) return 2; // Offerta
    return 3; // Compilazione
  }, [selectedOperator, selectedType, selectedOfferId]);

  const steps = [
    { key: 'operatore', label: 'Operatore' },
    { key: 'tipologia', label: 'Tipologia' },
    { key: 'offerta', label: 'Offerta' },
    { key: 'compilazione', label: 'Compilazione' },
  ];

  // Filtra offerte per IdOperatore in base alla sottocategoria SKY
  const filteredOffers = useMemo(() => {
    if (!Array.isArray(offers) || offers.length === 0) return offers;
    const sub = (skyInfo.sub || '').toUpperCase();
    if (!sub) return offers;
    const MAP = { TV: 3, MOBILE: 8, BUSINESS: 12, BAR: 14 };
    const idOp = MAP[sub];
    if (!idOp) return offers;
    return offers.filter(o => {
      const v = o.IdOperatore ?? o.IDOperatore ?? o.idOperatore ?? o.operatoreId;
      return String(v) === String(idOp);
    });
  }, [offers, skyInfo.sub]);

  const opLabel = useMemo(() => {
    const base = operators.find((o) => String(o.id) === String(skyInfo.baseId))?.name;
    if (!base) return undefined;
    if (!skyInfo.sub) return base;
    const sub = String(skyInfo.sub).toUpperCase();
    const pretty = sub === 'TV' ? 'TV' : sub === 'MOBILE' ? 'MOBILE' : sub === 'BUSINESS' ? 'BUSINESS' : sub === 'BAR' ? 'BAR' : sub;
    return `${base} ${pretty}`;
  }, [operators, skyInfo.baseId, skyInfo.sub]);
  const typeLabel = types.find((t) => t.id === selectedType)?.label;
  
  // Label offerta selezionata
  const selectedOffer = useMemo(() => {
    if (!selectedOfferId) return null;
    return filteredOffers.find(o => o.id === selectedOfferId);
  }, [selectedOfferId, filteredOffers]);
  
  const offerLabel = useMemo(() => {
    if (!selectedOffer) return undefined;
    const name = selectedOffer.name || selectedOffer.title || selectedOffer.Titolo || 'Offerta';
    const price = selectedOffer.price || selectedOffer.Crediti || selectedOffer.crediti || 0;
    return `${name} - ${Number(price).toFixed(2)}€`;
  }, [selectedOffer]);

  const resetAfterOperator = () => {
    setSelectedType(null);
    setSelectedOfferId(null);
  };

  return (
    <DashboardLayout title="Attivazioni">
      <div className="rounded-2xl bg-white p-6 sm:p-8 shadow-sm mt-4 flex flex-col">
        {/* Hero title area */}
        <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Attivazioni</h1>
            <p className="text-sm text-gray-600">Crea una nuova attivazione in pochi passaggi.</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden sm:inline text-xs text-gray-500">Salvataggio automatico</span>
          </div>
        </div>

        {/* Stepper */}
        <div className="mb-6">
          <Stepper steps={steps} current={stepIndex} />
        </div>

        {/* Widget Credito rimosso: già presente nella Home */}

        {/* Chips delle scelte effettuate */}
        <div className="mb-4 flex flex-wrap gap-2">
          {selectedOperator && (
            <Chip label={`Operatore: ${opLabel}`} onClear={() => { setSelectedOperator(null); resetAfterOperator(); }} />
          )}
          {selectedType && (
            <Chip label={`Tipologia: ${typeLabel}`} onClear={() => setSelectedType(null)} />
          )}
          {selectedOfferId && offerLabel && (
            <Chip label={`Offerta: ${offerLabel}`} onClear={() => setSelectedOfferId(null)} />
          )}
        </div>

        {/* Selettori progressivi */}
        {!selectedOperator && (
          <div className="mb-6">
            {/* Barra loghi operatori */}
            <OperatorLogos 
              operators={operators} 
              selectedOperator={selectedOperator} 
              onSelect={(val) => { setSelectedOperator(val || null); resetAfterOperator(); }}
            />
            
            {/* Dropdown operatori */}
            <OperatorSelect operators={operators} value={selectedOperator} onChange={(val) => { setSelectedOperator(val || null); resetAfterOperator(); }} />
            {loadingOps && (
              <div className="mt-2 space-y-2">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-5 bg-gray-100 rounded animate-pulse" />
                ))}
              </div>
            )}
            {errorOps && (
              <div className="mt-2 text-xs text-red-600 flex items-center justify-between">
                <span>Errore nel caricamento operatori. Verifica token o API.</span>
                <button onClick={refetchOps} className="ml-3 px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 text-gray-700">Riprova</button>
              </div>
            )}
          </div>
        )}

        {selectedOperator && !selectedType && (
          <div className="mb-6">
            <TypeSelect types={displayedTypes} value={selectedType} onChange={setSelectedType} />
            {loadingTypes && (
              <div className="mt-2 space-y-2">
                {[...Array(2)].map((_, i) => (
                  <div key={i} className="h-5 bg-gray-100 rounded animate-pulse" />
                ))}
              </div>
            )}
            {errorTypes && (
              <div className="mt-2 text-xs text-red-600 flex items-center justify-between">
                <span>Errore nel caricamento tipologie.</span>
                <button onClick={refetchTypes} className="ml-3 px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 text-gray-700">Riprova</button>
              </div>
            )}
            {!loadingTypes && !errorTypes && types.length === 0 && (
              <div className="mt-2 text-xs text-gray-500">Nessuna tipologia disponibile per questo operatore.</div>
            )}
          </div>
        )}

        {/* Griglia offerte */}
        {selectedOperator && selectedType && !selectedOfferId && (
          <div className="mt-2 flex-1 min-h-0">
            {/* Solo la sezione offerte deve scrollare */}
            <div className="h-full overflow-y-auto overscroll-contain pr-1">
              {loadingOffers && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="h-24 rounded-lg bg-gray-100 animate-pulse" />
                  ))}
                </div>
              )}
              {errorOffers && (
                <div className="py-4 text-sm text-red-600 flex items-center justify-between">
                  <span>Errore nel caricamento offerte.</span>
                  <button onClick={refetchOffers} className="ml-3 px-3 py-1.5 rounded bg-gray-100 hover:bg-gray-200 text-gray-700">Riprova</button>
                </div>
              )}
              {!loadingOffers && !errorOffers && (filteredOffers.length === 0 ? (
                <div className="py-10 text-center text-sm text-gray-500">Nessuna offerta trovata</div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {filteredOffers.map((offer) => (
                    <OfferCard
                      key={offer.id}
                      offer={offer}
                      onSelect={() => {
                        try {
                          // Controllo credito solo per dealer
                          if (isDealer) {
                            const prezzo = Number(offer.price || 0);
                            const saldo = Number((credito && typeof credito === 'object' ? credito.credito : credito) ?? 0);
                            if (Number.isFinite(prezzo) && Number.isFinite(saldo) && prezzo > 0 && saldo < prezzo) {
                              toast.error('FONDI INSUFFICIENTI. RICARICA PLAFOND');
                              // Reindirizza alla Home Dealer e richiedi apertura modale TopUp
                              navigate('/dealer', { state: { openTopUp: true }, replace: false });
                              return; // blocca selezione
                            }
                          }
                        } catch {}
                        setSelectedOfferId(offer.id);
                      }}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Compilazione dinamica */}
        {selectedOfferId && (
          <div className="mt-4 flex-1">
            {/* Box riepilogativo offerta selezionata */}
            {selectedOffer && (
              <div className="mb-3 rounded-lg border border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50 p-3 shadow-sm">
                <div className="flex items-start gap-3">
                  {/* Logo operatore */}
                  {selectedOffer.logo && (
                    <div className="flex-shrink-0">
                      <img src={selectedOffer.logo} alt={selectedOffer.brand} className="h-10 w-10 object-contain rounded bg-white p-1" />
                    </div>
                  )}
                  {/* Dettagli offerta */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-semibold text-blue-600 uppercase mb-0.5">{selectedOffer.brand || opLabel}</p>
                        <h3 className="text-sm font-bold text-gray-900 leading-tight mb-1">{selectedOffer.title}</h3>
                        <p className="text-xs text-gray-600 leading-snug line-clamp-2">{selectedOffer.subtitle}</p>
                      </div>
                      <div className="flex-shrink-0">
                        <div className="inline-flex items-center justify-center rounded-full bg-blue-600 text-white px-3 py-1.5 text-sm font-bold whitespace-nowrap">
                          {Number(selectedOffer.price || 0).toFixed(2)}€
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            <div className="pr-1 pb-8">
            {loadingTemplate && (
              <div className="text-sm text-gray-500">Caricamento modulo…</div>
            )}
            {errorTemplate && (
              <div className="mt-2 text-sm text-red-600 flex items-center justify-between">
                <span>Errore nel caricamento del modulo.</span>
                <button onClick={refetchTemplate} className="ml-3 px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 text-gray-700">Riprova</button>
              </div>
            )}
            {!!template && (
              <DynamicForm
                template={template}
                idOfferta={selectedOfferId}
                onSuccess={(res) => {
                  toast.success('Attivazione inviata');
                  // opzionale: pulizia stato
                }}
                onError={(err) => {
                  toast.error(err?.message || 'Errore invio');
                }}
              />
            )}
            </div>
          </div>
        )}

        {/* Modale TopUp rimossa qui: gestita globalmente nella Home (DealerDashboard) */}
      </div>
    </DashboardLayout>
  );
}
