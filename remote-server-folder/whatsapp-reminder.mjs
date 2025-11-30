import cron from 'node-cron';
import sql from 'mssql';
import axios from 'axios';

const whatsappAccessToken = process.env.WHATSAPP_ACCESS_TOKEN;
const phoneNumberId = process.env.PHONE_NUMBER_ID;
const whatsappApiUrl = process.env.WHATSAPP_API_URL;

/**
 * Invia reminder WhatsApp a un agente usando template approvato
 */
async function inviaReminderAgente(nomeAgente, numeroTelefono) {
  if (!whatsappAccessToken || !phoneNumberId || !whatsappApiUrl) {
    console.log('[REMINDER] WhatsApp API non configurata');
    return { success: false, reason: 'API non configurata' };
  }

  try {
    // Rimuovi prefisso + se presente (Meta lo gestisce automaticamente)
    const numeroDestinatario = (numeroTelefono || '').replace('+', '');
    if (!numeroDestinatario) {
      return { success: false, reason: 'Numero destinatario mancante' };
    }

    console.log(`[REMINDER] Invio a ${nomeAgente} (${numeroDestinatario})`);
    
    const url = `${whatsappApiUrl}/${phoneNumberId}/messages`;
    const response = await axios.post(url, {
      messaging_product: 'whatsapp',
      to: numeroDestinatario,
      type: 'template',
      template: {
        name: 'reminder_agenda_mattutino',
        language: {
          code: 'it'
        },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: nomeAgente || 'Agente' }
            ]
          }
        ]
      }
    }, {
      headers: {
        'Authorization': `Bearer ${whatsappAccessToken}`,
        'Content-Type': 'application/json'
      }
    });

    console.log(`[REMINDER] Inviato a ${nomeAgente}:`, response.data);

    return {
      success: true,
      agente: nomeAgente,
      response: response.data
    };

  } catch (error) {
    console.error(`[REMINDER] Errore invio a ${nomeAgente}:`, error?.response?.data || error.message);
    return {
      success: false,
      agente: nomeAgente,
      error: error.message
    };
  }
}

/**
 * Controlla se un agente ha visite registrate per oggi entro le 10:00
 */
async function haVisiteOggi(idAgente) {
  try {
    const pool = await sql.connect();
    const oggi = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    
    const result = await pool.request()
      .input('idAgente', sql.Int, idAgente)
      .input('oggi', sql.Date, oggi)
      .query(`
        SELECT COUNT(*) as NumVisite
        FROM dbo.tbAgendaVisite
        WHERE IDAgente = @idAgente
          AND CAST(DataVisita AS DATE) = @oggi
          AND CAST(OraInizio AS TIME) <= '10:00:00'
      `);

    const numVisite = result.recordset[0]?.NumVisite || 0;
    return numVisite > 0;

  } catch (error) {
    console.error('[REMINDER] Errore controllo visite:', error);
    return false; // In caso di errore, non inviare reminder
  }
}

/**
 * Job principale: invia reminder agli agenti senza visite
 */
async function eseguiReminderMattutino() {
  console.log('[REMINDER] ========================================');
  console.log('[REMINDER] Inizio job reminder mattutino');
  console.log('[REMINDER] Data/Ora:', new Date().toLocaleString('it-IT'));
  
  try {
    const pool = await sql.connect();
    
    // Recupera agenti attivi con numero telefono
    const agenti = await pool.request().query(`
      SELECT 
        IdAgente,
        Nome,
        RecapitoCell
      FROM dbo.tbAgenti
      WHERE Nome IN ('GABRIELE', 'GIACOMO', 'LUIGI', 'RAFFAELE')
        AND RecapitoCell IS NOT NULL
        AND Active = 1
        AND IdAgente != 626
      ORDER BY Nome
    `);

    console.log(`[REMINDER] Trovati ${agenti.recordset.length} agenti attivi`);

    let inviati = 0;
    let saltati = 0;
    let errori = 0;

    for (const agente of agenti.recordset) {
      // Controlla se ha già visite registrate per oggi entro le 10:00
      const haVisite = await haVisiteOggi(agente.IdAgente);

      if (haVisite) {
        console.log(`[REMINDER] ${agente.Nome} ha già visite registrate - SKIP`);
        saltati++;
        continue;
      }

      // Invia reminder
      const risultato = await inviaReminderAgente(agente.Nome, agente.RecapitoCell);

      if (risultato.success) {
        inviati++;
      } else {
        errori++;
        console.log(`[REMINDER] Invio fallito per ${agente.Nome}:`, risultato.reason || risultato.error);
      }

      // Pausa di 1 secondo tra un invio e l'altro per non sovraccaricare
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log('[REMINDER] ========================================');
    console.log(`[REMINDER] Completato: ${inviati} inviati, ${saltati} saltati, ${errori} errori`);
    console.log('[REMINDER] ========================================');

  } catch (error) {
    console.error('[REMINDER] Errore job:', error);
  }
}

/**
 * Configura cron job
 * Esegue alle 9:00 AM dal lunedì al sabato
 */
export function avviaReminderSchedulato() {
  // Cron: 0 9 * * 1-6 = alle 9:00 dal lunedì (1) al sabato (6)
  cron.schedule('0 9 * * 1-6', () => {
    eseguiReminderMattutino();
  }, {
    timezone: "Europe/Rome"
  });

  console.log('[REMINDER] Scheduler attivato: 9:00 AM Lun-Sab (Europe/Rome)');
}

// Esporta anche per test manuali
export { eseguiReminderMattutino };

export default {
  avviaReminderSchedulato,
  eseguiReminderMattutino
};
