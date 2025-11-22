import { createContext, useContext, useState, useEffect } from 'react';
import { USER_ROLES, hasPermission, hasRoleAccess } from '../types/auth';
import { login as apiLogin, logout as apiLogout, isAuthenticated, getToken } from '../services/api';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

// Funzione per decodificare JWT (definita fuori dal componente per evitare ricreazioni)
const decodeJWT = (token) => {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const json = atob(padded);
    return JSON.parse(json);
  } catch (e) {
    console.error('JWT decode error', e);
    return null;
  }
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const normalizeUserFromPayload = (payload, candidate) => {
    if (!payload) return null;
    // Se non c'è candidate, usa il payload stesso
    if (!candidate) candidate = payload.user || payload.data?.user || payload.account || payload.profile || null;

    // Supporta diversi claim id: userId (nostro backend), dealerId (dealer), user_id, id, sub
    const id = candidate?.id ?? payload.user_id ?? payload.userId ?? payload.dealerId ?? payload.id ?? payload.sub ?? null;
    const email = candidate?.email ?? payload.email ?? payload.user_email ?? null;
    const name = candidate?.name ?? payload.name ?? ([payload.first_name, payload.last_name].filter(Boolean).join(' ') || null);
    // Estrazione flessibile del ruolo
    let roleRaw = (
      payload.role ?? candidate?.role ?? payload.user_role ??
      // Varianti comuni
      (Array.isArray(payload.roles) ? payload.roles[0] : payload.roles) ??
      (Array.isArray(candidate?.roles) ? candidate.roles[0] : candidate?.roles) ??
      payload.Ruolo ?? payload.ruolo ?? candidate?.Ruolo ?? candidate?.ruolo ??
      payload.Ruoli ?? payload.ruoli ?? candidate?.Ruoli ?? candidate?.ruoli ??
      'dealer'
    );
    if (Array.isArray(roleRaw)) roleRaw = roleRaw[0];
    const role = (roleRaw ? String(roleRaw) : 'dealer').toLowerCase();
    const permissions = payload.permissions || candidate?.permissions || [];
    // agentenome: nome agente da usare per filtri lato backend
    const agentenome = (
      candidate?.agentenome ?? payload.agentenome ??
      candidate?.AgenteNome ?? payload.AgenteNome ??
      candidate?.agenteNome ?? payload.agenteNome ??
      null
    );
    // dealerName / ragione sociale per dealer
    const dealerName = (
      candidate?.dealerName ?? payload.dealerName ??
      candidate?.ragioneSociale ?? payload.ragioneSociale ??
      candidate?.RagioneSociale ?? payload.RagioneSociale ??
      null
    );
    const credit = candidate?.credit ?? payload.credit; // opzionale per Header
    const idGruppo = candidate?.idGruppo ?? payload.idGruppo ?? payload.IDGruppo ?? payload.idgruppo ?? null;

    console.log('[DEBUG AuthContext] payload:', payload);
    console.log('[DEBUG AuthContext] candidate:', candidate);
    console.log('[DEBUG AuthContext] idGruppo extracted:', idGruppo);

    if (!id) return null;

    const userObj = { id, email, name, role, permissions, credit, agentenome, dealerName, idGruppo };
    console.log('[DEBUG AuthContext] Final user object:', userObj);
    console.log('[CRITICAL] idGruppo in user object:', userObj.idGruppo, new Date().toISOString());
    return userObj;
  };

  // Verifica autenticazione al caricamento
  useEffect(() => {
    const checkAuth = async () => {
      if (isAuthenticated()) {
        try {
          const token = getToken();
          
          // Gestione token mock
          if (token === 'mock-jwt-token-dealer-12345') {
            setUser({
              id: 1,
              email: 'dealer@test.com',
              name: 'Mario Rossi',
              role: 'dealer',
              permissions: ['view_dashboard', 'manage_orders', 'view_activations']
            });
            setLoading(false);
            return;
          }
          
          // Token reale: decodifica e normalizza
          const payload = decodeJWT(token);
          if (!payload) {
            console.error('Token JWT non valido');
            await logout();
            setLoading(false);
            return;
          }
          
          const normalizedUser = normalizeUserFromPayload(payload, null);
          if (!normalizedUser) {
            console.error('Impossibile normalizzare utente dal token');
            await logout();
            setLoading(false);
            return;
          }
          
          setUser(normalizedUser);
        } catch (error) {
          // Soft fallback: non spammiamo la console, eseguiamo logout
          console.error('Errore checkAuth:', error);
          await logout();
          setLoading(false);
          return;
        }
      }
      setLoading(false);
    };

    checkAuth();
  }, []);

  const login = async (emailOrCredentials, password) => {
    try {
      setError(null);
      
      // Gestione parametri flessibile
      let email, pass;
      if (typeof emailOrCredentials === 'string') {
        email = emailOrCredentials;
        pass = password;
      } else {
        email = emailOrCredentials.email;
        pass = emailOrCredentials.password;
      }
      
      const response = await apiLogin(email, pass);
      
      // Decodifica il token per ottenere idGruppo e aggiorna l'utente
      if (response?.token) {
        const token = response.token;
        const payload = decodeJWT(token);
        const normalizedUser = normalizeUserFromPayload(payload, response.user);
        
        console.log('[DEBUG Login] Token payload:', payload);
        console.log('[DEBUG Login] Normalized user:', normalizedUser);
        
        if (normalizedUser) {
          setUser(normalizedUser);
        }
      }
      
      return response;
    } catch (err) {
      // Estrai il messaggio di errore dall'oggetto Error
      const errorMessage = err?.message || 'Errore durante il login. Riprova.';
      setError(errorMessage);
      throw err;
    }
  };

  const logout = async () => {
    try {
      await apiLogout();
    } catch (err) {
      console.error('Logout error:', err);
    }
    setUser(null);
    setError(null);
    setLoading(false);
  };

  // Helper functions per controllo permessi
  const checkPermission = (permission) => {
    if (!user) return false;
    return hasPermission(user.role, permission);
  };

  const checkRoleAccess = (requiredRole) => {
    if (!user) return false;
    return hasRoleAccess(user.role, requiredRole);
  };

  const isRole = (role) => {
    return user?.role === role;
  };

  const value = {
    user,
    loading,
    error,
    setError,
    login,
    logout,
    checkPermission,
    checkRoleAccess,
    isRole,
    // Considera autenticato solo se abbiamo user e token valido presente in storage
    isAuthenticated: !!(user && getToken()),
    // Shortcuts per ruoli specifici
    isDealer: () => isRole(USER_ROLES.DEALER),
    isMaster: () => isRole(USER_ROLES.MASTER),
    isMasterProdotti: () => isRole(USER_ROLES.MASTER_PRODOTTI),
    isAgente: () => isRole(USER_ROLES.AGENTE),
    isSuperMaster: () => isRole(USER_ROLES.SUPER_MASTER),
    isAdmin: () => isRole(USER_ROLES.ADMIN)
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
