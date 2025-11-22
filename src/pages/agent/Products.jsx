import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { useAuth } from '../../contexts/AuthContext';
import ProductCard from '../../components/products/ProductCard';
import useProdotti from '../../hooks/prodotti/useProdotti';
import useAgenteDealers from '../../hooks/agent/useAgenteDealers';
import DealerFilterBar from '../../components/agent/DealerFilterBar';
import AgentCart from '../../components/cart/AgentCart';
import api from '../../api/client';

export default function AgentProducts() {
  const { user } = useAuth();
  const [cartItems, setCartItems] = useState([]);
  const [transportMethod, setTransportMethod] = useState('Invio da Sede');
  const [notes, setNotes] = useState('');
  const cartRef = useRef(null);
  const [query, setQuery] = useState('');
  const [photos, setPhotos] = useState([]);
  // Mostriamo solo SIM
  const { data: products = [], loading, error, refetch } = useProdotti('SIM');
  const { dealers, idAgente } = useAgenteDealers();
  const [selectedDealerId, setSelectedDealerId] = useState('');
  // Chiave di storage per-utente per evitare collisioni tra sessioni/device
  const storageKey = useMemo(() => {
    const uid = (user?.id || user?.email || user?.agentenome || user?.name || 'unknown').toString();
    return `selectedDealerId:${uid}`;
  }, [user?.id, user?.email, user?.agentenome, user?.name]);

  // Init selected dealer from localStorage (single source of truth)
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) setSelectedDealerId(saved);
    } catch {}
  }, [storageKey]);

  // When dealers list loads/changes, ensure current selection is valid; otherwise clear
  useEffect(() => {
    if (!Array.isArray(dealers)) return;
    if (!selectedDealerId) {
      // opzionale: se esiste un unico dealer, preselezionalo
      if (dealers.length === 1) {
        const only = String(dealers[0].id);
        setSelectedDealerId(only);
        try { localStorage.setItem(storageKey, only); } catch {}
      }
      return;
    }
    const exists = dealers.some(d => String(d.id) === String(selectedDealerId));
    if (!exists) {
      // se l'ID corrente non è più valido nella lista, azzera senza ripristinare da storage
      setSelectedDealerId('');
      try { localStorage.removeItem(storageKey); } catch {}
    }
  }, [dealers, selectedDealerId, storageKey]);

  // Persist selection on change in parent (not in child)
  const handleSelectDealer = (id) => {
    setSelectedDealerId(id);
    try { localStorage.setItem(storageKey, String(id || '')); } catch {}
  };

  // Listen to custom updates from AgentCart (e.g., customCode for offerta 446)
  useEffect(() => {
    const handler = (e) => {
      const { id, patch } = e.detail || {};
      if (!id || !patch) return;
      setCartItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
    };
    window.addEventListener('agentcart:updateItem', handler);
    return () => window.removeEventListener('agentcart:updateItem', handler);
  }, []);

  const q = query.trim().toLowerCase();
  const filteredProducts = useMemo(() => {
    const list = Array.isArray(products) ? products : [];
    if (!q) return list;
    return list.filter((p) => (p.title || '').toLowerCase().includes(q) || (p.id || '').toLowerCase().includes(q));
  }, [products, q]);

  const addToCart = (product) => {
    // product from hook: id, idOfferta, title, price (EUR), priceCents (centesimi), image
    const base = {
      id: product.id,
      idOfferta: Number(product.idOfferta || 0),
      title: product.title,
      price: product.price, // EUR for UI
      priceCents: product.priceCents, // cents for backend
      image: product.image,
      // Importante: includi le spese di spedizione dell'offerta per il calcolo del carrello
      speseSpedizione: Number(product.speseSpedizione ?? 0),
    };
    setCartItems((prev) => {
      const idx = prev.findIndex((p) => p.id === product.id);
      if (idx !== -1) {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], qty: (copy[idx].qty || 1) + 1 };
        return copy;
      }
      return [...prev, { ...base, qty: 1 }];
    });
    if (typeof window !== 'undefined' && !window.matchMedia('(min-width: 1280px)').matches) {
      setTimeout(() => { cartRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 0);
    }
  };

  const increaseQty = (id) => setCartItems((prev) => prev.map((p) => p.id === id ? { ...p, qty: (p.qty || 1) + 1 } : p));
  const decreaseQty = (id) => setCartItems((prev) => prev.map((p) => p.id === id ? { ...p, qty: Math.max(1, (p.qty || 1) - 1) } : p));
  const removeItem = (id) => setCartItems((prev) => prev.filter((p) => p.id !== id));

  const MAX_PHOTOS = 10;

  const createPhotoEntry = useCallback((file) => {
    const id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
    const preview = URL.createObjectURL(file);
    return { id, file, preview };
  }, []);

  const handleAddPhotos = useCallback((filesList) => {
    if (!filesList || filesList.length === 0) return;
    const incoming = Array.from(filesList);
    
    // Validazione dimensione file (max 10MB)
    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
    const invalidFiles = incoming.filter(file => file.size > MAX_FILE_SIZE);
    
    if (invalidFiles.length > 0) {
      const fileNames = invalidFiles.map(f => f.name).join(', ');
      const sizeMB = (invalidFiles[0].size / (1024 * 1024)).toFixed(2);
      alert(`Le seguenti foto superano il limite di 10MB:\n${fileNames}\n\nDimensione: ${sizeMB}MB\n\nRiduci la dimensione o comprimi le immagini prima di caricarle.`);
      return;
    }
    
    setPhotos((prev) => {
      const available = Math.max(0, MAX_PHOTOS - prev.length);
      if (available <= 0) {
        alert(`Puoi caricare massimo ${MAX_PHOTOS} foto per ordine.`);
        return prev;
      }
      const selected = incoming.slice(0, available).map(createPhotoEntry);
      return [...prev, ...selected];
    });
  }, [createPhotoEntry]);

  const handleRemovePhoto = useCallback((id) => {
    setPhotos((prev) => {
      const next = prev.filter((photo) => photo.id !== id);
      const removed = prev.find((photo) => photo.id === id);
      if (removed) {
        URL.revokeObjectURL(removed.preview);
      }
      return next;
    });
  }, []);

  useEffect(() => () => {
    photos.forEach((photo) => URL.revokeObjectURL(photo.preview));
  }, [photos]);

  const onCheckout = async () => {
    // Validazioni
    // Usa solo lo stato corrente per evitare ripescaggi da sessioni precedenti
    const effectiveSelected = selectedDealerId;
    if (!effectiveSelected) {
      alert('Seleziona un dealer prima di procedere.');
      return;
    }
    // Verifica che il dealer esista nella lista corrente (evita ID stantii)
    const selectedDealerObj = Array.isArray(dealers) ? dealers.find(d => String(d.id) === String(effectiveSelected)) : null;
    if (!selectedDealerObj) {
      alert('Dealer selezionato non valido o non più disponibile. Selezionalo di nuovo.');
      return;
    }
    // Conferma esplicita: evita invii al dealer sbagliato
    const confirmMsg = `Confermi l\'invio ordine per il dealer:\n\n${selectedDealerObj.ragioneSociale} (ID ${selectedDealerObj.id})`;
    if (!window.confirm(confirmMsg)) return;
    if (cartItems.length === 0) return;

    // Regola speciale 446: valida customCode
    for (const it of cartItems) {
      if (Number(it.idOfferta) === 446) {
        const code = (it.customCode || '').toString().trim();
        if (!/^cim-flora-kim-d\d{1,3}$/.test(code)) {
          alert('Per il prodotto speciale (ID 446) è necessario un codice valido nel formato cim-flora-kim-dXXX');
          return;
        }
      }
    }

    // Mappa carrello per backend
    const carrello = cartItems.map((it) => ({
      idOfferta: Number(it.idOfferta),
      prezzo: Number(it.priceCents || 0), // in centesimi
      quantita: Number(it.qty || 1),
      customCode: it.customCode || undefined,
    }));

    const payload = {
      idDealer: Number(effectiveSelected),
      trasporto: transportMethod, // "Invio da Sede" | "Consegna a Mano"
      carrello,
      noteOrdine: notes || '',
      idAgente: undefined, // opzionale: backend lo risolve da token/email
    };

    try {
      const hasPhotos = photos.length > 0;
      let res;

      if (hasPhotos) {
        const formData = new FormData();
        formData.append('order', JSON.stringify(payload));
        photos.forEach((photo) => {
          const fileName = photo.file?.name || `foto-${photo.id}.jpg`;
          formData.append('photos', photo.file, fileName);
        });
        res = await api.post('/api/agente/ordine', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      } else {
        res = await api.post('/api/agente/ordine', payload);
      }
      if (res?.data?.success) {
        alert('Ordine inviato con successo');
        setCartItems([]);
        setNotes('');
        photos.forEach((photo) => URL.revokeObjectURL(photo.preview));
        setPhotos([]);
        // Evita riutilizzo accidentale del dealer al prossimo ordine
        setSelectedDealerId('');
        try { localStorage.removeItem(storageKey); } catch {}
      } else {
        alert('Ordine non riuscito');
      }
    } catch (err) {
      const msg = err?.normalized?.message || 'Errore durante l\'invio dell\'ordine';
      alert(msg);
    }
  };

  return (
    <DashboardLayout title="Prodotti">
      <div className="space-y-4">
        <DealerFilterBar dealers={dealers} selectedId={selectedDealerId} onChange={handleSelectDealer} />

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-0">
          {/* Left - Catalogo / Tabella */}
          <div className="xl:col-span-2 space-y-6">
            <section className="bg-white rounded-xl p-4 sm:p-6 h-[calc(100vh-140px)] flex flex-col mt-2">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">Catalogo Prodotti</h2>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Cerca prodotto..."
                    className="w-48 sm:w-64 rounded-lg border-gray-300 focus:border-blue-500 focus:ring-blue-500 text-sm"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
              </div>
              {/* Griglia prodotti (scroll interno) */}
              <div className="flex-1 overflow-y-auto pr-1 sm:pr-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                  {loading && [...Array(6)].map((_, i) => (
                    <div key={`sk-${i}`} className="h-40 bg-gray-100 rounded-2xl animate-pulse" />
                  ))}
                  {error && (
                    <div className="col-span-full text-sm text-red-600 flex items-center justify-between">
                      <span>Errore nel caricamento prodotti.</span>
                      <button onClick={refetch} className="ml-3 px-3 py-1.5 rounded bg-gray-100 hover:bg-gray-200 text-gray-700">Riprova</button>
                    </div>
                  )}
                  {!loading && !error && filteredProducts.map((p) => (
                    <ProductCard
                      key={p.id}
                      image={p.image}
                      title={p.title.toUpperCase()}
                      price={p.price}
                      onSelect={() => addToCart(p)}
                    />
                  ))}
                  {!loading && !error && filteredProducts.length === 0 && (
                    <div className="col-span-full text-sm text-gray-500">Nessun prodotto trovato</div>
                  )}
                </div>
              </div>
            </section>
          </div>

          {/* Right - Carrello */}
          <div className="space-y-6 mt-2 scroll-mt-24" ref={cartRef}>
            <AgentCart
              items={cartItems}
              onIncrease={increaseQty}
              onDecrease={decreaseQty}
              onRemove={removeItem}
              transportMethod={transportMethod}
              setTransportMethod={setTransportMethod}
              notes={notes}
              setNotes={setNotes}
              onCheckout={onCheckout}
              photos={photos}
              onAddPhotos={handleAddPhotos}
              onRemovePhoto={handleRemovePhoto}
            />
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
