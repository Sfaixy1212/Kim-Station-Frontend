import axios from 'axios';

// Usa '/api' come default sicuro se VITE_API_BASE non è definita
const baseURL = (import.meta.env.VITE_API_BASE?.replace(/\/$/, '') || '/api');

const api = axios.create({
  baseURL,
  // withCredentials: false,
  timeout: 60000, // 60 secondi per upload foto grandi
});

api.interceptors.request.use((config) => {
  // Evita doppio /api quando baseURL termina con /api e l'endpoint inizia con /api/
  try {
    const base = api.defaults.baseURL || '';
    if (typeof config.url === 'string') {
      const startsWithApi = config.url.startsWith('/api/');
      const baseEndsWithApi = /\/api\/?$/.test(base);
      if (startsWithApi && baseEndsWithApi) {
        // rimuovi il prefisso /api dall'url richiesta
        config.url = config.url.replace(/^\/api\//, '/');
      }
    }
  } catch {}
  try {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${token}`;
    }
  } catch {}
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    // Normalizza l'errore
    const status = err?.response?.status;
    const data = err?.response?.data;
    let message = data?.message || err.message || 'Request error';
    if (status === 413) {
      message = 'Una o più foto superano il limite di 10MB. Riduci la dimensione delle immagini o comprimi le foto prima di caricarle.';
    }
    err.normalized = { status, message, data };
    return Promise.reject(err);
  }
);

// Helper per upload: passare direttamente FormData senza impostare Content-Type
export const upload = (url, formData, config = {}) =>
  api.post(url, formData, {
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
    ...config,
  });

export default api;
