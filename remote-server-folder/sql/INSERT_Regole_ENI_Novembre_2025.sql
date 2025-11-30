-- ============================================================================
-- Script per inserire regole ENI e bonus aggiuntivi per NOVEMBRE 2025
-- ============================================================================
-- Data: 2025-11-15
-- Agenti: GIACOMO, LUIGI
-- ============================================================================

USE [KAM]
GO

PRINT '=================================================================';
PRINT 'INSERIMENTO REGOLE ENI E BONUS - NOVEMBRE 2025';
PRINT '=================================================================';
PRINT '';

-- ============================================================================
-- 1. REGOLE ENI BASE per GIACOMO e LUIGI
-- ============================================================================
PRINT 'Inserimento regole ENI base...';

-- ENI Base: €5 per commodity (per entrambi gli agenti)
INSERT INTO dbo.cfg_compensi_agente (MonthStart, Agente, Categoria, SottoVoce, EuroUnit, IsActive)
VALUES 
    ('2025-11-01', 'GIACOMO', 'PRODOTTO', 'ENI_BASE', 5.00, 1),
    ('2025-11-01', 'LUIGI', 'PRODOTTO', 'ENI_BASE', 5.00, 1);

PRINT '✓ Regole ENI_BASE inserite per GIACOMO e LUIGI';
PRINT '';

-- ============================================================================
-- 2. BONUS ENI ADDEBITO (RID) per GIACOMO e LUIGI
-- ============================================================================
PRINT 'Inserimento bonus ENI addebito...';

-- Bonus addebito: +€2 per commodity con RID (gas+luce con addebito = €5 x 2 = €10 totale)
INSERT INTO dbo.cfg_compensi_agente (MonthStart, Agente, Categoria, SottoVoce, EuroUnit, IsActive)
VALUES 
    ('2025-11-01', 'GIACOMO', 'PRODOTTO', 'ENI_ADDEBITO', 2.00, 1),
    ('2025-11-01', 'LUIGI', 'PRODOTTO', 'ENI_ADDEBITO', 2.00, 1);

PRINT '✓ Bonus ENI_ADDEBITO inseriti per GIACOMO e LUIGI';
PRINT '';

-- ============================================================================
-- 3. BOOST ENERGY FASTWEB per GIACOMO
-- ============================================================================
PRINT 'Inserimento boost Energy Fastweb per GIACOMO...';

-- GIACOMO: ≥30 Energy totali + ≥20% Fastweb (almeno 6) → €250 bonus
INSERT INTO dbo.cfg_compensi_agente (MonthStart, Agente, Categoria, SottoVoce, Soglia, EuroBonus, IsActive)
VALUES 
    ('2025-11-01', 'GIACOMO', 'BONUS', 'ENERGY_FW_BOOST', 30, 250.00, 1);

PRINT '✓ Boost ENERGY_FW_BOOST inserito per GIACOMO (≥30 Energy, ≥20% FW)';
PRINT '';

-- ============================================================================
-- 4. BOOST ENERGY FASTWEB per LUIGI
-- ============================================================================
PRINT 'Inserimento boost Energy Fastweb per LUIGI...';

-- LUIGI: ≥20 Energy totali + ≥30% Fastweb (almeno 6) → €250 bonus
INSERT INTO dbo.cfg_compensi_agente (MonthStart, Agente, Categoria, SottoVoce, Soglia, EuroBonus, IsActive)
VALUES 
    ('2025-11-01', 'LUIGI', 'BONUS', 'ENERGY_FW_BOOST', 20, 250.00, 1);

PRINT '✓ Boost ENERGY_FW_BOOST inserito per LUIGI (≥20 Energy, ≥30% FW)';
PRINT '';

-- ============================================================================
-- 5. BONUS 50% RA per LUIGI
-- ============================================================================
PRINT 'Inserimento bonus 50% RA per LUIGI...';

-- LUIGI: ≥70 SIM totali con ≥50% RA → €200 bonus
INSERT INTO dbo.cfg_compensi_agente (MonthStart, Agente, Categoria, SottoVoce, Soglia, EuroBonus, IsActive)
VALUES 
    ('2025-11-01', 'LUIGI', 'BONUS', 'SIM_RA_50PCT', 70, 200.00, 1);

PRINT '✓ Bonus SIM_RA_50PCT inserito per LUIGI (≥70 SIM, ≥50% RA)';
PRINT '';

-- ============================================================================
-- VERIFICA INSERIMENTI
-- ============================================================================
PRINT '=================================================================';
PRINT 'VERIFICA REGOLE INSERITE';
PRINT '=================================================================';
PRINT '';

SELECT 
    ID,
    MonthStart,
    Agente,
    Categoria,
    SottoVoce,
    EuroUnit,
    Soglia,
    EuroBonus,
    IsActive
FROM dbo.cfg_compensi_agente
WHERE MonthStart = '2025-11-01'
  AND Agente IN ('GIACOMO', 'LUIGI')
  AND (
      SottoVoce IN ('ENI_BASE', 'ENI_ADDEBITO', 'ENERGY_FW_BOOST', 'SIM_RA_50PCT')
  )
ORDER BY Agente, Categoria, SottoVoce;

PRINT '';
PRINT '=================================================================';
PRINT 'SCRIPT COMPLETATO!';
PRINT '=================================================================';
PRINT '';
PRINT 'NOTE:';
PRINT '- ENI_BASE: €5 per commodity ENI';
PRINT '- ENI_ADDEBITO: +€2 per commodity con RID (gas+luce con addebito)';
PRINT '- ENERGY_FW_BOOST (GIACOMO): €250 se ≥30 Energy + ≥20% Fastweb';
PRINT '- ENERGY_FW_BOOST (LUIGI): €250 se ≥20 Energy + ≥30% Fastweb';
PRINT '- SIM_RA_50PCT (LUIGI): €200 se ≥70 SIM + ≥50% RA';
PRINT '';

GO
