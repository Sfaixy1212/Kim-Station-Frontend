import nodemailer from 'nodemailer';
import sql from 'mssql';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Carica esplicitamente le variabili di ambiente
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

// Funzione helper per determinare il database corretto
function getDbName() {
  // Se DB_NAME è definito nel .env, usalo
  if (process.env.DB_NAME) {
    return process.env.DB_NAME;
  }
  
  // Fallback intelligente basato sulla porta o ambiente
  const port = process.env.PORT || '3001';
  if (port === '3002') {
    return 'KAM'; // Produzione
  } else {
    return 'KAM_2'; // Staging/Development
  }
}

/**
 * Servizio Email Personalizzate per Kim Station
 * Gestisce l'invio di email per tutti gli eventi del sistema
 */

class EmailService {
  constructor() {
    // Debug configurazione SMTP
    console.log('[EMAIL-DEBUG] Configurazione SMTP:', {
      host: process.env.EMAIL_HOST,
      port: process.env.EMAIL_PORT,
      secure: process.env.EMAIL_SECURE,
      user: process.env.EMAIL_USER,
      testMode: process.env.EMAIL_TEST_MODE,
      testRecipient: process.env.EMAIL_TEST_RECIPIENT
    });
    
    // Configurazione SMTP con fallback
    const emailConfig = {
      host: process.env.EMAIL_HOST || 'mail.kimweb.agency',
      port: parseInt(process.env.EMAIL_PORT || '465'),
      secure: process.env.EMAIL_SECURE === 'true' || true,
      auth: {
        user: process.env.EMAIL_USER || 'kimstation.noreply@kimweb.agency',
        pass: process.env.EMAIL_PASSWORD || '#k2oOf$$#6km',
      },
    };
    
    this.transporter = nodemailer.createTransport(emailConfig);
  }

  /**
   * Invia email per eventi di attivazione/ordine
   */
  async sendOrderEmail(eventType, orderId, additionalData = {}) {
    try {
      console.log(`[EMAIL] Invio email per evento: ${eventType}, ordine: ${orderId}`);
      
      // Recupera template email
      const template = await this.getEmailTemplate(eventType);
      if (!template) {
        console.log(`[EMAIL] Nessun template trovato per evento: ${eventType}`);
        return false;
      }

      // Recupera dati ordine
      const orderData = await this.getOrderData(orderId);
      if (!orderData) {
        console.log(`[EMAIL] Dati ordine non trovati: ${orderId}`);
        return false;
      }

      // Personalizza email
      const emailContent = this.personalizeTemplate(template, orderData, additionalData);
      
      // Invia email
      await this.sendEmail(emailContent);
      
      console.log(`[EMAIL] Email inviata con successo per evento: ${eventType}`);
      return true;
    } catch (error) {
      console.error(`[EMAIL] Errore invio email:`, error);
      return false;
    }
  }

  /**
   * Invia email per eventi di ricarica plafond
   */
  async sendRechargeEmail(dealerId, amount, transactionId) {
    try {
      const template = await this.getEmailTemplate('RICARICA_PLAFOND');
      if (!template) return false;

      const dealerData = await this.getDealerData(dealerId);
      const emailContent = this.personalizeTemplate(template, {
        ...dealerData,
        amount: amount,
        transactionId: transactionId,
        date: new Date().toLocaleDateString('it-IT')
      });

      await this.sendEmail(emailContent);
      return true;
    } catch (error) {
      console.error(`[EMAIL] Errore invio email ricarica:`, error);
      return false;
    }
  }

