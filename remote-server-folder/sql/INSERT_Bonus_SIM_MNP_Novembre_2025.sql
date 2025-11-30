-- ============================================================================
-- Inserisce bonus SIM MNP target per GIACOMO e LUIGI - Novembre 2025
-- ============================================================================
-- Data: 2025-11-15
-- Periodo: 15-30 Novembre 2025
-- MNP Valide: WindTre, Very Mobile, Poste Mobile, Coop Voce, Kena Mobile
-- ============================================================================

USE [KAM]
GO

PRINT '=================================================================';
PRINT 'INSERIMENTO BONUS SIM MNP TARGET - NOVEMBRE 2025';
PRINT '=================================================================';
PRINT '';

-- ============================================================================
-- GIACOMO - Bonus SIM MNP Target
-- ============================================================================
PRINT 'Inserimento bonus SIM MNP per GIACOMO...';

-- Soglia 1 (paracadute): ≥300 SIM totali → +€5,00
INSERT INTO dbo.cfg_bonus_sim_mnp_target (MonthStart, PeriodStart, PeriodEnd, Agente, Soglia, EuroBonus, Note, IsActive)
VALUES 
    ('2025-11-01', '2025-11-15', '2025-11-30', 'GIACOMO', 300, 5.00, 
     'Soglia 1 (paracadute): ≥300 SIM totali con MNP valide (W3, Poste, Kena)', 1);

-- Soglia 2: ≥400 SIM totali → +€10,00
INSERT INTO dbo.cfg_bonus_sim_mnp_target (MonthStart, PeriodStart, PeriodEnd, Agente, Soglia, EuroBonus, Note, IsActive)
VALUES 
    ('2025-11-01', '2025-11-15', '2025-11-30', 'GIACOMO', 400, 10.00, 
     'Soglia 2: ≥400 SIM totali con MNP valide (W3, Poste, Kena)', 1);

PRINT '✓ Bonus SIM MNP inseriti per GIACOMO';
PRINT '';

-- ============================================================================
-- LUIGI - Bonus SIM MNP Target
-- ============================================================================
PRINT 'Inserimento bonus SIM MNP per LUIGI...';

-- Soglia 1 (paracadute): ≥90 SIM totali → +€5,00
INSERT INTO dbo.cfg_bonus_sim_mnp_target (MonthStart, PeriodStart, PeriodEnd, Agente, Soglia, EuroBonus, Note, IsActive)
VALUES 
    ('2025-11-01', '2025-11-15', '2025-11-30', 'LUIGI', 90, 5.00, 
     'Soglia 1 (paracadute): ≥90 SIM totali con MNP valide (W3, Poste, Kena)', 1);

-- Soglia 2: ≥150 SIM totali → +€10,00
INSERT INTO dbo.cfg_bonus_sim_mnp_target (MonthStart, PeriodStart, PeriodEnd, Agente, Soglia, EuroBonus, Note, IsActive)
VALUES 
    ('2025-11-01', '2025-11-15', '2025-11-30', 'LUIGI', 150, 10.00, 
     'Soglia 2: ≥150 SIM totali con MNP valide (W3, Poste, Kena)', 1);

PRINT '✓ Bonus SIM MNP inseriti per LUIGI';
PRINT '';

-- ============================================================================
-- VERIFICA INSERIMENTI
-- ============================================================================
PRINT '=================================================================';
PRINT 'VERIFICA BONUS SIM MNP TARGET INSERITI';
PRINT '=================================================================';
PRINT '';

SELECT 
    ID,
    MonthStart,
    PeriodStart,
    PeriodEnd,
    Agente,
    Soglia AS Target_SIM,
    EuroBonus,
    Note,
    IsActive
FROM dbo.cfg_bonus_sim_mnp_target
WHERE MonthStart = '2025-11-01'
  AND Agente IN ('GIACOMO', 'LUIGI')
ORDER BY Agente, Soglia;

PRINT '';
PRINT '=================================================================';
PRINT 'SCRIPT COMPLETATO!';
PRINT '=================================================================';
PRINT '';
PRINT 'NOTE:';
PRINT '- Periodo: 15-30 Novembre 2025';
PRINT '- MNP Valide: W3 (WindTre), Poste (Poste Mobile), Kena (Kena Mobile)';
PRINT '- GIACOMO: €5 (≥300 SIM), €10 (≥400 SIM)';
PRINT '- LUIGI: €5 (≥90 SIM), €10 (≥150 SIM)';
PRINT '- Bonus cumulativi: se raggiungi soglia 2, prendi entrambi i bonus';
PRINT '';

GO
