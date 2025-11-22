import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Suspense, lazy, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './contexts/AuthContext';
import { getToken } from './services/api';
import { useAuth } from './contexts/AuthContext';
const LoginForm = lazy(() => import('./components/LoginForm'));
const AdminCreateUser = lazy(() => import('./pages/admin/CreateUser'));
const AdminImport = lazy(() => import('./pages/admin/Import'));
const AdminGestioneOfferte = lazy(() => import('./pages/admin/GestioneOfferte'));
const SuperMasterDealerTrend = lazy(() => import('./pages/supermaster/DealerTrend'));
const SuperMasterAnalisiPage = lazy(() => import('./pages/supermaster/AnalisiPage'));
const SuperMasterGeolocalizzazione = lazy(() => import('./pages/supermaster/Geolocalizzazione'));
const SuperMasterReports = lazy(() => import('./pages/supermaster/Reports'));
const SuperMasterCompensi = lazy(() => import('./pages/supermaster/Compensi'));
const SuperMasterCompensiDealer = lazy(() => import('./pages/supermaster/CompensiDealer'));
const SuperMasterStrumenti = lazy(() => import('./pages/Strumenti'));
const SuperMasterPianiIncentivazione = lazy(() => import('./pages/supermaster/PianiIncentivazione'));
const SuperMasterPianiIncentiviModulare = lazy(() => import('./pages/supermaster/PianiIncentiviModulare'));
const SuperMasterAttivitaBackend = lazy(() => import('./pages/supermaster/AttivitaBackend'));
const SuperMasterAnalisiFw = lazy(() => import('./pages/supermaster/AnalisiFw'));
const SuperMasterAnalisiSky = lazy(() => import('./pages/supermaster/AnalisiSky'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const DealerDashboard = lazy(() => import('./pages/DealerDashboard'));
const SuperMasterDashboard = lazy(() => import('./pages/SuperMasterDashboard'));
const AgentDashboard = lazy(() => import('./pages/AgentDashboard'));
const MasterDashboard = lazy(() => import('./pages/MasterDashboard'));
const MasterProdottiDashboard = lazy(() => import('./pages/MasterProdottiDashboard'));
const MasterProdottiCompensiAgenti = lazy(() => import('./pages/masterprodotti/CompensiAgenti'));
const MasterProdottiCompensiDealer = lazy(() => import('./pages/masterprodotti/CompensiDealer'));
const MasterProdottiPlafond = lazy(() => import('./pages/masterprodotti/Plafond'));
const MasterContratti = lazy(() => import('./pages/master/Contratti'));
const Docs = lazy(() => import('./pages/dealer/Docs'));
const Activations = lazy(() => import('./pages/dealer/Activations'));
const Products = lazy(() => import('./pages/dealer/Products'));
const AgentProducts = lazy(() => import('./pages/agent/Products'));
const AgentActivations = lazy(() => import('./pages/agent/Activations'));
const Upload = lazy(() => import('./pages/dealer/Upload'));
const Support = lazy(() => import('./pages/dealer/Support'));
const ObiettiviCompensi = lazy(() => import('./pages/agent/ObiettiviCompensi'));
const Incentivi = lazy(() => import('./pages/Incentivi'));
const Reportistica = lazy(() => import('./pages/agent/Reportistica'));
const ReportisticaV3 = lazy(() => import('./pages/agent/ReportisticaV3'));
const AgendaVisite = lazy(() => import('./pages/agent/Agenda'));
const CRMVisite = lazy(() => import('./pages/supermaster/CRMVisite'));
import './App.css';

// Componente per proteggere le route
function ProtectedRoute({ children, allowedRoles = [] }) {
  const { user, isAuthenticated } = useAuth();
  
  console.log('ProtectedRoute - isAuthenticated:', isAuthenticated);
  console.log('ProtectedRoute - user:', user);
  console.log('ProtectedRoute - allowedRoles:', allowedRoles);
  console.log('ProtectedRoute - user.role:', user?.role);
  
  // Se il token non è presente o l'utente non è autenticato, reindirizza al login
  if (!isAuthenticated || !getToken()) {
    return <Navigate to="/login" replace />;
  }
  const normalize = (s) => (s || '').toString().trim().toLowerCase().replace(/[^a-z]/g, '');
  const role = normalize(user?.role);
  const allowed = allowedRoles.map(r => normalize(r));
  console.log('ProtectedRoute - normalized role:', role, 'normalized allowed:', allowed, 'pathname:', window?.location?.pathname);
  // Consenti sempre l'accesso agli admin e superuser
  if (role === 'admin' || role === 'superuser') {
    return children;
  }
  if (allowedRoles.length > 0 && !allowed.includes(role)) {
    console.log('Access denied - role not allowed');
    return <Navigate to="/unauthorized" replace />;
  }
  
  return children;
}

// Pagina di logout: esegue logout e reindirizza al login
function Logout() {
  const { logout } = useAuth();
  useEffect(() => { logout(); }, []);
  return <Navigate to="/login" replace />;
}

// Componente principale dell'app
function AppContent() {
  const { isAuthenticated, loading, user, login, logout } = useAuth();
  const navigate = useNavigate();


  // Helper redirect per ruolo
  const normalize = (s) => (s || '').toString().trim().toLowerCase().replace(/[^a-z]/g, '');
  const redirectByRole = (role) => {
    const r = normalize(role);
    if (r === 'supermaster') return navigate('/supermaster');
    if (r === 'master') return navigate('/master');
    if (r === 'masterprodotti') return navigate('/masterprodotti');
    if (r === 'agente' || r === 'agent') return navigate('/agente');
    if (r === 'admin' || r === 'superuser') return navigate('/admin');
    return navigate('/dealer');
  };

  // Listener globale per postMessage (impersonate iframe)
  useEffect(() => {
    // Invia ACK all'avvio, utile quando l'iframe viene rediretto fuori da /login
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: 'IMPERSONATE_ACK' }, window.location.origin);
      }
    } catch {}

    const handler = async (ev) => {
      try {
        if (!ev || ev.origin !== window.location.origin) return;
        const data = ev.data || {};
        if (data.type === 'IMPERSONATE_ACK') {
          try { window.__LOGIN_FORM_READY = true; } catch {}
          return;
        }
        if (data.type === 'IMPERSONATE_RESET' || data.type === 'IMPERSONATE_LOGOUT') {
          await logout();
          // Porta l'app sulla pagina di login per montare il LoginForm e consentire l'ACK
          navigate('/login');
          return;
        }
        // Gestisci login impersonato solo se il LoginForm NON è montato (niente ACK)
        if (data.type === 'IMPERSONATE_LOGIN' && data.payload) {
          if (typeof window !== 'undefined' && window.__LOGIN_FORM_READY) {
            // Lascia che sia il LoginForm a gestirlo per evitare duplicazione
            return;
          }
          const { email: em, password: pw } = data.payload;
          if (!em || !pw) return;
          await logout();
          const result = await login(em, pw);
          redirectByRole(result?.role);
          return;
        }
      } catch (e) {
        console.error('[Impersonate] handler error', e);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);
  
  // Mostra loading durante il check dell'autenticazione
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Caricamento...</p>
        </div>
      </div>
    );
  }
  
  return (
      <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-gray-50"><div className="text-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div><p className="text-gray-600">Caricamento...</p></div></div>}>
      <Routes>
        {/* Route pubblica per login */}
        <Route 
          path="/login" 
          element={
            isAuthenticated 
              ? (() => {
                  const normalize = (s) => (s || '').toString().trim().toLowerCase().replace(/[^a-z]/g, '');
                  const role = normalize(user?.role);
                  if (role === 'master') return <Navigate to="/master" replace />;
                  if (role === 'supermaster') return <Navigate to="/supermaster" replace />;
                  if (role === 'masterprodotti') return <Navigate to="/masterprodotti" replace />;
                  if (role === 'agente' || role === 'agent') return <Navigate to="/agente" replace />;
                  if (role === 'admin' || role === 'superuser') return <Navigate to="/admin" replace />;
                  return <Navigate to="/dealer" replace />;
                })()
              : <LoginForm />
          } 
        />

        {/* Route pubblica per reset password */}
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        {/* Route per effettuare rapidamente il logout e pulire lo stato */}
        <Route path="/logout" element={<Logout />} />
        
        {/* Compat: redirect vecchio path dashboard */}
        <Route path="/dashboard" element={<Navigate to="/dealer" replace />} />

        {/* Admin - Dashboard */}
        <Route 
          path="/admin" 
          element={
            <ProtectedRoute allowedRoles={['admin', 'superuser']}>
              <AdminDashboard />
            </ProtectedRoute>
          } 
        />

        {/* Admin - Import unificato (FW Energia, RA, TLC) */}
        <Route 
          path="/admin/imports" 
          element={
            <ProtectedRoute allowedRoles={['admin', 'superuser']}>
              <AdminImport />
            </ProtectedRoute>
          } 
        />

        {/* Admin - Gestione Offerte */}
        <Route 
          path="/admin/gestione-offerte" 
          element={
            <ProtectedRoute allowedRoles={['admin', 'superuser']}>
              <AdminGestioneOfferte />
            </ProtectedRoute>
          } 
        />

        {/* Dealer - Dashboard */}
        <Route 
          path="/dealer" 
          element={
            <ProtectedRoute allowedRoles={['dealer']}>
              <DealerDashboard />
            </ProtectedRoute>
          } 
        />

        {/* Agente - Dashboard */}
        <Route 
          path="/agente" 
          element={
            <ProtectedRoute allowedRoles={['agente', 'agent']}>
              <AgentDashboard />
            </ProtectedRoute>
          } 
        />

        {/* Agente - Attivazioni */}
        <Route 
          path="/agente/attivazioni" 
          element={
            <ProtectedRoute allowedRoles={['agente', 'agent']}>
              <AgentActivations />
            </ProtectedRoute>
          } 
        />

        {/* Master - Dashboard (Home diversa) */}
        <Route 
          path="/master" 
          element={
            <ProtectedRoute allowedRoles={['master']}>
              <MasterDashboard />
            </ProtectedRoute>
          } 
        />

        {/* Master - Contratti */}
        <Route 
          path="/master/contratti" 
          element={
            <ProtectedRoute allowedRoles={['master']}>
              <MasterContratti />
            </ProtectedRoute>
          } 
        />

        {/* Master Prodotti - Dashboard (Home vuota con top e sidebar) */}
        <Route 
          path="/masterprodotti" 
          element={
            <ProtectedRoute allowedRoles={['masterprodotti']}>
              <MasterProdottiDashboard />
            </ProtectedRoute>
          } 
        />

        {/* Supermaster - Dashboard con sottosezioni */}
        <Route 
          path="/supermaster" 
          element={
            <ProtectedRoute allowedRoles={['supermaster']}>
              <SuperMasterDashboard />
            </ProtectedRoute>
          } 
        />

        {/* SuperMaster - Strumenti */}
        <Route 
          path="/supermaster/strumenti" 
          element={
            <ProtectedRoute allowedRoles={['supermaster']}>
              <SuperMasterStrumenti />
            </ProtectedRoute>
          } 
        />

        {/* SuperMaster - Geolocalizzazione */}
        <Route 
          path="/supermaster/geolocalizzazione" 
          element={
            <ProtectedRoute allowedRoles={['supermaster']}>
              <SuperMasterGeolocalizzazione />
            </ProtectedRoute>
          } 
        />

        {/* SuperMaster - Analisi */}
        <Route 
          path="/supermaster/analisi" 
          element={
            <ProtectedRoute allowedRoles={['supermaster']}>
              <SuperMasterAnalisiPage />
            </ProtectedRoute>
          } 
        />

        {/* SuperMaster - Analisi FW */}
        <Route 
          path="/supermaster/analisi-fw" 
          element={
            <ProtectedRoute allowedRoles={['supermaster']}>
              <SuperMasterAnalisiFw />
            </ProtectedRoute>
          }
        />

        {/* SuperMaster - Analisi SKY */}
        <Route
          path="/supermaster/analisi-sky"
          element={
            <ProtectedRoute allowedRoles={['supermaster']}>
              <SuperMasterAnalisiSky />
            </ProtectedRoute>
          }
        />

        {/* SuperMaster - Compensi */}
        <Route 
          path="/supermaster/compensi" 
          element={
            <ProtectedRoute allowedRoles={['supermaster']}>
              <SuperMasterCompensi />
            </ProtectedRoute>
          } 
        />

        {/* SuperMaster - Compensi Dealer */}
        <Route 
          path="/supermaster/compensi-dealer" 
          element={
            <ProtectedRoute allowedRoles={['supermaster']}>
              <SuperMasterCompensiDealer />
            </ProtectedRoute>
          } 
        />

        {/* SuperMaster - Dealer Trend */}
        <Route 
          path="/supermaster/dealer-trend" 
          element={
            <ProtectedRoute allowedRoles={['supermaster']}>
              <SuperMasterDealerTrend />
            </ProtectedRoute>
          } 
        />

        {/* SuperMaster - Piani Incentivazione (EDITOR JSON) */}
        <Route 
          path="/supermaster/piani-incentivazione" 
          element={
            <ProtectedRoute allowedRoles={['supermaster']}>
              <SuperMasterPianiIncentivazione />
            </ProtectedRoute>
          } 
        />

        {/* SuperMaster - Piani Incentivi Modulare (VIEWER a tab) */}
        <Route 
          path="/supermaster/piani-incentivi-modulare" 
          element={
            <ProtectedRoute allowedRoles={['supermaster']}>
              <SuperMasterPianiIncentiviModulare />
            </ProtectedRoute>
          } 
        />

        {/* SuperMaster - Attività Backend */}
        <Route 
          path="/supermaster/attivita-backend" 
          element={
            <ProtectedRoute allowedRoles={['supermaster']}>
              <SuperMasterAttivitaBackend />
            </ProtectedRoute>
          } 
        />

        {/* SuperMaster - CRM Visite */}
        <Route 
          path="/supermaster/crm-visite" 
          element={
            <ProtectedRoute allowedRoles={['supermaster']}>
              <CRMVisite />
            </ProtectedRoute>
          } 
        />

        {/* Dealer - Attivazioni */}
        <Route 
          path="/dealer/activations" 
          element={
            <ProtectedRoute allowedRoles={['dealer']}>
              <Activations />
            </ProtectedRoute>
          } 
        />

        {/* Agente - Attivazioni (identico a dealer) */}
        <Route 
          path="/agente/activations" 
          element={
            <ProtectedRoute allowedRoles={['agente', 'agent']}>
              <Activations />
            </ProtectedRoute>
          } 
        />

        {/* Master - Attivazioni (identico a dealer) */}
        <Route 
          path="/master/activations" 
          element={
            <ProtectedRoute allowedRoles={['master']}>
              <Activations />
            </ProtectedRoute>
          } 
        />

        {/* Master Prodotti - Compensi Agenti */}
        <Route 
          path="/masterprodotti/compensi-agenti" 
          element={
            <ProtectedRoute allowedRoles={['masterprodotti']}>
              <MasterProdottiCompensiAgenti />
            </ProtectedRoute>
          } 
        />

        {/* Supermaster - Attivazioni (identico a dealer) */}
        <Route 
          path="/supermaster/activations" 
          element={
            <ProtectedRoute allowedRoles={['supermaster']}>
              <Activations />
            </ProtectedRoute>
          } 
        />

        {/* Dealer - Dettaglio Attivazione (deep-link) */}
        <Route
          path="/dealer/activations/:id"
          element={
            <ProtectedRoute allowedRoles={['dealer']}>
              <DealerDashboard />
            </ProtectedRoute>
          }
        />

        {/* Master - Dettaglio Attivazione (deep-link) */}
        <Route
          path="/master/activations/:id"
          element={
            <ProtectedRoute allowedRoles={['master']}>
              <MasterDashboard />
            </ProtectedRoute>
          }
        />

        {/* Dealer - Prodotti */}
        <Route 
          path="/dealer/products" 
          element={
            <ProtectedRoute allowedRoles={['dealer']}>
              <Products />
            </ProtectedRoute>
          } 
        />

        {/* Agente - Prodotti (con filtro dealer e carrello specifico) */}
        <Route 
          path="/agente/products" 
          element={
            <ProtectedRoute allowedRoles={['agente', 'agent']}>
              <AgentProducts />
            </ProtectedRoute>
          } 
        />

        {/* Master - Prodotti (identico a dealer) */}
        <Route 
          path="/master/products" 
          element={
            <ProtectedRoute allowedRoles={['master']}>
              <Products />
            </ProtectedRoute>
          } 
        />

        {/* Master Prodotti - Compensi Dealer */}
        <Route 
          path="/masterprodotti/compensi-dealer" 
          element={
            <ProtectedRoute allowedRoles={['masterprodotti']}>
              <MasterProdottiCompensiDealer />
            </ProtectedRoute>
          } 
        />

        {/* Master Prodotti - Plafond */}
        <Route 
          path="/masterprodotti/plafond" 
          element={
            <ProtectedRoute allowedRoles={['masterprodotti']}>
              <MasterProdottiPlafond />
            </ProtectedRoute>
          } 
        />

        {/* Supermaster - Prodotti (identico a dealer) */}
        <Route 
          path="/supermaster/products" 
          element={
            <ProtectedRoute allowedRoles={['supermaster']}>
              <Products />
            </ProtectedRoute>
          } 
        />

        {/* Dealer - Upload */}
        <Route 
          path="/dealer/upload" 
          element={
            <ProtectedRoute allowedRoles={['dealer']}>
              <Upload />
            </ProtectedRoute>
          } 
        />

        {/* Agente - Upload (identico a dealer) */}
        <Route 
          path="/agente/upload" 
          element={
            <ProtectedRoute allowedRoles={['agente', 'agent']}>
              <Upload />
            </ProtectedRoute>
          } 
        />

        {/* Master - Upload (identico a dealer) */}
        <Route 
          path="/master/upload" 
          element={
            <ProtectedRoute allowedRoles={['master']}>
              <Upload />
            </ProtectedRoute>
          } 
        />

        {/* Master Prodotti - Upload (identico a dealer) */}
        <Route 
          path="/masterprodotti/upload" 
          element={
            <ProtectedRoute allowedRoles={['masterprodotti']}>
              <Upload />
            </ProtectedRoute>
          } 
        />

        {/* Supermaster - Upload (identico a dealer) */}
        <Route 
          path="/supermaster/upload" 
          element={
            <ProtectedRoute allowedRoles={['supermaster']}>
              <Upload />
            </ProtectedRoute>
          } 
        />

        {/* Dealer - Assistenza */}
        <Route 
          path="/dealer/support" 
          element={
            <ProtectedRoute allowedRoles={['dealer']}>
              <Support />
            </ProtectedRoute>
          } 
        />

        {/* Agente - Assistenza (identico a dealer) */}
        <Route 
          path="/agente/support" 
          element={
            <ProtectedRoute allowedRoles={['agente', 'agent']}>
              <Support />
            </ProtectedRoute>
          } 
        />

        {/* Agente - Obiettivi & Compensi */}
        <Route
          path="/agente/obiettivi-compensi"
          element={
            <ProtectedRoute allowedRoles={['agente', 'agent']}>
              <ObiettiviCompensi />
            </ProtectedRoute>
          }
        />

        {/* Agente - Reportistica */}
        <Route
          path="/agente/reportistica"
          element={
            <ProtectedRoute allowedRoles={['agente', 'agent']}>
              <Reportistica />
            </ProtectedRoute>
          }
        />

        {/* Agente - Reportistica V3 (Nuova Versione) */}
        <Route
          path="/agente/reportistica-v3"
          element={
            <ProtectedRoute allowedRoles={['agente', 'agent']}>
              <ReportisticaV3 />
            </ProtectedRoute>
          }
        />

        {/* Agente - Agenda Visite */}
        <Route
          path="/agente/agenda"
          element={
            <ProtectedRoute allowedRoles={['agente', 'agent']}>
              <AgendaVisite />
            </ProtectedRoute>
          }
        />
        <Route
          path="/agent/agenda"
          element={
            <ProtectedRoute allowedRoles={['agente', 'agent']}>
              <AgendaVisite />
            </ProtectedRoute>
          }
        />

        {/* Piani Incentivi - accesso per Dealer, Agente, Master, MasterProdotti, SuperMaster (TOTP step-up gestito nella pagina per Dealer) */}
        <Route
          path="/piani-incentivi"
          element={
            <ProtectedRoute allowedRoles={['dealer', 'agente', 'master', 'masterprodotti', 'supermaster']}>
              <Incentivi />
            </ProtectedRoute>
          }
        />

        {/* Alias per compatibilità con link esistenti */}
        <Route
          path="/dealer/incentives"
          element={
            <ProtectedRoute allowedRoles={['dealer']}>
              <Incentivi />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dealer/incentivi"
          element={
            <ProtectedRoute allowedRoles={['dealer']}>
              <Incentivi />
            </ProtectedRoute>
          }
        />

        {/* Master - Assistenza (identico a dealer) */}
        <Route 
          path="/master/support" 
          element={
            <ProtectedRoute allowedRoles={['master']}>
              <Support />
            </ProtectedRoute>
          } 
        />

        {/* Master Prodotti - Assistenza (identico a dealer) */}
        <Route 
          path="/masterprodotti/support" 
          element={
            <ProtectedRoute allowedRoles={['masterprodotti']}>
              <Support />
            </ProtectedRoute>
          } 
        />

        {/* Supermaster - Assistenza (identico a dealer) */}
        <Route 
          path="/supermaster/support" 
          element={
            <ProtectedRoute allowedRoles={['supermaster']}>
              <Support />
            </ProtectedRoute>
          } 
        />

        {/* ChatBot: pagina rimossa. Usare il widget flottante. */}

        {/* Dealer - Documentazione */}
        <Route 
          path="/dealer/docs" 
          element={
            <ProtectedRoute allowedRoles={['dealer']}>
              <Docs />
            </ProtectedRoute>
          } 
        />

        {/* Agente - Documentazione (identico a dealer) */}
        <Route 
          path="/agente/docs" 
          element={
            <ProtectedRoute allowedRoles={['agente', 'agent']}>
              <Docs />
            </ProtectedRoute>
          } 
        />

        {/* Master - Documentazione (identico a dealer) */}
        <Route 
          path="/master/docs" 
          element={
            <ProtectedRoute allowedRoles={['master']}>
              <Docs />
            </ProtectedRoute>
          } 
        />

        {/* Master Prodotti - Documentazione (identico a dealer) */}
        <Route 
          path="/masterprodotti/docs" 
          element={
            <ProtectedRoute allowedRoles={['masterprodotti']}>
              <Docs />
            </ProtectedRoute>
          } 
        />

        {/* Supermaster - Documentazione (identico a dealer) */}
        <Route 
          path="/supermaster/docs" 
          element={
            <ProtectedRoute allowedRoles={['supermaster']}>
              <Docs />
            </ProtectedRoute>
          } 
        />

        {/* Admin - Crea nuovo utente Station */}
        <Route
          path="/admin/users/create"
          element={
            <ProtectedRoute allowedRoles={['admin','superuser','master','supermaster']}>
              <AdminCreateUser />
            </ProtectedRoute>
          }
        />

        {/* Route di default - forza sempre il redirect a /login se non autenticato */}
        <Route 
          path="/" 
          element={<Navigate to="/login" replace />}
        />
        
        {/* Route per accesso non autorizzato */}
        <Route 
          path="/unauthorized" 
          element={
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
              <div className="text-center">
                <h1 className="text-2xl font-bold text-gray-900 mb-4">Accesso Non Autorizzato</h1>
                <p className="text-gray-600">Non hai i permessi per accedere a questa pagina.</p>
              </div>
            </div>
          } 
        />
        
        {/* Route catch-all per 404 */}
        <Route 
          path="*" 
          element={
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
              <div className="text-center">
                <h1 className="text-2xl font-bold text-gray-900 mb-4">Pagina Non Trovata</h1>
                <p className="text-gray-600">La pagina che stai cercando non esiste.</p>
              </div>
            </div>
          } 
        />
      </Routes>
      </Suspense>
  );
}

function App() {
  return (
    <Router>
      <AuthProvider>
        <Toaster position="top-right" />
        <AppContent />
      </AuthProvider>
    </Router>
  );
}

export default App;