  /**
   * Invia email per eventi di ordini prodotti
   */
  async sendProductOrderEmail(eventType, productOrderId, additionalData = {}) {
    try {
      console.log(`[EMAIL] Invio email per evento prodotto: ${eventType}, ordine: ${productOrderId}`);
      
      // Recupera template email
      const template = await this.getEmailTemplate(eventType);
      if (!template) {
        console.log(`[EMAIL] Nessun template trovato per evento: ${eventType}`);
        return false;
      }

      // Recupera dati ordine prodotto
      const orderData = await this.getProductOrderData(productOrderId);
      if (!orderData) {
        console.log(`[EMAIL] Dati ordine prodotto non trovati: ${productOrderId}`);
        return false;
      }
      // Se creato da agente, recupera email agente e aggiungila ai dati (solo se agentId valido)
      let agentEmail = null;
      try {
        const createdByAgent = !!(additionalData && additionalData.createdByAgent);
        const rawId = additionalData?.agentId;
        const agentId = typeof rawId === 'string' ? rawId.trim() : (rawId != null ? String(rawId).trim() : '');
        if (createdByAgent && agentId) {
          const agentData = await this.getAgentData(agentId);
          agentEmail = agentData?.Email || null;
          if (agentEmail) additionalData.AGENTE_EMAIL = agentEmail;
        }
      } catch (e) {
        console.warn('[EMAIL] Impossibile recuperare dati agente per email:', e);
      }

      // Personalizza email
      const emailContent = this.personalizeTemplate(template, orderData, additionalData);
      
      // --- Miglioramento destinatari: includi sempre Dealer, eventuale Cliente, Agente e CC amministrazione ---
      const adminEmail = (process.env.EMAIL_ADMIN && process.env.EMAIL_ADMIN.trim()) || 'amministrazione@kimweb.it';
      const defaultCommsEmail = (process.env.EMAIL_COMMUNICATIONS && process.env.EMAIL_COMMUNICATIONS.trim()) || 'comunicazioni@kimweb.it';
      const isValidEmail = (e) => typeof e === 'string' && /.+@.+\..+/.test(e.trim());
      const parseEmails = (s) => {
        if (!s) return [];
        const entries = s.split(/[;,]/).map(x => x.trim()).filter(x => x.length > 0);
        return entries.flatMap((entry) => {
          const lower = entry.toLowerCase();
          if (lower === 'dealer' || lower === '{{dealer_email}}') {
            return isValidEmail(orderData.DealerEmail) ? [orderData.DealerEmail.trim()] : [];
          }
          if (lower === 'agente' || lower === '{{agente_email}}' || lower === '{{agent_email}}') {
            return isValidEmail(agentEmail) ? [agentEmail.trim()] : [];
          }
          if (lower === 'amministrazione' || lower === 'admin') {
            return isValidEmail(adminEmail) ? [adminEmail] : [];
          }
          if (lower === 'comunicazioni') {
            return isValidEmail(defaultCommsEmail) ? [defaultCommsEmail] : [];
          }
          return isValidEmail(entry) ? [entry] : [];
        });
      };
      const uniqueMerge = (arr) => Array.from(new Set(arr.map(e => e.toLowerCase())));

      // Cliente: da additionalData.emailCliente oppure fallback a OrdineDA se sembra una email
      const customerEmailCandidate = (additionalData && additionalData.emailCliente) || orderData.OrdineDA || '';
      const customerEmail = isValidEmail(customerEmailCandidate) ? customerEmailCandidate.trim() : null;

      // Costruisci lista TO
      let toList = parseEmails(emailContent.to);
      if ((!template.Recipients || template.Recipients.trim() === '')) {
        // Template non forza i destinatari: assicurati Dealer e Agente siano presenti
        if (isValidEmail(orderData.DealerEmail)) toList.push(orderData.DealerEmail.trim());
        if (agentEmail && isValidEmail(agentEmail)) toList.push(agentEmail.trim());
      }
      // Aggiungi sempre il cliente se disponibile
      if (customerEmail) toList.push(customerEmail);
      toList = uniqueMerge(toList);
      emailContent.to = toList.join(', ');

      console.log('[EMAIL][DEBUG][TO]', {
        eventType,
        templateRecipients: template.Recipients,
        resolvedToBeforeJoin: toList,
        dealerEmail: orderData.DealerEmail,
        agentEmail,
        customerEmail
      });

      // Costruisci CC: unisci eventuale CCN/BCC del template con amministrazione
      let ccList = parseEmails(emailContent.cc);
      if (isValidEmail(adminEmail)) ccList.push(adminEmail);
      ccList = uniqueMerge(ccList);
      emailContent.cc = ccList.length ? ccList.join(', ') : undefined;

      // Invia email
      await this.sendEmail(emailContent);
      
      console.log(`[EMAIL] Email inviata con successo per evento: ${eventType}`);
      return true;
    } catch (error) {
      console.error(`[EMAIL] Errore invio email ordine prodotto:`, error);
      return false;
    }
  }

