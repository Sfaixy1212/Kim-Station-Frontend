const pw = require('aspnet-identity-pw');
const hash = pw.hashPassword('Password123!');
console.log(hash);
