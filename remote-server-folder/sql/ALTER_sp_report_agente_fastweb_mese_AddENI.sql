-- =============================================
-- Modifica sp_report_agente_fastweb_mese per aggiungere colonna ENI separata
-- =============================================

USE [KAM]
GO

CREATE OR ALTER PROCEDURE [dbo].[sp_report_agente_fastweb_mese]
    @agente        nvarchar(100),
    @year          int,
    @month         int,
    @fallback_prev bit = 0
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @start_date date = DATEFROMPARTS(@year, @month, 1);
    DECLARE @end_date   date = EOMONTH(@start_date);

    /* 1) Dealer dell'agente - ✅ INCLUDE ANCHE DEALER ENI SENZA COMSY */
    IF OBJECT_ID('tempdb..#dealers_clean') IS NOT NULL DROP TABLE #dealers_clean;

    WITH dealers_raw AS (
        SELECT
            d.IDDealer,
            d.RagioneSociale,
            UPPER(LTRIM(RTRIM(d.COMSY1))) AS COMSY1,
            UPPER(LTRIM(RTRIM(d.COMSY2))) AS COMSY2
        FROM dbo.TbDealers d
        WHERE LTRIM(RTRIM(d.AGENTE)) = @agente
    ),
    dealers_key AS (
        SELECT
            IDDealer, RagioneSociale, COMSY1, COMSY2,
            CASE WHEN COMSY1 LIKE 'NR.1217.0601NA.C%' AND CHARINDEX('.C', COMSY1) > 0
                 THEN SUBSTRING(COMSY1, CHARINDEX('.C', COMSY1) + 2, 100) END AS SUF1,
            CASE WHEN COMSY2 LIKE 'NS.1638.0601NA.C%' AND CHARINDEX('.C', COMSY2) > 0
                 THEN SUBSTRING(COMSY2, CHARINDEX('.C', COMSY2) + 2, 100) END AS SUF2
        FROM dealers_raw
    )
    SELECT DISTINCT
        COALESCE(SUF1, SUF2, CAST(IDDealer AS VARCHAR(10))) AS dealer_suf,
        MAX(IDDealer)        AS IDDealer,
        MAX(RagioneSociale)  AS RagioneSociale,
        MAX(COMSY1)          AS COMSY1,
        MAX(COMSY2)          AS COMSY2
    INTO #dealers_clean
    FROM dealers_key
    GROUP BY COALESCE(SUF1, SUF2, CAST(IDDealer AS VARCHAR(10)));

    DECLARE @totale_point int = (SELECT COUNT(*) FROM #dealers_clean);

    /* 2) Ultimi batch PER DATA nel mese (o precedente se fallback) */
    DECLARE @lb_tlc_date    date = (
        SELECT MAX(TRY_CONVERT(date, [Batch], 23))
        FROM dbo.InseritoFW
        WHERE TRY_CONVERT(date, [Batch], 23) BETWEEN @start_date AND @end_date
    );
    DECLARE @lb_energy_date date = (
        SELECT MAX(TRY_CONVERT(date, [Batch], 23))
        FROM dbo.FWEnergiaImporter
        WHERE TRY_CONVERT(date, [Batch], 23) BETWEEN @start_date AND @end_date
    );

    IF @fallback_prev = 1 AND @lb_tlc_date IS NULL
        SELECT @lb_tlc_date = (
            SELECT MAX(TRY_CONVERT(date, [Batch], 23))
            FROM dbo.InseritoFW
            WHERE TRY_CONVERT(date, [Batch], 23) <= @end_date
        );

    IF @fallback_prev = 1 AND @lb_energy_date IS NULL
        SELECT @lb_energy_date = (
            SELECT MAX(TRY_CONVERT(date, [Batch], 23))
            FROM dbo.FWEnergiaImporter
            WHERE TRY_CONVERT(date, [Batch], 23) <= @end_date
        );

    /* 3) Normalizzazione TLC del batch scelto */
    IF OBJECT_ID('tempdb..#tlc_norm') IS NOT NULL DROP TABLE #tlc_norm;

    IF @lb_tlc_date IS NOT NULL
    BEGIN
        WITH tlc_raw AS (
            SELECT
                UPPER(LTRIM(RTRIM(i.[Codice Comsy Tecnico Attuale]))) AS cod_comsy,
                UPPER(LTRIM(RTRIM(i.[Tipo Ordine])))                  AS tipo_ordine,
                UPPER(LTRIM(RTRIM(i.[Valore])))                       AS valore,
                UPPER(LTRIM(RTRIM(i.[tipo ricarica])))                AS tipo_ricarica,
                UPPER(LTRIM(RTRIM(i.[Codice Ordine])))                AS codice_ordine,
                UPPER(LTRIM(RTRIM(i.[Segmento])))                     AS segmento_raw
            FROM dbo.InseritoFW i
            WHERE TRY_CONVERT(date, i.[Batch], 23) = @lb_tlc_date
        )
        SELECT
            r.cod_comsy,
            r.codice_ordine,
            CASE
                WHEN (r.cod_comsy LIKE 'NR.1217.0601NA.C%' OR r.cod_comsy LIKE 'NS.1638.0601NA.C%')
                     AND CHARINDEX('.C', r.cod_comsy) > 0
                THEN SUBSTRING(r.cod_comsy, CHARINDEX('.C', r.cod_comsy) + 2, 100)
                ELSE NULL
            END AS suf,
            CASE
                WHEN r.cod_comsy LIKE 'NR.1217.0601NA.%' THEN 'RES'
                WHEN r.cod_comsy LIKE 'NS.1638.0601NA.%' THEN 'SHP'
                ELSE 'RES'
            END AS segmento,
            r.segmento_raw,
            r.tipo_ordine,
            CASE
                WHEN r.tipo_ordine IN ('FISSO','FIX','FTTH','FTTC','ADSL') THEN 'FISSO'
                WHEN r.tipo_ordine = 'MOBILE' THEN 'MOBILE'
                WHEN r.tipo_ordine IN ('FISSO E MOBILE','FISSO&MOBILE','FISSO/MOBILE','FISSO E  MOBILE') THEN
                    CASE
                        WHEN UPPER(LTRIM(RTRIM(p.[TIPO_Fastweb]))) = 'FISSO'  THEN 'FISSO'
                        WHEN UPPER(LTRIM(RTRIM(p.[TIPO_Fastweb]))) = 'MOBILE' THEN 'MOBILE'
                        ELSE 'ALTRO'
                    END
                ELSE 'ALTRO'
            END AS categoria,
            CASE
                WHEN (r.tipo_ordine = 'MOBILE' AND r.tipo_ricarica = 'AUTOMATICA')
                     OR 
                     (r.tipo_ordine IN ('FISSO E MOBILE','FISSO&MOBILE','FISSO/MOBILE','FISSO E  MOBILE')
                      AND UPPER(LTRIM(RTRIM(p.[TIPO_Fastweb]))) = 'MOBILE'
                      AND r.tipo_ricarica = 'AUTOMATICA')
            THEN 1 ELSE 0 END AS is_ra,
            CASE
                WHEN r.tipo_ordine IN ('FISSO E MOBILE','FISSO&MOBILE','FISSO/MOBILE','FISSO E  MOBILE')
                     AND UPPER(LTRIM(RTRIM(p.[TIPO_Fastweb]))) = 'MOBILE'
            THEN 1 ELSE 0 END AS in_convergenza
        INTO #tlc_norm
        FROM tlc_raw r
        LEFT JOIN dbo.tbPianiFastweb p
          ON UPPER(LTRIM(RTRIM(p.[VALORE]))) = r.valore;
    END

    /* 3b) Normalizzazione ENERGIA FASTWEB del batch scelto */
    IF OBJECT_ID('tempdb..#energia_norm') IS NOT NULL DROP TABLE #energia_norm;

    IF @lb_energy_date IS NOT NULL
    BEGIN
        WITH energia_raw AS (
            SELECT
                UPPER(LTRIM(RTRIM(e.[Codice Comsy/Order Owner (Report!DBSELLER)]))) AS cod_comsy
            FROM dbo.FWEnergiaImporter e
            WHERE TRY_CONVERT(date, e.[Batch], 23) = @lb_energy_date
        )
        SELECT
            r.cod_comsy,
            CASE
                WHEN (r.cod_comsy LIKE 'NR.1217.0601NA.C%' OR r.cod_comsy LIKE 'NS.1638.0601NA.C%')
                     AND CHARINDEX('.C', r.cod_comsy) > 0
                THEN SUBSTRING(r.cod_comsy, CHARINDEX('.C', r.cod_comsy) + 2, 100)
                ELSE NULL
            END AS suf,
            CASE
                WHEN r.cod_comsy LIKE 'NR.1217.0601NA.%' THEN 'RES'
                WHEN r.cod_comsy LIKE 'NS.1638.0601NA.%' THEN 'SHP'
                ELSE 'RES'
            END AS segmento
        INTO #energia_norm
        FROM energia_raw r;
    END

    /* 4) (NON EMETTO KPI GENERALI: la UI vuole il dettaglio dealer come recordset 0) */

    /* 5) DETTAGLIO PER DEALER (recordset 0) - ✅ AGGIUNTA COLONNA ENI SEPARATA */
    IF OBJECT_ID('tempdb..#tlc_by_dealer')    IS NOT NULL DROP TABLE #tlc_by_dealer;
    IF OBJECT_ID('tempdb..#energy_by_dealer') IS NOT NULL DROP TABLE #energy_by_dealer;
    IF OBJECT_ID('tempdb..#eni_by_dealer')    IS NOT NULL DROP TABLE #eni_by_dealer;

    SELECT
        d.dealer_suf,
        SUM(CASE WHEN n.categoria='FISSO' THEN 1 ELSE 0 END)                                           AS [FISSO],
        SUM(CASE WHEN n.categoria='FISSO' AND n.segmento='SHP' THEN 1 ELSE 0 END)                      AS [FISSO SHP],
        SUM(CASE WHEN n.categoria='FISSO' AND n.segmento='RES' THEN 1 ELSE 0 END)                      AS [FISSO RES],
        SUM(CASE WHEN n.categoria='MOBILE' THEN 1 ELSE 0 END)                                          AS [MOBILE],
        SUM(CASE WHEN n.categoria='MOBILE' AND n.segmento='SHP' THEN 1 ELSE 0 END)                     AS [MOBILE SHP],
        SUM(CASE WHEN n.categoria='MOBILE' AND n.segmento='RES' THEN 1 ELSE 0 END)                     AS [MOBILE RES],
        SUM(CASE WHEN n.categoria='MOBILE' AND n.is_ra=1 AND n.in_convergenza=0 THEN 1 ELSE 0 END)     AS [Mobile RA],
        COUNT(DISTINCT CASE 
            WHEN n.tipo_ordine IN ('FISSO E MOBILE','FISSO&MOBILE','FISSO/MOBILE','FISSO E  MOBILE') 
            THEN n.codice_ordine 
            ELSE NULL 
        END) AS [CONVERGENZA]
    INTO #tlc_by_dealer
    FROM #dealers_clean d
    LEFT JOIN #tlc_norm n ON n.suf = d.dealer_suf
    GROUP BY d.dealer_suf;

    -- ✅ Energia FASTWEB per dealer (solo FW)
    SELECT
        d.dealer_suf,
        ISNULL(fw.cnt, 0) AS [ENERGIA]
    INTO #energy_by_dealer
    FROM #dealers_clean d
    LEFT JOIN (
        SELECT suf, COUNT(*) as cnt
        FROM #energia_norm
        WHERE suf IS NOT NULL
        GROUP BY suf
    ) fw ON fw.suf = d.dealer_suf;

    -- ✅ ENI separato per dealer (usa dealer_suf per match corretto con e senza COMSY)
    -- FIX: Aggiunto filtro o.Stato IN (2, 3) per allineare con KPI globali
    SELECT
        d.dealer_suf,
        COUNT(DISTINCT o.IDORDINE) as [ENI]
    INTO #eni_by_dealer
    FROM #dealers_clean d
    JOIN dbo.tbOrdini o ON o.idDealer = d.IDDealer
    JOIN dbo.tbOfferte ofr ON o.idOfferta = ofr.IDOfferta
    WHERE ofr.idOperatore = 16
      AND ofr.IDOfferta <> 526
      AND o.Stato IN (2, 3)
      AND o.MonthStart >= @start_date 
      AND o.MonthStart < DATEADD(MONTH, 1, @start_date)
    GROUP BY d.dealer_suf;

    -- Recordset 0: dettaglio dealer con ENI separato
    SELECT
        dc.dealer_suf AS DealerKey,
        dc.RagioneSociale,
        dc.COMSY1,
        dc.COMSY2,
        CASE WHEN
             ISNULL(t.[FISSO],0) + ISNULL(t.[MOBILE],0) + ISNULL(en.[ENERGIA],0) + ISNULL(eni.[ENI],0) > 0
             THEN 'SI' ELSE 'NO' END AS Ingaggiato,
        ISNULL(t.[FISSO],0)        AS [FISSO],
        ISNULL(t.[FISSO SHP],0)    AS [FISSO SHP],
        ISNULL(t.[FISSO RES],0)    AS [FISSO RES],
        ISNULL(t.[MOBILE],0)       AS [MOBILE],
        ISNULL(t.[MOBILE SHP],0)   AS [MOBILE SHP],
        ISNULL(t.[MOBILE RES],0)   AS [MOBILE RES],
        ISNULL(t.[Mobile RA],0)    AS [Mobile RA],
        ISNULL(t.[CONVERGENZA],0)  AS [CONVERGENZA],
        ISNULL(en.[ENERGIA],0)     AS [ENERGIA],
        ISNULL(eni.[ENI],0)        AS [ENI]
    FROM #dealers_clean dc
    LEFT JOIN #tlc_by_dealer    t   ON t.dealer_suf   = dc.dealer_suf
    LEFT JOIN #energy_by_dealer en  ON en.dealer_suf  = dc.dealer_suf
    LEFT JOIN #eni_by_dealer    eni ON eni.dealer_suf = dc.dealer_suf
    ORDER BY Ingaggiato DESC, dc.RagioneSociale;

    /* 6) PROVINCIA: dealer totali, dealer ingaggiati, attivazioni per categoria (recordset 1) */
    IF OBJECT_ID('tempdb..#dealer_province') IS NOT NULL DROP TABLE #dealer_province;

    WITH dprov_raw AS (
        SELECT
            UPPER(LTRIM(RTRIM(COALESCE(d.Provincia,'N/D')))) AS Provincia,
            UPPER(LTRIM(RTRIM(d.COMSY1)))                   AS COMSY1,
            UPPER(LTRIM(RTRIM(d.COMSY2)))                   AS COMSY2,
            d.IDDealer
        FROM dbo.TbDealers d
        WHERE LTRIM(RTRIM(d.AGENTE)) = @agente
    ),
    dprov_key AS (
        SELECT
            Provincia,
            IDDealer,
            CASE WHEN COMSY1 LIKE 'NR.1217.0601NA.C%' AND CHARINDEX('.C', COMSY1) > 0
                 THEN SUBSTRING(COMSY1, CHARINDEX('.C', COMSY1) + 2, 100) END AS SUF1,
            CASE WHEN COMSY2 LIKE 'NS.1638.0601NA.C%' AND CHARINDEX('.C', COMSY2) > 0
                 THEN SUBSTRING(COMSY2, CHARINDEX('.C', COMSY2) + 2, 100) END AS SUF2
        FROM dprov_raw
    )
    SELECT
        COALESCE(SUF1, SUF2, CAST(IDDealer AS VARCHAR(10))) AS dealer_suf,
        MAX(Provincia) AS Provincia,
        MAX(IDDealer) AS IDDealer
    INTO #dealer_province
    FROM dprov_key
    GROUP BY COALESCE(SUF1, SUF2, CAST(IDDealer AS VARCHAR(10)));

    WITH att_per_prov AS (
        SELECT
            dp.Provincia,
            SUM(CASE WHEN a.categoria = 'FISSO'   THEN 1 ELSE 0 END)       AS tlc_fisso_inseriti,
            SUM(CASE WHEN a.categoria = 'MOBILE'  THEN 1 ELSE 0 END)       AS tlc_mobile_inseriti,
            SUM(CAST(a.is_ricarica_automatica AS INT))                      AS mobile_ricarica_automatica,
            SUM(CASE WHEN a.categoria = 'ENERGIA' THEN 1 ELSE 0 END)       AS energia_inseriti,
            COUNT(DISTINCT a.dealer_suf)                                   AS dealer_ingaggiati
        FROM #dealer_province dp
        LEFT JOIN (
            SELECT dealer_suf, categoria, is_ricarica_automatica
            FROM (
                SELECT n.suf AS dealer_suf, n.categoria, n.is_ra AS is_ricarica_automatica
                FROM #tlc_norm n
                UNION ALL
                SELECT e.suf, 'ENERGIA', 0
                FROM #energia_norm e
            ) z
        ) a ON a.dealer_suf = dp.dealer_suf
        GROUP BY dp.Provincia
    ),
    tot_dealer_prov AS (
        SELECT Provincia, COUNT(DISTINCT dealer_suf) AS dealer_totali
        FROM #dealer_province
        GROUP BY Provincia
    )
    SELECT
        t.Provincia,
        td.dealer_totali,
        COALESCE(t.dealer_ingaggiati, 0)           AS dealer_ingaggiati,
        COALESCE(t.tlc_fisso_inseriti, 0)          AS tlc_fisso_inseriti,
        COALESCE(t.tlc_mobile_inseriti, 0)         AS tlc_mobile_inseriti,
        COALESCE(t.mobile_ricarica_automatica, 0)  AS mobile_ricarica_automatica,
        COALESCE(t.energia_inseriti, 0)            AS energia_inseriti
    FROM att_per_prov t
    JOIN tot_dealer_prov td ON td.Provincia = t.Provincia
    ORDER BY dealer_ingaggiati DESC, t.Provincia;

    /* 7A) Dealer ingaggiati per Provincia x Segmento (recordset 2) */
    SELECT
        dp.Provincia,
        a.segmento,
        COUNT(DISTINCT a.dealer_suf) AS dealer_ingaggiati
    FROM #dealer_province dp
    JOIN (
        SELECT n.suf AS dealer_suf, n.segmento
        FROM #tlc_norm n
        UNION ALL
        SELECT e.suf, e.segmento
        FROM #energia_norm e
    ) a ON a.dealer_suf = dp.dealer_suf
    GROUP BY dp.Provincia, a.segmento
    ORDER BY dp.Provincia,
             CASE a.segmento WHEN 'RES' THEN 1 WHEN 'SHP' THEN 2 ELSE 3 END;

    /* 7B) Attivazioni per Provincia x Segmento x Categoria (recordset 3) */
    SELECT
        dp.Provincia,
        a.segmento,
        a.categoria,
        COUNT(*) AS attivazioni
    FROM #dealer_province dp
    JOIN (
        SELECT n.suf AS dealer_suf, n.segmento, n.categoria
        FROM #tlc_norm n
        UNION ALL
        SELECT e.suf, e.segmento, 'ENERGIA'
        FROM #energia_norm e
    ) a ON a.dealer_suf = dp.dealer_suf
    GROUP BY dp.Provincia, a.segmento, a.categoria
    ORDER BY dp.Provincia,
             CASE a.segmento WHEN 'RES' THEN 1 WHEN 'SHP' THEN 2 ELSE 3 END,
             CASE a.categoria WHEN 'FISSO' THEN 1 WHEN 'MOBILE' THEN 2 WHEN 'ENERGIA' THEN 3 ELSE 4 END;
END
GO