  /**
   * Invia email per ricarica plafond completata
   */
  async sendRechargeCompletedEmail(dealerId, importo, additionalData = {}) {
    try {
      const template = await this.getEmailTemplate('RICARICA_PLAFOND_COMPLETATA');
      if (!template) {
        console.warn('[EMAIL] Template RICARICA_PLAFOND_COMPLETATA non trovato');
        return false;
      }

      const dealerData = await this.getDealerData(dealerId);
      if (!dealerData) {
        console.warn('[EMAIL] Dati dealer non trovati per ID:', dealerId);
        return false;
      }

      const templateData = {
        ...dealerData,
        IMPORTO_RICARICA: this.formatCurrency(importo),
        DATA_RICARICA: new Date().toLocaleDateString('it-IT', { timeZone: 'Europe/Rome' }),
        ORA_RICARICA: new Date().toLocaleTimeString('it-IT', { timeZone: 'Europe/Rome' }),
        TRANSACTION_ID: additionalData.transactionId || 'N/A',
        ...additionalData
      };

      const emailContent = this.personalizeTemplate(template, templateData, additionalData);
      await this.sendEmail(emailContent);
      
      console.log(`[EMAIL] Email ricarica plafond completata inviata per dealer ${dealerId}`);
      return true;
    } catch (error) {
      console.error('[EMAIL] Errore invio email ricarica completata:', error);
      return false;
    }
  }

  /**
   * Invia email per eventi di assistenza
   */
  async sendAssistanceEmail(assistanceId, dealerId) {
    try {
      const template = await this.getEmailTemplate('RICHIESTA_ASSISTENZA');
      if (!template) return false;

      const assistanceData = await this.getAssistanceData(assistanceId);
      const dealerData = await this.getDealerData(dealerId);
      
      const emailContent = this.personalizeTemplate(template, {
        ...assistanceData,
        ...dealerData
      });

      await this.sendEmail(emailContent);
      return true;
    } catch (error) {
      console.error(`[EMAIL] Errore invio email assistenza:`, error);
      return false;
    }
  }

  /**
   * Invia email per obiettivi agenti
   */
  async sendGoalEmail(agentId, goalType, goalData) {
    try {
      const template = await this.getEmailTemplate(`OBIETTIVO_${goalType}`);
      if (!template) return false;

      const agentData = await this.getAgentData(agentId);
      const emailContent = this.personalizeTemplate(template, {
        ...agentData,
        ...goalData
      });

      await this.sendEmail(emailContent);
      return true;
    } catch (error) {
      console.error(`[EMAIL] Errore invio email obiettivi:`, error);
      return false;
    }
  }

  /**
   * Invia report periodici
   */
  async sendPeriodicReport(reportType, recipients, reportData) {
    try {
      const template = await this.getEmailTemplate(`REPORT_${reportType}`);
      if (!template) return false;

      for (const recipient of recipients) {
        const emailContent = this.personalizeTemplate(template, {
          ...reportData,
          recipientName: recipient.name,
          recipientRole: recipient.role
        });

        emailContent.to = recipient.email;
        await this.sendEmail(emailContent);
      }
      
      return true;
    } catch (error) {
      console.error(`[EMAIL] Errore invio report:`, error);
      return false;
    }
  }

  /**
   * Recupera template email dal database
   */
  async getEmailTemplate(eventType) {
    try {
      const result = await new sql.Request()
        .input('eventType', sql.NVarChar, eventType)
        .query(`
          SELECT 
            EventType,
            Subject,
            HtmlTemplate,
            TextTemplate,
            Recipients,
            CCN,
            BCC,
            IsActive
          FROM dbo.tbEmailTemplates 
          WHERE EventType = @eventType AND IsActive = 1
        `);

      return result.recordset.length > 0 ? result.recordset[0] : null;
    } catch (error) {
      console.error('[EMAIL] Errore recupero template:', error);
      return null;
    }
  }

