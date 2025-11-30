import express from 'express';
import sql from 'mssql';

/**
 * API per la gestione dei template email
 * Endpoints per CRUD dei template email personalizzati
 */

const router = express.Router();

// Middleware per verificare ruolo MASTER o SUPERMASTER
function onlyMasterOrSuperMaster(req, res, next) {
  const ruoli = req.user?.ruoli || [];
  const isMaster = Array.isArray(ruoli) 
    ? ruoli.map(r => r && r.toUpperCase()).includes('MASTER')
    : false;
  const isSuperMaster = Array.isArray(ruoli)
    ? ruoli.map(r => r && r.toUpperCase()).includes('SUPERMASTER')
    : false;

  if (!isMaster && !isSuperMaster) {
    return res.status(403).json({ 
      error: 'Accesso negato. Solo MASTER e SUPERMASTER possono gestire i template email.' 
    });
  }
  next();
}

// GET /api/email-templates - Lista tutti i template
router.get('/email-templates', onlyMasterOrSuperMaster, async (req, res) => {
  try {
    const result = await new sql.Request().query(`
      SELECT 
        ID,
        EventType,
        EventDescription,
        Subject,
        Recipients,
        CCN,
        BCC,
        IsActive,
        CreatedDate,
        ModifiedDate,
        CreatedBy,
        ModifiedBy
      FROM dbo.tbEmailTemplates 
      ORDER BY EventType
    `);

    res.json({
      success: true,
      templates: result.recordset
    });
  } catch (error) {
    console.error('[EMAIL-TEMPLATES] Errore recupero template:', error);
    res.status(500).json({ 
      error: 'Errore nel recupero dei template', 
      details: error.message 
    });
  }
});

// GET /api/email-templates/:id - Dettaglio template specifico
router.get('/email-templates/:id', onlyMasterOrSuperMaster, async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await new sql.Request()
      .input('id', sql.Int, id)
      .query(`
        SELECT 
          ID,
          EventType,
          EventDescription,
          Subject,
          HtmlTemplate,
          TextTemplate,
          Recipients,
          CCN,
          BCC,
          IsActive,
          CreatedDate,
          ModifiedDate,
          CreatedBy,
          ModifiedBy
        FROM dbo.tbEmailTemplates 
        WHERE ID = @id
      `);

    if (result.recordset.length === 0) {
      return res.status(404).json({ error: 'Template non trovato' });
    }

    res.json({
      success: true,
      template: result.recordset[0]
    });
  } catch (error) {
    console.error('[EMAIL-TEMPLATES] Errore recupero template:', error);
    res.status(500).json({ 
      error: 'Errore nel recupero del template', 
      details: error.message 
    });
  }
});

// POST /api/email-templates - Crea nuovo template
router.post('/email-templates', onlyMasterOrSuperMaster, express.json(), async (req, res) => {
  try {
    const {
      eventType,
      eventDescription,
      subject,
      htmlTemplate,
      textTemplate,
      recipients,
      ccn,
      bcc,
      isActive = true
    } = req.body;

    // Validazione campi obbligatori
    if (!eventType || !subject || !htmlTemplate) {
      return res.status(400).json({ 
        error: 'Campi obbligatori mancanti: eventType, subject, htmlTemplate' 
      });
    }

    // Verifica che EventType non esista già
    const existingCheck = await new sql.Request()
      .input('eventType', sql.NVarChar, eventType)
      .query('SELECT ID FROM dbo.tbEmailTemplates WHERE EventType = @eventType');

    if (existingCheck.recordset.length > 0) {
      return res.status(400).json({ 
        error: 'Esiste già un template per questo tipo di evento' 
      });
    }

    const result = await new sql.Request()
      .input('eventType', sql.NVarChar, eventType)
      .input('eventDescription', sql.NVarChar, eventDescription || '')
      .input('subject', sql.NVarChar, subject)
      .input('htmlTemplate', sql.NText, htmlTemplate)
      .input('textTemplate', sql.NText, textTemplate || '')
      .input('recipients', sql.NVarChar, recipients || '')
      .input('ccn', sql.NVarChar, ccn || '')
      .input('bcc', sql.NVarChar, bcc || '')
      .input('isActive', sql.Bit, isActive)
      .input('createdBy', sql.NVarChar, req.user.email || 'SYSTEM')
      .query(`
        INSERT INTO dbo.tbEmailTemplates 
        (EventType, EventDescription, Subject, HtmlTemplate, TextTemplate, 
         Recipients, CCN, BCC, IsActive, CreatedBy, ModifiedBy)
        VALUES 
        (@eventType, @eventDescription, @subject, @htmlTemplate, @textTemplate,
         @recipients, @ccn, @bcc, @isActive, @createdBy, @createdBy);
        
        SELECT SCOPE_IDENTITY() as NewID;
      `);

    const newId = result.recordset[0].NewID;

    res.json({
      success: true,
      message: 'Template creato con successo',
      templateId: newId
    });
  } catch (error) {
    console.error('[EMAIL-TEMPLATES] Errore creazione template:', error);
    res.status(500).json({ 
      error: 'Errore nella creazione del template', 
      details: error.message 
    });
  }
});

