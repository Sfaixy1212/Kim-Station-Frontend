// Script di test per caricare e stampare le variabili AWS da .env
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

console.log('AWS_ACCESS_KEY_ID:', process.env.AWS_ACCESS_KEY_ID, '| length:', process.env.AWS_ACCESS_KEY_ID ? process.env.AWS_ACCESS_KEY_ID.length : 'undefined');
console.log('AWS_SECRET_ACCESS_KEY:', process.env.AWS_SECRET_ACCESS_KEY, '| length:', process.env.AWS_SECRET_ACCESS_KEY ? process.env.AWS_SECRET_ACCESS_KEY.length : 'undefined');
console.log('AWS_REGION:', process.env.AWS_REGION, '| length:', process.env.AWS_REGION ? process.env.AWS_REGION.length : 'undefined');

if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY || !process.env.AWS_REGION) {
  console.error('\n[ERRORE] Una o più variabili AWS sono mancanti o vuote!');
  process.exit(1);
} else {
  console.log('\n[TUTTO OK] Variabili AWS caricate correttamente!');
}
