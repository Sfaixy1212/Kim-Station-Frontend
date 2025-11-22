import { useState, useEffect, useRef } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import ImpersonateModal from '../ImpersonateModal';

export default function SuperMasterTopbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout, user } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [impersonateOpen, setImpersonateOpen] = useState(false);
  const [selectedKey, setSelectedKey] = useState('dealer');
  const [openDropdown, setOpenDropdown] = useState(null);
  const [mobileExpanded, setMobileExpanded] = useState(null);
  const navRef = useRef(null);

  const credsMap = {
    dealer: { label: 'DEALER', email: 'mdlcomunicazioni@gmail.com', password: 'Maglie25.' },
    agente: { label: 'AGENTE', email: 'g.rosato@kimweb.it', password: 'Fasano123!' },
    backoffice: { label: 'BACKOFFICE', email: 'attivazioni@kimweb.it', password: 'Savana2025!' },
    amministrazione: { label: 'AMMINISTRAZIONE', email: 'amministrazione@kimweb.it', password: '!Kimbr2025' },
  };

  const sections = [
    {
      label: 'Dashboard',
      items: [{ name: 'Home', href: '/supermaster' }]
    },
    {
      label: 'Field & CRM',
      items: [
        { name: 'CRM Visite', href: '/supermaster/crm-visite' },
        { name: 'Agenti', href: '/supermaster/analisi' },
        { name: 'Geolocalizzazione', href: '/supermaster/geolocalizzazione' }
      ]
    },
    {
      label: 'Analisi',
      items: [
        { name: 'Analisi FW', href: '/supermaster/analisi-fw' },
        { name: 'Analisi SKY', href: '/supermaster/analisi-sky' },
        { name: 'Dealer Trend', href: '/supermaster/dealer-trend' }
      ]
    },
    {
      label: 'Compensi & Incentivi',
      items: [
        { name: 'Compensi Agenti', href: '/supermaster/compensi' },
        { name: 'Compensi Dealer', href: '/supermaster/compensi-dealer' },
        { name: 'Piani Incentivi', href: '/supermaster/piani-incentivi-modulare' }
      ]
    },
    {
      label: 'Strumenti',
      items: [
        { name: 'Tool Operativi', href: '/supermaster/strumenti' },
        { name: 'Attività Backend', href: '/supermaster/attivita-backend' }
      ]
    }
  ];

  const isSectionActive = (section) =>
    section.items.some(item => location.pathname.startsWith(item.href));

  useEffect(() => {
    setOpenDropdown(null);
    setMobileExpanded(null);
    setMobileOpen(false);
  }, [location.pathname]);

  const handleDesktopToggle = (label) => {
    setOpenDropdown(prev => (prev === label ? null : label));
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (navRef.current && !navRef.current.contains(event.target)) {
        setOpenDropdown(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const renderDesktopNav = () => (
    <nav ref={navRef} className="hidden md:flex items-center gap-2">
      {sections.map(section => {
        if (section.items.length === 1) {
          const item = section.items[0];
          return (
            <NavLink
              key={item.href}
              to={item.href}
              className={({ isActive }) => `px-3 py-2 rounded-md text-sm font-medium transition-colors ${isActive ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-100'}`}
              end={item.href === '/supermaster'}
            >
              {item.name}
            </NavLink>
          );
        }

        const active = isSectionActive(section);
        const dropdownOpen = openDropdown === section.label;
        return (
          <div
            key={section.label}
            className="relative"
          >
            <button
              type="button"
              onClick={() => handleDesktopToggle(section.label)}
              className={`flex items-center gap-1 px-3 py-2 rounded-md text-sm font-medium transition-colors ${active ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-100'}`}
            >
              <span>{section.label}</span>
              <svg
                className={`w-4 h-4 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`}
                viewBox="0 0 20 20"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
              >
                <path d="M6 8l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <div
              className={`absolute left-0 top-full mt-1 w-56 rounded-lg border border-gray-200 bg-white shadow-lg transition-all duration-150 ${dropdownOpen ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 -translate-y-1 pointer-events-none'}`}
            >
              <div className="py-2">
                {section.items.map(item => (
                  <NavLink
                    key={item.href}
                    to={item.href}
                    onClick={() => setOpenDropdown(null)}
                    className={({ isActive }) => `block px-4 py-2 text-sm ${isActive ? 'text-blue-600 font-semibold bg-blue-50' : 'text-gray-700 hover:bg-gray-100'}`}
                    end={item.href === '/supermaster'}
                  >
                    {item.name}
                  </NavLink>
                ))}
              </div>
            </div>
          </div>
        );
      })}
    </nav>
  );

  return (
    <div className="sticky top-0 z-50 pointer-events-auto bg-white/80 backdrop-blur border-b border-gray-200">
      <div className="w-full px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-gray-800">KIM Station • ARMANDO</span>
          </div>
          {/* Mobile burger */}
          <button
            className="md:hidden inline-flex items-center justify-center w-9 h-9 rounded-md border border-gray-200 text-gray-700 hover:bg-gray-50"
            aria-label="Apri menu"
            onClick={() => setMobileOpen(o => !o)}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>
          {renderDesktopNav()}
          <div className="hidden md:flex items-center gap-2">
            {/* Accedi come (iframe) */}
            <div className="hidden sm:flex items-center gap-2 mr-2">
              <span className="text-sm text-gray-500">Accedi come</span>
              <select
                value={selectedKey}
                onChange={(e) => setSelectedKey(e.target.value)}
                className="text-sm border-gray-300 rounded-md"
              >
                <option value="dealer">DEALER</option>
                <option value="agente">AGENTE</option>
                <option value="backoffice">BACKOFFICE</option>
                <option value="amministrazione">AMMINISTRAZIONE</option>
              </select>
              <button
                onClick={() => setImpersonateOpen(true)}
                className="px-3 py-2 text-sm rounded-md bg-blue-600 hover:bg-blue-700 text-white"
              >
                Apri
              </button>
            </div>
            {user?.name && (
              <span className="hidden sm:inline text-sm text-gray-500 mr-2">{user.name}</span>
            )}
            <button
              onClick={async () => { try { await logout(); } finally { navigate('/login', { replace: true }); } }}
              className="px-3 py-2 text-sm rounded-md bg-gray-100 hover:bg-gray-200 text-gray-700"
              aria-label="Logout"
            >
              Logout
            </button>
          </div>
        </div>
      </div>
      {/* Mobile menu panel */}
      {mobileOpen && (
        <div className="md:hidden border-t border-gray-200 bg-white/95 backdrop-blur">
          <div className="px-4 py-3 space-y-2">
            {sections.map(section => {
              if (section.items.length === 1) {
                const item = section.items[0];
                return (
                  <NavLink
                    key={item.href}
                    to={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={({ isActive }) => `block px-3 py-2 rounded-md text-sm ${isActive ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-100'}`}
                    end={item.href === '/supermaster'}
                  >
                    {item.name}
                  </NavLink>
                );
              }

              const expanded = mobileExpanded === section.label;
              return (
                <div key={section.label} className="border border-gray-100 rounded-lg">
                  <button
                    type="button"
                    onClick={() => setMobileExpanded(expanded ? null : section.label)}
                    className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium text-gray-700"
                  >
                    <span>{section.label}</span>
                    <svg className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M6 8l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                  {expanded && (
                    <div className="px-3 pb-2 space-y-1">
                      {section.items.map(item => (
                        <NavLink
                          key={item.href}
                          to={item.href}
                          onClick={() => setMobileOpen(false)}
                          className={({ isActive }) => `block px-3 py-2 rounded-md text-sm ${isActive ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-100'}`}
                          end={item.href === '/supermaster'}
                        >
                          {item.name}
                        </NavLink>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {/* Logout button per mobile */}
            <button
              onClick={async () => { 
                setMobileOpen(false);
                try { await logout(); } finally { navigate('/login', { replace: true }); } 
              }}
              className="w-full text-left px-3 py-2 rounded-md text-sm bg-red-50 hover:bg-red-100 text-red-700 font-medium"
            >
              Logout
            </button>
          </div>
        </div>
      )}
      {/* Modale impersonate */}
      <ImpersonateModal isOpen={impersonateOpen} onClose={() => setImpersonateOpen(false)} selectedKey={selectedKey} credsMap={credsMap} />
    </div>
  );
}