// PUT /api/email-templates/:id - Aggiorna template esistente
router.put('/email-templates/:id', onlyMasterOrSuperMaster, express.json(), async (req, res) => {
  try {
    const { id } = req.params;
    const {
      eventDescription,
      subject,
      htmlTemplate,
      textTemplate,
      recipients,
      ccn,
      bcc,
      isActive
    } = req.body;

    // Verifica che il template esista
    const existingCheck = await new sql.Request()
      .input('id', sql.Int, id)
      .query('SELECT ID FROM dbo.tbEmailTemplates WHERE ID = @id');

    if (existingCheck.recordset.length === 0) {
      return res.status(404).json({ error: 'Template non trovato' });
    }

    await new sql.Request()
      .input('id', sql.Int, id)
      .input('eventDescription', sql.NVarChar, eventDescription || '')
      .input('subject', sql.NVarChar, subject)
      .input('htmlTemplate', sql.NText, htmlTemplate)
      .input('textTemplate', sql.NText, textTemplate || '')
      .input('recipients', sql.NVarChar, recipients || '')
      .input('ccn', sql.NVarChar, ccn || '')
      .input('bcc', sql.NVarChar, bcc || '')
      .input('isActive', sql.Bit, isActive !== undefined ? isActive : true)
      .input('modifiedBy', sql.NVarChar, req.user.email || 'SYSTEM')
      .query(`
        UPDATE dbo.tbEmailTemplates 
        SET 
          EventDescription = @eventDescription,
          Subject = @subject,
          HtmlTemplate = @htmlTemplate,
          TextTemplate = @textTemplate,
          Recipients = @recipients,
          CCN = @ccn,
          BCC = @bcc,
          IsActive = @isActive,
          ModifiedDate = GETDATE(),
          ModifiedBy = @modifiedBy
        WHERE ID = @id
      `);

    res.json({
      success: true,
      message: 'Template aggiornato con successo'
    });
  } catch (error) {
    console.error('[EMAIL-TEMPLATES] Errore aggiornamento template:', error);
    res.status(500).json({ 
      error: 'Errore nell\'aggiornamento del template', 
      details: error.message 
    });
  }
});

// DELETE /api/email-templates/:id - Elimina template
router.delete('/email-templates/:id', onlyMasterOrSuperMaster, async (req, res) => {
  try {
    const { id } = req.params;

    // Verifica che il template esista
    const existingCheck = await new sql.Request()
      .input('id', sql.Int, id)
      .query('SELECT ID, EventType FROM dbo.tbEmailTemplates WHERE ID = @id');

    if (existingCheck.recordset.length === 0) {
      return res.status(404).json({ error: 'Template non trovato' });
    }

    await new sql.Request()
      .input('id', sql.Int, id)
      .query('DELETE FROM dbo.tbEmailTemplates WHERE ID = @id');

    res.json({
      success: true,
      message: 'Template eliminato con successo'
    });
  } catch (error) {
    console.error('[EMAIL-TEMPLATES] Errore eliminazione template:', error);
    res.status(500).json({ 
      error: 'Errore nell\'eliminazione del template', 
      details: error.message 
    });
  }
});

