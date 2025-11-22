import React, { useState, useEffect, useRef, useMemo } from 'react';
import { toast } from 'react-hot-toast';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { useAuth } from '../../contexts/AuthContext';
import ProductCard from '../../components/products/ProductCard';
import Cart from '../../components/cart/Cart';
import useProdotti from '../../hooks/prodotti/useProdotti';
import useTelefoni from '../../hooks/prodotti/useTelefoni';
import api from '../../api/client';
import { ShoppingCart, Plus, Minus, Trash2, CreditCard, Banknote, Smartphone } from 'lucide-react';

export default function Products() {
  const { user } = useAuth();
  const [cartItems, setCartItems] = useState([]);
  const [paymentMethod, setPaymentMethod] = useState('card'); // 'card' | 'sepa'
  const [transportMethod, setTransportMethod] = useState('corriere'); // solo corriere per ora
  const [notes, setNotes] = useState('');
  const cartRef = useRef(null);
  const [query, setQuery] = useState('');
  const [bonificoModal, setBonificoModal] = useState({ open: false, ordineId: null, totale: 0 });
  const [activeTab, setActiveTab] = useState('sim'); // 'sim' | 'telefoni'
  
  // ID Offerte SIM Fastweb (solo queste possono essere pagate con bonifico)
  const FASTWEB_SIM_IDS = [147, 251, 212]; // 147 = PACCHETTO 5 SIM FASTWEB, 251 = PACCHETTO 5 ESIM FASTWEB, 212 = SIM SOSTITUTIVE FASTWEB
  
  // Hook per SIM e Telefoni
  const { data: simProducts = [], loading: simLoading, error: simError, refetch: refetchSim } = useProdotti('SIM');
  const { data: telefoniProducts = [], loading: telefoniLoading, error: telefoniError, refetch: refetchTelefoni } = useTelefoni();
  
  // SEMPRE LOG - INIZIO PAGINA PRODUCTS
  console.log('=== PAGINA PRODUCTS CARICATA ===');
  
  // Debug token JWT direttamente - SEMPRE
  const token = localStorage.getItem('token');
  console.log('[DEBUG Products] Token presente:', !!token);
  if (token) {
    try {
      const base64Url = token.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
      const payload = JSON.parse(atob(padded));
      console.log('[DEBUG Products] JWT payload diretto:', payload);
      console.log('[DEBUG Products] idGruppo nel token:', payload.idGruppo);
      console.log('[DEBUG Products] dealerId nel token:', payload.dealerId);
    } catch (e) {
      console.error('[DEBUG Products] Errore decodifica token:', e);
    }
  }

  // Determina se l'utente può accedere ai telefoni
  console.log('[DEBUG] User object:', JSON.stringify(user, null, 2));
  console.log('[DEBUG] user.idGruppo:', user?.idGruppo);
  console.log('[DEBUG] user.role:', user?.role);
  const canAccessTelefoni = user?.role === 'dealer' && user?.idGruppo === 1;
  console.log('[DEBUG] canAccessTelefoni:', canAccessTelefoni);
  
  const showTelefoniTab = canAccessTelefoni;
  
  // Prodotti attivi basati sul tab selezionato
  const products = activeTab === 'sim' ? simProducts : telefoniProducts;
  const loading = activeTab === 'sim' ? simLoading : telefoniLoading;
  const error = activeTab === 'sim' ? simError : telefoniError;
  const refetch = activeTab === 'sim' ? refetchSim : refetchTelefoni;
  
  // Verifica se il carrello contiene SIM non-Fastweb
  const hasNonFastwebSim = useMemo(() => {
    return cartItems.some(item => {
      const idOfferta = Number(item.idOfferta || 0);
      // Se NON è una SIM Fastweb (esclude 147 e 251)
      // Nota: Telefoni hanno idOfferta diversi, quindi verranno inclusi qui
      // ma non è un problema perché i telefoni possono essere pagati con bonifico
      // Dobbiamo verificare solo le SIM non-Fastweb
      
      // Lista completa ID offerte SIM (tutti i pacchetti SIM)
      // Se l'offerta NON è Fastweb (147, 251) ed è una SIM, blocca bonifico
      const isSimOffer = idOfferta > 0 && idOfferta < 500; // Range approssimativo per SIM
      const isFastwebSim = FASTWEB_SIM_IDS.includes(idOfferta);
      
      return isSimOffer && !isFastwebSim;
    });
  }, [cartItems]);
  
  // Se ci sono SIM non-Fastweb, forza pagamento con carta
  useEffect(() => {
    if (hasNonFastwebSim && paymentMethod === 'sepa') {
      setPaymentMethod('card');
      toast.error('Le SIM non-Fastweb possono essere pagate solo con carta di credito');
    }
  }, [hasNonFastwebSim, paymentMethod]);

  // Listener per aggiornamenti degli item dal componente Cart (customCode per offerta 446)
  useEffect(() => {
    const handler = (e) => {
      const { id, patch } = e.detail || {};
      if (!id || !patch) return;
      setCartItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
    };
    window.addEventListener('agentcart:updateItem', handler);
    return () => window.removeEventListener('agentcart:updateItem', handler);
  }, []);

  // Listener di successo pagamento ordini (Stripe)
  useEffect(() => {
    const onPaid = (e) => {
      const { total } = e.detail || {};
      setCartItems([]);
      setNotes('');
      toast.success(`Ordine confermato. Totale pagato: ${new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(Number(total || 0))}`);
    };
    window.addEventListener('order-paid', onPaid);
    return () => window.removeEventListener('order-paid', onPaid);
  }, []);

  const q = query.trim().toLowerCase();
  const filteredProducts = useMemo(() => {
    const list = Array.isArray(products) ? products : [];
    if (!q) return list;
    return list.filter((p) => (p.title || '').toLowerCase().includes(q) || (p.id || '').toLowerCase().includes(q));
  }, [products, q]);

  const addToCart = (product) => {
    // product contiene: id, idOfferta, title, price (EUR), priceCents (centesimi), image
    const base = {
      id: product.id,
      idOfferta: Number(product.idOfferta || 0),
      title: product.title,
      price: product.price,
      priceCents: product.priceCents,
      image: product.image,
      speseSpedizione: Number(product.speseSpedizione ?? 0),
    };
    
    // LIMITE SPECIALE per SIM ILIAD (IDOfferta 149): massimo 1 pack
    const isIliadSim = Number(product.idOfferta) === 149;
    
    setCartItems((prev) => {
      const idx = prev.findIndex((p) => p.id === product.id);
      if (idx !== -1) {
        // Prodotto già nel carrello
        if (isIliadSim && prev[idx].qty >= 1) {
          toast.error('SIM ILIAD: è possibile acquistare massimo 1 pack per ordine');
          return prev; // Non aggiungere
        }
        const copy = [...prev];
        copy[idx] = { ...copy[idx], qty: (copy[idx].qty || 1) + 1 };
        return copy;
      }
      // Nuovo prodotto nel carrello
      return [...prev, { ...base, qty: 1 }];
    });
    
    // If the cart stacks under the catalog (below xl), scroll to it smoothly
    if (typeof window !== 'undefined' && !window.matchMedia('(min-width: 1280px)').matches) {
      // Let state/UI update, then scroll
      setTimeout(() => {
        cartRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 0);
    }
  };

  const increaseQty = (id) => setCartItems((prev) => prev.map((p) => {
    if (p.id === id) {
      // LIMITE SPECIALE per SIM ILIAD (IDOfferta 149): massimo 1 pack
      if (Number(p.idOfferta) === 149 && p.qty >= 1) {
        toast.error('SIM ILIAD: è possibile acquistare massimo 1 pack per ordine');
        return p; // Non aumentare
      }
      return { ...p, qty: (p.qty || 1) + 1 };
    }
    return p;
  }));
  const decreaseQty = (id) => setCartItems((prev) => prev.map((p) => p.id === id ? { ...p, qty: Math.max(1, (p.qty || 1) - 1) } : p));
  const removeItem = (id) => setCartItems((prev) => prev.filter((p) => p.id !== id));

  const onCheckout = () => {
    // Validazione codice speciale per offerta 446
    for (const it of cartItems) {
      if (Number(it.idOfferta) === 446) {
        const code = (it.customCode || '').toString().trim();
        if (!/^cim-flora-kim-d\d{1,3}$/.test(code)) {
          alert('Per il prodotto speciale (ID 446) è necessario un codice valido nel formato cim-flora-kim-dXXX');
          return;
        }
      }
    }

    const subtotal = cartItems.reduce((sum, it) => sum + (it.price || 0) * (it.qty || 1), 0);
    // Calcolo corretto spese spedizione: massimo SpeseSpedizione tra gli articoli
    const shipping = transportMethod === 'corriere' 
      ? cartItems.reduce((max, it) => {
          const spese = Number(it.speseSpedizione ?? it.SpeseSpedizione ?? 0);
          return Number.isFinite(spese) ? Math.max(max, spese) : max;
        }, 0)
      : 0;
    const total = subtotal + shipping;

    if (paymentMethod === 'sepa') {
      // Invio ordine BONIFICO
      const carrello = cartItems.map((it) => ({ id: it.id, quantita: it.qty || 1 }));
      api.post('/api/order/bonifico', {
        carrello,
        emailCliente: user?.email || '',
        speseSpedizione: shipping,
        noteOrdine: notes || ''
      })
      .then(({ data }) => {
        const ordineId = data?.idOrdineProdotto;
        setCartItems([]);
        setNotes('');
        toast.success('Ordine registrato. Attendi la ricezione della mail con i dettagli per il bonifico.');
        setBonificoModal({ open: true, ordineId, totale: subtotal });
      })
      .catch((err) => {
        const msg = err?.response?.data?.error || err?.message || 'Errore invio ordine bonifico';
        toast.error(msg);
      });
      return;
    }

    alert(`Checkout\nArticoli: ${cartItems.length}\nPagamento: ${paymentMethod}\nTrasporto: ${transportMethod}\nTotale: €${total.toFixed(2)}\nNote: ${notes || '-'}\n(Placeholder)\n\n` +
      cartItems.map((it) => `- ${it.title} x${it.qty}${Number(it.idOfferta)===446 ? ` (codice: ${it.customCode || '-'})` : ''}`).join('\n'));
  };

  return (
    <DashboardLayout>
      <div className="p-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Prodotti</h1>
          <button
            onClick={() => cartRef.current?.scrollIntoView({ behavior: 'smooth' })}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center space-x-2 lg:hidden"
          >
            <ShoppingCart className="w-5 h-5" />
            <span>Carrello ({cartItems.length})</span>
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="mb-6">
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex space-x-8">
              <button
                onClick={() => setActiveTab('sim')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'sim'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center space-x-2">
                  <CreditCard className="w-4 h-4" />
                  <span>SIM</span>
                </div>
              </button>
              {showTelefoniTab && (
                <button
                  onClick={() => setActiveTab('telefoni')}
                  className={`py-2 px-1 border-b-2 font-medium text-sm ${
                    activeTab === 'telefoni'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center space-x-2">
                    <Smartphone className="w-4 h-4" />
                    <span>Telefoni</span>
                  </div>
                </button>
              )}
            </nav>
          </div>
        </div>

        {/* Layout a due colonne */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left - Catalogo (2/3 della larghezza) */}
          <div className="lg:col-span-2">
            <section className="bg-white rounded-xl p-4 sm:p-6 h-[calc(100vh-200px)] flex flex-col">
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
              
              {/* Dicitura promozionale per telefoni */}
              {activeTab === 'telefoni' && (
                <div className="mb-4 p-4 bg-gradient-to-r from-green-50 to-blue-50 border border-green-200 rounded-lg">
                  <div className="flex items-start space-x-3">
                    <div className="flex-shrink-0">
                      <span className="text-2xl">💰</span>
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-green-800 mb-1">PROMOZIONE TELEFONI + SIM FASTWEB</h3>
                      <p className="text-sm text-green-700">
                        Per ogni telefono venduto in abbinamento ad una SIM Fastweb <strong>(modalità one shot)</strong>, riceverai una nota di credito del <strong>5%</strong> sul valore del dispositivo, <strong>oltre al compenso previsto dal piano incentivazione</strong>.
                      </p>
                    </div>
                  </div>
                </div>
              )}
              {/* Griglia prodotti (scroll interno) */}
              <div className="flex-1 overflow-y-auto pr-1 sm:pr-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6">
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
                      originalPrice={p.originalPrice}
                      discountPct={p.discountPct}
                      idOfferta={p.idOfferta}
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

          {/* Right - Carrello fisso (1/3 della larghezza) */}
          <div className="lg:col-span-1">
            <div className="sticky top-6" ref={cartRef}>
              <Cart
                items={cartItems}
                onIncrease={increaseQty}
                onDecrease={decreaseQty}
                onRemove={removeItem}
                paymentMethod={paymentMethod}
                setPaymentMethod={setPaymentMethod}
                transportMethod={transportMethod}
                setTransportMethod={setTransportMethod}
                notes={notes}
                setNotes={setNotes}
                onCheckout={onCheckout}
                hasNonFastwebSim={hasNonFastwebSim}
              />
            </div>
          </div>
        </div>

        {/* Modale conferma BONIFICO */}
        {bonificoModal.open && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-3">Ordine registrato</h3>
              <p className="text-sm text-gray-700 mb-2">
                Il tuo ordine è stato registrato con successo. Verrà evaso non appena riceveremo l'accredito del bonifico.
              </p>
              <p className="text-sm text-gray-900 font-medium mb-4">
                Per completare l'acquisto, effettua il bonifico. IBAN: IT31Y0306915936100000061953 intestato a KIM S.r.l.s.
              </p>
              <div className="rounded-lg border border-gray-200 p-4 mb-4">
                <div className="text-sm text-gray-700"><span className="font-medium">N. Ordine:</span> #{bonificoModal.ordineId}</div>
                <div className="text-sm text-gray-700"><span className="font-medium">Totale:</span> {new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(Number(bonificoModal.totale || 0))}</div>
                <div className="text-sm text-amber-700 mt-2">Stato: In attesa di pagamento</div>
              </div>
              <h4 className="text-sm font-semibold text-gray-900 mb-2">Dati per il bonifico</h4>
              <div className="rounded-lg bg-gray-50 border border-gray-200 p-4 text-sm text-gray-800 space-y-1">
                <div><span className="font-medium">IBAN:</span> IT31Y0306915936100000061953</div>
                <div><span className="font-medium">Banca:</span> INTESA SAN PAOLO</div>
                <div><span className="font-medium">Intestatario:</span> Kim s.r.l.s</div>
                <div><span className="font-medium">Causale:</span> Ordine Prodotti {bonificoModal.ordineId ? `#${bonificoModal.ordineId}` : ''} Ragione sociale: {(user?.ragioneSociale || '')}</div>
              </div>
              <div className="flex justify-end mt-5">
                <button onClick={() => setBonificoModal({ open: false, ordineId: null, totale: 0 })} className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700">Ho capito</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
