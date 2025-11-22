import api from './client';

// Invia un messaggio al bot tramite backend proxy
// Richiede autenticazione JWT (il client la aggiunge in header Authorization)
export async function sendChatMessage(text) {
  if (!text || typeof text !== 'string' || !text.trim()) {
    throw new Error('Messaggio vuoto');
  }
  const { data } = await api.post('/api/proxy/chat', { text: text.trim() });
  return data; // atteso { reply, ... }
}
