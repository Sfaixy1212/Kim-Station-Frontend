-- =============================================
-- Modifica stored procedure GetOrderStatisticsByAgent_V3
-- per aggiungere colonna EnergyEni (senza filtro stato)
-- =============================================

USE [KAM];
GO

-- NOTA: Questa è una modifica INDICATIVA della stored procedure
-- La SP effettiva potrebbe avere una struttura diversa
-- Questo script mostra DOVE aggiungere la logica per EnergyEni

/*
MODIFICA DA APPLICARE ALLA STORED PROCEDURE GetOrderStatisticsByAgent_V3:

1. Nella sezione SELECT principale, aggiungere:
   - EnergyEni = COUNT(DISTINCT CASE WHEN ... ENI senza filtro stato ...)

2. Esempio di logica da aggiungere:

   -- Energy FASTWEB (con filtro stato)
   EnergyCore = COUNT(DISTINCT CASE 
       WHEN Operatore = 'FASTWEB ENERGIA' 
       AND Segmento = 'CORE'
       AND Stato IN ('INSERITO', 'ATTIVO', 'LAVORAZIONE') -- FILTRO STATO
       THEN [Codice Contratto] 
   END),
   
   EnergyFlex = COUNT(DISTINCT CASE 
       WHEN Operatore = 'FASTWEB ENERGIA' 
       AND Segmento = 'FLEX'
       AND Stato IN ('INSERITO', 'ATTIVO', 'LAVORAZIONE') -- FILTRO STATO
       THEN [Codice Contratto] 
   END),
   
   EnergyFix = COUNT(DISTINCT CASE 
       WHEN Operatore = 'FASTWEB ENERGIA' 
       AND Segmento = 'FIX'
       AND Stato IN ('INSERITO', 'ATTIVO', 'LAVORAZIONE') -- FILTRO STATO
       THEN [Codice Contratto] 
   END),
   
   -- Energy ENI (SENZA filtro stato - TUTTI gli stati)
   EnergyEni = COUNT(DISTINCT CASE 
       WHEN Operatore LIKE '%ENI%'  -- o la condizione corretta per identificare ENI
       -- NESSUN FILTRO SU Stato
       THEN [Codice Contratto] 
   END),
   
   -- Percentuale FASTWEB su Energy (calcolata)
   EnergyPercentFastweb = CASE 
       WHEN (COUNT(DISTINCT CASE WHEN Operatore = 'FASTWEB ENERGIA' ... END) + 
             COUNT(DISTINCT CASE WHEN Operatore LIKE '%ENI%' ... END)) > 0
       THEN CAST(
           (COUNT(DISTINCT CASE WHEN Operatore = 'FASTWEB ENERGIA' ... END) * 100.0) / 
           (COUNT(DISTINCT CASE WHEN Operatore = 'FASTWEB ENERGIA' ... END) + 
            COUNT(DISTINCT CASE WHEN Operatore LIKE '%ENI%' ... END))
           AS DECIMAL(10,2))
       ELSE 0
   END

3. Assicurarsi che la tabella sorgente sia:
   - FWEnergiaImporter per FASTWEB ENERGIA
   - Verificare quale tabella contiene i dati ENI (potrebbe essere la stessa o diversa)

*/

-- =============================================
-- ISTRUZIONI PER L'APPLICAZIONE:
-- =============================================
-- 1. Aprire SQL Server Management Studio
-- 2. Navigare a: Database KAM > Programmability > Stored Procedures
-- 3. Trovare: dbo.GetOrderStatisticsByAgent_V3
-- 4. Fare clic destro > Modify
-- 5. Aggiungere la logica per EnergyEni come indicato sopra
-- 6. Verificare che:
--    a) EnergyCore, EnergyFlex, EnergyFix mantengano il filtro stato
--    b) EnergyEni NON abbia filtro stato
--    c) EnergyPercentFastweb calcoli la % di FW sul totale Energy
-- 7. Eseguire ALTER PROCEDURE per salvare le modifiche
-- =============================================

PRINT '============================================';
PRINT 'ATTENZIONE: Questo è uno script INFORMATIVO';
PRINT 'Modificare manualmente la stored procedure';
PRINT 'GetOrderStatisticsByAgent_V3 seguendo le';
PRINT 'istruzioni sopra riportate.';
PRINT '============================================';
GO

-- Query di test per verificare i dati ENI disponibili
-- Eseguire questa query per capire come identificare le attivazioni ENI
SELECT TOP 10
    Operatore,
    Segmento,
    Stato,
    [Codice Contratto],
    [Data Inserimento]
FROM FWEnergiaImporter
WHERE Operatore LIKE '%ENI%'
ORDER BY [Data Inserimento] DESC;
GO

PRINT 'Script informativo completato.';
PRINT 'Verificare i risultati della query di test sopra.';
