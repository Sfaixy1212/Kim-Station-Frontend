-- Script per aggiungere colonna ASSISTENZA alla tabella tbOrdini
-- Eseguire questo script sul database SQL Server

-- 1. Aggiungi la colonna ASSISTENZA (bit, default FALSE)
ALTER TABLE dbo.tbOrdini 
ADD ASSISTENZA bit NOT NULL DEFAULT 0;

-- 2. Aggiorna gli ordini esistenti: marca come assistenza quelli con IDOperatore = 10
UPDATE dbo.tbOrdini 
SET ASSISTENZA = 1 
WHERE IDOperatore = 10;

-- 3. Verifica il risultato
SELECT 
    COUNT(*) as TotaleOrdini,
    SUM(CASE WHEN ASSISTENZA = 1 THEN 1 ELSE 0 END) as OrdiniAssistenza,
    SUM(CASE WHEN ASSISTENZA = 0 THEN 1 ELSE 0 END) as OrdiniNormali
FROM dbo.tbOrdini;

-- 4. Mostra alcuni esempi
SELECT TOP 10 
    IDOrdine, 
    IDOperatore, 
    ASSISTENZA,
    CASE WHEN ASSISTENZA = 1 THEN 'ASSISTENZA' ELSE 'NORMALE' END as TipoOrdine
FROM dbo.tbOrdini 
ORDER BY IDOrdine DESC;
