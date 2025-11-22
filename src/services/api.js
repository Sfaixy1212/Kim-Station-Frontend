// Base URL delle API: per setup con proxy Nginx usa "/api"
import { toast } from 'react-hot-toast';
const API_BASE = import.meta.env.VITE_API_BASE || '/api';
// Abilita i mock SOLO se esplicitamente richiesti: VITE_USE_MOCK === 'true'
// In produzione il default è disattivato.
const USE_MOCK = String(import.meta.env.VITE_USE_MOCK).toLowerCase() === 'true';
if (USE_MOCK) {
  // Evidenzia in console quando i mock sono attivi
  // utile per evitare fraintendimenti in ambienti reali
  try { console.warn('[AUTH] USE_MOCK attivo: il login accetta solo credenziali mock'); } catch {}
}

// Storage helper: in iframe usa sessionStorage per isolare la sessione dal parent
function getStorage() {
  try {
    const inIframe = typeof window !== 'undefined' && window.top !== window.self;
    return inIframe ? window.sessionStorage : window.localStorage;
  } catch {
    return window.localStorage;
  }
}

// Funzione per ottenere il token
const getToken = () => {
  try { return getStorage().getItem("token"); } catch { return null; }
};

// Funzione per rimuovere il token (logout)
const removeToken = () => { try { getStorage().removeItem("token"); } catch {} };

// Funzione per salvare il token
const saveToken = (token) => { try { getStorage().setItem("token", token); } catch {} };

// Gestione centralizzata errori auth
function handleAuthStatus(status) {
  try {
    if (status === 401) {
      try { toast.dismiss(); toast.error('Sessione scaduta. Effettua di nuovo il login.'); } catch {}
      removeToken();
      // Pulisci eventuali token elevati
      try { localStorage.removeItem('token_incentivi'); localStorage.removeItem('token_base_cache'); } catch {}
      if (typeof window !== 'undefined') window.location.href = '/login';
    }
    if (status === 403) {
      try { toast.dismiss(); toast.error('Accesso non autorizzato. Accedi con un profilo abilitato.'); } catch {}
      if (typeof window !== 'undefined') window.location.href = '/unauthorized';
    }
  } catch {}
}

// Funzione generica per fare chiamate API
async function apiCall(endpoint, options = {}) {
  const token = getToken();
  
  const config = {
    headers: {
      "Content-Type": "application/json",
      ...(token && { "Authorization": `Bearer ${token}` }),
      ...options.headers,
    },
    ...options,
  };

  const url = `${API_BASE || ''}${endpoint}`;
  const response = await fetch(url, config);
  
  if (!response.ok) {
    const status = response.status;
    let body = '';
    try { body = await response.text(); } catch {}
    // Gestione 401/403 globale
    if (status === 401 || status === 403) {
      handleAuthStatus(status);
      if (status === 401) {
        throw new Error('Sessione scaduta. Effettua di nuovo il login.');
      }
      if (status === 403) {
        throw new Error('Permesso negato. Accedi con un profilo autorizzato.');
      }
    }
    throw new Error('Si è verificato un errore. Riprova più tardi.');
  }
  
  return await response.json();
}

