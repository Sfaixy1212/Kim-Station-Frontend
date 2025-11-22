USE [KAM]
GO

-- Elimina la SP esistente se presente
IF OBJECT_ID('[dbo].[GetOrderStatisticsByAgent_V2]', 'P') IS NOT NULL
    DROP PROCEDURE [dbo].[GetOrderStatisticsByAgent_V2];
GO

/****** Object:  StoredProcedure [dbo].[GetOrderStatisticsByAgent_V2]    Script Date: 12/10/2025 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE PROCEDURE [dbo].[GetOrderStatisticsByAgent_V2]
    @agente NVARCHAR(50),
    @year INT = NULL  -- Parametro opzionale per l'anno (default: anno corrente)
AS
BEGIN
    SET NOCOUNT ON;

    -- Imposta la lingua italiana per i nomi dei mesi
    SET LANGUAGE Italian;

    -- Se @year non è specificato, usa l'anno corrente
    IF @year IS NULL
        SET @year = YEAR(GETDATE());

    WITH 
    -- CTE con l'elenco di tutti i point per l'agente specificato, 
    -- filtrando solo quelli con COMSY1 valorizzato (non null, non vuoto, non 'null')
    CTE_AllPoints AS (
        SELECT 
            LEFT(AGENTE, 1) AS Agente,
            COALESCE(RagioneSociale, COMSY1) AS Point,
            COMSY1,
            COMSY2
        FROM dbo.tbDealers
        WHERE AGENTE = @agente
          AND COMSY1 IS NOT NULL
          AND COMSY1 <> ''
          AND COMSY1 <> 'null'
    ),
    -- CTE che calcola i batch più recenti per ogni mese da InseritoFW
    CTE_MaxBatchPerMese AS (
        SELECT 
            YEAR(Batch) AS Year, 
            MONTH(Batch) AS Month, 
            MAX(Batch) AS MaxBatch
        FROM dbo.InseritoFW
        GROUP BY YEAR(Batch), MONTH(Batch)
    ),
    -- CTE che filtra gli ordini basandosi sui batch più recenti
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
        LEFT OUTER JOIN dbo.tbPianiFastweb AS tf 
            ON ins.Valore = tf.VALORE
        INNER JOIN CTE_MaxBatchPerMese AS maxBatch 
            ON YEAR(ins.Batch) = maxBatch.Year 
            AND MONTH(ins.Batch) = maxBatch.Month 
            AND ins.Batch = maxBatch.MaxBatch
    ),
    -- CTE per i batch più recenti Energy per ogni mese
    CTE_MaxBatchEnergyPerMese AS (
        SELECT 
            YEAR(Batch) AS Year, 
            MONTH(Batch) AS Month, 
            MAX(Batch) AS MaxBatch
        FROM [dbo].[FWEnergiaImporter]
        GROUP BY YEAR(Batch), MONTH(Batch)
    ),
    -- CTE per gli ordini Energy (solo batch più recenti E solo COMSY dell'agente)
    CTE_Energy AS (
        SELECT 
            energy.[Codice Comsy/Order Owner (Report!DBSELLER)] AS ComsyCode,
            energy.[Nome Offerta Vendita] AS OffertaEnergy,
            YEAR(energy.Batch) AS Year,
            MONTH(energy.Batch) AS Month
        FROM [dbo].[FWEnergiaImporter] AS energy
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
    -- CTE che estrae i Year/Month disponibili per l'anno desiderato
    CTE_YearMonths AS (
        SELECT DISTINCT
            Year,
            Month
        FROM CTE_FilteredOrdini
        WHERE Year = @year
    ),
    -- Calcolo dei dati principali per ciascun Point e ciascun Year/Month
    CTE_PerPoint AS (
        SELECT 
            p.Agente,
            CAST(ym.Year AS VARCHAR(4)) + '/' + RIGHT('00' + CAST(ym.Month AS VARCHAR(2)), 2) AS AnnoMese,
            p.Point,
            
            -- FISSI TOTALI
            COUNT(CASE WHEN fo.TIPO_Fastweb = 'FISSO' THEN 1 END) AS FISSI,
            
            -- FISSI PER TIPOLOGIA
            COUNT(CASE WHEN fo.TIPO_Fastweb = 'FISSO' AND fo.FissoOfferta LIKE '%Casa Start%' THEN 1 END) AS FissoStart,
            COUNT(CASE WHEN fo.TIPO_Fastweb = 'FISSO' AND fo.FissoOfferta LIKE '%Casa Pro%' THEN 1 END) AS FissoPro,
            COUNT(CASE WHEN fo.TIPO_Fastweb = 'FISSO' AND fo.FissoOfferta LIKE '%Casa Ultra%' THEN 1 END) AS FissoUltra,
            
            -- MOBILI TOTALI
            COUNT(CASE WHEN fo.TIPO_Fastweb = 'MOBILE' THEN 1 END) AS MOBILI,
            
            -- MOBILI PER TIPOLOGIA
            COUNT(CASE WHEN fo.TIPO_Fastweb = 'MOBILE' AND fo.MobileOfferta LIKE '%Mobile Start%' THEN 1 END) AS MobileStart,
            COUNT(CASE WHEN fo.TIPO_Fastweb = 'MOBILE' AND fo.MobileOfferta LIKE '%Mobile Pro%' THEN 1 END) AS MobilePro,
            COUNT(CASE WHEN fo.TIPO_Fastweb = 'MOBILE' AND fo.MobileOfferta LIKE '%Mobile Ultra%' THEN 1 END) AS MobileUltra,
            
            -- MOBILI CON RICARICA AUTOMATICA
            COUNT(CASE WHEN fo.TIPO_Fastweb = 'MOBILE' AND fo.TipoRicarica = 'Automatica' THEN 1 END) AS MobileRA,
            
            -- % RICARICA AUTOMATICA (calcolata dopo)
            CASE 
                WHEN COUNT(CASE WHEN fo.TIPO_Fastweb = 'MOBILE' THEN 1 END) > 0 
                THEN CAST(COUNT(CASE WHEN fo.TIPO_Fastweb = 'MOBILE' AND fo.TipoRicarica = 'Automatica' THEN 1 END) AS FLOAT) 
                     / COUNT(CASE WHEN fo.TIPO_Fastweb = 'MOBILE' THEN 1 END) * 100
                ELSE 0 
            END AS MobilePercentRA,
            
            -- MOBILI PER SEGMENTO
            COUNT(CASE WHEN fo.TIPO_Fastweb = 'MOBILE' AND fo.Segmento = 'RES' THEN 1 END) AS [MOBILI RES],
            COUNT(CASE WHEN fo.TIPO_Fastweb = 'MOBILE' AND fo.Segmento = 'SHP' THEN 1 END) AS [MOBILI BUS],
            
            -- FISSI PER SEGMENTO
            COUNT(CASE WHEN fo.TIPO_Fastweb = 'FISSO' AND fo.Segmento = 'RES' THEN 1 END) AS [FISSI RES],
            COUNT(CASE WHEN fo.TIPO_Fastweb = 'FISSO' AND fo.Segmento = 'SHP' THEN 1 END) AS [FISSI BUS],
            
            -- CONVERGENZE
            SUM(CASE WHEN fo.TIPO_Fastweb = 'MOBILE' AND fo.TipoOrdine = 'FISSO E MOBILE' AND fo.Segmento = 'RES' THEN 1 ELSE 0 END) AS [di cui CONV_RES],
            SUM(CASE WHEN fo.TIPO_Fastweb = 'MOBILE' AND fo.TipoOrdine = 'FISSO E MOBILE' AND fo.Segmento = 'SHP' THEN 1 ELSE 0 END) AS [di cui CONV_BUS],
            
            -- ENERGY TOTALE (conta solo righe distinte per evitare duplicati dal join)
            COUNT(DISTINCT CASE WHEN en.ComsyCode IS NOT NULL THEN en.ComsyCode + '|' + en.OffertaEnergy END) AS ENERGY,
            
            -- ENERGY PER TIPOLOGIA (conta solo righe distinte)
            COUNT(DISTINCT CASE 
                WHEN en.OffertaEnergy IN ('MONO Fastweb Energia Flat Full', 'MONO Fastweb Energia Flat Light', 'MONO Fastweb Energia Flat Maxi') 
                THEN en.ComsyCode + '|' + en.OffertaEnergy
            END) AS EnergyCore,
            COUNT(DISTINCT CASE WHEN en.OffertaEnergy = 'MONO Fastweb Energia Flex' THEN en.ComsyCode + '|' + en.OffertaEnergy END) AS EnergyFlex,
            COUNT(DISTINCT CASE WHEN en.OffertaEnergy = 'MONO Fastweb Energia Fix' THEN en.ComsyCode + '|' + en.OffertaEnergy END) AS EnergyFix,
            
            FORMAT(CONVERT(DATE, MAX(fo.Batch), 120), 'dd/MM/yyyy') AS DataAggiornamento
        FROM CTE_AllPoints AS p
        CROSS JOIN CTE_YearMonths AS ym
        LEFT JOIN CTE_FilteredOrdini AS fo 
            ON ((fo.[Codice Comsy Tecnico Attuale] = p.COMSY1 AND p.COMSY1 LIKE 'NR.1217%')
             OR (fo.[Codice Comsy Tecnico Attuale] = p.COMSY2 AND p.COMSY2 LIKE 'NS.1638%'))
            AND fo.Year = ym.Year
            AND fo.Month = ym.Month
        LEFT JOIN CTE_Energy AS en
            ON ((en.ComsyCode = p.COMSY1 AND p.COMSY1 LIKE 'NR.1217%')
             OR (en.ComsyCode = p.COMSY2 AND p.COMSY2 LIKE 'NS.1638%'))
            AND en.Year = ym.Year
            AND en.Month = ym.Month
        GROUP BY 
            p.Agente,
            CAST(ym.Year AS VARCHAR(4)) + '/' + RIGHT('00' + CAST(ym.Month AS VARCHAR(2)), 2),
            p.Point
    )

    -- Query finale con UNION per aggiungere i totali mensili
    SELECT 
        Agente,
        AnnoMese,
        Point,
        FISSI,
        FissoStart,
        FissoPro,
        FissoUltra,
        MOBILI,
        MobileStart,
        MobilePro,
        MobileUltra,
        MobileRA,
        CAST(ROUND(MobilePercentRA, 2) AS DECIMAL(5,2)) AS MobilePercentRA,
        [MOBILI RES],
        [MOBILI BUS],
        [FISSI RES],
        [FISSI BUS],
        [di cui CONV_RES],
        [di cui CONV_BUS],
        ENERGY,
        EnergyCore,
        EnergyFlex,
        EnergyFix,
        DataAggiornamento
    FROM CTE_PerPoint

    UNION ALL

    SELECT 
        NULL AS Agente, 
        CAST(Year AS VARCHAR(4)) + '/' + RIGHT('00' + CAST(Month AS VARCHAR(2)), 2) AS AnnoMese,
        'TOTALE ' + UPPER(DATENAME(MONTH, DATEFROMPARTS(Year, Month, 1))) AS Point,
        SUM(FISSI) AS FISSI,
        SUM(FissoStart) AS FissoStart,
        SUM(FissoPro) AS FissoPro,
        SUM(FissoUltra) AS FissoUltra,
        SUM(MOBILI) AS MOBILI,
        SUM(MobileStart) AS MobileStart,
        SUM(MobilePro) AS MobilePro,
        SUM(MobileUltra) AS MobileUltra,
        SUM(MobileRA) AS MobileRA,
        CAST(ROUND(
            CASE 
                WHEN SUM(MOBILI) > 0 
                THEN (CAST(SUM(MobileRA) AS FLOAT) / SUM(MOBILI)) * 100
                ELSE 0 
            END, 2) AS DECIMAL(5,2)) AS MobilePercentRA,
        SUM([MOBILI RES]) AS [MOBILI RES],
        SUM([MOBILI BUS]) AS [MOBILI BUS],
        SUM([FISSI RES]) AS [FISSI RES],
        SUM([FISSI BUS]) AS [FISSI BUS],
        SUM([di cui CONV_RES]) AS [di cui CONV_RES],
        SUM([di cui CONV_BUS]) AS [di cui CONV_BUS],
        SUM(ENERGY) AS ENERGY,
        SUM(EnergyCore) AS EnergyCore,
        SUM(EnergyFlex) AS EnergyFlex,
        SUM(EnergyFix) AS EnergyFix,
        NULL AS DataAggiornamento
    FROM CTE_PerPoint
    CROSS APPLY (
        SELECT 
            CAST(LEFT(AnnoMese, 4) AS INT) AS Year,
            CAST(RIGHT(AnnoMese, 2) AS INT) AS Month
    ) AS ExtractedDate
    GROUP BY Year, Month
    ORDER BY 
        AnnoMese DESC,
        [MOBILI RES] DESC;
END;
GO