// POST /api/email-templates/:id/test - Invia email di test
router.post('/email-templates/:id/test', onlyMasterOrSuperMaster, express.json(), async (req, res) => {
  try {
    const { id } = req.params;
    const { testEmail, testData = {} } = req.body;

    if (!testEmail) {
      return res.status(400).json({ error: 'Email di test obbligatoria' });
    }

    // Recupera template
    const templateResult = await new sql.Request()
      .input('id', sql.Int, id)
      .query(`
        SELECT EventType, Subject, HtmlTemplate, TextTemplate
        FROM dbo.tbEmailTemplates 
        WHERE ID = @id AND IsActive = 1
      `);

    if (templateResult.recordset.length === 0) {
      return res.status(404).json({ error: 'Template non trovato o non attivo' });
    }

    const template = templateResult.recordset[0];

    // Dati di test predefiniti
    const defaultTestData = {
      DEALERNOME: 'Mario Rossi',
      IDORDINE: '12345',
      OFFERTATITOLO: 'Offerta Test',
      OPERATORE: 'OPERATORE TEST',
      CLIENTENOME: 'Giuseppe',
      CLIENTECOGNOME: 'Verdi',
      DATE: new Date().toLocaleDateString('it-IT'),
      DATETIME: new Date().toLocaleString('it-IT'),
      AMOUNT: '50.00',
      TRANSACTIONID: 'TEST_' + Date.now(),
      RAGIONESOCIALE: 'Test S.r.l.',
      STATOESTESO: 'ATTIVATO'
    };

    const mergedData = { ...defaultTestData, ...testData };

    // Personalizza template
    let subject = template.Subject;
    let htmlBody = template.HtmlTemplate;
    let textBody = template.TextTemplate;

    Object.keys(mergedData).forEach(key => {
      const placeholder = new RegExp(`{{${key.toUpperCase()}}}`, 'g');
      const value = mergedData[key] || '';
      
      subject = subject.replace(placeholder, value);
      htmlBody = htmlBody.replace(placeholder, value);
      if (textBody) {
        textBody = textBody.replace(placeholder, value);
      }
    });

    // Invia email di test usando il servizio email
    const emailService = await import('./email-service.mjs');
    await emailService.default.sendEmail({
      to: testEmail,
      subject: `[TEST] ${subject}`,
      html: htmlBody,
      text: textBody
    });

    res.json({
      success: true,
      message: `Email di test inviata a ${testEmail}`
    });
  } catch (error) {
    console.error('[EMAIL-TEMPLATES] Errore invio test:', error);
    res.status(500).json({ 
      error: 'Errore nell\'invio dell\'email di test', 
      details: error.message 
    });
  }
});

// GET /api/email-templates/events/available - Lista eventi disponibili
router.get('/email-templates/events/available', onlyMasterOrSuperMaster, async (req, res) => {
  try {
    const availableEvents = [
      { type: 'NUOVA_ATTIVAZIONE', description: 'Conferma nuova attivazione' },
      { type: 'CAMBIO_STATO', description: 'Notifica cambio stato ordine' },
      { type: 'RICARICA_PLAFOND', description: 'Conferma ricarica plafond' },
      { type: 'RICHIESTA_ASSISTENZA', description: 'Nuova richiesta assistenza' },
      { type: 'OBIETTIVO_RAGGIUNTO', description: 'Obiettivo raggiunto (Agenti)' },
      { type: 'OBIETTIVO_MANCATO', description: 'Obiettivo mancato (Agenti)' },
      { type: 'NUOVO_DEALER', description: 'Registrazione nuovo dealer' },
      { type: 'CONTRATTO_APPROVATO', description: 'Contratto approvato' },
      { type: 'CONTRATTO_RIFIUTATO', description: 'Contratto rifiutato' },
      { type: 'REPORT_SETTIMANALE', description: 'Report settimanale' },
      { type: 'REPORT_MENSILE', description: 'Report mensile' },
      { type: 'ALERT_SISTEMA', description: 'Alert di sistema' }
    ];

    res.json({
      success: true,
      events: availableEvents
    });
  } catch (error) {
    console.error('[EMAIL-TEMPLATES] Errore recupero eventi:', error);
    res.status(500).json({ 
      error: 'Errore nel recupero degli eventi', 
      details: error.message 
    });
  }
});

