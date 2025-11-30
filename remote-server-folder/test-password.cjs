const aspnetIdentityPw = require('aspnet-identity-pw');

const password = 'Sasha2023!';
const hash = 'AQAAAAIAAYagAAAAEDC/f610IW3BwloWYVfqsVK0RHaAtzk+67+TFCpv5unDgYTFKVPOn8aOuCc8ZyRK1g==';

try {
  const isValid = aspnetIdentityPw.validatePassword(password, hash);
  console.log('Password valida?', isValid);
} catch (err) {
  console.error('Errore nella validazione:', err);
}
