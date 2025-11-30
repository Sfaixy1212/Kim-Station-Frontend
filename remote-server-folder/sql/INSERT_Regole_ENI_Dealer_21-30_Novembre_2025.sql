-- ============================================================================
-- Inserisce le nuove regole ENI per i dealer (Periodo 21-30 Novembre 2025)
-- ============================================================================
-- Data: 2025-11-22
-- Descrizione: Regole speciali ENI Plenitude per segmento RES, RES_RID e BUSINESS
-- ============================================================================

USE [KAM]
GO

PRINT '=================================================================';
PRINT 'INSERIMENTO REGOLE ENI DEALER - 21/11/2025 -> 30/11/2025';
PRINT '=================================================================';
PRINT '';

-- NOTE: le regole precedenti rimangono valide per il periodo 1-20 novembre.
-- Queste configurazioni si appoggiano alla tabella cfg_compensi_dealer_eni_speciali
-- che garantisce la limitazione del periodo.

-- Pulizia eventuale (facoltativa)
-- DELETE FROM dbo.cfg_compensi_dealer_eni_speciali
-- WHERE MonthStart = '2025-11-01';

INSERT INTO dbo.cfg_compensi_dealer_eni_speciali
    (MonthStart, PeriodStart, PeriodEnd, Segmento, TipoTariffa, SogliaMin, SogliaMax, Importo, Note)
VALUES
    -- RESIDENZIALE STANDARD
    ('2025-11-01','2025-11-21','2025-11-30','RES','RES',1,5,40.00,'ENI RES 01-05'),
    ('2025-11-01','2025-11-21','2025-11-30','RES','RES',6,10,40.00,'ENI RES 06-10'),
    ('2025-11-01','2025-11-21','2025-11-30','RES','RES',11,19,45.00,'ENI RES 11-19'),
    ('2025-11-01','2025-11-21','2025-11-30','RES','RES',20,NULL,50.00,'ENI RES >=20'),

    -- RESIDENZIALE RID (modalità pagamento RID bancario)
    ('2025-11-01','2025-11-21','2025-11-30','RES','RES_RID',1,5,15.00,'ENI RES RID 01-05'),
    ('2025-11-01','2025-11-21','2025-11-30','RES','RES_RID',6,10,20.00,'ENI RES RID 06-10'),
    ('2025-11-01','2025-11-21','2025-11-30','RES','RES_RID',11,19,25.00,'ENI RES RID 11-19'),
    ('2025-11-01','2025-11-21','2025-11-30','RES','RES_RID',20,NULL,30.00,'ENI RES RID >=20'),

    -- BUSINESS (SHP)
    ('2025-11-01','2025-11-21','2025-11-30','SHP','BUSINESS',1,5,40.00,'ENI SHP 01-05'),
    ('2025-11-01','2025-11-21','2025-11-30','SHP','BUSINESS',6,10,40.00,'ENI SHP 06-10'),
    ('2025-11-01','2025-11-21','2025-11-30','SHP','BUSINESS',11,19,45.00,'ENI SHP 11-19'),
    ('2025-11-01','2025-11-21','2025-11-30','SHP','BUSINESS',20,NULL,50.00,'ENI SHP >=20');

PRINT '✓ Regole ENI speciali inserite correttamente';
PRINT '';

SELECT *
FROM dbo.cfg_compensi_dealer_eni_speciali
WHERE MonthStart = '2025-11-01'
ORDER BY Segmento, TipoTariffa, SogliaMin;

GO
