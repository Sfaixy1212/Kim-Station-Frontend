// Stripe integration for carrello acquisto
// This script exposes payment functions for both card and SEPA bank transfer
// and should be loaded in the frontend where the cart is rendered.

let stripe = null;
let elements = null;

async function initStripe() {
    let publicKey = window.stripePublicKey;
    if (!publicKey) {
        try {
            const resp = await fetch('/api/stripe/public-key');
            if (!resp.ok) {
                console.error('Errore HTTP nel recupero chiave pubblica Stripe:', resp.status, resp.statusText);
                throw new Error('Errore HTTP nel recupero chiave pubblica Stripe: ' + resp.status);
            }
            const data = await resp.json();
            publicKey = data.publicKey;
            if (!publicKey) {
                console.error('Chiave pubblica Stripe vuota o non trovata:', data);
                throw new Error('Chiave pubblica Stripe non trovata.');
            }
            window.stripePublicKey = publicKey;
        } catch (e) {
            console.error('Eccezione nel recupero chiave pubblica Stripe:', e);
            throw new Error('Errore di rete nel recupero della chiave pubblica Stripe.');
        }
    }
    stripe = Stripe(publicKey);
}

async function createPaymentIntent({ amount, userId, metodo, endpoint = '/api/stripe/create-payment-intent' }) {
    // Call backend to create PaymentIntent for card or SEPA
    const token = localStorage.getItem('token');
    const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ amount, userId, metodo })
    });
    if (!res.ok) throw new Error('Errore creazione PaymentIntent');
    return await res.json();
}

function mountCardElement(containerId) {
    elements = stripe.elements();
    const card = elements.create('card');
    card.mount(containerId);
    return card;
}

async function confirmCardPayment(clientSecret, card, billingDetails) {
    
    const result = await stripe.confirmCardPayment(clientSecret, {
        payment_method: {
            card: card,
            billing_details: billingDetails
        }
    });
    return result;
}

// For SEPA: just show the bank instructions returned from backend
export { initStripe, createPaymentIntent, mountCardElement, confirmCardPayment };
