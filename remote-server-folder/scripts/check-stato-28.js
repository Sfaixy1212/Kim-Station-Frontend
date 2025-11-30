// Check presence and configuration of stato 28 (PDA DA FIRMARE) in tbStatiOrdini
// Usage: node scripts/check-stato-28.js

const path = require('path');
const dotenv = require('dotenv');
const sql = require('mssql');

(async () => {
  try {
    dotenv.config({ path: path.join(__dirname, '..', '.env') });

    const dbConfig = {
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      server: process.env.DB_SERVER,
      database: process.env.DB_NAME || 'KAM',
      pool: { max: 5, min: 0, idleTimeoutMillis: 30000 },
      options: {
        encrypt: true,
        trustServerCertificate: true,
        enableArithAbort: true,
        cryptoCredentialsDetails: { minVersion: 'TLSv1.2' }
      },
      requestTimeout: 30000,
      connectionTimeout: 30000
    };

    const pool = await sql.connect(dbConfig);

    const q = `SELECT TOP 1 IDStato, StatoEsteso, Notifica, MailSubject, LEFT(MailTemplate, 120) AS MailTemplatePreview, CCN, ISNULL(Refund,0) AS Refund
               FROM tbStatiOrdini WHERE IDStato = 28`;
    const { recordset } = await pool.request().query(q);

    if (!recordset || recordset.length === 0) {
      console.log(JSON.stringify({ exists: false }, null, 2));
    } else {
      console.log(JSON.stringify({ exists: true, row: recordset[0] }, null, 2));
    }

    await pool.close();
    process.exit(0);
  } catch (err) {
    console.error('[check-stato-28] Error:', err.message);
    process.exit(1);
  }
})();
