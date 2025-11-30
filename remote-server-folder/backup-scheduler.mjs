// =============================================
// BACKUP SCHEDULER - Alternativa a SQL Server Agent
// =============================================
// Questo modulo esegue backup automatici delle tabelle ordini
// utilizzando Node.js e node-cron
// =============================================

import cron from 'node-cron';
import sql from 'mssql';
import { dbConfig } from './db-pool.mjs';

// =============================================
// Configurazione Backup
// =============================================
const BACKUP_CONFIG = {
  // Schedule: ogni giorno alle 02:00 (formato cron: minuto ora giorno mese giornoSettimana)
  schedule: '0 2 * * *',
  
  // Retention: giorni di conservazione backup
  retentionDays: 30,
  
  // Tabelle da includere nel backup
  tables: [
    'tbOrdini',
    'tbDatiOrdine',
    'tbDatiIntestario',
    'tbFileOrdine',
    'tbStoricoOrdini',
    'tbTransazioni'
  ],
  
  // Abilita/disabilita backup automatico
  enabled: true,
  
  // Timezone (default: Europe/Rome)
  timezone: 'Europe/Rome'
};

// =============================================
// Funzione di Backup
// =============================================
async function eseguiBackup() {
  const startTime = new Date();
  console.log('========================================');
  console.log('🔄 INIZIO BACKUP TABELLE ORDINI');
  console.log(`📅 Data/Ora: ${startTime.toLocaleString('it-IT', { timeZone: BACKUP_CONFIG.timezone })}`);
  console.log('========================================');
  
  let pool;
  
  try {
    // Connessione al database
    pool = await sql.connect(dbConfig);
    console.log('✓ Connesso al database');
    
    // Esegui stored procedure di backup
    const result = await pool.request()
      .input('RetentionDays', sql.Int, BACKUP_CONFIG.retentionDays)
      .execute('backup.sp_BackupTabelle_Ordini');
    
    // Log risultati
    if (result.recordsets && result.recordsets.length > 0) {
      console.log('\n📊 Risultati backup:');
      result.recordsets.forEach((recordset, index) => {
        console.log(`\nRecordset ${index + 1}:`);
        console.table(recordset);
      });
    }
    
    // Log messaggi dalla stored procedure
    if (result.output) {
      console.log('\n📝 Output stored procedure:');
      console.log(result.output);
    }
    
    const endTime = new Date();
    const duration = ((endTime - startTime) / 1000).toFixed(2);
    
    console.log('\n========================================');
    console.log('✅ BACKUP COMPLETATO CON SUCCESSO');
    console.log(`⏱️  Durata: ${duration} secondi`);
    console.log('========================================\n');
    
    return { success: true, duration, timestamp: endTime };
    
  } catch (error) {
    console.error('\n========================================');
    console.error('❌ ERRORE DURANTE IL BACKUP');
    console.error('========================================');
    console.error('Messaggio:', error.message);
    console.error('Stack:', error.stack);
    console.error('========================================\n');
    
    // Invia notifica email/Slack/Telegram se configurato
    await inviaNotificaErrore(error);
    
    return { success: false, error: error.message, timestamp: new Date() };
    
  } finally {
    if (pool) {
      try {
        await pool.close();
        console.log('✓ Connessione database chiusa\n');
      } catch (closeError) {
        console.error('⚠️  Errore chiusura connessione:', closeError.message);
      }
    }
  }
}

// =============================================
// Funzione di Ripristino
// =============================================
async function ripristinaOrdine(idOrdine, backupDate, dryRun = true) {
  console.log('========================================');
  console.log(`🔄 RIPRISTINO ORDINE #${idOrdine}`);
  console.log(`📅 Da backup: ${backupDate}`);
  console.log(`🔍 Modalità: ${dryRun ? 'PREVIEW (DRY RUN)' : 'ESECUZIONE REALE'}`);
  console.log('========================================\n');
  
  let pool;
  
  try {
    pool = await sql.connect(dbConfig);
    
    const result = await pool.request()
      .input('IDOrdine', sql.Int, idOrdine)
      .input('BackupDate', sql.VarChar(20), backupDate)
      .input('DryRun', sql.Bit, dryRun ? 1 : 0)
      .execute('backup.sp_RipristinaOrdine');
    
    // Log risultati
    if (result.recordsets && result.recordsets.length > 0) {
      console.log('\n📊 Dati da ripristinare:');
      result.recordsets.forEach((recordset, index) => {
        if (recordset.length > 0) {
          console.log(`\nTabella ${index + 1}:`);
          console.table(recordset);
        }
      });
    }
    
    console.log('\n========================================');
    if (dryRun) {
      console.log('✅ PREVIEW COMPLETATA - Nessuna modifica effettuata');
    } else {
      console.log('✅ RIPRISTINO COMPLETATO CON SUCCESSO');
    }
    console.log('========================================\n');
    
    return { success: true, dryRun };
    
  } catch (error) {
    console.error('\n❌ ERRORE:', error.message);
    return { success: false, error: error.message };
    
  } finally {
    if (pool) {
      await pool.close();
    }
  }
}