  /**
   * Recupera dati ordine
   */
  async getOrderData(orderId) {
    try {
      const result = await new sql.Request()
        .input('orderId', sql.Int, orderId)
        .query(`
          SELECT 
          o.IDOrdine,
          o.DataOra,
          o.Stato,
          so.StatoEsteso,
          d.RagioneSociale as DealerNome,
          d.RecapitoEmail as DealerEmail,
          d.RagioneSociale,
          offerta.Titolo as OffertaTitolo,
          op.Denominazione as Operatore,
          di.Cognome as ClienteCognome,
          di.Payload as ClientePayload
        FROM dbo.tbOrdini o
        INNER JOIN dbo.tbDealers d ON o.idDealer = d.IDDealer
        INNER JOIN dbo.tbOfferte offerta ON o.idOfferta = offerta.IDOfferta
        INNER JOIN dbo.tbOperatori op ON offerta.IDOperatore = op.IDOperatore
        LEFT JOIN dbo.tbStatiOrdini so ON o.Stato = so.IDStato
        LEFT JOIN dbo.tbDatiIntestario di ON o.IDOrdine = di.IDOrdine
        WHERE o.IDOrdine = @orderId
      `);

    if (result.recordset.length > 0) {
      const orderData = result.recordset[0];
      
      // Parse del payload JSON per estrarre dati cliente
      if (orderData.ClientePayload) {
        try {
          const clienteData = JSON.parse(orderData.ClientePayload);
          // Estrae nome e cognome dal campo completo "alessandro ferrulli"
          const nomeCompleto = clienteData.NOME_E_COGNOME_INTESTATARIO_CONTRATTO || '';
          const partiNome = nomeCompleto.trim().split(/\s+/);
          
          if (partiNome.length >= 2) {
            // Primo elemento = nome, resto = cognome
            orderData.ClienteNome = partiNome[0];
            // Non sovrascrivere ClienteCognome se già presente dal DB
            if (!orderData.ClienteCognome || orderData.ClienteCognome.trim() === '') {
              orderData.ClienteCognome = partiNome.slice(1).join(' ');
            }
          } else {
            // Solo un elemento, usa come nome
            orderData.ClienteNome = nomeCompleto || 'Cliente';
          }
          
          orderData.ClienteEmail = clienteData.EMAIL || clienteData.email || 'N/A';
        } catch (e) {
          console.log('[EMAIL] Errore parsing payload cliente:', e);
          orderData.ClienteNome = 'Cliente';
          orderData.ClienteEmail = 'N/A';
        }
      } else {
        console.log('[EMAIL] Nessun payload cliente trovato');
        orderData.ClienteNome = orderData.ClienteCognome || 'Cliente';
        orderData.ClienteEmail = 'N/A';
      }
      
      return orderData;
    }
    return null;
  } catch (error) {
    console.error('[EMAIL] Errore recupero dati ordine:', error);
    return null;
  }
}

