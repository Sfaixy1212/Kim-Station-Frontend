-- ============================================================================
-- Crea tabella cfg_bonus_sim_mnp_target per bonus SIM con MNP valide
-- ============================================================================
-- Data: 2025-11-15
-- Descrizione: Tabella per configurare bonus basati su target SIM totali con MNP valide
-- ============================================================================

USE [KAM]
GO

-- Verifica se la tabella esiste già
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[cfg_bonus_sim_mnp_target]') AND type in (N'U'))
BEGIN
    PRINT 'Creazione tabella cfg_bonus_sim_mnp_target...';
    
    CREATE TABLE [dbo].[cfg_bonus_sim_mnp_target] (
        [ID] INT IDENTITY(1,1) PRIMARY KEY,
        [MonthStart] DATE NOT NULL,
        [PeriodStart] DATE NULL,  -- Data inizio periodo (es: 2025-11-15)
        [PeriodEnd] DATE NULL,    -- Data fine periodo (es: 2025-11-30)
        [Agente] NVARCHAR(100) NOT NULL,
        [Soglia] INT NOT NULL,    -- Target SIM totali
        [EuroBonus] DECIMAL(18,2) NOT NULL,  -- Bonus in euro
        [Note] NVARCHAR(500) NULL,
        [IsActive] BIT NOT NULL DEFAULT 1,
        [CreatedAt] DATETIME NOT NULL DEFAULT GETDATE(),
        [UpdatedAt] DATETIME NULL
    );

    -- Indici per performance
    CREATE NONCLUSTERED INDEX [IX_cfg_bonus_sim_mnp_target_MonthStart_Agente] 
        ON [dbo].[cfg_bonus_sim_mnp_target] ([MonthStart], [Agente], [IsActive]);

    PRINT '✓ Tabella cfg_bonus_sim_mnp_target creata con successo!';
END
ELSE
BEGIN
    PRINT '⚠ Tabella cfg_bonus_sim_mnp_target già esistente.';
END

GO

-- Verifica struttura
PRINT '';
PRINT 'Struttura tabella cfg_bonus_sim_mnp_target:';
EXEC sp_help 'dbo.cfg_bonus_sim_mnp_target';

GO
