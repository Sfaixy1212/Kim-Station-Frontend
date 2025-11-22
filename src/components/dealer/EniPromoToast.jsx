import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function EniPromoToast() {
  const navigate = useNavigate();
  const [show, setShow] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Controlla se l'utente ha già visto il toast oggi
    const lastDismissed = localStorage.getItem('eni-promo-dismissed');
    const today = new Date().toDateString();
    
    if (lastDismissed === today) {
      return; // Non mostrare se già visto oggi
    }

    // Mostra il toast dopo 2 secondi
    const timer = setTimeout(() => {
      setShow(true);
    }, 2000);

    return () => clearTimeout(timer);
  }, []);

  const handleDismiss = () => {
    setShow(false);
    setDismissed(true);
    // Salva che l'utente ha visto il toast oggi
    localStorage.setItem('eni-promo-dismissed', new Date().toDateString());
  };

  const handleClick = () => {
    handleDismiss();
    navigate('/dealer/activations');
  };

  if (!show || dismissed) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 animate-slide-up">
      <div className="bg-white rounded-xl shadow-2xl ring-1 ring-gray-200 max-w-sm overflow-hidden">
        {/* Header con gradiente */}
        <div className="bg-gradient-to-r from-yellow-400 to-amber-500 px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">⚡</span>
            <span className="text-sm font-bold text-white">Novità!</span>
          </div>
          <button
            onClick={handleDismiss}
            className="text-white hover:text-gray-100 transition-colors"
            aria-label="Chiudi"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Contenuto */}
        <div className="p-4">
          {/* Logo ENI Plenitude */}
          <div className="flex items-center gap-3 mb-3">
            <div className="flex-shrink-0 w-16 h-16 bg-white rounded-lg p-2 shadow-sm ring-1 ring-gray-100">
              <img 
                src="https://kimweb.agency/wp-content/uploads/2024/11/Eni_Plenitude_logo.svg.png" 
                alt="ENI Plenitude"
                className="w-full h-full object-contain"
              />
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900">
                Nuovo operatore disponibile!
              </h3>
              <p className="text-sm text-gray-700">
                <span className="font-semibold text-yellow-700">ENI Plenitude</span> è ora attivo
              </p>
            </div>
          </div>
          
          <p className="text-sm text-gray-600 mb-3">
            Scopri le offerte Luce & Gas con condizioni esclusive per i tuoi clienti.
          </p>
          
          <div className="bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-300 rounded-lg p-3 mb-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-bold text-green-800">
                🌐 Fibra Ultraveloce di Plenitude
              </p>
              <div className="bg-gradient-to-r from-red-500 to-red-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-md">
                OFFERTA SPECIALE
              </div>
            </div>
            <p className="text-xs text-green-700 mb-2">
              Se sei cliente Eni Plenitude Luce puoi avere la <span className="font-semibold">Fibra fino a 2,5 Gbps in download</span> e <span className="font-semibold">fino a 1 Gbps in upload</span>.
            </p>
            <div className="bg-white rounded-lg p-2 border-2 border-green-400">
              <div className="flex items-center justify-center gap-2">
                <span className="text-2xl font-black text-green-700">16,90€</span>
                <div className="text-left">
                  <div className="text-[10px] text-gray-600 leading-tight">/mese</div>
                  <div className="text-[10px] font-semibold text-green-700 leading-tight">per 3 anni</div>
                </div>
              </div>
            </div>
          </div>
          
          <button
            onClick={handleClick}
            className="w-full bg-gradient-to-r from-yellow-500 to-amber-600 hover:from-yellow-600 hover:to-amber-700 text-white font-semibold py-2.5 px-4 rounded-lg transition-all transform hover:scale-105 flex items-center justify-center gap-2 shadow-md"
          >
            <span>👉 Scopri le offerte</span>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