  /**
   * Recupera dati ordine prodotto
   */
  async getProductOrderData(productOrderId) {
    try {
      const dbName = getDbName();
      const result = await new sql.Request()
        .input('productOrderId', sql.Int, productOrderId)
        .query(`
          SELECT 
            op.IDOrdineProdotto,
            op.DataOra,
            op.TotaleOrdine,
            op.SpeseSpedizione,
            op.NoteOrdine,
            op.OrdineDA,
            op.OrdineDaAgente,
            sop.StatoEsteso,
            d.RagioneSociale as DealerNome,
            d.RecapitoEmail as DealerEmail,
            d.AGENTE as AgenteNome,
            d.RecapitoCell as DealerTelefono,
            -- Recupera dettagli prodotti
            STRING_AGG(
              CONCAT(
                offr.Titolo, 
                ' (Qtà: ', dop.Quantita, 
                ', €', FORMAT(dop.CostoUnitario, 'N2'), ')'
              ), 
              '; '
            ) WITHIN GROUP (ORDER BY dop.IDDettagliOrdiniProdotti) as ProdottiDettaglio,
            COUNT(dop.IDDettagliOrdiniProdotti) as NumeroProdotti
          FROM [${dbName}].dbo.tbOrdiniProdotti op
          INNER JOIN [${dbName}].dbo.tbDealers d ON op.idDealer = d.IDDealer
          LEFT JOIN [${dbName}].dbo.tbStatiOrdiniProdotti sop ON op.idStatoOrdineProdotto = sop.IDStato
          LEFT JOIN [${dbName}].dbo.tbDettagliOrdiniProdotti dop ON op.IDOrdineProdotto = dop.IDOrdineProdotto
          LEFT JOIN [${dbName}].dbo.tbOfferte offr ON dop.IDOfferta = offr.IDOfferta
          WHERE op.IDOrdineProdotto = @productOrderId
          GROUP BY 
            op.IDOrdineProdotto, op.DataOra, op.TotaleOrdine, op.SpeseSpedizione,
            op.NoteOrdine, op.OrdineDA, op.OrdineDaAgente, sop.StatoEsteso,
            d.RagioneSociale, d.RecapitoEmail, d.AGENTE, d.RecapitoCell
        `);

      if (result.recordset.length > 0) {
        const orderData = result.recordset[0];
        
        // Formatta i dati per i template email
        orderData.IDORDINE = orderData.IDOrdineProdotto;
        orderData.DATA_ORDINE = new Date(orderData.DataOra).toLocaleDateString('it-IT', { timeZone: 'Europe/Rome' });
        orderData.ORA_ORDINE = new Date(orderData.DataOra).toLocaleTimeString('it-IT', { timeZone: 'Europe/Rome' });
        // Valori già memorizzati in EURO in DB
        orderData.TOTALE_ORDINE = `€${Number(orderData.TotaleOrdine).toFixed(2)}`;
        orderData.SPESE_SPEDIZIONE = `€${Number(orderData.SpeseSpedizione || 0).toFixed(2)}`;
        // Totale completo = TotaleOrdine + SpeseSpedizione
        const totaleCompleto = Number(orderData.TotaleOrdine) + Number(orderData.SpeseSpedizione || 0);
        orderData.TOTALE_COMPLETO = `€${totaleCompleto.toFixed(2)}`;
        orderData.STATO_ORDINE = orderData.StatoEsteso || 'In elaborazione';
        orderData.PRODOTTI_LISTA = orderData.ProdottiDettaglio || 'Nessun prodotto specificato';
        orderData.NUMERO_PRODOTTI = orderData.NumeroProdotti || 0;
        
        // Crea versione HTML formattata dei prodotti
        if (orderData.ProdottiDettaglio) {
          const prodotti = orderData.ProdottiDettaglio.split('; ');
          let prodottiHtml = '';
          prodotti.forEach(prodotto => {
            if (prodotto.trim()) {
              // Estrae nome prodotto e dettagli (Qtà e prezzo)
              const match = prodotto.match(/^(.+?)\s*\(Qtà:\s*(\d+),\s*€([\d,\.]+)\)$/);
              if (match) {
                const [, nome, qta, prezzo] = match;
                prodottiHtml += `
                  <div class="product-item">
                    <div class="product-name">${nome.trim()}</div>
                    <div class="product-details">
                      <span style="color: #666;">Quantità: <strong>${qta}</strong></span> • 
                      <span style="color: #28a745; font-weight: bold;">€${prezzo}</span>
                    </div>
                  </div>`;
              } else {
                // Fallback per formato non riconosciuto
                prodottiHtml += `
                  <div class="product-item">
                    <div class="product-name">${prodotto.trim()}</div>
                  </div>`;
              }
            }
          });
          orderData.PRODOTTI_LISTA_HTML = prodottiHtml || '<div class="product-item"><div class="product-name">Nessun prodotto specificato</div></div>';
        } else {
          orderData.PRODOTTI_LISTA_HTML = '<div class="product-item"><div class="product-name">Nessun prodotto specificato</div></div>';
        }
        orderData.NOTE_ORDINE = orderData.NoteOrdine || 'Nessuna nota';
        orderData.DEALER_NOME = orderData.DealerNome;
        orderData.DEALER_EMAIL = orderData.DealerEmail;
        orderData.DEALER_TELEFONO = orderData.DealerTelefono || 'Non specificato';
        orderData.AGENTE_NOME = orderData.AgenteNome || 'Non assegnato';
        orderData.ORDINATO_DA = orderData.OrdineDA || 'Sistema';
        orderData.ORDINE_DA_AGENTE = orderData.OrdineDaAgente ? 'Sì' : 'No';
        
        return orderData;
      }
      return null;
    } catch (error) {
      console.error('[EMAIL] Errore recupero dati ordine prodotto:', error);
      return null;
    }
  }

  /**
   * Recupera dati dealer
   */
  async getDealerData(dealerId) {
    try {
      const result = await new sql.Request()
        .input('dealerId', sql.Int, dealerId)
        .query(`
          SELECT 
            IDDealer,
            Nome,
            Email,
            RagioneSociale,
            Telefono,
            Indirizzo,
            Citta,
            CAP,
            Provincia
          FROM dbo.tbDealers 
          WHERE IDDealer = @dealerId
        `);

      return result.recordset.length > 0 ? result.recordset[0] : null;
    } catch (error) {
      console.error('[EMAIL] Errore recupero dati dealer:', error);
      return null;
    }
  }

