-- Correzione definitiva template per evitare duplicazione nome
-- Modifica il template per mostrare solo CLIENTENOME invece di CLIENTENOME + CLIENTECOGNOME

UPDATE [dbo].[tbEmailTemplates] 
SET [HtmlTemplate] = REPLACE([HtmlTemplate], 
    '<tr><th>Cliente:</th><td>{{CLIENTENOME}} {{CLIENTECOGNOME}}</td></tr>',
    '<tr><th>Cliente:</th><td>{{CLIENTENOME}}</td></tr>')
WHERE EventType = 'NUOVA_ATTIVAZIONE';

-- Verifica la modifica
SELECT EventType, Subject, 
       CASE 
         WHEN HtmlTemplate LIKE '%{{CLIENTENOME}} {{CLIENTECOGNOME}}%' THEN 'DUPLICATO - DA CORREGGERE'
         WHEN HtmlTemplate LIKE '%{{CLIENTENOME}}</td>%' THEN 'CORRETTO - SOLO NOME'
         ELSE 'ALTRO'
       END as StatoTemplate
FROM [dbo].[tbEmailTemplates] 
WHERE EventType = 'NUOVA_ATTIVAZIONE';
