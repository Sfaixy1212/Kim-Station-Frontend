import axios from 'axios';

// Configurazione WhatsApp Business API (Meta)
const whatsappAccessToken = process.env.WHATSAPP_ACCESS_TOKEN;
const phoneNumberId = process.env.PHONE_NUMBER_ID;
const whatsappApiUrl = process.env.WHATSAPP_API_URL;
const supermasterWhatsapp = process.env.WHATSAPP_TEST_NUMBER || process.env.SUPERMASTER_WHATSAPP;

// Verifica configurazione WhatsApp
function checkWhatsAppConfig() {
  if (!whatsappAccessToken || !phoneNumberId || !whatsappApiUrl) {
    console.warn('[WHATSAPP] Credenziali WhatsApp Business API non configurate. Notifiche disabilitate.');
    return false;
  }
  return true;
}

/**
 * Invia notifica WhatsApp per nuova visita registrata
 */
export async function notificaNuovaVisita(visitaData) {
  if (!checkWhatsAppConfig()) {
    console.log('[WHATSAPP] Skip notifica - WhatsApp non configurato');
    return { success: false, reason: 'WhatsApp non configurato' };
  }

  if (!supermasterWhatsapp) {
    console.warn('[WHATSAPP] Numero SuperMaster non configurato');
    return { success: false, reason: 'Numero destinatario mancante' };
  }

  try {
    const {
      nomeAgente,
      ragioneSocialeDealer,
      citta,
      dataVisita,
      oraInizio,
      durataMinuti,
      referente,
      argomento,
      note,
      latitudine,
      longitudine,
      latitudineDispositivo,
      longitudineDispositivo
    } = visitaData || {};

    if (!nomeAgente || !dataVisita || !oraInizio || durataMinuti == null) {
      console.warn('[WHATSAPP] Dati visita incompleti, skip invio:', visitaData);
      return { success: false, reason: 'Dati visita incompleti' };
    }

    // Formatta durata
    const ore = Math.floor(durataMinuti / 60);
    const minuti = durataMinuti % 60;
    let durataStr = '';
    if (ore > 0) durataStr += `${ore}h`;
    if (minuti > 0) durataStr += ` ${minuti}min`;
    if (!durataStr) durataStr = `${durataMinuti}min`;

    // Formatta data
    const dataFormatted = new Date(dataVisita).toLocaleDateString('it-IT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });

    // Costruisci messaggio
    let messaggio = `🔔 *Nuova Visita Registrata*\n\n`;
    messaggio += `👤 *Agente:* ${nomeAgente}\n`;
    messaggio += `📍 *Point:* ${ragioneSocialeDealer}\n`;
    if (citta) {
      messaggio += `🏙️ *Città:* ${citta}\n`;
    }
    messaggio += `📅 *Data:* ${dataFormatted}\n`;
    messaggio += `🕐 *Ora:* ${oraInizio?.slice(0, 5)}\n`;
    messaggio += `⏱️ *Durata:* ${durataStr.trim()}\n`;
    
    if (referente) {
      messaggio += `👨‍💼 *Referente:* ${referente}\n`;
    }
    
    if (argomento) {
      messaggio += `💬 *Argomento:* ${argomento}\n`;
    }
    
    if (note) {
      messaggio += `\n📝 *Note:* ${note}\n`;
    }

    messaggio += `\n_Visualizza dettagli completi nella dashboard CRM_`;

    // Rimuovi prefisso whatsapp: se presente, mantieni + se c'è
    const numeroDestinatario = supermasterWhatsapp.replace('whatsapp:', '');

    // Calcola coordinate per eventuale pin posizione
    const locationLat = (latitudineDispositivo ?? latitudine);
    const locationLon = (longitudineDispositivo ?? longitudine);
    const parsedLat = locationLat != null ? Number(locationLat) : null;
    const parsedLon = locationLon != null ? Number(locationLon) : null;
    const hasValidLocation = Number.isFinite(parsedLat) && Number.isFinite(parsedLon);

    // Invia messaggio tramite WhatsApp Business API usando template
    const url = `${whatsappApiUrl}/${phoneNumberId}/messages`;
    console.log('[WHATSAPP] Invio a:', numeroDestinatario);

    // Usa template approvato invece di testo libero
    const components = [
      {
        type: 'body',
        parameters: [
          { type: 'text', text: nomeAgente || 'N/D' },
          { type: 'text', text: ragioneSocialeDealer || 'N/D' },
          { type: 'text', text: citta || 'N/D' },
          { type: 'text', text: dataFormatted || 'N/D' },
          { type: 'text', text: oraInizio?.slice(0, 5) || 'N/D' },
          { type: 'text', text: durataStr.trim() || 'N/D' },
          { type: 'text', text: argomento || 'N/D' },
          { type: 'text', text: note || 'N/D' }
        ]
      }
    ];

    if (hasValidLocation) {
      components.push({
        type: 'header',
        parameters: [
          {
            type: 'location',
            location: {
              latitude: parsedLat,
              longitude: parsedLon,
              name: ragioneSocialeDealer || 'Destinazione visita',
              address: referente || undefined
            }
          }
        ]
      });
    }

    const response = await axios.post(url, {
      messaging_product: 'whatsapp',
      to: numeroDestinatario,
      type: 'template',
      template: {
        name: 'notifica_nuova_visita_v2',
        language: {
          code: 'it'
        },
        components
      }
    }, {
      headers: {
        'Authorization': `Bearer ${whatsappAccessToken}`,
        'Content-Type': 'application/json'
      }
    });

    console.log('[WHATSAPP] Messaggio inviato con successo:', response.data);

    return {
      success: true,
      response: response.data
    };

  } catch (error) {
    console.error('[WHATSAPP] Errore invio notifica:', error);
    console.error('[WHATSAPP] Dettagli:', error.response?.data || error.message);
    
    return {
      success: false,
      error: error.message,
      details: error.response?.data
    };
  }
}

/**
 * Invia notifica WhatsApp generica
 */
export async function inviaNotificaWhatsApp(destinatario, messaggio) {
  if (!checkWhatsAppConfig()) {
    console.log('[WHATSAPP] Skip notifica - WhatsApp non configurato');
    return { success: false, reason: 'WhatsApp non configurato' };
  }

  try {
    // Rimuovi prefisso whatsapp: se presente
    const numeroDestinatario = destinatario.replace('whatsapp:', '');
    
    const url = `${whatsappApiUrl}/${phoneNumberId}/messages`;
    const response = await axios.post(url, {
      messaging_product: 'whatsapp',
      to: numeroDestinatario,
      text: { body: messaggio }
    }, {
      headers: {
        'Authorization': `Bearer ${whatsappAccessToken}`,
        'Content-Type': 'application/json'
      }
    });

    console.log('[WHATSAPP] Messaggio inviato:', response.data);
    
    return {
      success: true,
      response: response.data
    };

  } catch (error) {
    console.error('[WHATSAPP] Errore invio:', error);
    return {
      success: false,
      error: error.message,
      details: error.response?.data
    };
  }
}

/**
 * Verifica configurazione WhatsApp Bot
 */
export function verificaConfigurazioneWhatsApp() {
  return {
    configured: !!whatsappBotUrl,
    hasDestination: !!supermasterWhatsapp,
    botUrl: whatsappBotUrl || 'non configurato',
    to: supermasterWhatsapp ? supermasterWhatsapp.replace(/\d(?=\d{4})/g, '*') : 'non configurato'
  };
}

export default {
  notificaNuovaVisita,
  inviaNotificaWhatsApp,
  verificaConfigurazioneWhatsApp
};
