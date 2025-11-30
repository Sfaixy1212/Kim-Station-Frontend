-- Correzione template per campo ntext - conversione necessaria
-- SQL Server richiede conversione da ntext a nvarchar(max) per usare REPLACE

UPDATE [dbo].[tbEmailTemplates] 
SET [HtmlTemplate] = CAST(
    REPLACE(
        CAST([HtmlTemplate] AS nvarchar(max)), 
        '<tr><th>Cliente:</th><td>{{CLIENTENOME}} {{CLIENTECOGNOME}}</td></tr>',
        '<tr><th>Cliente:</th><td>{{CLIENTENOME}}</td></tr>'
    ) AS ntext
)
WHERE EventType = 'NUOVA_ATTIVAZIONE'
  AND CAST([HtmlTemplate] AS nvarchar(max)) LIKE '%{{CLIENTENOME}} {{CLIENTECOGNOME}}%';

-- Verifica la modifica
SELECT EventType, Subject, 
       CASE 
         WHEN CAST([HtmlTemplate] AS nvarchar(max)) LIKE '%{{CLIENTENOME}} {{CLIENTECOGNOME}}%' THEN 'DUPLICATO - DA CORREGGERE'
         WHEN CAST([HtmlTemplate] AS nvarchar(max)) LIKE '%<th>Cliente:</th><td>{{CLIENTENOME}}</td>%' THEN 'CORRETTO - SOLO NOME'
         ELSE 'ALTRO'
       END as StatoTemplate
FROM [dbo].[tbEmailTemplates] 
WHERE EventType = 'NUOVA_ATTIVAZIONE';