// =============================================
// Funzione per Listare Backup Disponibili
// =============================================
async function listaBackupDisponibili() {
  let pool;
  
  try {
    pool = await sql.connect(dbConfig);
    
    const result = await pool.request()
      .query('SELECT * FROM backup.vw_BackupDisponibili ORDER BY DataCreazione DESC');
    
    console.log('\n📋 BACKUP DISPONIBILI:');
    console.log('========================================');
    
    if (result.recordset.length === 0) {
      console.log('Nessun backup trovato');
    } else {
      console.table(result.recordset);
      
      // Calcola spazio totale occupato
      const totalSizeMB = result.recordset.reduce((sum, row) => sum + (row.SizeMB || 0), 0);
      console.log(`\n💾 Spazio totale occupato: ${totalSizeMB.toFixed(2)} MB`);
    }
    
    console.log('========================================\n');
    
    return result.recordset;
    
  } catch (error) {
    console.error('❌ Errore:', error.message);
    return [];
    
  } finally {
    if (pool) {
      await pool.close();
    }
  }
}

// =============================================
// Funzione di Notifica Errore
// =============================================
async function inviaNotificaErrore(error) {
  // TODO: Implementare invio notifiche via:
  // - Email (Nodemailer)
  // - Slack (Webhook)
  // - Telegram (Bot API)
  // - SMS (Twilio)
  
  console.log('⚠️  Notifica errore non configurata');
  console.log('   Configura invio email/Slack/Telegram per ricevere alert');
}

// =============================================
// Inizializzazione Scheduler
// =============================================
function inizializzaScheduler() {
  if (!BACKUP_CONFIG.enabled) {
    console.log('⚠️  Backup automatico DISABILITATO');
    console.log('   Modifica BACKUP_CONFIG.enabled = true per abilitare\n');
    return null;
  }
  
  console.log('========================================');
  console.log('🚀 BACKUP SCHEDULER INIZIALIZZATO');
  console.log('========================================');
  console.log(`📅 Schedule: ${BACKUP_CONFIG.schedule}`);
  console.log(`   (Ogni giorno alle 02:00 ${BACKUP_CONFIG.timezone})`);
  console.log(`🗄️  Retention: ${BACKUP_CONFIG.retentionDays} giorni`);
  console.log(`📊 Tabelle: ${BACKUP_CONFIG.tables.length}`);
  BACKUP_CONFIG.tables.forEach(table => {
    console.log(`   • ${table}`);
  });
  console.log('========================================\n');
  
  // Crea task schedulato
  const task = cron.schedule(
    BACKUP_CONFIG.schedule,
    async () => {
      await eseguiBackup();
    },
    {
      scheduled: true,
      timezone: BACKUP_CONFIG.timezone
    }
  );
  
  console.log('✅ Scheduler attivo e in ascolto\n');
  console.log('💡 COMANDI DISPONIBILI:');
  console.log('   - Backup manuale: await eseguiBackup()');
  console.log('   - Lista backup: await listaBackupDisponibili()');
  console.log('   - Ripristino: await ripristinaOrdine(3930, "20251015_140000", true)');
  console.log('');
  
  return task;
}

// =============================================
// Esporta funzioni
// =============================================
export {
  eseguiBackup,
  ripristinaOrdine,
  listaBackupDisponibili,
  inizializzaScheduler,
  BACKUP_CONFIG
};

// =============================================
// Avvio automatico se eseguito direttamente
// =============================================
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('\n🔧 MODALITÀ STANDALONE\n');
  
  // Parse argomenti CLI
  const args = process.argv.slice(2);
  const command = args[0];
  
  switch (command) {
    case 'backup':
      // Esegui backup manuale
      await eseguiBackup();
      process.exit(0);
      break;
      
    case 'list':
      // Lista backup disponibili
      await listaBackupDisponibili();
      process.exit(0);
      break;
      
    case 'restore':
      // Ripristina ordine
      const idOrdine = parseInt(args[1]);
      const backupDate = args[2];
      const dryRun = args[3] !== 'execute';
      
      if (!idOrdine || !backupDate) {
        console.error('❌ Uso: node backup-scheduler.mjs restore <IDOrdine> <BackupDate> [execute]');
        console.error('   Esempio: node backup-scheduler.mjs restore 3930 20251015_140000');
        console.error('   Esempio: node backup-scheduler.mjs restore 3930 20251015_140000 execute');
        process.exit(1);
      }
      
      await ripristinaOrdine(idOrdine, backupDate, dryRun);
      process.exit(0);
      break;
      
    case 'start':
    default:
      // Avvia scheduler
      inizializzaScheduler();
      
      // Mantieni processo attivo
      console.log('⏳ Scheduler in esecuzione... (Ctrl+C per terminare)\n');
      break;
  }
}
