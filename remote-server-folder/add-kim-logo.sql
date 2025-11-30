-- Aggiunge il logo Kim Station in cima al template email
-- Inserisce header con logo centrato e professionale

UPDATE [dbo].[tbEmailTemplates] 
SET [HtmlTemplate] = CAST(
    REPLACE(
        CAST([HtmlTemplate] AS nvarchar(max)), 
        '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">',
        '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
        <!-- Header con Logo Kim Station -->
        <div style="text-align: center; margin-bottom: 30px; padding: 20px; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <img src="https://staging3.kimweb.agency/assets/images/logo.png" alt="Kim Station Logo" style="max-height: 60px; width: auto;" />
            <h1 style="color: #2c3e50; margin: 15px 0 5px 0; font-size: 24px; font-weight: bold;">Kim Station</h1>
            <p style="color: #7f8c8d; margin: 0; font-size: 14px;">Il tuo partner per le telecomunicazioni</p>
        </div>'
    ) AS ntext
)
WHERE EventType = 'NUOVA_ATTIVAZIONE';

-- Verifica la modifica
SELECT EventType, Subject, 
       CASE 
         WHEN CAST([HtmlTemplate] AS nvarchar(max)) LIKE '%Kim Station Logo%' THEN 'LOGO AGGIUNTO ✅'
         ELSE 'LOGO MANCANTE ❌'
       END as StatoLogo
FROM [dbo].[tbEmailTemplates] 
WHERE EventType = 'NUOVA_ATTIVAZIONE';
