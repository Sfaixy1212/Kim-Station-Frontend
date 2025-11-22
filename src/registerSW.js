// Registrazione Service Worker per PWA
// MODALITÀ TEST: Nessun popup automatico di installazione

let deferredPrompt = null;

export function registerSW() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/service-worker.js')
        .then((registration) => {
          console.log('[PWA] Service Worker registrato:', registration.scope);
          
          // Controlla aggiornamenti ogni 60 secondi
          setInterval(() => {
            registration.update();
          }, 60000);
        })
        .catch((error) => {
          console.error('[PWA] Registrazione Service Worker fallita:', error);
        });
    });
  }

  // Cattura l'evento beforeinstallprompt ma NON mostrare popup automatico
  window.addEventListener('beforeinstallprompt', (e) => {
    console.log('[PWA] App installabile - Evento catturato');
    
    // Previeni il popup automatico del browser
    e.preventDefault();
    
    // Salva l'evento per uso manuale futuro
    deferredPrompt = e;
    
    // Log per debug (puoi vedere nella console quando l'app è installabile)
    console.log('[PWA] Per installare manualmente, apri DevTools > Application > Manifest > Install');
  });

  // Evento quando l'app viene installata
  window.addEventListener('appinstalled', () => {
    console.log('[PWA] App installata con successo!');
    deferredPrompt = null;
  });
}

// Funzione per installazione manuale (per uso futuro quando vorrai il popup)
export function showInstallPrompt() {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then((choiceResult) => {
      if (choiceResult.outcome === 'accepted') {
        console.log('[PWA] Utente ha accettato installazione');
      } else {
        console.log('[PWA] Utente ha rifiutato installazione');
      }
      deferredPrompt = null;
    });
  } else {
    console.log('[PWA] Prompt di installazione non disponibile');
  }
}

// Controlla se l'app è già installata
export function isInstalled() {
  return window.matchMedia('(display-mode: standalone)').matches ||
         window.navigator.standalone === true;
}
