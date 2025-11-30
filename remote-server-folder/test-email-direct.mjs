import nodemailer from 'nodemailer';

/**
 * Test diretto del sistema email con configurazione hardcoded
 * Per verificare che le credenziali SMTP funzionino
 */

async function testEmailDirect() {
  console.log('[EMAIL-TEST-DIRECT] Avvio test email diretto...');
  
  try {
    // Configurazione SMTP hardcoded (temporanea per test)
    const transporter = nodemailer.createTransport({
      host: 'mail.kimweb.agency',
      port: 465,
      secure: true, // true per 465, false per altri
      auth: {
        user: 'kimstation.noreply@kimweb.agency',
        pass: '#k2oOf$$#6km'
      }
    });

    console.log('[EMAIL-TEST-DIRECT] Transporter creato, verifica connessione...');
    
    // Verifica connessione
    await transporter.verify();
    console.log('[EMAIL-TEST-DIRECT] ✅ Connessione SMTP verificata con successo!');

    // Invia email di test
    const mailOptions = {
      from: '"Kim Station Test" <kimstation.noreply@kimweb.agency>',
      to: 'comunicazioni@kimweb.it',
      subject: '[TEST DIRETTO] Sistema Email Kim Station',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center;">
            <h1>🧪 Test Email Diretto</h1>
          </div>
          <div style="padding: 30px;">
            <div style="background: #d4edda; border-left: 4px solid #28a745; padding: 15px; margin: 20px 0;">
              <h3>✅ Sistema Email Funzionante!</h3>
              <p>Questo test diretto conferma che:</p>
              <ul>
                <li>Le credenziali SMTP sono corrette</li>
                <li>La connessione al server mail.kimweb.agency funziona</li>
                <li>Il sistema può inviare email</li>
              </ul>
            </div>
            <p><strong>Configurazione testata:</strong></p>
            <ul>
              <li><strong>Host:</strong> mail.kimweb.agency</li>
              <li><strong>Porta:</strong> 465 (SSL)</li>
              <li><strong>Utente:</strong> kimstation.noreply@kimweb.agency</li>
              <li><strong>Data/Ora:</strong> ${new Date().toLocaleString('it-IT')}</li>
            </ul>
          </div>
          <div style="background: #f8f9fa; padding: 20px; text-align: center; font-size: 12px; color: #666;">
            <p>© 2025 Kim Station - Test diretto sistema email</p>
          </div>
        </div>
      `,
      text: `
Test Email Diretto - Kim Station

✅ Sistema Email Funzionante!

Questo test diretto conferma che:
- Le credenziali SMTP sono corrette
- La connessione al server mail.kimweb.agency funziona
- Il sistema può inviare email

Configurazione testata:
- Host: mail.kimweb.agency
- Porta: 465 (SSL)
- Utente: kimstation.noreply@kimweb.agency
- Data/Ora: ${new Date().toLocaleString('it-IT')}

© 2025 Kim Station - Test diretto sistema email
      `
    };

    const result = await transporter.sendMail(mailOptions);
    console.log('[EMAIL-TEST-DIRECT] ✅ Email inviata con successo!');
    console.log('[EMAIL-TEST-DIRECT] Message ID:', result.messageId);
    console.log('[EMAIL-TEST-DIRECT] Destinatario:', mailOptions.to);
    
    return {
      success: true,
      messageId: result.messageId,
      recipient: mailOptions.to
    };
  } catch (error) {
    console.error('[EMAIL-TEST-DIRECT] ❌ Errore:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// Esegui test se chiamato direttamente
if (import.meta.url === `file://${process.argv[1]}`) {
  testEmailDirect()
    .then(result => {
      console.log('[EMAIL-TEST-DIRECT] Risultato finale:', result);
      process.exit(result.success ? 0 : 1);
    })
    .catch(error => {
      console.error('[EMAIL-TEST-DIRECT] Errore fatale:', error);
      process.exit(1);
    });
}

export default testEmailDirect;
