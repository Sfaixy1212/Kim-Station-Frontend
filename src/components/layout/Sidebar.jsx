import { useAuth } from '../../contexts/AuthContext';
import logo2 from '../../Logo/logo2.png';
import { NavLink } from 'react-router-dom';

export default function Sidebar({ isOpen, setIsOpen, items = [], userRole }) {
  const { logout } = useAuth();

  const getRoleColor = (role) => {
    const colors = {
      admin: 'bg-red-500',
      super_master: 'bg-purple-500',
      master: 'bg-blue-500',
      master_prodotti: 'bg-green-500',
      masterprodotti: 'bg-green-500',
      dealer: 'bg-yellow-500',
      agente: 'bg-orange-500',
    };
    return colors[role] || 'bg-gray-500';
  };

  const getRoleLabel = (role) => {
    const labels = {
      admin: 'Admin',
      super_master: 'Super Master',
      master: 'Master',
      master_prodotti: 'Master Prodotti',
      masterprodotti: 'Master Prodotti',
      dealer: 'Dealer',
      agente: 'Agente',
    };
    return labels[role] || role;
  };

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-gray-600/60 lg:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-white/95 backdrop-blur transform transition-transform duration-300 ease-in-out lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex flex-col h-full">
          {/* Logo area (centered logo only) */}
          <div className="relative h-[160px] px-5 pt-8 mb-8 flex items-center justify-center">
            <img
              src={logo2}
              alt="KIM Logo"
              className="h-[190px] w-[190px] rounded-lg object-contain"
            />
            <button
              className="absolute right-4 lg:hidden text-gray-400 hover:text-gray-600"
              onClick={() => setIsOpen(false)}
              aria-label="Chiudi menu"
            >
              ✕
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-3 pb-4 overflow-y-auto">

            <ul className="space-y-1">
              {items.map((item, index) => (
                <li key={index}>
                  <NavLink
                    to={item.href || '#'}
                    end={Boolean(item?.end)}
                    className={({ isActive }) =>
                      `group flex items-center gap-3 px-3 py-3 rounded-xl text-[15px] font-medium transition-colors duration-300 ` +
                      (isActive
                        ? 'bg-gradient-to-r from-blue-50 to-blue-100/40 text-blue-700 shadow-sm ring-1 ring-blue-100'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900')
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <span
                          className={`flex h-9 w-9 items-center justify-center rounded-lg text-base transition-all duration-300 ${
                            isActive
                              ? 'bg-blue-100 text-blue-700 shadow-sm'
                              : 'bg-gray-100 text-gray-600 group-hover:bg-blue-100 group-hover:text-blue-700'
                          }`}
                        >
                          {item.icon}
                        </span>
                        <span className="truncate">{item.name}</span>
                        {item.badge && (
                          <span className="ml-auto bg-blue-100 text-blue-700 text-[11px] px-2 py-0.5 rounded-full">
                            {item.badge}
                          </span>
                        )}
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>

          {/* Promo ChatBot Banner */}
          <div className="px-4 pb-4">
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100 p-5 min-h-[12rem]">
              {/* Decorative curved lines background */}
              <svg className="pointer-events-none absolute inset-0 opacity-40" aria-hidden viewBox="0 0 300 200" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="grad" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#93c5fd" />
                    <stop offset="100%" stopColor="#c7d2fe" />
                  </linearGradient>
                </defs>
                <path d="M-20 20 C 60 40, 120 0, 200 30 S 320 70, 360 40" fill="none" stroke="url(#grad)" strokeWidth="2" style={{ strokeDasharray: 6, animation: 'dash 10s linear infinite' }} />
                <path d="M-30 120 C 40 90, 140 160, 220 120 S 340 80, 380 120" fill="none" stroke="url(#grad)" strokeWidth="2" style={{ strokeDasharray: 8, animation: 'dash 14s linear infinite reverse' }} />
                <path d="M-10 180 C 50 170, 140 190, 210 175 S 320 150, 360 170" fill="none" stroke="url(#grad)" strokeWidth="1.5" style={{ strokeDasharray: 5, animation: 'dash 12s linear infinite' }} />
              </svg>

              {/* Floating bubbles */}
              <span className="absolute top-10 left-6 h-7 w-7 rounded-full bg-white/80 text-blue-600 text-xs font-bold flex items-center justify-center shadow-sm animate-bounce">!</span>
              <span className="absolute top-16 right-6 h-7 w-7 rounded-full bg-white/80 text-blue-600 text-xs font-bold flex items-center justify-center shadow-sm animate-[bounce_2.2s_infinite_0.5s]">?</span>

              {/* Robot icon - enhanced */}
              <div className="relative mx-auto mb-3 h-16 w-16 rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 text-white flex items-center justify-center shadow-md animate-[float_4s_ease-in-out_infinite]" aria-hidden>
                {/* glow ring */}
                <span className="absolute inset-0 rounded-full ring-3 ring-blue-300/30 animate-[pulseGlow_2.8s_ease-in-out_infinite]" />
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" className="h-[56px] w-[56px]">
                  {/* antenna */}
                  <circle cx="32" cy="10" r="3" className="fill-current opacity-90" />
                  <rect x="31" y="10" width="2" height="6" className="fill-current opacity-90" />
                  {/* head */}
                  <rect x="14" y="18" width="36" height="26" rx="8" ry="8" className="fill-white/95" />
                  {/* eyes */}
                  <circle cx="26" cy="31" r="4" className="fill-blue-600 origin-center animate-[blink_3.5s_infinite]" />
                  <circle cx="38" cy="31" r="4" className="fill-blue-600 origin-center animate-[blink_4.2s_infinite_0.3s]" />
                  {/* mouth */}
                  <rect x="24" y="38" width="16" height="3" rx="1.5" className="fill-blue-500" />
                </svg>
              </div>

              {/* Title */}
              <p className="text-center text-[15px] text-blue-900 leading-tight">
                Prova la nostra <span className="font-semibold underline decoration-blue-400 decoration-2 underline-offset-2">ChatBot</span>.
              </p>

              {/* CTA */}
              <button
                type="button"
                onClick={() => { try { window.dispatchEvent(new Event('open-chatbot')); } catch {} }}
                className="mt-3 block w-full text-center rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold py-2.5 shadow-sm transition-colors"
              >
                Chatta ora
              </button>

              {/* decorative blobs */}
              <div className="pointer-events-none absolute -bottom-10 -right-10 h-32 w-32 rounded-full bg-blue-200/40 blur-2xl" />
              <div className="pointer-events-none absolute -top-8 -left-10 h-24 w-24 rounded-full bg-indigo-200/40 blur-2xl" />
            </div>
          </div>

          
        </div>
      </aside>
    </>
  );
}
