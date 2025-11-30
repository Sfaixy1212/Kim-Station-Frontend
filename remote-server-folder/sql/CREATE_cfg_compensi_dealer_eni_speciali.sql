-- ============================================================================
-- Crea tabella cfg_compensi_dealer_eni_speciali per gestire le regole ENI mirate
-- ============================================================================
-- Data: 2025-11-22
-- Descrizione: Configurazione dinamica per compensi ENI limitati a periodi specifici
-- ============================================================================

USE [KAM]
GO

IF OBJECT_ID('[dbo].[cfg_compensi_dealer_eni_speciali]', 'U') IS NULL
BEGIN
    PRINT 'Creazione tabella cfg_compensi_dealer_eni_speciali...';

    CREATE TABLE [dbo].[cfg_compensi_dealer_eni_speciali] (
        [ID] INT IDENTITY(1,1) PRIMARY KEY,
        [MonthStart] DATE NOT NULL,
        [PeriodStart] DATE NOT NULL,
        [PeriodEnd] DATE NOT NULL,
        [Segmento] VARCHAR(10) NOT NULL,          -- RES / SHP
        [TipoTariffa] VARCHAR(20) NOT NULL,       -- RES, RES_RID, BUSINESS
        [SogliaMin] INT NOT NULL,
        [SogliaMax] INT NULL,
        [Importo] DECIMAL(18,2) NOT NULL,
        [Note] NVARCHAR(255) NULL,
        [IsActive] BIT NOT NULL DEFAULT 1,
        [CreatedAt] DATETIME NOT NULL DEFAULT GETDATE()
    );

    CREATE NONCLUSTERED INDEX [IX_cfg_compensi_dealer_eni_speciali_MonthStart]
        ON [dbo].[cfg_compensi_dealer_eni_speciali] ([MonthStart], [Segmento], [TipoTariffa], [IsActive]);

    PRINT '✓ Tabella cfg_compensi_dealer_eni_speciali creata con successo';
END
ELSE
BEGIN
    PRINT '⚠ La tabella cfg_compensi_dealer_eni_speciali esiste già. Nessuna azione eseguita.';
END
GO
