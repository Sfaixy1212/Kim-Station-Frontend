import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export default function ImpersonateModal({ isOpen, onClose, selectedKey, credsMap }) {
  const iframeRef = useRef(null);
  const [acked, setAcked] = useState(false);
  const sentRef = useRef(false);

  // Disabilita scroll del body quando aperta
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [isOpen]);

  // Ricevi ACK dall'iframe; quando arriva, invia login una sola volta
  useEffect(() => {
    if (!isOpen) return;
    sentRef.current = false;
    const handler = (ev) => {
      try {
        if (ev.origin !== window.location.origin) return;
        if (ev.data && ev.data.type === 'IMPERSONATE_ACK') {
          setAcked(true);
          // invia login una sola volta al ricevimento dell'ACK
          try {
            if (sentRef.current) return;
            const iframe = iframeRef.current;
            const creds = credsMap?.[selectedKey];
            if (!iframe || !creds) return;
            iframe.contentWindow?.postMessage({ type: 'IMPERSONATE_LOGIN', payload: { email: creds.email, password: creds.password } }, window.location.origin);
            sentRef.current = true;
          } catch {}
        }
      } catch {}
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [isOpen]);

  // All'apertura: reset della sessione nell'iframe e fallback di invio dopo 1s se l'ACK tarda
  useEffect(() => {
    if (!isOpen) return;
    setAcked(false);
    sentRef.current = false;
    try {
      const iframe = iframeRef.current;
      iframe?.contentWindow?.postMessage({ type: 'IMPERSONATE_RESET' }, window.location.origin);
    } catch {}
    const t = setTimeout(() => {
      try {
        if (sentRef.current) return;
        const iframe = iframeRef.current;
        const creds = credsMap?.[selectedKey];
        if (!iframe || !creds) return;
        iframe.contentWindow?.postMessage({ type: 'IMPERSONATE_LOGIN', payload: { email: creds.email, password: creds.password } }, window.location.origin);
        sentRef.current = true;
      } catch {}
    }, 1000);
    return () => clearTimeout(t);
  }, [isOpen, selectedKey]);

  // Sul load dell'iframe invia nuovamente RESET e poi LOGIN (riduce casi in cui il frame non era pronto)
  useEffect(() => {
    if (!isOpen) return;
    const iframe = iframeRef.current;
    if (!iframe) return;
    const onLoad = () => {
      try {
        const creds = credsMap?.[selectedKey];
        iframe.contentWindow?.postMessage({ type: 'IMPERSONATE_RESET' }, window.location.origin);
        setTimeout(() => {
          if (!creds) return;
          iframe.contentWindow?.postMessage({ type: 'IMPERSONATE_LOGIN', payload: { email: creds.email, password: creds.password } }, window.location.origin);
        }, 200);
      } catch {}
    };
    iframe.addEventListener('load', onLoad);
    return () => iframe.removeEventListener('load', onLoad);
  }, [isOpen, selectedKey, credsMap]);

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-[95vw] h-[85vh] max-w-6xl overflow-hidden border border-gray-200">
        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 bg-gray-50">
          <div className="text-sm text-gray-700">Sessione embedded • Accedi come: <strong>{credsMap?.[selectedKey]?.label || selectedKey}</strong></div>
          <button onClick={onClose} className="px-3 py-1.5 text-sm rounded-md bg-gray-100 hover:bg-gray-200 text-gray-700">Chiudi</button>
        </div>
        <iframe ref={iframeRef} title="Impersonate" src={`/login?imp=${encodeURIComponent(selectedKey)}&t=${Date.now()}`} className="block w-full h-[calc(85vh-40px)]" />
      </div>
    </div>,
    document.body
  );
}
