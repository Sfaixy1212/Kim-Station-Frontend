import { useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import useCredito from '../../hooks/attivazioni/useCredito';

const currency = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });

export default function Header({ setSidebarOpen, title = 'Dashboard', user }) {
  const { logout } = useAuth();
  const role = (user?.role || '').toString().toLowerCase();
  const isDealer = role === 'dealer';
  const { data: creditoData, loading: loadingCredito, error: creditoError, refetch: refetchCredito } = useCredito(isDealer);

  useEffect(() => {
    if (!isDealer || !refetchCredito) return undefined;
    const handler = () => refetchCredito();
    window.addEventListener('plafond-updated', handler);
    return () => window.removeEventListener('plafond-updated', handler);
  }, [isDealer, refetchCredito]);

  const displayName = (() => {
    if (!user) return 'Utente';
    const aliasByEmail = { 'g.rosato@kimweb.it': 'GIACOMO' };
    if (user?.email && aliasByEmail[user.email]) return aliasByEmail[user.email];

    const role = (user.role || '').toString().toLowerCase();
    if (role === 'dealer') {
      const dealerDirect = user?.dealerName || user?.ragioneSociale || user?.RagioneSociale || user?.name || user?.username;
      if (dealerDirect && String(dealerDirect).trim().length > 0) return dealerDirect;
    } else if (role === 'agente' || role === 'agent') {
      const agentDirect = user?.agentenome || user?.agenteNome || user?.name || user?.username;
      if (agentDirect && String(agentDirect).trim().length > 0) return agentDirect;
    } else {
      const generic = user?.name || user?.username || user?.agentenome || user?.agenteNome;
      if (generic && String(generic).trim().length > 0) return generic;
    }

    // Deriva un nome leggibile dall'email senza mostrarla direttamente
    const email = user?.email;
    if (email && typeof email === 'string') {
      const local = email.split('@')[0] || '';
      if (local) {
        const parts = local.replace(/[_.-]+/g, ' ').split(' ').filter(Boolean);
        if (parts.length === 1) return parts[0].toUpperCase();
        return parts.map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(' ');
      }
    }
    return 'Utente';
  })();

  return (
    <header className="fixed top-0 left-0 lg:left-64 right-0 z-40 bg-white/95 backdrop-blur">
      <div className="flex items-center justify-between h-20 px-4 sm:px-6 lg:px-8">
        {/* Mobile menu */}
        <button
          className="lg:hidden p-2 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100"
          onClick={() => setSidebarOpen(true)}
          aria-label="Apri menu"
        >
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        {/* Title replaced with user info (dealer name + avatar) */}
        <div className="flex-1 ml-0">
          <div className="flex items-center gap-4">
            {/* Avatar icon (professional person) on the left */}
            <div className="w-12 h-12 rounded-xl bg-[#30589e] text-white flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                {/* head */}
                <circle cx="12" cy="8" r="3.25" />
                {/* shoulders/jacket */}
                <path d="M4.5 19.5c.8-3.6 3.7-5.5 7.5-5.5s6.7 1.9 7.5 5.5" />
                {/* tie */}
                <path d="M12 11.5l1.2 1.2L12 14l-1.2-1.3L12 11.5z" fill="currentColor" stroke="none" />
              </svg>
            </div>
            {/* User name on the right */}
            <div className="leading-tight">
              <p className="text-sm sm:text-base tracking-wide text-gray-700 -mb-0.5">Benvenuto!</p>
              <p className="text-base sm:text-lg font-semibold text-gray-900">{displayName}</p>
            </div>
          </div>
        </div>

        {/* Right actions */}
        <div className="flex items-center space-x-3 sm:space-x-4">
          {isDealer && (
            <div className="hidden sm:flex items-center bg-blue-50 border border-blue-100 rounded-xl px-3 py-2 text-sm text-blue-900 shadow-sm">
              <div className="mr-3">
                <div className="text-[11px] uppercase tracking-wide text-blue-500 font-semibold">Credito plafond</div>
                <div className="text-base font-bold">
                  {loadingCredito ? '…' : currency.format(Number(creditoData?.credito ?? creditoData?.saldo ?? 0))}
                </div>
                {creditoError && (
                  <div className="text-[10px] text-red-500 mt-0.5">{creditoError}</div>
                )}
              </div>
              <button
                onClick={() => window.dispatchEvent(new CustomEvent('open-plafond-topup'))}
                className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold"
                type="button"
              >
                Ricarica
              </button>
            </div>
          )}
          {/* Link SuperMaster: Andamento Dealer */}
          {(() => {
            const role = String(user?.role || '').toLowerCase();
            const ruoli = Array.isArray(user?.ruoli) ? user.ruoli.map(r => String(r || '').toLowerCase()) : [];
            const isSuperMaster = role === 'supermaster' || ruoli.includes('supermaster');
            return isSuperMaster;
          })() && (
            <NavLink
              to="/supermaster/dealer-trend"
              className={({ isActive }) => `inline-flex items-center px-3 sm:px-4 py-2 rounded-lg text-sm font-medium ${isActive ? 'bg-blue-700 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'}`}
            >
              Andamento Dealer
            </NavLink>
          )}
          {/* Logout */}
          <button
            onClick={logout}
            className="inline-flex items-center px-3 sm:px-4 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-white text-sm font-medium"
            aria-label="Logout"
          >
            Logout
          </button>

          {/* Avatar moved to title area; removed here to avoid duplication */}
        </div>
      </div>
    </header>
  );
}