  /**
   * Recupera dati assistenza
   */
  async getAssistanceData(assistanceId) {
    try {
      const result = await new sql.Request()
        .input('assistanceId', sql.Int, assistanceId)
        .query(`
          SELECT 
            IDOrdine,
            DataOra,
            Stato,
            off.Titolo as OffertaTitolo,
            di.Nome as ClienteNome,
            di.Cognome as ClienteCognome
          FROM dbo.tbOrdini o
          INNER JOIN dbo.tbOfferte off ON o.idOfferta = off.IDOfferta
          LEFT JOIN dbo.tbDatiIntestario di ON o.IDOrdine = di.IDOrdine
          WHERE o.IDOrdine = @assistanceId AND o.ASSISTENZA = 1
        `);

      return result.recordset.length > 0 ? result.recordset[0] : null;
    } catch (error) {
      console.error('[EMAIL] Errore recupero dati assistenza:', error);
      return null;
    }
  }

  /**
   * Recupera dati agente
   */
  async getAgentData(agentId) {
    try {
      const result = await new sql.Request()
        .input('agentId', sql.NVarChar, agentId)
        .query(`
          SELECT 
            Id,
            Email,
            UserName
          FROM dbo.AspNetUsers 
          WHERE Id = @agentId
        `);

      return result.recordset.length > 0 ? result.recordset[0] : null;
    } catch (error) {
      console.error('[EMAIL] Errore recupero dati agente:', error);
      return null;
    }
  }