// Funzioni di autenticazione
export async function login(email, password) {
  try {
    if (USE_MOCK) {
      console.log('Attempting mock login with:', { email, password });
      if (email === 'dealer@test.com' && password === 'password') {
        const mockData = {
          token: 'mock-jwt-token-dealer-12345',
          user: {
            id: 1,
            email: 'dealer@test.com',
            name: 'Mario Rossi',
            role: 'dealer',
            credit: 0,
            permissions: ['view_dashboard', 'manage_orders', 'view_activations']
          }
        };
        saveToken(mockData.token);
        console.log('Mock login successful:', mockData);
        return mockData;
      }
      throw new Error('Credenziali non valide. Usa: dealer@test.com / password');
    }

    // Real backend login
    if (!API_BASE) throw new Error('Base API non configurata');
    const res = await fetch(`${API_BASE}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    if (!res.ok) {
      if (res.status === 401 || res.status === 400) {
        throw new Error('Credenziali non valide. Verifica email e password.');
      }
      throw new Error(`Errore ${res.status} durante il login`);
    }
    const data = await res.json();
    if (!data?.token) throw new Error('Token mancante nella risposta');
    saveToken(data.token);
    return data; // atteso { token, user }
  } catch (error) {
    console.error('Login error:', error);
    throw error;
  }
}

export async function logout() {
  removeToken();
  try {
    // Clear elevated incentives token and base cache to prevent cross-role leakage
    const s = getStorage();
    s.removeItem('token_incentivi');
    s.removeItem('token_base_cache');
  } catch {}
  // Evita chiamate backend se in mock o se la base API non è configurata
  if (USE_MOCK || !API_BASE) return;
  try {
    await apiCall('/logout', { method: 'POST' });
  } catch (error) {
    console.error('Logout error:', error);
  }
}

// Funzioni per chiamate protette
export async function getProtectedData(endpoint) {
  try {
    return await apiCall(endpoint);
  } catch (error) {
    if (error.message.includes('401')) {
      // Token scaduto o non valido
      removeToken();
      window.location.href = '/login'; // Redirect al login
    }
    throw error;
  }
}

export async function postProtectedData(endpoint, data) {
  try {
    return await apiCall(endpoint, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  } catch (error) {
    if (error.message.includes('401')) {
      removeToken();
      window.location.href = '/login';
    }
    throw error;
  }
}

export async function putProtectedData(endpoint, data) {
  try {
    return await apiCall(endpoint, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  } catch (error) {
    if (error.message.includes('401')) {
      removeToken();
      window.location.href = '/login';
    }
    throw error;
  }
}

// Invio PATCH con JSON protetto
export async function patchProtectedData(endpoint, data) {
  try {
    return await apiCall(endpoint, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  } catch (error) {
    if (error.message.includes('401')) {
      removeToken();
      window.location.href = '/login';
    }
    throw error;
  }
}

// Invio DELETE con JSON protetto
export async function deleteProtectedData(endpoint, data) {
  try {
    return await apiCall(endpoint, {
      method: 'DELETE',
      body: data ? JSON.stringify(data) : undefined,
    });
  } catch (error) {
    if (error.message.includes('401')) {
      removeToken();
      window.location.href = '/login';
    }
    throw error;
  }
}

export async function getFastwebQualityRanking(params = {}) {
  const search = new URLSearchParams();
  if (params.scope) search.set('scope', params.scope);
  if (Number.isInteger(params.year)) search.set('year', String(params.year));
  if (Number.isInteger(params.month)) search.set('month', String(params.month));
  const query = search.toString();
  return await apiCall(`/supermaster/fastweb/quality-ranking${query ? `?${query}` : ''}`);
}

export async function getSkyQualityRanking(params = {}) {
  const search = new URLSearchParams();
  if (params.scope) search.set('scope', params.scope);
  if (Number.isInteger(params.year)) search.set('year', String(params.year));
  if (Number.isInteger(params.month)) search.set('month', String(params.month));
  const query = search.toString();
  return await apiCall(`/supermaster/sky/quality-ranking${query ? `?${query}` : ''}`);
}

export async function getSkyQualityTrend(params = {}) {
  const search = new URLSearchParams();
  if (params.scope) search.set('scope', params.scope);
  if (Number.isInteger(params.monthsBack)) search.set('monthsBack', String(params.monthsBack));
  const query = search.toString();
  return await apiCall(`/supermaster/sky/trend${query ? `?${query}` : ''}`);
}

// Invio multipart/form-data senza impostare Content-Type manualmente
export async function postFormData(endpoint, formData) {
  const token = getToken();
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const url = `${API_BASE || ''}${endpoint}`;
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: formData,
  });
  if (!res.ok) {
    const status = res.status;
    let body = '';
    try { body = await res.text(); } catch {}
    if (status === 401 || status === 403) {
      handleAuthStatus(status);
      if (status === 401) throw new Error('Sessione scaduta. Effettua di nuovo il login.');
      if (status === 403) throw new Error('Accesso non autorizzato. Accedi con un profilo abilitato.');
    }
    throw new Error('Si è verificato un errore durante il caricamento. Riprova.');
  }
  return await res.json();
}

// Utility per verificare se l'utente è autenticato
export function isAuthenticated() {
  return !!getToken();
}

export { getToken, removeToken, saveToken, apiCall };

// Variante per risposte binarie (Blob), con stessa gestione errori friendly
export async function apiCallBlob(endpoint, options = {}) {
  const token = getToken();
  const config = {
    ...options,
    headers: {
      'Accept': 'application/pdf,application/octet-stream,*/*',
      ...(options.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  };
  const url = `${API_BASE || ''}${endpoint}`;
  const response = await fetch(url, config);
  if (!response.ok) {
    const status = response.status;
    try { await response.text(); } catch {}
    if (status === 401 || status === 403) {
      handleAuthStatus(status);
      if (status === 401) throw new Error('Sessione scaduta. Effettua di nuovo il login.');
      if (status === 403) throw new Error('Accesso non autorizzato. Accedi con un profilo abilitato.');
    }
    throw new Error('Si è verificato un errore. Riprova più tardi.');
  }
  return await response.blob();
}

// ====== Incentivi & MFA (TOTP) specific APIs ======
// Elevated token storage helpers
export const getElevatedToken = () => { try { return getStorage().getItem('token_incentivi'); } catch { return null; } };
export const saveElevatedToken = (token) => { try { getStorage().setItem('token_incentivi', token); } catch {} };
export const removeElevatedToken = () => { try { getStorage().removeItem('token_incentivi'); } catch {} };
export const getTokenBaseCache = () => { try { return getStorage().getItem('token_base_cache'); } catch { return null; } };
export const setTokenBaseCache = (val) => { try { getStorage().setItem('token_base_cache', val || ''); } catch {} };

// Verify TOTP to obtain elevated token (uses base JWT auth implicitly via apiCall)
export async function verifyTotp(code) {
  return await apiCall('/auth/totp/verify', {
    method: 'POST',
    body: JSON.stringify({ code }),
  });
}

// MFA enroll and verify enrollment
export async function mfaEnroll() {
  return await apiCall('/mfa/totp/enroll', { method: 'POST' });
}

export async function mfaVerifyEnrollment(code) {
  return await apiCall('/mfa/totp/verify-enrollment', {
    method: 'POST',
    body: JSON.stringify({ code }),
  });
}

// MFA: stato enrollment (ritorna { enrolled: boolean })
export async function mfaStatus() {
  try {
    return await apiCall('/mfa/totp/status');
  } catch (e) {
    // Se l'endpoint non esiste ancora, falla degradare a false
    return { enrolled: false };
  }
}

// MFA: reset OTP (ritorna { reset: true })
export async function mfaReset() {
  return await apiCall('/mfa/totp/reset', { method: 'POST' });
}

// Fetch piani incentivi with elevated token in Authorization header
export async function getPianiIncentiviWithElevated(elevatedToken) {
  const url = `${API_BASE || ''}/piani-incentivi`;
  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...(elevatedToken ? { Authorization: `Bearer ${elevatedToken}` } : {}),
    },
  });
  if (!res.ok) {
    const status = res.status;
    let body = '';
    try { body = await res.text(); } catch {}
    if (status === 401 || status === 403) handleAuthStatus(status);
    throw new Error(`HTTP ${status} on ${url}${body ? ` -> ${body}` : ''}`);
  }
  return await res.json();
}

// Base-token variant (no elevated header, relies on apiCall which injects base token)
export async function getPianiIncentiviBase() {
  return await apiCall('/piani-incentivi');
}
