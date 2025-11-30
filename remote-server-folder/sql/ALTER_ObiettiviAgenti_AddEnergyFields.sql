-- =============================================
-- Aggiunge colonne EnergyEni e EnergyPercentFastweb
-- alla tabella ObiettiviAgenti
-- =============================================

USE [KAM];
GO

-- Verifica se la colonna EnergyEni esiste già
IF NOT EXISTS (
    SELECT * FROM sys.columns 
    WHERE object_id = OBJECT_ID(N'[dbo].[ObiettiviAgenti]') 
    AND name = 'EnergyEni'
)
BEGIN
    ALTER TABLE [dbo].[ObiettiviAgenti]
    ADD [EnergyEni] INT NOT NULL DEFAULT 0;
    
    PRINT 'Colonna EnergyEni aggiunta con successo';
END
ELSE
BEGIN
    PRINT 'Colonna EnergyEni già esistente';
END
GO

-- Verifica se la colonna EnergyPercentFastweb esiste già
IF NOT EXISTS (
    SELECT * FROM sys.columns 
    WHERE object_id = OBJECT_ID(N'[dbo].[ObiettiviAgenti]') 
    AND name = 'EnergyPercentFastweb'
)
BEGIN
    ALTER TABLE [dbo].[ObiettiviAgenti]
    ADD [EnergyPercentFastweb] DECIMAL(10, 2) NOT NULL DEFAULT 0;
    
    PRINT 'Colonna EnergyPercentFastweb aggiunta con successo';
END
ELSE
BEGIN
    PRINT 'Colonna EnergyPercentFastweb già esistente';
END
GO

-- Verifica risultato
SELECT TOP 5 
    Agente,
    Anno,
    Mese,
    EnergyCore,
    EnergyFlex,
    EnergyFix,
    EnergyEni,
    EnergyPercentFastweb
FROM [dbo].[ObiettiviAgenti]
ORDER BY Anno DESC, Mese DESC;
GO

PRINT 'Script completato con successo!';
