USE [KAM]
GO
/****** Object:  StoredProcedure [dbo].[GetOrderStatisticsByAgent_V3]    Script Date: 12/11/2025 21:19:21 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

ALTER PROCEDURE [dbo].[GetOrderStatisticsByAgent_V3]
    @agente NVARCHAR(50),
    @year   INT = NULL,              
    @dealer NVARCHAR(255) = NULL     
AS
BEGIN
    SET NOCOUNT ON;
    SET LANGUAGE Italian;

    IF @year IS NULL
        SET @year = YEAR(GETDATE());

    DECLARE @startDate DATE = DATEFROMPARTS(@year,1,1);
    DECLARE @endDate   DATE = DATEFROMPARTS(@year,12,31);

    /* =======================
       1) BLOCCO FASTWEB / ENERGY / ENI
       ======================= */
    WITH 
    CTE_AllPoints AS (
        SELECT 
            IDDealer,
            LEFT(AGENTE, 1) AS Agente,
            COALESCE(RagioneSociale, COMSY1, 'Dealer #' + CAST(IDDealer AS VARCHAR(10))) AS Point,
            COMSY1,
            COMSY2
        FROM dbo.tbDealers
        WHERE AGENTE = @agente
          AND (@dealer IS NULL OR COALESCE(RagioneSociale, COMSY1) = @dealer)
    ),
    CTE_MaxBatchPerMese AS (
        SELECT YEAR(Batch) AS Year, MONTH(Batch) AS Month, MAX(Batch) AS MaxBatch
        FROM dbo.InseritoFW
        GROUP BY YEAR(Batch), MONTH(Batch)
    ),
    CTE_FilteredOrdini AS (
        SELECT 
            ins.Valore, 
            ins.[Codice Comsy Tecnico Attuale], 
            MONTH(ins.Batch) AS Month, 
            YEAR(ins.Batch) AS Year, 
            ins.Batch, 
            tf.TIPO_Fastweb,
            ins.[Segmento],
            ins.[Tipo Ordine] AS TipoOrdine,
            ins.[customer first ord offer group] AS FissoOfferta,
            ins.[usim first mobile offer] AS MobileOfferta,
            ins.[tipo ricarica] AS TipoRicarica
        FROM dbo.InseritoFW AS ins
        LEFT OUTER JOIN dbo.tbPianiFastweb AS tf ON ins.Valore = tf.VALORE
        INNER JOIN CTE_MaxBatchPerMese AS maxBatch 
            ON YEAR(ins.Batch) = maxBatch.Year 
           AND MONTH(ins.Batch) = maxBatch.Month 
           AND ins.Batch = maxBatch.MaxBatch
    ),
    CTE_MaxBatchEnergyPerMese AS (
        SELECT YEAR(Batch) AS Year, MONTH(Batch) AS Month, MAX(Batch) AS MaxBatch
        FROM dbo.FWEnergiaImporter
        GROUP BY YEAR(Batch), MONTH(Batch)
    ),
    CTE_Energy AS (
        SELECT 
            energy.[Codice Comsy/Order Owner (Report!DBSELLER)] AS ComsyCode,
            energy.[Nome Offerta Vendita] AS OffertaEnergy,
            YEAR(energy.Batch) AS Year,
            MONTH(energy.Batch) AS Month
        FROM dbo.FWEnergiaImporter AS energy
        INNER JOIN CTE_MaxBatchEnergyPerMese AS maxBatch
            ON YEAR(energy.Batch) = maxBatch.Year
           AND MONTH(energy.Batch) = maxBatch.Month
           AND energy.Batch = maxBatch.MaxBatch
        INNER JOIN CTE_AllPoints AS p
            ON ((energy.[Codice Comsy/Order Owner (Report!DBSELLER)] = p.COMSY1 AND p.COMSY1 LIKE 'NR.1217%')
             OR (energy.[Codice Comsy/Order Owner (Report!DBSELLER)] = p.COMSY2 AND p.COMSY2 LIKE 'NS.1638%'))
        WHERE energy.[Codice Comsy/Order Owner (Report!DBSELLER)] IS NOT NULL
          AND energy.[Nome Offerta Vendita] IS NOT NULL
    ),
    /* === NUOVA CTE_ENI === */
    CTE_ENI AS (
        SELECT 
            d.IDDealer,
            d.COMSY1, 
            d.COMSY2,
            YEAR(ord.DataStato) AS Year,
            MONTH(ord.DataStato) AS Month,
            ord.IDORDINE
        FROM dbo.tbOrdini ord
        INNER JOIN dbo.tbOfferte o ON o.IDOfferta = ord.IDOfferta
        INNER JOIN dbo.tbDealers d ON d.idDealer = ord.idDealer
        WHERE o.idOperatore = 16
          AND YEAR(ord.DataStato) = @year
          AND d.AGENTE = @agente
          AND (@dealer IS NULL OR COALESCE(d.RagioneSociale, d.COMSY1) = @dealer)
    ),
    CTE_YearMonths AS (
        SELECT DISTINCT Year, Month
        FROM CTE_FilteredOrdini
        WHERE Year = @year
    ),
    CTE_PerPoint AS (
        SELECT 
            p.Agente,
            CAST(ym.Year AS VARCHAR(4)) + '/' + RIGHT('00' + CAST(ym.Month AS VARCHAR(2)), 2) AS AnnoMese,
            p.Point,

            /* --------- Fissi --------- */
            COUNT(CASE WHEN fo.TIPO_Fastweb = 'FISSO' THEN 1 END) AS FISSI,
            COUNT(CASE WHEN fo.TIPO_Fastweb = 'FISSO' AND fo.FissoOfferta LIKE '%Casa Start%' THEN 1 END) AS FissoStart,
            COUNT(CASE WHEN fo.TIPO_Fastweb = 'FISSO' AND fo.FissoOfferta LIKE '%Casa Pro%' THEN 1 END) AS FissoPro,
            COUNT(CASE WHEN fo.TIPO_Fastweb = 'FISSO' AND fo.FissoOfferta LIKE '%Casa Ultra%' THEN 1 END) AS FissoUltra,

            /* --------- Mobili --------- */
            COUNT(CASE WHEN fo.TIPO_Fastweb = 'MOBILE' THEN 1 END) AS MOBILI,
            COUNT(CASE WHEN fo.TIPO_Fastweb = 'MOBILE' AND fo.MobileOfferta LIKE '%Mobile Start%' THEN 1 END) AS MobileStart,
            COUNT(CASE WHEN fo.TIPO_Fastweb = 'MOBILE' AND fo.MobileOfferta LIKE '%Mobile Pro%' THEN 1 END) AS MobilePro,
            COUNT(CASE WHEN fo.TIPO_Fastweb = 'MOBILE' AND fo.MobileOfferta LIKE '%Mobile Ultra%' THEN 1 END) AS MobileUltra,

            COUNT(CASE WHEN fo.TIPO_Fastweb='MOBILE' AND fo.TipoRicarica='Automatica' THEN 1 END) AS MobileRA,
            CASE WHEN COUNT(CASE WHEN fo.TIPO_Fastweb='MOBILE' THEN 1 END) > 0 
                 THEN CAST(COUNT(CASE WHEN fo.TIPO_Fastweb='MOBILE' AND fo.TipoRicarica='Automatica' THEN 1 END) AS FLOAT)
                      / COUNT(CASE WHEN fo.TIPO_Fastweb='MOBILE' THEN 1 END) * 100
                 ELSE 0 END AS MobilePercentRA,

            COUNT(CASE WHEN fo.TIPO_Fastweb='MOBILE' AND fo.Segmento='RES' THEN 1 END) AS [MOBILI RES],
            COUNT(CASE WHEN fo.TIPO_Fastweb='MOBILE' AND fo.Segmento='SHP' THEN 1 END) AS [MOBILI BUS],
            COUNT(CASE WHEN fo.TIPO_Fastweb='FISSO'  AND fo.Segmento='RES' THEN 1 END) AS [FISSI RES],
            COUNT(CASE WHEN fo.TIPO_Fastweb='FISSO'  AND fo.Segmento='SHP' THEN 1 END) AS [FISSI BUS],

            SUM(CASE WHEN fo.TIPO_Fastweb='MOBILE' AND fo.TipoOrdine='FISSO E MOBILE' AND fo.Segmento='RES' THEN 1 ELSE 0 END) AS [di cui CONV_RES],
            SUM(CASE WHEN fo.TIPO_Fastweb='MOBILE' AND fo.TipoOrdine='FISSO E MOBILE' AND fo.Segmento='SHP' THEN 1 ELSE 0 END) AS [di cui CONV_BUS],

            /* --------- ENERGY --------- */
            COUNT(DISTINCT CASE WHEN en.ComsyCode IS NOT NULL THEN en.ComsyCode + '|' + en.OffertaEnergy END) AS ENERGY,
            COUNT(DISTINCT CASE WHEN en.OffertaEnergy IN ('MONO Fastweb Energia Flat Full', 'MONO Fastweb Energia Flat Light', 'MONO Fastweb Energia Flat Maxi') THEN en.ComsyCode + '|' + en.OffertaEnergy END) AS EnergyCore,
            COUNT(DISTINCT CASE WHEN en.OffertaEnergy = 'MONO Fastweb Energia Flex' THEN en.ComsyCode + '|' + en.OffertaEnergy END) AS EnergyFlex,
            COUNT(DISTINCT CASE WHEN en.OffertaEnergy = 'MONO Fastweb Energia Fix'  THEN en.ComsyCode + '|' + en.OffertaEnergy END) AS EnergyFix,

            /* --------- ENI --------- */
            COUNT(DISTINCT eni.IDORDINE) AS ENI,

            /* --------- Percentuale FASTWEB su Energy --------- */
            CAST(CASE 
                WHEN (COUNT(DISTINCT CASE WHEN en.ComsyCode IS NOT NULL THEN en.ComsyCode + '|' + en.OffertaEnergy END) + COUNT(DISTINCT eni.IDORDINE)) > 0
                THEN (CAST(COUNT(DISTINCT CASE WHEN en.ComsyCode IS NOT NULL THEN en.ComsyCode + '|' + en.OffertaEnergy END) AS FLOAT) / 
                      (COUNT(DISTINCT CASE WHEN en.ComsyCode IS NOT NULL THEN en.ComsyCode + '|' + en.OffertaEnergy END) + COUNT(DISTINCT eni.IDORDINE))) * 100
                ELSE 0
            END AS DECIMAL(10,2)) AS EnergyPercentFastweb,

            FORMAT(CONVERT(DATE, MAX(fo.Batch), 120), 'dd/MM/yyyy') AS DataAggiornamento
        FROM CTE_AllPoints AS p
        CROSS JOIN CTE_YearMonths AS ym
        LEFT JOIN CTE_FilteredOrdini AS fo 
               ON ((fo.[Codice Comsy Tecnico Attuale] = p.COMSY1 AND p.COMSY1 LIKE 'NR.1217%')
                OR (fo.[Codice Comsy Tecnico Attuale] = p.COMSY2 AND p.COMSY2 LIKE 'NS.1638%'))
              AND fo.Year  = ym.Year
              AND fo.Month = ym.Month
        LEFT JOIN CTE_Energy AS en
               ON ((en.ComsyCode = p.COMSY1 AND p.COMSY1 LIKE 'NR.1217%')
                OR (en.ComsyCode = p.COMSY2 AND p.COMSY2 LIKE 'NS.1638%'))
              AND en.Year  = ym.Year
              AND en.Month = ym.Month
        LEFT JOIN CTE_ENI AS eni
               ON eni.IDDealer = p.IDDealer
              AND eni.Year  = ym.Year
              AND eni.Month = ym.Month
        GROUP BY 
            p.Agente,
            CAST(ym.Year AS VARCHAR(4)) + '/' + RIGHT('00' + CAST(ym.Month AS VARCHAR(2)), 2),
            p.Point
    )
    SELECT 
        Agente, AnnoMese, Point,
        FISSI, FissoStart, FissoPro, FissoUltra,
        MOBILI, MobileStart, MobilePro, MobileUltra, MobileRA,
        CAST(ROUND(MobilePercentRA, 2) AS DECIMAL(5,2)) AS MobilePercentRA,
        [MOBILI RES], [MOBILI BUS], [FISSI RES], [FISSI BUS],
        [di cui CONV_RES], [di cui CONV_BUS],
        ENERGY, EnergyCore, EnergyFlex, EnergyFix,
        ENI,
        EnergyPercentFastweb,
        DataAggiornamento
    FROM CTE_PerPoint

    UNION ALL

    SELECT 
        NULL AS Agente,
        CAST(Year AS VARCHAR(4)) + '/' + RIGHT('00' + CAST(Month AS VARCHAR(2)), 2) AS AnnoMese,
        'TOTALE ' + UPPER(DATENAME(MONTH, DATEFROMPARTS(Year, Month, 1))) AS Point,
        SUM(FISSI), SUM(FissoStart), SUM(FissoPro), SUM(FissoUltra),
        SUM(MOBILI), SUM(MobileStart), SUM(MobilePro), SUM(MobileUltra),
        SUM(MobileRA),
        CAST(ROUND(CASE WHEN SUM(MOBILI) > 0 
                        THEN (CAST(SUM(MobileRA) AS FLOAT) / SUM(MOBILI)) * 100
                        ELSE 0 END, 2) AS DECIMAL(5,2)),
        SUM([MOBILI RES]), SUM([MOBILI BUS]), SUM([FISSI RES]), SUM([FISSI BUS]),
        SUM([di cui CONV_RES]), SUM([di cui CONV_BUS]),
        SUM(ENERGY), SUM(EnergyCore), SUM(EnergyFlex), SUM(EnergyFix),
        SUM(ENI),
        CAST(CASE 
            WHEN (SUM(ENERGY) + SUM(ENI)) > 0
            THEN (CAST(SUM(ENERGY) AS FLOAT) / (SUM(ENERGY) + SUM(ENI))) * 100
            ELSE 0
        END AS DECIMAL(10,2)) AS EnergyPercentFastweb,
        NULL AS DataAggiornamento
    FROM CTE_PerPoint
    CROSS APPLY (SELECT CAST(LEFT(AnnoMese, 4) AS INT) AS Year, CAST(RIGHT(AnnoMese, 2) AS INT) AS Month) AS ExtractedDate
    GROUP BY Year, Month
    ORDER BY AnnoMese DESC, [MOBILI RES] DESC;

    /* ===========================
       2) BLOCCO SKY (con filtro dealer)
       =========================== */
    ;WITH SKY_Base AS (
        SELECT 
            d.RagioneSociale AS Point,
            MONTH(ord.DataStato) AS Mese,
            o.Tipo AS TipoNorm,
            COUNT(ord.IDORDINE) AS Totale
        FROM dbo.tbOFFERTE o
        INNER JOIN dbo.tbordini ord ON ord.IDOFFERTA = o.IDOFFERTA
        INNER JOIN dbo.tbDealers d  ON d.idDealer    = ord.idDealer
        WHERE ord.Stato = '1'
          AND ord.DataStato >= @startDate 
          AND ord.DataStato < DATEADD(DAY,1,@endDate)
          AND d.Agente = @agente
          AND (@dealer IS NULL OR d.RagioneSociale = @dealer)
          AND (
                (o.idOperatore = 3  AND o.Tipo IN ('TV_ONLY','TRIPLE_PLAY','WIFI_RESIDENZIALE','SKY_GLASS','4P','PROVA SKY'))
             OR (o.idOperatore = 8  AND o.Tipo = 'MOBILE')
             OR (o.idOperatore = 12 AND o.Tipo IN ('B&B BUS','WIFI_BUSINESS'))
             OR (o.idOperatore = 14 AND o.Tipo = 'BAR BUS')
          )
        GROUP BY d.RagioneSociale, MONTH(ord.DataStato), o.Tipo
    ),
    SKY_Agg AS (
        SELECT
            Point, Mese,
            SUM(CASE WHEN TipoNorm = 'TV_ONLY'           THEN Totale ELSE 0 END) AS [TV_ONLY],
            SUM(CASE WHEN TipoNorm = 'TRIPLE_PLAY'       THEN Totale ELSE 0 END) AS [TRIPLE_PLAY],
            SUM(CASE WHEN TipoNorm = 'WIFI_RESIDENZIALE' THEN Totale ELSE 0 END) AS [WIFI_RESIDENZIALE],
            SUM(CASE WHEN TipoNorm = 'SKY_GLASS'         THEN Totale ELSE 0 END) AS [SKY_GLASS],
            SUM(CASE WHEN TipoNorm = '4P'                THEN Totale ELSE 0 END) AS [4P],
            SUM(CASE WHEN TipoNorm = 'PROVA SKY'         THEN Totale ELSE 0 END) AS [PROVA SKY],
            SUM(CASE WHEN TipoNorm = 'MOBILE'            THEN Totale ELSE 0 END) AS [MOBILE],
            SUM(CASE WHEN TipoNorm = 'WIFI_BUSINESS'     THEN Totale ELSE 0 END) AS [WIFI_BUSINESS],
            SUM(CASE WHEN TipoNorm = 'B&B BUS'           THEN Totale ELSE 0 END) AS [B&B BUS],
            SUM(CASE WHEN TipoNorm = 'BAR BUS'           THEN Totale ELSE 0 END) AS [BAR BUS]
        FROM SKY_Base
        GROUP BY Point, Mese
    )
    SELECT *
    FROM (
        SELECT
            Point, Mese,
            [TV_ONLY], [TRIPLE_PLAY], [WIFI_RESIDENZIALE], [SKY_GLASS], [4P], [PROVA SKY],
            [MOBILE], [WIFI_BUSINESS], [B&B BUS], [BAR BUS],
            SKY_TOTALE = COALESCE([TV_ONLY],0)+COALESCE([TRIPLE_PLAY],0)+COALESCE([WIFI_RESIDENZIALE],0)+COALESCE([SKY_GLASS],0)+COALESCE([4P],0)+COALESCE([PROVA SKY],0)+COALESCE([MOBILE],0)+COALESCE([WIFI_BUSINESS],0)+COALESCE([B&B BUS],0)+COALESCE([BAR BUS],0),
            SortKey = 1
        FROM SKY_Agg

        UNION ALL

        SELECT
            'TOTALE ' + UPPER(DATENAME(MONTH, DATEFROMPARTS(@year, Mese, 1))) AS Point,
            Mese,
            SUM([TV_ONLY]), SUM([TRIPLE_PLAY]), SUM([WIFI_RESIDENZIALE]), SUM([SKY_GLASS]), SUM([4P]), SUM([PROVA SKY]),
            SUM([MOBILE]), SUM([WIFI_BUSINESS]), SUM([B&B BUS]), SUM([BAR BUS]),
            SUM(COALESCE([TV_ONLY],0)+COALESCE([TRIPLE_PLAY],0)+COALESCE([WIFI_RESIDENZIALE],0)+COALESCE([SKY_GLASS],0)+COALESCE([4P],0)+COALESCE([PROVA SKY],0)+COALESCE([MOBILE],0)+COALESCE([WIFI_BUSINESS],0)+COALESCE([B&B BUS],0)+COALESCE([BAR BUS],0)) AS SKY_TOTALE,
            SortKey = 0
        FROM SKY_Agg
        GROUP BY Mese
    ) AS Z
    ORDER BY Z.Mese DESC, Z.SortKey, Z.Point;

    /* ================================================
       3) BLOCCO SIM vendute (con filtro dealer)
       ================================================ */
    ;WITH PacchettiSIM AS (
        SELECT o.IDOfferta, o.Titolo, o.SIMTYPE
        FROM dbo.tbOfferte o
        WHERE o.idOperatore = 11
          AND o.tipoOfferta = 4
          AND o.Segmento = 'SIM'
          AND o.Tipo = 'SIM'
          AND o.IDOfferta <> 446
          AND UPPER(LTRIM(RTRIM(o.SIMTYPE))) <> 'SOS_SIM'
    ),
    VenditeSIM AS (
        SELECT
              op.DataOra,
              d.Agente,
              d.RagioneSociale,
              ps.SIMTYPE,
              ps.Titolo,
              dop.Quantita,
              SIM_vendute_riga = dop.Quantita * 5
        FROM dbo.tbOrdiniProdotti op
        INNER JOIN dbo.tbDettagliOrdiniProdotti dop
            ON dop.idOrdineProdotto = op.IDOrdineProdotto
        INNER JOIN PacchettiSIM ps
            ON ps.IDOfferta = dop.idOfferta
        INNER JOIN dbo.tbDealers d
            ON d.idDealer = op.idDealer
        WHERE op.DataOra >= @startDate
          AND op.DataOra < DATEADD(DAY, 1, @endDate)
          AND d.Agente = @agente
          AND (@dealer IS NULL OR d.RagioneSociale = @dealer)
    )
    SELECT
          AnnoMese = CONVERT(char(7), DATEFROMPARTS(YEAR(DataOra), MONTH(DataOra), 1), 126),
          Agente,
          SIMTYPE = COALESCE(NULLIF(LTRIM(RTRIM(SIMTYPE)), ''), 'UNKNOWN'),
          SIM_Vendute = SUM(SIM_vendute_riga)
    FROM VenditeSIM
    GROUP BY YEAR(DataOra), MONTH(DataOra), Agente, COALESCE(NULLIF(LTRIM(RTRIM(SIMTYPE)), ''), 'UNKNOWN')
    ORDER BY AnnoMese DESC, Agente, SIMTYPE;
END
GO
