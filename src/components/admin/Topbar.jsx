import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

export default function AdminTopbar() {
  const navigate = useNavigate();
  const { logout, user } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const tabs = [
    { name: 'Home', href: '/admin' },
    { name: 'Crea Utente', href: '/admin/users/create' },
    { name: 'Import', href: '/admin/imports' },
    { name: 'Gestione Offerte', href: '/admin/gestione-offerte' },
  ];

  return (
    <div className="sticky top-0 z-50 pointer-events-auto bg-white/80 backdrop-blur border-b border-gray-200 dark:bg-gray-900/80 dark:border-gray-700">
      <div className="w-full px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-gray-800 dark:text-gray-200">KIM Station • ADMIN</span>
          </div>
          {/* Mobile burger */}
          <button
            className="md:hidden inline-flex items-center justify-center w-9 h-9 rounded-md border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
            aria-label="Apri menu"
            onClick={() => setMobileOpen(o => !o)}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>
          <nav className="hidden md:flex items-center gap-1">
            {tabs.map(t => (
              <NavLink
                key={t.href}
                to={t.href}
                className={({ isActive }) => `px-3 py-2 rounded-md text-sm font-medium transition-colors ${isActive ? 'bg-red-600 text-white' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                end={t.href === '/admin'}
              >
                {t.name}
              </NavLink>
            ))}
          </nav>
          <div className="hidden md:flex items-center gap-2">
            {user?.name && (
              <span className="hidden sm:inline text-sm text-gray-500 dark:text-gray-400 mr-2">{user.name}</span>
            )}
            <button
              onClick={async () => { try { await logout(); } finally { navigate('/login', { replace: true }); } }}
              className="px-3 py-2 text-sm rounded-md bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300"
              aria-label="Logout"
            >
              Logout
            </button>
          </div>
        </div>
      </div>
      {/* Mobile menu panel */}
      {mobileOpen && (
        <div className="md:hidden border-t border-gray-200 dark:border-gray-700 bg-white/95 dark:bg-gray-900/95 backdrop-blur">
          <div className="px-4 py-2 space-y-1">
            {tabs.map(t => (
              <NavLink
                key={t.href}
                to={t.href}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) => `block px-3 py-2 rounded-md text-sm ${isActive ? 'bg-red-600 text-white' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                end={t.href === '/admin'}
              >
                {t.name}
              </NavLink>
            ))}
            {/* Mobile logout */}
            <button
              onClick={async () => { try { await logout(); } finally { navigate('/login', { replace: true }); } }}
              className="w-full text-left px-3 py-2 rounded-md text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              Logout
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
