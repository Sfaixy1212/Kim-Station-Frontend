import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useAuth } from '../../contexts/AuthContext';
import Sidebar from './Sidebar';
import Header from './Header';
import ChatbotWidget from '../chat/ChatbotWidget';

export default function DashboardLayout({ children, title, sidebarItems }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user } = useAuth();
  const location = useLocation();

  const buildDefaultItems = () => {
    const role = (user?.role || '').toString().toLowerCase();
    const isMaster = role === 'master';
    const isMasterProdotti = role === 'master_prodotti' || role === 'masterprodotti';
    const isAgent = role === 'agente' || role === 'agent';
    const isSuperMaster = role === 'supermaster';
    const base = isMaster
      ? '/master'
      : isMasterProdotti
      ? '/masterprodotti'
      : isSuperMaster
      ? '/supermaster'
      : isAgent
      ? '/agente'
      : '/dealer';
    if (isAgent) {
      // Menu specifico per Agente
      return [
        { name: 'Home', icon: '🏠', current: true, href: base, end: true },
        { name: 'Attivazioni', icon: '⚡', current: false, href: `${base}/attivazioni` },
        { name: 'Prodotti', icon: '📦', current: false, href: `${base}/products` },
        { name: 'Obiettivi & Compensi', icon: '🎯', current: false, href: `${base}/obiettivi-compensi` },
        { name: 'Agenda Visite', icon: '📅', current: false, href: `${base}/agenda` },
        { name: 'Reportistica', icon: '📈', current: false, href: `${base}/reportistica` },
        { name: 'Documentazione', icon: '📋', current: false, href: `${base}/docs` },
        { name: 'Piani Incentivi', icon: '💰', current: false, href: `/piani-incentivi` },
      ];
    }
    // Sidebar specifica per Master: aggiungi "Contratti" subito dopo "Attivazioni"
    if (isMaster) {
      return [
        { name: 'Home', icon: '🏠', current: true, href: base, end: true },
        { name: 'Attivazioni', icon: '⚡', current: false, href: `${base}/activations` },
        { name: 'Contratti', icon: '📝', current: false, href: `${base}/contratti` },
        { name: 'Prodotti', icon: '📦', current: false, href: `${base}/products` },
        { name: 'Upload', icon: '📤', current: false, href: `${base}/upload` },
        { name: 'Assistenza', icon: '🎧', current: false, href: `${base}/support` },
        { name: 'Documentazione', icon: '📋', current: false, href: `${base}/docs` },
        { name: 'Piani Incentivi', icon: '💰', current: false, href: `/piani-incentivi` },
      ];
    }
    // Menu specifico per MasterProdotti
    if (isMasterProdotti) {
      return [
        { name: 'Home', icon: '🏠', current: true, href: base, end: true },
        { name: 'Compensi Dealer', icon: '💰', current: false, href: `${base}/compensi-dealer` },
        { name: 'Plafond', icon: '💳', current: false, href: `${base}/plafond` },
        { name: 'Upload', icon: '📤', current: false, href: `${base}/upload` },
        { name: 'Assistenza', icon: '🎧', current: false, href: `${base}/support` },
        { name: 'Documentazione', icon: '📋', current: false, href: `${base}/docs` },
        { name: 'Piani Incentivi', icon: '🎁', current: false, href: `/piani-incentivi` },
      ];
    }
    // Menu specifico per SuperMaster
    if (isSuperMaster) {
      return [
        { name: 'Home', icon: '🏠', current: true, href: base, end: true },
        { name: 'CRM Visite', icon: '🗺️', current: false, href: `${base}/crm-visite` },
        { name: 'Attivazioni', icon: '⚡', current: false, href: `${base}/activations` },
        { name: 'Prodotti', icon: '📦', current: false, href: `${base}/products` },
        { name: 'Upload', icon: '📤', current: false, href: `${base}/upload` },
        { name: 'Assistenza', icon: '🎧', current: false, href: `${base}/support` },
        { name: 'Documentazione', icon: '📋', current: false, href: `${base}/docs` },
        { name: 'Piani Incentivi', icon: '💰', current: false, href: `/piani-incentivi` },
      ];
    }
    // Menu default per altri ruoli (Dealer)
    return [
      { name: 'Home', icon: '🏠', current: true, href: base, end: true },
      { name: 'Attivazioni', icon: '⚡', current: false, href: `${base}/activations` },
      { name: 'Prodotti', icon: '📦', current: false, href: `${base}/products` },
      { name: 'Upload', icon: '📤', current: false, href: `${base}/upload` },
      { name: 'Assistenza', icon: '🎧', current: false, href: `${base}/support` },
      { name: 'Documentazione', icon: '📋', current: false, href: `${base}/docs` },
      { name: 'Piani Incentivi', icon: '💰', current: false, href: `/piani-incentivi` },
    ];
  };

  const items = Array.isArray(sidebarItems) && sidebarItems.length ? sidebarItems : buildDefaultItems();

  return (
    <div className="min-h-screen w-full bg-gray-50 overflow-x-hidden overflow-y-hidden">
      <Sidebar 
        isOpen={sidebarOpen} 
        setIsOpen={setSidebarOpen}
        items={items}
        userRole={user?.role}
      />
      
      {/* Main content */}
      <div className="lg:pl-64 pt-20">
        <Header 
          setSidebarOpen={setSidebarOpen}
          title={title}
          user={user}
        />
        
        <main className="px-4 sm:px-6 lg:px-8 pt-4 sm:pt-6 lg:pt-8 pb-0">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* Chatbot floating widget (globale) */}
      <ChatbotWidget />
    </div>
  );
}
