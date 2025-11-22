import { useEffect, useRef, useState } from 'react';
import { sendChatMessage } from '../../api/chat';

// Funzione per convertire URL in link cliccabili con etichette personalizzate
function renderTextWithLinks(text, isUserMessage = false) {
  if (!text) return text;
  
  // Mappa degli URL con le loro etichette personalizzate
  const urlLabels = {
    'https://kimweb.agency/wp-content/uploads/BOT/Disponibili.pdf': 'TERMINALI DISPONIBILI',
    'https://kimweb.agency/wp-content/uploads/BOT/Retail.pdf': 'TERMINALI ORDINABILI'
  };
  
  // Regex per trovare URL (http, https, www)
  const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+)/g;
  
  // Dividi il testo in parti, alternando testo normale e URL
  const parts = text.split(urlRegex);
  
  return parts.map((part, index) => {
    // Se la parte corrisponde a un URL
    if (part.match(urlRegex)) {
      // Assicurati che l'URL abbia il protocollo
      const url = part.startsWith('http') ? part : `https://${part}`;
      
      // Trova l'etichetta personalizzata o usa l'URL originale
      const displayText = urlLabels[url] || part;
      
      // Colori diversi per messaggi utente (sfondo blu) vs bot (sfondo grigio)
      const linkClasses = isUserMessage 
        ? "text-blue-200 hover:text-white underline font-medium inline-flex items-center gap-1"
        : "text-blue-600 hover:text-blue-800 underline font-medium inline-flex items-center gap-1";
      
      return (
        <a
          key={index}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className={linkClasses}
          onClick={(e) => e.stopPropagation()}
        >
          {displayText}
          {/* Icona per indicare link esterno */}
          <svg className="w-3 h-3 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </a>
      );
    }
    // Altrimenti restituisci il testo normale
    return part;
  });
}

