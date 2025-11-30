-- Script per inserire i template email predefiniti
-- Kim Station - Sistema Email Personalizzate

-- Template 1: Nuova Attivazione
INSERT INTO [dbo].[tbEmailTemplates] 
([EventType], [EventDescription], [Subject], [HtmlTemplate], [TextTemplate], [CreatedBy])
VALUES 
('NUOVA_ATTIVAZIONE', 'Email di conferma per nuova attivazione', 
'✅ Attivazione Confermata - Ordine #{{IDORDINE}}',
'<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        .container { max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; }
        .body { padding: 30px; line-height: 1.6; }
        .success-box { background: #d4edda; border-left: 4px solid #28a745; padding: 15px; margin: 20px 0; }
        .info-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        .info-table th, .info-table td { padding: 10px; border-bottom: 1px solid #ddd; text-align: left; }
        .info-table th { background: #f8f9fa; font-weight: bold; }
        .footer { background: #f8f9fa; padding: 20px; text-align: center; font-size: 12px; color: #666; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>✅ Attivazione Confermata</h1>
        </div>
        <div class="body">
            <p>Gentile <strong>{{DEALERNOME}}</strong>,</p>
            
            <div class="success-box">
                <h3>🎉 La tua attivazione è stata confermata!</h3>
                <p>Abbiamo ricevuto e processato con successo la tua richiesta di attivazione.</p>
            </div>
            
            <table class="info-table">
                <tr><th>ID Ordine:</th><td><strong>{{IDORDINE}}</strong></td></tr>
                <tr><th>Offerta:</th><td>{{OFFERTATITOLO}}</td></tr>
                <tr><th>Operatore:</th><td>{{OPERATORE}}</td></tr>
                <tr><th>Cliente:</th><td>{{CLIENTENOME}} {{CLIENTECOGNOME}}</td></tr>
                <tr><th>Data:</th><td>{{DATE}}</td></tr>
            </table>
            
            <p>Il tuo ordine è ora in elaborazione. Riceverai aggiornamenti via email non appena ci saranno novità.</p>
            
            <p>Grazie per aver scelto Kim Station!</p>
        </div>
        <div class="footer">
            <p>© 2025 Kim Station - Tutti i diritti riservati</p>
            <p>Questa è una email automatica, non rispondere a questo messaggio.</p>
        </div>
    </div>
</body>
</html>',
'Gentile {{DEALERNOME}},

La tua attivazione è stata confermata!

Dettagli ordine:
- ID Ordine: {{IDORDINE}}
- Offerta: {{OFFERTATITOLO}}
- Operatore: {{OPERATORE}}
- Cliente: {{CLIENTENOME}} {{CLIENTECOGNOME}}
- Data: {{DATE}}

Grazie per aver scelto Kim Station!',
'SYSTEM');

-- Template 2: Cambio Stato Ordine
INSERT INTO [dbo].[tbEmailTemplates] 
([EventType], [EventDescription], [Subject], [HtmlTemplate], [TextTemplate], [CreatedBy])
VALUES 
('CAMBIO_STATO', 'Notifica cambio stato ordine', 
'📋 Aggiornamento Ordine #{{IDORDINE}} - {{STATOESTESO}}',
'<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        .container { max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; }
        .body { padding: 30px; line-height: 1.6; }
        .info-box { background: #f8f9fa; border-left: 4px solid #667eea; padding: 15px; margin: 20px 0; }
        .info-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        .info-table th, .info-table td { padding: 10px; border-bottom: 1px solid #ddd; text-align: left; }
        .info-table th { background: #f8f9fa; font-weight: bold; }
        .footer { background: #f8f9fa; padding: 20px; text-align: center; font-size: 12px; color: #666; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📋 Aggiornamento Ordine</h1>
        </div>
        <div class="body">
            <p>Gentile <strong>{{DEALERNOME}}</strong>,</p>
            
            <div class="info-box">
                <h3>Stato ordine aggiornato</h3>
                <p>Il tuo ordine <strong>#{{IDORDINE}}</strong> è stato aggiornato.</p>
                <p><strong>Nuovo stato:</strong> {{STATOESTESO}}</p>
            </div>
            
            <table class="info-table">
                <tr><th>ID Ordine:</th><td>{{IDORDINE}}</td></tr>
                <tr><th>Offerta:</th><td>{{OFFERTATITOLO}}</td></tr>
                <tr><th>Cliente:</th><td>{{CLIENTENOME}} {{CLIENTECOGNOME}}</td></tr>
                <tr><th>Stato:</th><td><strong>{{STATOESTESO}}</strong></td></tr>
                <tr><th>Data aggiornamento:</th><td>{{DATETIME}}</td></tr>
            </table>
            
            <p>{{NOTEDEALER}}</p>
            
            <p>Continueremo a tenerti aggiornato sui progressi del tuo ordine.</p>
        </div>
        <div class="footer">
            <p>© 2025 Kim Station - Tutti i diritti riservati</p>
        </div>
    </div>
</body>
</html>',
'Gentile {{DEALERNOME}},

Il tuo ordine #{{IDORDINE}} è stato aggiornato.

Nuovo stato: {{STATOESTESO}}
Offerta: {{OFFERTATITOLO}}
Cliente: {{CLIENTENOME}} {{CLIENTECOGNOME}}
Data aggiornamento: {{DATETIME}}

Note: {{NOTEDEALER}}

Grazie per aver scelto Kim Station!',
'SYSTEM');

-- Template 3: Ricarica Plafond
INSERT INTO [dbo].[tbEmailTemplates] 
([EventType], [EventDescription], [Subject], [HtmlTemplate], [TextTemplate], [CreatedBy])
VALUES 
('RICARICA_PLAFOND', 'Notifica ricarica plafond dealer', 
'💰 Ricarica Plafond Completata - €{{AMOUNT}}',
'<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        .container { max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif; }
        .header { background: linear-gradient(135deg, #28a745 0%, #20c997 100%); color: white; padding: 30px; text-align: center; }
        .body { padding: 30px; line-height: 1.6; }
        .success-box { background: #d4edda; border-left: 4px solid #28a745; padding: 15px; margin: 20px 0; }
        .amount { font-size: 24px; font-weight: bold; color: #28a745; text-align: center; margin: 20px 0; }
        .info-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        .info-table th, .info-table td { padding: 10px; border-bottom: 1px solid #ddd; text-align: left; }
        .info-table th { background: #f8f9fa; font-weight: bold; }
        .footer { background: #f8f9fa; padding: 20px; text-align: center; font-size: 12px; color: #666; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>💰 Ricarica Plafond</h1>
        </div>
        <div class="body">
            <p>Gentile <strong>{{NOME}}</strong>,</p>
            
            <div class="success-box">
                <h3>✅ Ricarica completata con successo!</h3>
                <p>Il tuo plafond è stato ricaricato.</p>
            </div>
            
            <div class="amount">€{{AMOUNT}}</div>
            
            <table class="info-table">
                <tr><th>Importo ricarica:</th><td><strong>€{{AMOUNT}}</strong></td></tr>
                <tr><th>ID Transazione:</th><td>{{TRANSACTIONID}}</td></tr>
                <tr><th>Data:</th><td>{{DATE}}</td></tr>
                <tr><th>Dealer:</th><td>{{RAGIONESOCIALE}}</td></tr>
            </table>
            
            <p>La ricarica è stata elaborata e il credito è ora disponibile nel tuo account.</p>
            
            <p>Puoi verificare il saldo aggiornato accedendo alla tua dashboard.</p>
        </div>
        <div class="footer">
            <p>© 2025 Kim Station - Tutti i diritti riservati</p>
        </div>
    </div>
</body>
</html>',
'Gentile {{NOME}},

Ricarica plafond completata!

Importo: €{{AMOUNT}}
ID Transazione: {{TRANSACTIONID}}
Data: {{DATE}}
Dealer: {{RAGIONESOCIALE}}

Il credito è ora disponibile nel tuo account.

Grazie per aver scelto Kim Station!',
'SYSTEM');

-- Template 4: Richiesta Assistenza
INSERT INTO [dbo].[tbEmailTemplates] 
([EventType], [EventDescription], [Subject], [HtmlTemplate], [TextTemplate], [CCN], [CreatedBy])
VALUES 
('RICHIESTA_ASSISTENZA', 'Notifica nuova richiesta assistenza', 
'🆘 Nuova Richiesta Assistenza - Ordine #{{IDORDINE}}',
'<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        .container { max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif; }
        .header { background: linear-gradient(135deg, #ffc107 0%, #fd7e14 100%); color: white; padding: 30px; text-align: center; }
        .body { padding: 30px; line-height: 1.6; }
        .warning-box { background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; }
        .info-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        .info-table th, .info-table td { padding: 10px; border-bottom: 1px solid #ddd; text-align: left; }
        .info-table th { background: #f8f9fa; font-weight: bold; }
        .footer { background: #f8f9fa; padding: 20px; text-align: center; font-size: 12px; color: #666; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🆘 Richiesta Assistenza</h1>
        </div>
        <div class="body">
            <p>Gentile Team,</p>
            
            <div class="warning-box">
                <h3>Nuova richiesta di assistenza ricevuta</h3>
                <p>È stata inviata una nuova richiesta di assistenza che richiede attenzione.</p>
            </div>
            
            <table class="info-table">
                <tr><th>ID Ordine:</th><td><strong>{{IDORDINE}}</strong></td></tr>
                <tr><th>Dealer:</th><td>{{DEALERNOME}} ({{RAGIONESOCIALE}})</td></tr>
                <tr><th>Email Dealer:</th><td>{{DEALEREMAIL}}</td></tr>
                <tr><th>Offerta:</th><td>{{OFFERTATITOLO}}</td></tr>
                <tr><th>Cliente:</th><td>{{CLIENTENOME}} {{CLIENTECOGNOME}}</td></tr>
                <tr><th>Data richiesta:</th><td>{{DATETIME}}</td></tr>
            </table>
            
            <p>Si prega di prendere in carico la richiesta il prima possibile.</p>
        </div>
        <div class="footer">
            <p>© 2025 Kim Station - Sistema di gestione automatico</p>
        </div>
    </div>
</body>
</html>',
'Nuova richiesta assistenza ricevuta:

ID Ordine: {{IDORDINE}}
Dealer: {{DEALERNOME}} ({{RAGIONESOCIALE}})
Email: {{DEALEREMAIL}}
Offerta: {{OFFERTATITOLO}}
Cliente: {{CLIENTENOME}} {{CLIENTECOGNOME}}
Data: {{DATETIME}}

Si prega di prendere in carico la richiesta.',
'assistenza@kimweb.it',
'SYSTEM');

-- Template 5: Obiettivo Raggiunto (Agenti)
INSERT INTO [dbo].[tbEmailTemplates] 
([EventType], [EventDescription], [Subject], [HtmlTemplate], [TextTemplate], [CreatedBy])
VALUES 
('OBIETTIVO_RAGGIUNTO', 'Notifica obiettivo raggiunto per agenti', 
'🎯 Obiettivo Raggiunto! Congratulazioni {{NOME}}',
'<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        .container { max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif; }
        .header { background: linear-gradient(135deg, #28a745 0%, #20c997 100%); color: white; padding: 30px; text-align: center; }
        .body { padding: 30px; line-height: 1.6; }
        .success-box { background: #d4edda; border-left: 4px solid #28a745; padding: 15px; margin: 20px 0; }
        .celebration { text-align: center; font-size: 48px; margin: 20px 0; }
        .info-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        .info-table th, .info-table td { padding: 10px; border-bottom: 1px solid #ddd; text-align: left; }
        .info-table th { background: #f8f9fa; font-weight: bold; }
        .footer { background: #f8f9fa; padding: 20px; text-align: center; font-size: 12px; color: #666; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🎯 Obiettivo Raggiunto!</h1>
        </div>
        <div class="body">
            <p>Gentile <strong>{{NOME}}</strong>,</p>
            
            <div class="celebration">🎉🎊🏆</div>
            
            <div class="success-box">
                <h3>Congratulazioni!</h3>
                <p>Hai raggiunto il tuo obiettivo! Eccellente lavoro!</p>
            </div>
            
            <table class="info-table">
                <tr><th>Obiettivo:</th><td>{{GOALTYPE}}</td></tr>
                <tr><th>Target:</th><td>{{GOALTARGET}}</td></tr>
                <tr><th>Raggiunto:</th><td><strong>{{GOALACHIEVED}}</strong></td></tr>
                <tr><th>Percentuale:</th><td>{{GOALPERCENTAGE}}%</td></tr>
                <tr><th>Data raggiungimento:</th><td>{{DATE}}</td></tr>
            </table>
            
            <p>Il tuo impegno e la tua dedizione hanno portato a questo fantastico risultato!</p>
            
            <p>Continua così e raggiungerai traguardi ancora più ambiziosi!</p>
        </div>
        <div class="footer">
            <p>© 2025 Kim Station - Tutti i diritti riservati</p>
        </div>
    </div>
</body>
</html>',
'Gentile {{NOME}},

🎯 OBIETTIVO RAGGIUNTO! 🎉

Congratulazioni! Hai raggiunto il tuo obiettivo!

Dettagli:
- Obiettivo: {{GOALTYPE}}
- Target: {{GOALTARGET}}
- Raggiunto: {{GOALACHIEVED}}
- Percentuale: {{GOALPERCENTAGE}}%
- Data: {{DATE}}

Eccellente lavoro! Continua così!

Kim Station Team',
'SYSTEM');
