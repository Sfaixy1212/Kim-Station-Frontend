import emailService from '../email-service.mjs';
import sql from 'mssql';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Simple CLI arg parsing
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, idx, arr) => {
    if (cur.startsWith('--')) {
      const key = cur.replace(/^--/, '');
      const val = arr[idx + 1] && !arr[idx + 1].startsWith('--') ? arr[idx + 1] : true;
      acc.push([key, val]);
    }
    return acc;
  }, [])
);

async function main() {
  // Ensure env is loaded from backend/.env
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  dotenv.config({ path: path.join(__dirname, '..', '.env') });

  // Connect to MSSQL using env
  const dbConfig = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_NAME || 'KAM',
    options: { encrypt: false }
  };

  // Avoid multiple connections if already connected
  if (!sql.connected) {
    await sql.connect(dbConfig);
  }

  const dealerId = parseInt(args.dealer || args.dealerId || args.d || '');
  const importo = parseFloat(args.importo || args.amount || '');
  const transactionId = args.transactionId || args.tx || 'TEST-TX';

  if (!dealerId || isNaN(importo)) {
    console.error('Usage: node tools/render-recharge-email.mjs --dealer <dealerId> --importo <amount> [--transactionId <id>]');
    process.exit(1);
  }

  // Fetch template and dealer data (no email is sent)
  const template = await emailService.getEmailTemplate('RICARICA_PLAFOND_COMPLETATA');
  if (!template) {
    console.error('Template RICARICA_PLAFOND_COMPLETATA not found or inactive');
    process.exit(2);
  }

  // Fetch dealer data directly using production column names
  const dealerResult = await new sql.Request()
    .input('dealerId', sql.Int, dealerId)
    .query(`
      SELECT 
        IDDealer,
        RagioneSociale,
        RecapitoEmail AS DealerEmail,
        RecapitoCell AS DealerTelefono,
        Indirizzo,
        Citta,
        CAP,
        Provincia
      FROM dbo.tbDealers
      WHERE IDDealer = @dealerId
    `);
  const dealerData = dealerResult.recordset[0];
  if (!dealerData) {
    console.error('Dealer not found for ID:', dealerId);
    process.exit(3);
  }

  const templateData = {
    ...dealerData,
    IMPORTO_RICARICA: emailService.formatCurrency ? emailService.formatCurrency(importo) : `€${importo.toFixed(2)}`,
    DATA_RICARICA: emailService.formatDate ? emailService.formatDate(new Date()) : new Date().toLocaleDateString('it-IT'),
    ORA_RICARICA: emailService.formatTime ? emailService.formatTime(new Date()) : new Date().toLocaleTimeString('it-IT'),
    TRANSACTION_ID: transactionId
  };

  const rendered = emailService.personalizeTemplate(template, templateData, { transactionId });

  // Output a compact preview
  const preview = {
    to: rendered.to,
    subject: rendered.subject,
    hasHtml: Boolean(rendered.html),
    htmlPreview: (rendered.html || '').slice(0, 800),
    hasText: Boolean(rendered.text),
    textPreview: (rendered.text || '').slice(0, 400)
  };

  console.log(JSON.stringify(preview, null, 2));
}

main().catch(err => {
  console.error('Error rendering email:', err);
  process.exit(99);
});
