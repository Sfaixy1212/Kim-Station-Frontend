-- Correzione rapida template per rimuovere N/A dal nome cliente
-- Modifica il template per mostrare solo il cognome del cliente

UPDATE [dbo].[tbEmailTemplates] 
SET [HtmlTemplate] = REPLACE([HtmlTemplate], 
    '<tr><th>Cliente:</th><td>{{CLIENTENOME}} {{CLIENTECOGNOME}}</td></tr>',
    '<tr><th>Cliente:</th><td>{{CLIENTECOGNOME}}</td></tr>')
WHERE EventType = 'NUOVA_ATTIVAZIONE';

-- Verifica modifica
SELECT EventType, Subject FROM [dbo].[tbEmailTemplates] WHERE EventType = 'NUOVA_ATTIVAZIONE';
