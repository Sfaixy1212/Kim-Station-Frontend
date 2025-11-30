// Script di test per validazione hash ASP.NET Identity
// Usage: node test-hash.js

import aspnetIdentityPw from 'aspnet-identity-pw';

// INSERISCI QUI i valori da testare:
const password = '9374C5CD!z';
const hash = 'AQAAAAIAAYagAAAAEH5qLGxdRUfmAqXDLQ7bJsRzMdYGiMpGqEZNGXbyCoUS+MDLKu0agXTUTqglclEaAg==';

async function runTest() {
  try {
    console.log('Password in chiaro:', password);
    console.log('Hash dal DB:', hash);
    const isValid = await aspnetIdentityPw.validatePassword(password, hash);
    console.log('Risultato validazione:', isValid ? '✅ CORRETTA' : '❌ NON CORRETTA');
  } catch (err) {
    console.error('Errore durante la validazione:', err);
  }
}

runTest();