// POST /api/email-test-simple - Test configurazione email SENZA autenticazione (solo per sviluppo)
router.post('/email-test-simple', express.json(), async (req, res) => {
  // ATTENZIONE: Questo endpoint è solo per test di sviluppo!
  // In produzione dovrebbe essere rimosso o protetto
  console.log('[EMAIL-TEST] Test email richiesto (modalità sviluppo)');
  
  try {
    const { testEmail } = req.body;
    
    const finalTestEmail = testEmail || process.env.EMAIL_TEST_RECIPIENT || 'comunicazioni@kimweb.it';
    
    // Importa il servizio email
    const emailService = await import('./email-service.mjs');
    
    // Crea email di test
    const testEmailContent = {
      to: finalTestEmail,
      subject: 'Test Sistema Email Kim Station',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <style>
                .container { max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif; }
                .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; }
                .body { padding: 30px; line-height: 1.6; }
                .success-box { background: #d4edda; border-left: 4px solid #28a745; padding: 15px; margin: 20px 0; }
                .footer { background: #f8f9fa; padding: 20px; text-align: center; font-size: 12px; color: #666; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>🧪 Test Sistema Email</h1>
                </div>
                <div class="body">
                    <div class="success-box">
                        <h3>✅ Sistema Email Funzionante!</h3>
                        <p>Se ricevi questa email, la configurazione SMTP è corretta.</p>
                    </div>
                    
                    <p><strong>Configurazione attuale:</strong></p>
                    <ul>
                        <li><strong>Host:</strong> ${process.env.EMAIL_HOST}</li>
                        <li><strong>Porta:</strong> ${process.env.EMAIL_PORT}</li>
                        <li><strong>Sicurezza:</strong> ${process.env.EMAIL_SECURE === 'true' ? 'SSL/TLS' : 'No'}</li>
                        <li><strong>Modalità Test:</strong> ${process.env.EMAIL_TEST_MODE === 'true' ? 'ATTIVA' : 'DISATTIVA'}</li>
                        <li><strong>Data/Ora:</strong> ${new Date().toLocaleString('it-IT')}</li>
                    </ul>
                    
                    <p>Il sistema di email personalizzate Kim Station è pronto per l'uso!</p>
                </div>
                <div class="footer">
                    <p>© 2025 Kim Station - Test automatico sistema email</p>
                </div>
            </div>
        </body>
        </html>
      `,
      text: `
Test Sistema Email Kim Station

✅ Sistema Email Funzionante!
Se ricevi questa email, la configurazione SMTP è corretta.

Configurazione attuale:
- Host: ${process.env.EMAIL_HOST}
- Porta: ${process.env.EMAIL_PORT}
- Sicurezza: ${process.env.EMAIL_SECURE === 'true' ? 'SSL/TLS' : 'No'}
- Modalità Test: ${process.env.EMAIL_TEST_MODE === 'true' ? 'ATTIVA' : 'DISATTIVA'}
- Data/Ora: ${new Date().toLocaleString('it-IT')}

Il sistema di email personalizzate Kim Station è pronto per l'uso!

© 2025 Kim Station - Test automatico sistema email
      `
    };

    // Invia email di test
    await emailService.default.sendEmail(testEmailContent);

    res.json({
      success: true,
      message: `Email di test inviata con successo a ${finalTestEmail}`,
      testMode: process.env.EMAIL_TEST_MODE === 'true',
      recipient: finalTestEmail
    });
  } catch (error) {
    console.error('[EMAIL-TEST] Errore invio test:', error);
    res.status(500).json({ 
      error: 'Errore nell\'invio dell\'email di test', 
      details: error.message 
    });
  }
});

// POST /api/email-templates/system/test - Test configurazione email
router.post('/email-templates/system/test', onlyMasterOrSuperMaster, express.json(), async (req, res) => {
  try {
    const { testEmail } = req.body;
    
    const finalTestEmail = testEmail || process.env.EMAIL_TEST_RECIPIENT || 'comunicazioni@kimweb.it';
    
    // Importa il servizio email
    const emailService = await import('./email-service.mjs');
    
    // Crea email di test
    const testEmailContent = {
      to: finalTestEmail,
      subject: 'Test Sistema Email Kim Station',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <style>
                .container { max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif; }
                .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; }
                .body { padding: 30px; line-height: 1.6; }
                .success-box { background: #d4edda; border-left: 4px solid #28a745; padding: 15px; margin: 20px 0; }
                .footer { background: #f8f9fa; padding: 20px; text-align: center; font-size: 12px; color: #666; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>🧪 Test Sistema Email</h1>
                </div>
                <div class="body">
                    <div class="success-box">
                        <h3>✅ Sistema Email Funzionante!</h3>
                        <p>Se ricevi questa email, la configurazione SMTP è corretta.</p>
                    </div>
                    
                    <p><strong>Configurazione attuale:</strong></p>
                    <ul>
                        <li><strong>Host:</strong> ${process.env.EMAIL_HOST}</li>
                        <li><strong>Porta:</strong> ${process.env.EMAIL_PORT}</li>
                        <li><strong>Sicurezza:</strong> ${process.env.EMAIL_SECURE === 'true' ? 'SSL/TLS' : 'No'}</li>
                        <li><strong>Modalità Test:</strong> ${process.env.EMAIL_TEST_MODE === 'true' ? 'ATTIVA' : 'DISATTIVA'}</li>
                        <li><strong>Data/Ora:</strong> ${new Date().toLocaleString('it-IT')}</li>
                    </ul>
                    
                    <p>Il sistema di email personalizzate Kim Station è pronto per l'uso!</p>
                </div>
                <div class="footer">
                    <p>© 2025 Kim Station - Test automatico sistema email</p>
                </div>
            </div>
        </body>
        </html>
      `,
      text: `
Test Sistema Email Kim Station

✅ Sistema Email Funzionante!
Se ricevi questa email, la configurazione SMTP è corretta.

Configurazione attuale:
- Host: ${process.env.EMAIL_HOST}
- Porta: ${process.env.EMAIL_PORT}
- Sicurezza: ${process.env.EMAIL_SECURE === 'true' ? 'SSL/TLS' : 'No'}
- Modalità Test: ${process.env.EMAIL_TEST_MODE === 'true' ? 'ATTIVA' : 'DISATTIVA'}
- Data/Ora: ${new Date().toLocaleString('it-IT')}

Il sistema di email personalizzate Kim Station è pronto per l'uso!

© 2025 Kim Station - Test automatico sistema email
      `
    };

    // Invia email di test
    await emailService.default.sendEmail(testEmailContent);

    res.json({
      success: true,
      message: `Email di test inviata con successo a ${finalTestEmail}`,
      testMode: process.env.EMAIL_TEST_MODE === 'true',
      recipient: finalTestEmail
    });
  } catch (error) {
    console.error('[EMAIL-TEST] Errore invio test:', error);
    res.status(500).json({ 
      error: 'Errore nell\'invio dell\'email di test', 
      details: error.message 
    });
  }
});

export default router;
