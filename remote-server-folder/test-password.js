const aspnetIdentityPw = require('aspnet-identity-pw');

// Inserisci qui la password che vuoi testare e l'hash dal log
const password = 'INSERISCI_LA_PASSWORD_SCELTA'; // <-- MODIFICA QUI
const hash = 'AQAAAAIAAYagAAAAEDC/f610IW3BwloWYVfqsVK0RHaAtzk+67+TFCpv5unDgYTFKVPOn8aOuCc8ZyRK1g==';

aspnetIdentityPw.validatePassword(password, hash)
  .then(isValid => {
    console.log('Password valida?', isValid);
  })
  .catch(err => {
    console.error('Errore nella validazione:', err);
  });
