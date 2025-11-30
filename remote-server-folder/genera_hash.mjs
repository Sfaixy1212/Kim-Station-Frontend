import aspnetIdentityPw from 'aspnet-identity-pw';
const hash = await aspnetIdentityPw.hashPassword('KimTemp!2025');
console.log(hash);
