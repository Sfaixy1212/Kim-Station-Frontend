import sql from 'mssql';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '.env') });

function getDbConfig(dbNameOverride) {
  return {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: dbNameOverride || process.env.DB_NAME,
    options: { encrypt: false }
  };
}

async function updateForDb(dbName) {
  const cfg = getDbConfig(dbName);
  console.log(`[UPDATE] Connecting to DB '${cfg.database}' @ ${cfg.server} ...`);
  const pool = await sql.connect(cfg);

  // Replace patterns we want to remove
  const patterns = [
    { from: '€{{IMPORTO_RICARICA}}', to: '{{IMPORTO_RICARICA}}' },
    { from: '€ {{IMPORTO_RICARICA}}', to: '{{IMPORTO_RICARICA}}' }
  ];

  // Update Subject safely
  for (const p of patterns) {
    const res = await pool.request()
      .input('from', sql.NVarChar, p.from)
      .input('to', sql.NVarChar, p.to)
      .query(`
        UPDATE dbo.tbEmailTemplates
        SET Subject = REPLACE(Subject, @from, @to)
        WHERE EventType = N'RICARICA_PLAFOND_COMPLETATA';
      `);
    console.log(`[UPDATE][${cfg.database}] Subject rows affected:`, res.rowsAffected?.[0] ?? 0);
  }

  // Determine column data types
  const typeRows = (await pool.request().query(`
    SELECT COLUMN_NAME, DATA_TYPE
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'tbEmailTemplates' AND COLUMN_NAME IN ('HtmlTemplate','TextTemplate');
  `)).recordset.reduce((acc, r) => { acc[r.COLUMN_NAME] = r.DATA_TYPE; return acc; }, {});

  async function updateTemplateColumn(col) {
    const dataType = (typeRows[col] || '').toLowerCase();
    const useNtext = dataType === 'ntext';
    for (const p of patterns) {
      const sqlText = useNtext
        ? `UPDATE dbo.tbEmailTemplates
             SET ${col} = CONVERT(NTEXT, REPLACE(CAST(${col} AS NVARCHAR(MAX)), @from, @to))
             WHERE EventType = N'RICARICA_PLAFOND_COMPLETATA';`
        : `UPDATE dbo.tbEmailTemplates
             SET ${col} = REPLACE(${col}, @from, @to)
             WHERE EventType = N'RICARICA_PLAFOND_COMPLETATA';`;
      const res = await pool.request()
        .input('from', sql.NVarChar, p.from)
        .input('to', sql.NVarChar, p.to)
        .query(sqlText);
      console.log(`[UPDATE][${cfg.database}] ${col} (${dataType}) rows affected:`, res.rowsAffected?.[0] ?? 0);
    }
  }

  await updateTemplateColumn('HtmlTemplate');
  await updateTemplateColumn('TextTemplate');

  console.log(`[UPDATE] Completed for DB '${cfg.database}'.`);
}

async function main() {
  const args = process.argv.slice(2);
  const idx = args.findIndex(a => a === '--db');
  if (idx === -1 || !args[idx+1]) {
    console.error('Usage: node tools/update-recharge-template-importo.mjs --db <KAM|KAM_2>');
    process.exit(1);
  }
  const dbName = args[idx+1];
  try {
    await updateForDb(dbName);
    process.exit(0);
  } catch (err) {
    console.error('[UPDATE] Error:', err);
    process.exit(2);
  }
}

main();
