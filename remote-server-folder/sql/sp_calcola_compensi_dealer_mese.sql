USE [KAM]
GO

/****** Object:  StoredProcedure [dbo].[sp_calcola_compensi_dealer_mese]    Script Date: 22/11/2025 11:26:05 ******/
SET ANSI_NULLS ON
GO

SET QUOTED_IDENTIFIER ON
GO


CREATE OR ALTER   PROCEDURE [dbo].[sp_calcola_compensi_dealer_mese]
    @MonthStart date,
    @IDDealer   int = NULL
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @ENI_Special_Start date = '2025-11-21';
    DECLARE @ENI_Special_End   date = '2025-11-30';

    IF OBJECT_ID('tempdb..#base') IS NOT NULL DROP TABLE #base;
    IF OBJECT_ID('tempdb..#final_details') IS NOT NULL DROP TABLE #final_details;

    -- 1) Base: attivazioni + Bucket
    SELECT u.*, b.Bucket
    INTO #base
    FROM dbo.vw_attivazioni_dealer_unified u
    LEFT JOIN dbo.vw_bucket_fastweb_from_sottovoce b
      ON  u.Operatore  = b.Operatore
      AND u.Segmento   = b.Segmento
      AND u.Categoria  = b.Categoria
      AND u.SottoVoce  = b.SottoVoce
      AND u.IsRA       = b.IsRA
      AND u.IsMNP      = b.IsMNP
    WHERE u.MonthStart = @MonthStart
      AND (@IDDealer IS NULL OR u.IDDealer = @IDDealer);

    -- 2) Risultati finali
    CREATE TABLE #final_details (
        IDDealer int,
        MonthStart date,
        Operatore varchar(50),
        Segmento varchar(50),
        Categoria varchar(50),
        Bucket varchar(100),
        Qty int,
        Ambito varchar(50),
        RuleId int,
        SogliaMin int,
        SogliaMax int,
        ImportoPerPezzo decimal(18,2),
        Note varchar(255),
        EuroCalcolati decimal(18,2)
    );

    -- BLOCCO 1: FISSO RES
    ;WITH Target AS (
        SELECT IDDealer, COUNT(Qty) as TGT_PDA
        FROM #base
        WHERE Operatore='FASTWEB' AND Categoria='FISSO' AND Segmento='RES' AND InConvergenza=1 AND IsRA=1
        GROUP BY IDDealer
    ), Compensi AS (
        SELECT t.IDDealer, r.SogliaMin, r.SogliaMax, r.Importo AS ImportoPerPezzo, r.Id as RuleId, r.Note, r.SottoVoce as BucketRegola
        FROM Target t
        JOIN dbo.cfg_compensi_dealer r
          ON r.MonthStart=@MonthStart AND r.Operatore='FASTWEB' AND r.Ambito='TLC'
         AND r.Categoria='FISSO' AND r.Segmento='RES'
         AND t.TGT_PDA BETWEEN r.SogliaMin AND ISNULL(r.SogliaMax, 99999)
    )
    INSERT INTO #final_details
    SELECT b.IDDealer, b.MonthStart, b.Operatore, b.Segmento, b.Categoria, b.Bucket, 1, 'TLC',
           c.RuleId, c.SogliaMin, c.SogliaMax, c.ImportoPerPezzo, c.Note, c.ImportoPerPezzo
    FROM #base b
    JOIN Compensi c ON b.IDDealer=c.IDDealer AND b.Bucket=c.BucketRegola
    WHERE b.Operatore='FASTWEB' AND b.Categoria='FISSO' AND b.Segmento='RES' AND b.InConvergenza=1 AND b.IsRA=1;

    -- BLOCCO 2: FISSO SHP
    ;WITH Target AS (
        SELECT IDDealer, COUNT(Qty) as TGT_PDA
        FROM #base WHERE Operatore='FASTWEB' AND Categoria='FISSO' AND Segmento='SHP'
        GROUP BY IDDealer
    ), Compensi AS (
        SELECT t.IDDealer, r.SogliaMin, r.SogliaMax, r.Importo AS ImportoPerPezzo, r.Id as RuleId, r.Note, r.SottoVoce as BucketRegola
        FROM Target t
        JOIN dbo.cfg_compensi_dealer r
          ON r.MonthStart=@MonthStart AND r.Operatore='FASTWEB' AND r.Ambito='TLC'
         AND r.Categoria='FISSO' AND r.Segmento='SHP'
         AND t.TGT_PDA BETWEEN r.SogliaMin AND ISNULL(r.SogliaMax, 99999)
    )
    INSERT INTO #final_details
    SELECT b.IDDealer, b.MonthStart, b.Operatore, b.Segmento, b.Categoria, b.Bucket, 1, 'TLC',
           c.RuleId, c.SogliaMin, c.SogliaMax, c.ImportoPerPezzo, c.Note, c.ImportoPerPezzo
    FROM #base b
    JOIN Compensi c ON b.IDDealer=c.IDDealer AND b.Bucket=c.BucketRegola
    WHERE b.Operatore='FASTWEB' AND b.Categoria='FISSO' AND b.Segmento='SHP';

    -- BLOCCO 3: MOBILE RES RA (logica Vodafone)
    ;WITH Target AS (
        SELECT IDDealer, COUNT(Qty) as TGT_PDA
        FROM #base
        WHERE Operatore='FASTWEB' AND Categoria='MOBILE' AND Segmento='RES' AND IsRA=1
          AND NOT (Bucket LIKE 'MOBILE/START%' AND UPPER(ISNULL(MNP_Operator,''))='VODAFONE')
        GROUP BY IDDealer
    ), Compensi AS (
        SELECT t.IDDealer, r.SogliaMin, r.SogliaMax, r.Importo AS ImportoPerPezzo, r.Id as RuleId, r.Note, r.SottoVoce as BucketRegola
        FROM Target t
        JOIN dbo.cfg_compensi_dealer r
          ON r.MonthStart=@MonthStart AND r.Operatore='FASTWEB' AND r.Ambito='TLC'
         AND r.Categoria='MOBILE_RA' AND r.Segmento='RES'
         AND t.TGT_PDA BETWEEN r.SogliaMin AND ISNULL(r.SogliaMax, 99999)
    )
    INSERT INTO #final_details
    SELECT
        b.IDDealer, b.MonthStart, b.Operatore, b.Segmento, b.Categoria, b.Bucket, 1, 'TLC',
        ISNULL(c.RuleId,0), ISNULL(c.SogliaMin,0), ISNULL(c.SogliaMax,0), ISNULL(c.ImportoPerPezzo,0),
        CASE
            WHEN b.Bucket LIKE 'MOBILE/START%' AND UPPER(ISNULL(b.MNP_Operator,''))='VODAFONE' THEN 'Regola MNP Vodafone: Escluso'
            WHEN b.Bucket LIKE 'FULL/PRO%'    AND UPPER(ISNULL(b.MNP_Operator,''))='VODAFONE' THEN ISNULL(c.Note,'') + ' (Sconto 10€ MNP Voda)'
            ELSE c.Note
        END,
        CAST(CASE
                WHEN b.Bucket LIKE 'MOBILE/START%' AND UPPER(ISNULL(b.MNP_Operator,''))='VODAFONE' THEN 0.00
                WHEN b.Bucket LIKE 'FULL/PRO%'    AND UPPER(ISNULL(b.MNP_Operator,''))='VODAFONE' THEN ISNULL(c.ImportoPerPezzo,0) - 10.00
                ELSE ISNULL(c.ImportoPerPezzo,0)
            END AS decimal(18,2))
    FROM #base b
    LEFT JOIN Compensi c ON b.IDDealer=c.IDDealer AND b.Bucket=c.BucketRegola
    WHERE b.Operatore='FASTWEB' AND b.Categoria='MOBILE' AND b.Segmento='RES' AND b.IsRA=1;

    -- BLOCCO 4: MOBILE SHP RA (logica Vodafone)
    ;WITH Target AS (
        SELECT IDDealer, COUNT(Qty) as TGT_PDA
        FROM #base
        WHERE Operatore='FASTWEB' AND Categoria='MOBILE' AND Segmento='SHP' AND IsRA=1
          AND UPPER(ISNULL(MNP_Operator,'')) <> 'VODAFONE'
        GROUP BY IDDealer
    ), Compensi AS (
        SELECT t.IDDealer, r.SogliaMin, r.SogliaMax, r.Importo AS ImportoPerPezzo, r.Id as RuleId, r.Note, r.SottoVoce as BucketRegola
        FROM Target t
        JOIN dbo.cfg_compensi_dealer r
          ON r.MonthStart=@MonthStart AND r.Operatore='FASTWEB' AND r.Ambito='TLC'
         AND r.Categoria='MOBILE_RA' AND r.Segmento='SHP'
         AND t.TGT_PDA BETWEEN r.SogliaMin AND ISNULL(r.SogliaMax, 99999)
    )
    INSERT INTO #final_details
    SELECT
        b.IDDealer, b.MonthStart, b.Operatore, b.Segmento, b.Categoria, b.Bucket, 1, 'TLC',
        ISNULL(c.RuleId,0), ISNULL(c.SogliaMin,0), ISNULL(c.SogliaMax,0), ISNULL(c.ImportoPerPezzo,0),
        CASE WHEN UPPER(ISNULL(b.MNP_Operator,''))='VODAFONE' THEN 'Regola MNP Vodafone: Escluso' ELSE c.Note END,
        CAST(CASE WHEN UPPER(ISNULL(b.MNP_Operator,''))='VODAFONE' THEN 0.00
                  ELSE ISNULL(c.ImportoPerPezzo,0) + (CASE WHEN b.InConvergenza=1 THEN 30.00 ELSE 0 END)
            END AS decimal(18,2))
    FROM #base b
    LEFT JOIN Compensi c ON b.IDDealer=c.IDDealer AND b.Bucket=c.BucketRegola
    WHERE b.Operatore='FASTWEB' AND b.Categoria='MOBILE' AND b.Segmento='SHP' AND b.IsRA=1;

    -- BLOCCO 5: MOBILE RES PURA (logica Vodafone)
    ;WITH Target AS (
        SELECT IDDealer, COUNT(Qty) as TGT_PDA
        FROM #base
        WHERE Operatore='FASTWEB' AND Categoria='MOBILE' AND Segmento='RES' AND IsRA=0
          AND NOT (Bucket LIKE 'MOBILE/START%' AND UPPER(ISNULL(MNP_Operator,''))='VODAFONE')
        GROUP BY IDDealer
    ), Compensi AS (
        SELECT t.IDDealer, r.SogliaMin, r.SogliaMax, r.Importo AS ImportoPerPezzo, r.Id as RuleId, r.Note, r.SottoVoce as BucketRegola
        FROM Target t
        JOIN dbo.cfg_compensi_dealer r
          ON r.MonthStart=@MonthStart AND r.Operatore='FASTWEB' AND r.Ambito='TLC'
         AND r.Categoria='MOBILE_PURA' AND r.Segmento='RES'
         AND t.TGT_PDA BETWEEN r.SogliaMin AND ISNULL(r.SogliaMax, 99999)
    )
    INSERT INTO #final_details
    SELECT
        b.IDDealer, b.MonthStart, b.Operatore, b.Segmento, b.Categoria, b.Bucket, 1, 'TLC',
        ISNULL(c.RuleId,0), ISNULL(c.SogliaMin,0), ISNULL(c.SogliaMax,0), ISNULL(c.ImportoPerPezzo,0),
        CASE
            WHEN b.Bucket LIKE 'MOBILE/START%' AND UPPER(ISNULL(b.MNP_Operator,''))='VODAFONE' THEN 'Regola MNP Vodafone: Escluso'
            WHEN b.Bucket LIKE 'FULL/PRO%'    AND UPPER(ISNULL(b.MNP_Operator,''))='VODAFONE' THEN ISNULL(c.Note,'') + ' (Sconto 10€ MNP Voda)'
            ELSE c.Note
        END,
        CAST(CASE
                WHEN b.Bucket LIKE 'MOBILE/START%' AND UPPER(ISNULL(b.MNP_Operator,''))='VODAFONE' THEN 0.00
                WHEN b.Bucket LIKE 'FULL/PRO%'    AND UPPER(ISNULL(b.MNP_Operator,''))='VODAFONE' THEN ISNULL(c.ImportoPerPezzo,0) - 10.00
                ELSE ISNULL(c.ImportoPerPezzo,0)
            END AS decimal(18,2))
    FROM #base b
    LEFT JOIN Compensi c ON b.IDDealer=c.IDDealer AND b.Bucket=c.BucketRegola
    WHERE b.Operatore='FASTWEB' AND b.Categoria='MOBILE' AND b.Segmento='RES' AND b.IsRA=0;

    -- BLOCCO 6: CESSIONE SIM (+5€)
    INSERT INTO #final_details
        (IDDealer, MonthStart, Operatore, Segmento, Categoria, Bucket, Qty,
         Ambito, RuleId, SogliaMin, SogliaMax, ImportoPerPezzo, Note, EuroCalcolati)
    SELECT 
        b.IDDealer, b.MonthStart, b.Operatore, b.Segmento, 'MOBILE',
        ISNULL(b.Bucket, b.SottoVoce),
        1,
        'CESSIONE_SIM',
        0, 0, 0,
        CAST(5.00 AS decimal(18,2)),
        'Cessione SIM al Dealer',
        CAST(5.00 AS decimal(18,2))
    FROM #base b
    WHERE b.Operatore='FASTWEB' AND b.Categoria='MOBILE';

    -- BLOCCO 7: ANTICIPO BANCO (−10€) dove c'è un compenso TLC MOBILE > 0
    INSERT INTO #final_details
        (IDDealer, MonthStart, Operatore, Segmento, Categoria, Bucket, Qty,
         Ambito, RuleId, SogliaMin, SogliaMax, ImportoPerPezzo, Note, EuroCalcolati)
    SELECT
        f.IDDealer, f.MonthStart, f.Operatore, f.Segmento, f.Categoria, f.Bucket,
        1,
        'ANTICIPO',
        0, 0, 0,
        CAST(-10.00 AS decimal(18,2)),
        'Anticipo banco già compreso nei compensi tabellari (-10€)',
        CAST(-10.00 AS decimal(18,2))
    FROM #final_details f
    WHERE f.Ambito='TLC'
      AND f.Categoria='MOBILE'
      AND f.EuroCalcolati > 0;

    -- BLOCCO 7B: EXTRA GARA MOBILE NOV 2025 - T0 (+10€ per SIM)
    -- Nota: blocco separato, valido SOLO per @MonthStart = '2025-11-01' e per
    --       attivazioni FASTWEB MOBILE RES MNP da OLO specifici nel periodo 15-30/11.
    IF @MonthStart = '2025-11-01'
    BEGIN
        ;WITH extra_gara AS (
            SELECT
                b.IDDealer,
                b.MonthStart,
                b.Operatore,
                b.Segmento,
                b.Categoria,
                COALESCE(b.Bucket, b.SottoVoce) AS BucketEffettivo,
                b.Qty,
                UPPER(ISNULL(b.MNP_Operator,'')) AS MNP_Op,
                b.DataAttivazione
            FROM #base b
            WHERE
                b.Operatore = 'FASTWEB'
                AND b.Categoria = 'MOBILE'
                AND b.Segmento = 'RES'
                AND b.IsMNP = 1
                AND UPPER(ISNULL(b.MNP_Operator,'')) IN (
                    'WINDTRE',      -- WindTre
                    'VERY',         -- Very Mobile (adattare al valore reale, es. VERY MOBILE)
                    'POSTE',        -- Poste Mobile (adattare al valore reale, es. POSTE MOBILE)
                    'COOP',         -- Coop Voce
                    'KENA'          -- Kena Mobile
                )
                -- PERIODO 15-30 NOVEMBRE 2025 COMPRESI
                AND b.DataAttivazione >= '2025-11-15'
                AND b.DataAttivazione <  '2025-12-01'
        )
        INSERT INTO #final_details
            (IDDealer, MonthStart, Operatore, Segmento, Categoria, Bucket, Qty,
             Ambito, RuleId, SogliaMin, SogliaMax, ImportoPerPezzo, Note, EuroCalcolati)
        SELECT
            e.IDDealer,
            e.MonthStart,
            e.Operatore,
            e.Segmento,
            e.Categoria,
            e.BucketEffettivo,
            1, -- 1 riga per SIM
            'TLC',
            0, 0, 0,
            CAST(10.00 AS decimal(18,2)) AS ImportoPerPezzo,
            'EXTRA GARA MOBILE MNP OLO NOV 2025 T0',
            CAST(10.00 AS decimal(18,2)) AS EuroCalcolati
        FROM extra_gara e;
    END;

    -- BLOCCO 8: ENI PLENITUDE SPECIALE (21-30 Novembre 2025)
    IF @MonthStart = '2025-11-01'
    BEGIN
        IF OBJECT_ID('tempdb..#eni_special_base') IS NOT NULL DROP TABLE #eni_special_base;

        SELECT
            b.*,
            LTRIM(RTRIM(ISNULL(b.ModalitaPagamento,'')))         AS ModalitaNorm,
            UPPER(LTRIM(RTRIM(ISNULL(b.TipoContratto,''))))      AS TipoContrattoNorm,
            CASE
                WHEN UPPER(LTRIM(RTRIM(ISNULL(b.TipoContratto,'')))) IN ('SUBENTRO','NUOVO ALLACCIO','NUOVO CONTATORE') THEN 'SPECIAL_20'
                WHEN b.Segmento = 'RES' AND LTRIM(RTRIM(ISNULL(b.ModalitaPagamento,''))) LIKE 'RID%' THEN 'RES_RID'
                WHEN b.Segmento = 'RES' THEN 'RES'
                WHEN b.Segmento = 'SHP' THEN 'BUSINESS'
                ELSE NULL
            END AS TipoTariffaNorm
        INTO #eni_special_base
        FROM #base b
        WHERE b.Operatore = 'ENI PLENITUDE'
          AND b.Categoria = 'ENERGIA'
          AND b.DataAttivazione IS NOT NULL
          AND b.DataAttivazione >= @ENI_Special_Start
          AND b.DataAttivazione <= @ENI_Special_End;

        -- Subentro / Nuovo Contatore (€20)
        INSERT INTO #final_details
            (IDDealer, MonthStart, Operatore, Segmento, Categoria, Bucket, Qty,
             Ambito, RuleId, SogliaMin, SogliaMax, ImportoPerPezzo, Note, EuroCalcolati)
        SELECT
            es.IDDealer,
            es.MonthStart,
            es.Operatore,
            es.Segmento,
            es.Categoria,
            es.SottoVoce,
            1,
            'ENERGIA',
            0, 0, 0,
            CAST(20.00 AS decimal(18,2)),
            'ENI SPECIALE 21-30 NOV · Subentro/Nuovo Contatore',
            CAST(20.00 AS decimal(18,2))
        FROM #eni_special_base es
        WHERE es.TipoTariffaNorm = 'SPECIAL_20';

        ;WITH eni_special_remaining AS (
            SELECT *
            FROM #eni_special_base
            WHERE TipoTariffaNorm IN ('RES','RES_RID','BUSINESS')
        ), target AS (
            SELECT
                IDDealer,
                Segmento,
                TipoTariffaNorm,
                COUNT(*) AS TGT_PDA
            FROM eni_special_remaining
            GROUP BY IDDealer, Segmento, TipoTariffaNorm
        ), regole AS (
            SELECT
                t.IDDealer,
                t.Segmento,
                t.TipoTariffaNorm,
                r.ID AS RuleId,
                r.SogliaMin,
                r.SogliaMax,
                r.Importo
            FROM target t
            JOIN dbo.cfg_compensi_dealer_eni_speciali r
              ON r.MonthStart = @MonthStart
             AND r.Segmento = t.Segmento
             AND r.TipoTariffa = t.TipoTariffaNorm
             AND r.IsActive = 1
             AND t.TGT_PDA BETWEEN r.SogliaMin AND ISNULL(r.SogliaMax, 99999)
        )
        INSERT INTO #final_details
            (IDDealer, MonthStart, Operatore, Segmento, Categoria, Bucket, Qty,
             Ambito, RuleId, SogliaMin, SogliaMax, ImportoPerPezzo, Note, EuroCalcolati)
        SELECT
            e.IDDealer,
            e.MonthStart,
            e.Operatore,
            e.Segmento,
            e.Categoria,
            e.SottoVoce,
            1,
            'ENERGIA',
            r.RuleId,
            r.SogliaMin,
            r.SogliaMax,
            r.Importo,
            CONCAT('ENI SPECIALE 21-30 NOV · ', e.TipoTariffaNorm),
            r.Importo
        FROM eni_special_remaining e
        JOIN regole r
          ON r.IDDealer = e.IDDealer
         AND r.Segmento = e.Segmento
         AND r.TipoTariffaNorm = e.TipoTariffaNorm;

        IF OBJECT_ID('tempdb..#eni_special_base') IS NOT NULL DROP TABLE #eni_special_base;
    END;

    -- ✨ BLOCCO 8: ENI PLENITUDE ENERGIA RES
    ;WITH Target AS (
        SELECT IDDealer, COUNT(Qty) as TGT_PDA
        FROM #base
        WHERE Operatore='ENI PLENITUDE' AND Categoria='ENERGIA' AND Segmento='RES'
        GROUP BY IDDealer
    ), Compensi AS (
        SELECT t.IDDealer, r.SogliaMin, r.SogliaMax, r.Importo AS ImportoPerPezzo, r.Id as RuleId, r.Note, r.SottoVoce as BucketRegola
        FROM Target t
        JOIN dbo.cfg_compensi_dealer r
          ON r.MonthStart=@MonthStart AND r.Operatore='ENI PLENITUDE' AND r.Ambito='ENERGIA'
         AND r.Categoria='ENERGY' AND r.Segmento='RES' AND r.SottoVoce='BASE'
         AND t.TGT_PDA BETWEEN r.SogliaMin AND ISNULL(r.SogliaMax, 99999)
    )
    INSERT INTO #final_details
    SELECT b.IDDealer, b.MonthStart, b.Operatore, b.Segmento, b.Categoria, b.SottoVoce, 1, 'ENERGIA',
           c.RuleId, c.SogliaMin, c.SogliaMax, c.ImportoPerPezzo, c.Note, c.ImportoPerPezzo
    FROM #base b
    JOIN Compensi c ON b.IDDealer=c.IDDealer
        WHERE b.Operatore='ENI PLENITUDE'
          AND b.Categoria='ENERGIA'
          AND b.Segmento='RES'
          AND (b.DataAttivazione IS NULL
               OR b.DataAttivazione < @ENI_Special_Start
               OR b.DataAttivazione > @ENI_Special_End);

    -- ✨ BLOCCO 9: ENI PLENITUDE ENERGIA SHP
    ;WITH Target AS (
        SELECT IDDealer, COUNT(Qty) as TGT_PDA
        FROM #base
        WHERE Operatore='ENI PLENITUDE' AND Categoria='ENERGIA' AND Segmento='SHP'
        GROUP BY IDDealer
    ), Compensi AS (
        SELECT t.IDDealer, r.SogliaMin, r.SogliaMax, r.Importo AS ImportoPerPezzo, r.Id as RuleId, r.Note, r.SottoVoce as BucketRegola
        FROM Target t
        JOIN dbo.cfg_compensi_dealer r
          ON r.MonthStart=@MonthStart AND r.Operatore='ENI PLENITUDE' AND r.Ambito='ENERGIA'
         AND r.Categoria='ENERGY' AND r.Segmento='SHP' AND r.SottoVoce='BASE'
         AND t.TGT_PDA BETWEEN r.SogliaMin AND ISNULL(r.SogliaMax, 99999)
    )
    INSERT INTO #final_details
    SELECT b.IDDealer, b.MonthStart, b.Operatore, b.Segmento, b.Categoria, b.SottoVoce, 1, 'ENERGIA',
           c.RuleId, c.SogliaMin, c.SogliaMax, c.ImportoPerPezzo, c.Note, c.ImportoPerPezzo
    FROM #base b
    JOIN Compensi c ON b.IDDealer=c.IDDealer
        WHERE b.Operatore='ENI PLENITUDE'
          AND b.Categoria='ENERGIA'
          AND b.Segmento='SHP'
          AND (b.DataAttivazione IS NULL
               OR b.DataAttivazione < @ENI_Special_Start
               OR b.DataAttivazione > @ENI_Special_End);

    /* ======= OUTPUT FINALE ======= */
    SELECT
        fd.IDDealer,
        fd.MonthStart,
        fd.Operatore,
        fd.Segmento,
        fd.Categoria,
        Bucket =
            CASE
                WHEN fd.Operatore = 'ENI PLENITUDE' THEN
                    CONCAT('ENERGIA · ', fd.Segmento, ' · ', fd.Bucket)
                WHEN fd.Categoria = 'FISSO' THEN
                    CONCAT('FISSO · ', fd.Segmento, ' · ', fd.Bucket)
                ELSE
                    CONCAT('MOBILE · ', fd.Segmento, ' · ',
                           CASE WHEN ISNULL(matchB.IsRA,0)=1 THEN 'RA' ELSE 'PURA' END,
                           ' · ', fd.Bucket)
            END,
        fd.Qty,
        fd.Ambito,
        fd.RuleId,
        fd.SogliaMin,
        fd.SogliaMax,
        fd.ImportoPerPezzo,
        fd.Note,
        fd.EuroCalcolati
    FROM #final_details fd
    OUTER APPLY (
        SELECT TOP (1) b.IsRA
        FROM #base b
        WHERE b.IDDealer   = fd.IDDealer
          AND b.MonthStart = fd.MonthStart
          AND b.Operatore  = fd.Operatore
          AND b.Segmento   = fd.Segmento
          AND b.Categoria  = fd.Categoria
          AND COALESCE(b.Bucket, b.SottoVoce) = fd.Bucket
    ) matchB
    ORDER BY fd.Operatore, fd.Categoria, fd.Segmento, fd.Bucket;

    ;WITH tot AS ( SELECT Ambito, SUM(EuroCalcolati) AS Euro FROM #final_details GROUP BY Ambito )
    SELECT 'TOT_PER_AMBITO' AS Tipo, Ambito, Euro FROM tot
    UNION ALL
    SELECT 'TOT_GENERALE', NULL, (SELECT SUM(EuroCalcolati) FROM #final_details);

    DROP TABLE #base;
    DROP TABLE #final_details;
END
GO


