-- =============================================
-- Tabella per integrazione manuale dati GABRIELE
-- =============================================
-- Questa tabella permette di inserire manualmente le attivazioni
-- che non vengono rilevate automaticamente dai sistemi standard.
-- I dati vengono SOMMATI a quelli automatici della stored procedure.
-- =============================================

IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[tbGabrieleIntegrazione]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[tbGabrieleIntegrazione] (
        [ID] INT IDENTITY(1,1) PRIMARY KEY,
        
        -- Periodo di riferimento
        [Anno] INT NOT NULL,
        [Mese] INT NOT NULL,
        
        -- Riferimento dealer (CHIAVE PRIMARIA)
        [IDDealer] INT NOT NULL,
        
        -- Attivazioni per tipologia
        [Fisso] INT NOT NULL DEFAULT 0,
        [Mobile] INT NOT NULL DEFAULT 0,
        [FissoBU] INT NOT NULL DEFAULT 0,        -- FISSO Business/SHP
        [Convergenza] INT NOT NULL DEFAULT 0,
        [Totale] INT NOT NULL DEFAULT 0,
        [Energia] INT NOT NULL DEFAULT 0,
        
        -- Metadati
        [DataInserimento] DATETIME NOT NULL DEFAULT GETDATE(),
        [DataModifica] DATETIME NULL,
        [UtenteInserimento] NVARCHAR(100) NULL,
        [Note] NVARCHAR(500) NULL,
        
        -- Indici e constraint
        CONSTRAINT [IX_tbGabrieleIntegrazione_AnnoMese] UNIQUE NONCLUSTERED ([Anno], [Mese], [IDDealer]),
        CONSTRAINT [FK_tbGabrieleIntegrazione_Dealer] FOREIGN KEY ([IDDealer]) REFERENCES [dbo].[tbDealers]([IDDealer])
    );

    -- Indice per ricerche per periodo
    CREATE NONCLUSTERED INDEX [IX_tbGabrieleIntegrazione_Periodo] 
    ON [dbo].[tbGabrieleIntegrazione] ([Anno], [Mese]);

    PRINT 'Tabella tbGabrieleIntegrazione creata con successo';
END
ELSE
BEGIN
    PRINT 'Tabella tbGabrieleIntegrazione già esistente';
END
GO

-- =============================================
-- Esempio di inserimento dati
-- =============================================
/*
-- STEP 1: Trova gli IDDealer dalla RagioneSociale
SELECT IDDealer, RagioneSociale, COMSY1, COMSY2, Provincia
FROM dbo.tbDealers
WHERE RagioneSociale IN ('AB MULTISERVICE S.R.L.S', 'ORLANDO CONSULENZE SRL', 'MARCO GENTILE')
  AND AGENTE = 'GABRIELE';

-- STEP 2: Inserisci usando gli IDDealer trovati
INSERT INTO dbo.tbGabrieleIntegrazione 
    (Anno, Mese, IDDealer, Fisso, Mobile, FissoBU, Convergenza, Totale, Energia, Note)
VALUES 
    (2025, 11, 123, 1, 3, 1, 1, 5, 0, 'Dati manuali novembre 2025'),  -- Sostituisci 123 con IDDealer reale
    (2025, 11, 456, 0, 2, 0, 0, 2, 0, 'Dati manuali novembre 2025'),  -- Sostituisci 456 con IDDealer reale
    (2025, 11, 789, 0, 1, 0, 0, 1, 0, 'Dati manuali novembre 2025');  -- Sostituisci 789 con IDDealer reale
*/

-- =============================================
-- Query di verifica
-- =============================================
/*
-- Vedi tutti i dati inseriti per un mese
SELECT * FROM dbo.tbGabrieleIntegrazione 
WHERE Anno = 2025 AND Mese = 11
ORDER BY RagioneSociale;

-- Totali per mese
SELECT 
    Anno,
    Mese,
    COUNT(*) AS NumDealer,
    SUM(Fisso) AS TotaleFisso,
    SUM(Mobile) AS TotaleMobile,
    SUM(FissoBU) AS TotaleFissoBU,
    SUM(Convergenza) AS TotaleConvergenza,
    SUM(Energia) AS TotaleEnergia,
    SUM(Totale) AS TotaleComplessivo
FROM dbo.tbGabrieleIntegrazione
GROUP BY Anno, Mese
ORDER BY Anno DESC, Mese DESC;
*/
