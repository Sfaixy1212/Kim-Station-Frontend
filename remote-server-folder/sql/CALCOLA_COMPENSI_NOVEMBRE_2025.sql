-- ============================================================================
-- Script per calcolare i compensi degli agenti per NOVEMBRE 2025
-- ============================================================================
-- Data: 2025-11-13
-- Descrizione: Esegue il calcolo dei compensi per tutti gli agenti per il mese di novembre 2025
-- ============================================================================

DECLARE @Anno INT = 2025;
DECLARE @Mese INT = 11;  -- Novembre

PRINT '=================================================================';
PRINT 'INIZIO CALCOLO COMPENSI AGENTI - NOVEMBRE 2025';
PRINT '=================================================================';
PRINT '';

-- Ottieni lista agenti attivi
DECLARE @Agente NVARCHAR(100);
DECLARE agenti_cursor CURSOR FOR
    SELECT DISTINCT AGENTE
    FROM dbo.tbDealers
    WHERE AGENTE IS NOT NULL 
      AND AGENTE != ''
      AND AGENTE != 'NULL'
    ORDER BY AGENTE;

OPEN agenti_cursor;
FETCH NEXT FROM agenti_cursor INTO @Agente;

WHILE @@FETCH_STATUS = 0
BEGIN
    PRINT '-----------------------------------------------------------';
    PRINT 'Calcolo compensi per agente: ' + @Agente;
    PRINT 'Anno: ' + CAST(@Anno AS VARCHAR(4)) + ' - Mese: ' + CAST(@Mese AS VARCHAR(2));
    
    BEGIN TRY
        -- Esegui stored procedure per calcolo compensi agente
        EXEC dbo.sp_refresh_compensi_agenti_mese 
            @agente = @Agente,
            @anno = @Anno,
            @mese = @Mese;
        
        PRINT '✓ Compensi calcolati con successo per: ' + @Agente;
        
    END TRY
    BEGIN CATCH
        PRINT '✗ ERRORE durante il calcolo per: ' + @Agente;
        PRINT 'Errore: ' + ERROR_MESSAGE();
    END CATCH
    
    PRINT '';
    
    FETCH NEXT FROM agenti_cursor INTO @Agente;
END

CLOSE agenti_cursor;
DEALLOCATE agenti_cursor;

PRINT '=================================================================';
PRINT 'FINE CALCOLO COMPENSI AGENTI - NOVEMBRE 2025';
PRINT '=================================================================';
PRINT '';

-- Verifica risultati
PRINT 'Verifica compensi calcolati per novembre 2025:';
PRINT '';

SELECT 
    Agente,
    MESE_LABEL,
    FISSO_TOTALE,
    MOBILE_TOTALE,
    ENERGY_TOTALE,
    SKY_TOTALE,
    EURO_TOTALE
FROM dbo.vw_compensi_agenti_mese_agg
WHERE MonthStart = '2025-11-01'
ORDER BY Agente;

PRINT '';
PRINT 'Script completato!';