export default function ChatbotWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState(() => {
    try {
      const cached = sessionStorage.getItem('chatbot_history');
      return cached ? JSON.parse(cached) : [{ role: 'bot', text: 'Ciao! Sono la ChatBot di KIM. Come posso aiutarti?' }];
    } catch { return [{ role: 'bot', text: 'Ciao! Sono la ChatBot di KIM. Come posso aiutarti?' }]; }
  });
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const listRef = useRef(null);

  // Persist history per sessione
  useEffect(() => {
    try { sessionStorage.setItem('chatbot_history', JSON.stringify(messages.slice(-50))); } catch {}
  }, [messages]);

  // Auto scroll
  useEffect(() => {
    try { listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' }); } catch {}
  }, [messages, loading]);

  // Eventi globali
  useEffect(() => {
    const onOpen = () => setOpen(true);
    const onToggle = () => setOpen((v) => !v);
    window.addEventListener('open-chatbot', onOpen);
    window.addEventListener('toggle-chatbot', onToggle);
    return () => {
      window.removeEventListener('open-chatbot', onOpen);
      window.removeEventListener('toggle-chatbot', onToggle);
    };
  }, []);

  async function handleSend(e) {
    e?.preventDefault?.();
    const text = input.trim();
    if (!text) return;
    setError('');
    setLoading(true);
    setMessages((prev) => [...prev, { role: 'me', text }]);
    setInput('');
    try {
      const res = await sendChatMessage(text);
      const reply = res?.reply || res?.message || 'Ok, ricevuto.';
      setMessages((prev) => [...prev, { role: 'bot', text: String(reply) }]);
    } catch (err) {
      const msg = err?.normalized?.message || err?.message || 'Errore durante l\'invio';
      setError(msg);
      setMessages((prev) => [...prev, { role: 'bot', text: 'Non riesco a contattare il servizio. Riprova più tardi.' }]);
    } finally {
      setLoading(false);
    }
  }

  // SVG Icons (Heroicons-like)
  const ChatIcon = ({ className = 'h-6 w-6' }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <path d="M7 8h6M7 12h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M5 3h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-4l-3.6 3.6c-.9.9-2.4.3-2.4-1V16H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
    </svg>
  );
  const CloseIcon = ({ className = 'h-5 w-5' }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
  const PlaneIcon = ({ className = 'h-5 w-5' }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <path d="M3 11l18-8-8 18-2-7-8-3Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
    </svg>
  );

  // Floating toggle button (sempre visibile)
  return (
    <>
      {/* Floating toggle fab */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="fixed z-40 bottom-4 right-4 h-12 w-12 rounded-full bg-blue-600 text-white shadow-lg hover:bg-blue-700 focus:outline-none transition-transform active:scale-95"
        aria-label={open ? 'Chiudi ChatBot' : 'Apri ChatBot'}
        title={open ? 'Chiudi ChatBot' : 'Apri ChatBot'}
      >
        <span className="relative inline-flex items-center justify-center h-full w-full">
          {open ? <CloseIcon /> : <ChatIcon />}
          {!open && (
            <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-emerald-400 shadow ring-2 ring-white animate-pulse" />
          )}
        </span>
      </button>

      {/* Panel */}
      {open && (
        <div className="fixed z-50 bottom-20 right-4 w-[92vw] max-w-sm rounded-2xl bg-white/95 backdrop-blur shadow-2xl border border-gray-200 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white">
            <div className="flex items-center gap-3">
              {/* Robot svg con micro-animazioni */}
              <div className="relative h-8 w-8 rounded-full bg-white/15 flex items-center justify-center shadow-inner">
                <svg viewBox="0 0 64 64" className="h-7 w-7 text-white" aria-hidden>
                  <circle cx="32" cy="10" r="3" className="fill-current opacity-90" />
                  <rect x="31" y="10" width="2" height="6" className="fill-current opacity-90" />
                  <rect x="14" y="18" width="36" height="26" rx="8" ry="8" className="fill-white/95" />
                  <circle cx="26" cy="31" r="4" className="fill-blue-600 origin-center animate-[blink_3.5s_infinite]" />
                  <circle cx="38" cy="31" r="4" className="fill-blue-600 origin-center animate-[blink_4.2s_infinite_0.3s]" />
                  <rect x="24" y="38" width="16" height="3" rx="1.5" className="fill-blue-500" />
                </svg>
                <span className="absolute inset-0 rounded-full ring-2 ring-white/20 animate-[pulseGlow_2.8s_ease-in-out_infinite]" />
              </div>
              <div className="text-sm font-semibold">ChatBot Assistenza</div>
            </div>
            <button onClick={() => setOpen(false)} className="text-white/90 hover:text-white transition-transform active:scale-95" aria-label="Chiudi">
              <CloseIcon />
            </button>
          </div>

          {/* Messages */}
          <div ref={listRef} className="p-3 max-h-96 overflow-y-auto space-y-2 bg-white">
            {messages.map((m, idx) => (
              <div key={idx} className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed shadow-sm transition-all ${m.role === 'me' ? 'ml-auto bg-gradient-to-r from-blue-600 to-indigo-600 text-white' : 'bg-gray-100 text-gray-900'}`}>
                {renderTextWithLinks(m.text, m.role === 'me')}
              </div>
            ))}
            {loading && (
              <div className="inline-flex items-center gap-2 rounded-2xl bg-gray-100 text-gray-700 px-3 py-2 text-sm">
                <span className="inline-block h-2 w-2 rounded-full bg-gray-400 animate-bounce" />
                <span className="inline-block h-2 w-2 rounded-full bg-gray-400 animate-[bounce_1.2s_infinite_0.2s]" />
                <span className="inline-block h-2 w-2 rounded-full bg-gray-400 animate-[bounce_1.2s_infinite_0.4s]" />
                <span className="ml-2">Scrivendo…</span>
              </div>
            )}
            {!!error && <div className="text-xs text-red-600">{error}</div>}
          </div>

          {/* Input */}
          <form onSubmit={handleSend} className="border-t border-gray-100 p-2 bg-white">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Scrivi un messaggio…"
                className="flex-1 rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={loading}
              />
              <button type="submit" disabled={loading || !input.trim()} className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-3 py-2 disabled:opacity-60 inline-flex items-center gap-2 transition-transform active:scale-95">
                <PlaneIcon className="h-5 w-5" />
                <span className="hidden sm:inline">Invia</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