  /**
   * Personalizza template con i dati
   */
  personalizeTemplate(template, data, additionalData = {}) {
    const allData = { ...data, ...additionalData };

    const now = new Date();
    const dateTime = now.toLocaleString('it-IT', { timeZone: 'Europe/Rome' });
    const date = now.toLocaleDateString('it-IT', { timeZone: 'Europe/Rome' });
    const time = now.toLocaleTimeString('it-IT', { timeZone: 'Europe/Rome' });

    const replacePlaceholders = (value) => {
      if (typeof value !== 'string' || value.length === 0) return value;
      let out = value;
      Object.keys(allData).forEach(key => {
        const placeholder = new RegExp(`{{${key.toUpperCase()}}}`, 'g');
        const replacement = allData[key] != null ? String(allData[key]) : '';
        out = out.replace(placeholder, replacement);
      });
      out = out.replace(/{{DATETIME}}/g, dateTime);
      out = out.replace(/{{DATE}}/g, date);
      out = out.replace(/{{TIME}}/g, time);
      return out;
    };

    let subject = template.Subject;
    let htmlBody = template.HtmlTemplate;
    let textBody = template.TextTemplate;

    // Sostituisci placeholder con dati reali
    Object.keys(allData).forEach(key => {
      const placeholder = new RegExp(`{{${key.toUpperCase()}}}`, 'g');
      const value = allData[key] || '';
      
      subject = subject.replace(placeholder, value);
      htmlBody = htmlBody.replace(placeholder, value);
      if (textBody) {
        textBody = textBody.replace(placeholder, value);
      }
    });

    // Aggiungi data/ora corrente con fuso orario italiano
    subject = subject.replace(/{{DATETIME}}/g, dateTime);
    subject = subject.replace(/{{DATE}}/g, date);
    subject = subject.replace(/{{TIME}}/g, time);
    
    htmlBody = htmlBody.replace(/{{DATETIME}}/g, dateTime);
    htmlBody = htmlBody.replace(/{{DATE}}/g, date);
    htmlBody = htmlBody.replace(/{{TIME}}/g, time);
    
    if (textBody) {
      textBody = textBody.replace(/{{DATETIME}}/g, dateTime);
      textBody = textBody.replace(/{{DATE}}/g, date);
      textBody = textBody.replace(/{{TIME}}/g, time);
    }

    // Gestione dinamica sezione pagamento se il template contiene {{PAYMENT_SECTION}}
    try {
      const wantsPaymentSection = typeof htmlBody === 'string' && htmlBody.includes('{{PAYMENT_SECTION}}');
      if (wantsPaymentSection) {
        const pm = (additionalData.paymentMethod || '').toString().toUpperCase();
        const paymentLink = additionalData.paymentLink || additionalData.PAYMENT_LINK || '';
        const ibanFromEnv = (process.env.IBAN_AZIENDA || '').trim();
        const ibanSafe = ibanFromEnv || 'IT00X0000000000000000000000';

        let paymentSectionHtml = '';
        if (pm === 'CARTA' || pm === 'CARD' || pm === 'CC' || pm === 'CREDIT_CARD') {
          // Se è presente un link pagamento lo mostriamo, altrimenti istruzioni generiche
          if (paymentLink) {
            paymentSectionHtml = `
              <div style="background:#e8f5e9;border:1px solid #a5d6a7;color:#2e7d32;padding:16px;border-radius:8px;margin:16px 0;">
                <div style="font-weight:600;margin-bottom:6px;">Pagamento con Carta di Credito</div>
                <p style="margin:6px 0 12px 0;">Completa il pagamento in modo sicuro cliccando sul pulsante qui sotto:</p>
                <div style="text-align:center;margin:14px 0;">
                  <a href="${paymentLink}" target="_blank" rel="noopener noreferrer"
                     style="display:inline-block;background:#28a745;color:#fff;padding:12px 18px;border-radius:6px;text-decoration:none;font-weight:600;">
                    Paga Ora con Carta
                  </a>
                </div>
                <p style="font-size:12px;color:#2e7d32;margin:0;">Dopo il pagamento riceverai una conferma via email.</p>
              </div>`;
          } else {
            paymentSectionHtml = `
              <div style="background:#fff3cd;border:1px solid #ffe08a;color:#856404;padding:16px;border-radius:8px;margin:16px 0;">
                <div style="font-weight:600;margin-bottom:6px;">Pagamento con Carta di Credito</div>
                <p style="margin:6px 0;">Il link per il pagamento con carta verrà inviato a breve oppure può essere richiesto al proprio referente Kim Station.</p>
              </div>`;
          }
        } else {
          // Default BONIFICO
          const idOrdine = allData.IDORDINE || allData.IDOrdineProdotto || '';
          paymentSectionHtml = `
            <div style="background:#eef2ff;border:1px solid #c7d2fe;color:#3730a3;padding:16px;border-radius:8px;margin:16px 0;">
              <div style="font-weight:600;margin-bottom:6px;">Istruzioni per Bonifico Bancario</div>
              <ul style="margin:8px 0 0 18px;padding:0;">
                <li><strong>Intestatario:</strong> Kim s.r.l.s</li>
                <li><strong>Banca:</strong> INTESA SANPAOLO</li>
                <li><strong>IBAN:</strong> ${ibanSafe}</li>
                <li><strong>Causale:</strong> Ordine #${idOrdine}</li>
                <li><strong>Importo:</strong> ${allData.TOTALE_COMPLETO || allData.TOTALE_ORDINE || ''}</li>
              </ul>
            </div>`;
        }

        htmlBody = htmlBody.replace(/{{PAYMENT_SECTION}}/g, paymentSectionHtml);
        if (textBody) {
          // Versione testo semplificata
          let paymentText = '';
          if (pm === 'CARTA' || pm === 'CARD' || pm === 'CC' || pm === 'CREDIT_CARD') {
            paymentText = paymentLink
              ? `Pagamento con carta: visita il link per pagare: ${paymentLink}`
              : 'Pagamento con carta: il link verrà inviato a breve.';
          } else {
            const idOrdine = allData.IDORDINE || allData.IDOrdineProdotto || '';
            paymentText = `Bonifico bancario\nIntestatario: Kim s.r.l.s\nBanca: INTESA SANPAOLO\nIBAN: ${ibanSafe}\nCausale: Ordine #${idOrdine}`;
          }
          textBody = textBody.replace(/{{PAYMENT_SECTION}}/g, paymentText);
        }
      }
    } catch (e) {
      console.warn('[EMAIL] Errore gestione PAYMENT_SECTION:', e?.message || e);
    }

    // Aggiungi header con logo Kim Station se non già presente
    if (htmlBody && !htmlBody.includes('Kim Station Logo')) {
      console.log('[EMAIL] Aggiungendo logo Kim Station al template');
      const logoHeader = `
        <!-- Header con Logo Kim Station -->
        <div style="text-align: center; margin-bottom: 30px; padding: 20px; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <img src="https://www.kimweb.agency/Immagini/logo.png" alt="Kim Station Logo" style="max-height: 60px; width: auto; margin-bottom: 10px;" />
            <h1 style="color: #2c3e50; margin: 10px 0 5px 0; font-size: 24px; font-weight: bold;">Kim Station</h1>
            <p style="color: #7f8c8d; margin: 0; font-size: 14px;">Il tuo partner per le telecomunicazioni</p>
        </div>`;
      
      // Inserisci il logo dopo il div container principale
      htmlBody = htmlBody.replace(
        '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">',
        '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">' + logoHeader
      );
    }

    const resolvedTo = replacePlaceholders(template.Recipients);
    const resolvedCc = replacePlaceholders(template.CCN);
    const resolvedBcc = replacePlaceholders(template.BCC);

    return {
      to: resolvedTo || data.DealerEmail || data.Email,
      cc: resolvedCc,
      bcc: resolvedBcc,
      subject: subject,
      html: htmlBody,
      text: textBody
    };
  }

