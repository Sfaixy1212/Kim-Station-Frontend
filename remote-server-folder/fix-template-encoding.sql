-- Correzione template email per rimuovere caratteri di encoding problematici
-- Aggiorna il template NUOVA_ATTIVAZIONE per rimuovere l'emoji ?? problematica

UPDATE [dbo].[tbEmailTemplates] 
SET [HtmlTemplate] = '<!DOCTYPE html>
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
                <h3>La tua attivazione è stata confermata!</h3>
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
        </div>
    </div>
</body>
</html>'
WHERE EventType = 'NUOVA_ATTIVAZIONE';

-- Verifica aggiornamento
SELECT EventType, Subject FROM [dbo].[tbEmailTemplates] WHERE EventType = 'NUOVA_ATTIVAZIONE';
