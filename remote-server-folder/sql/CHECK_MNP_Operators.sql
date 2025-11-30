-- ============================================================================
-- Verifica valori nella colonna [usim flag mnp] di InseritoFW
-- ============================================================================
-- Data: 2025-11-15
-- Descrizione: Controlla quali operatori MNP sono presenti e come sono scritti
-- ============================================================================

USE [KAM]
GO

PRINT '=================================================================';
PRINT 'VERIFICA OPERATORI MNP IN InseritoFW';
PRINT '=================================================================';
PRINT '';

-- Tutti gli operatori MNP distinti
PRINT 'Operatori MNP distinti (tutti):';
SELECT DISTINCT 
    [usim flag mnp] AS Operatore_MNP,
    COUNT(*) AS Conteggio
FROM dbo.InseritoFW
WHERE [usim flag mnp] IS NOT NULL 
  AND [usim flag mnp] != ''
GROUP BY [usim flag mnp]
ORDER BY COUNT(*) DESC;

PRINT '';
PRINT '=================================================================';

-- Operatori MNP nel periodo 15-30 Novembre 2025
PRINT 'Operatori MNP nel periodo 15-30 Novembre 2025:';
SELECT DISTINCT 
    [usim flag mnp] AS Operatore_MNP,
    COUNT(*) AS Conteggio
FROM dbo.InseritoFW
WHERE [usim flag mnp] IS NOT NULL 
  AND [usim flag mnp] != ''
  AND Batch >= '2025-11-15'
  AND Batch <= '2025-11-30'
GROUP BY [usim flag mnp]
ORDER BY COUNT(*) DESC;

PRINT '';
PRINT '=================================================================';

-- Cerca operatori che contengono le parole chiave
PRINT 'Operatori che contengono "WIND":';
SELECT DISTINCT [usim flag mnp], COUNT(*) AS Conteggio
FROM dbo.InseritoFW
WHERE [usim flag mnp] LIKE '%WIND%'
GROUP BY [usim flag mnp];

PRINT '';
PRINT 'Operatori che contengono "VERY":';
SELECT DISTINCT [usim flag mnp], COUNT(*) AS Conteggio
FROM dbo.InseritoFW
WHERE [usim flag mnp] LIKE '%VERY%'
GROUP BY [usim flag mnp];

PRINT '';
PRINT 'Operatori che contengono "POSTE":';
SELECT DISTINCT [usim flag mnp], COUNT(*) AS Conteggio
FROM dbo.InseritoFW
WHERE [usim flag mnp] LIKE '%POSTE%'
GROUP BY [usim flag mnp];

PRINT '';
PRINT 'Operatori che contengono "COOP":';
SELECT DISTINCT [usim flag mnp], COUNT(*) AS Conteggio
FROM dbo.InseritoFW
WHERE [usim flag mnp] LIKE '%COOP%'
GROUP BY [usim flag mnp];

PRINT '';
PRINT 'Operatori che contengono "KENA":';
SELECT DISTINCT [usim flag mnp], COUNT(*) AS Conteggio
FROM dbo.InseritoFW
WHERE [usim flag mnp] LIKE '%KENA%'
GROUP BY [usim flag mnp];

PRINT '';
PRINT '=================================================================';
PRINT 'SCRIPT COMPLETATO!';
PRINT '=================================================================';

GO