  /**
   * Invia email
   */
  async sendEmail(emailContent) {
    try {
      // Modalità test: reindirizza tutte le email a un indirizzo specifico
      const isTestMode = process.env.EMAIL_TEST_MODE === 'true';
      const testRecipient = process.env.EMAIL_TEST_RECIPIENT;
      
      let finalTo = emailContent.to;
      let finalCc = emailContent.cc;
      let finalBcc = emailContent.bcc;
      let subjectPrefix = '';
      
      if (isTestMode && testRecipient) {
        // In modalità test, reindirizza tutto al test recipient
        const originalRecipients = {
          to: emailContent.to,
          cc: emailContent.cc,
          bcc: emailContent.bcc
        };
        
        finalTo = testRecipient;
        finalCc = null;
        finalBcc = null;
        subjectPrefix = '[TEST MODE] ';
        
        console.log('[EMAIL] MODALITÀ TEST ATTIVA - Email reindirizzata da:', originalRecipients, 'a:', testRecipient);
        
        // Aggiungi info sui destinatari originali nel corpo dell'email
        if (emailContent.html) {
          emailContent.html = `
            <div style="background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; margin-bottom: 20px; border-radius: 5px;">
              <h4 style="color: #856404; margin: 0 0 10px 0;">🧪 MODALITÀ TEST ATTIVA</h4>
              <p style="margin: 0; color: #856404;"><strong>Destinatari originali:</strong></p>
              <ul style="margin: 5px 0 0 20px; color: #856404;">
                ${originalRecipients.to ? `<li><strong>A:</strong> ${originalRecipients.to}</li>` : ''}
                ${originalRecipients.cc ? `<li><strong>CC:</strong> ${originalRecipients.cc}</li>` : ''}
                ${originalRecipients.bcc ? `<li><strong>BCC:</strong> ${originalRecipients.bcc}</li>` : ''}
              </ul>
            </div>
            ${emailContent.html}
          `;
        }
        
        if (emailContent.text) {
          emailContent.text = `
🧪 MODALITÀ TEST ATTIVA
Destinatari originali:
- A: ${originalRecipients.to || 'N/A'}
- CC: ${originalRecipients.cc || 'N/A'}
- BCC: ${originalRecipients.bcc || 'N/A'}

--- EMAIL ORIGINALE ---
${emailContent.text}
          `;
        }
      }

      const mailOptions = {
        from: `"Kim Station" <${process.env.EMAIL_USER}>`,
        to: finalTo,
        cc: finalCc,
        bcc: finalBcc,
        subject: subjectPrefix + emailContent.subject,
        html: emailContent.html,
        text: emailContent.text
      };

      const result = await this.transporter.sendMail(mailOptions);
      
      if (isTestMode) {
        console.log('[EMAIL] Email inviata in MODALITÀ TEST a:', testRecipient, '- MessageID:', result.messageId);
      } else {
        console.log('[EMAIL] Email inviata a:', finalTo, '- MessageID:', result.messageId);
      }
      
      return result;
    } catch (error) {
      console.error('[EMAIL] Errore invio:', error);
      throw error;
    }
  }
}

// Esporta istanza singleton
export default new EmailService();

