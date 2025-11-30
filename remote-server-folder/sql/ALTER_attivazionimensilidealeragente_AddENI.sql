USE [KAM]
GO

ALTER PROCEDURE dbo.attivazionimensilidealeragente  
    @Agente NVARCHAR(100),  
    @Anno   INT,  
    @Mese   INT  
AS  
BEGIN  
    SET NOCOUNT ON;  
  
    DECLARE @StartOfMonth DATE     = DATEFROMPARTS(@Anno, @Mese, 1);  
    DECLARE @StartOfNextMonth DATE = DATEADD(MONTH, 1, @StartOfMonth);

    -- ========================================
    -- LOGICA SPECIALE PER GABRIELE
    -- ========================================
    IF @Agente = 'GABRIELE'
    BEGIN
        -- GABRIELE usa tbGabrieleIntegrazione per TLC
        SELECT
            d.RagioneSociale AS [DealerName],
            ISNULL(g.Fisso, 0) AS [FW FISSI],
            ISNULL(g.Mobile, 0) AS [FW MOBILI],
            -- FW ENERGY: usa la logica normale (batch), NON tbGabrieleIntegrazione
            ISNULL((
                SELECT COUNT(1)
                FROM dbo.FWEnergiaImporter e
                WHERE UPPER(REPLACE(REPLACE(REPLACE(LTRIM(RTRIM(e.[Codice Comsy/Order Owner (Report!DBSELLER)])),' ',''),'.',''),'-',''))
                      IN (UPPER(REPLACE(REPLACE(REPLACE(LTRIM(RTRIM(d.COMSY1)),' ',''),'.',''),'-','')),
                          UPPER(REPLACE(REPLACE(REPLACE(LTRIM(RTRIM(d.COMSY2)),' ',''),'.',''),'-','')))
                  AND e.Batch >= @StartOfMonth 
                  AND e.Batch < @StartOfNextMonth
            ), 0) AS [FW ENERGY],
            -- ENI da tbOrdini
            ISNULL((
                SELECT COUNT(*)
                FROM dbo.tbOrdini o
                INNER JOIN dbo.tbOfferte ofr ON ofr.idOfferta = o.idOfferta
                WHERE ofr.idOperatore = 16
                  AND o.idDealer = d.IDDealer
                  AND o.DataStato >= @StartOfMonth 
                  AND o.DataStato < @StartOfNextMonth
            ), 0) AS [ENI],
            0 AS [SKY]
        FROM dbo.tbDealers d
        LEFT JOIN dbo.tbGabrieleIntegrazione g 
            ON g.IDDealer = d.IDDealer 
            AND g.Anno = @Anno 
            AND g.Mese = @Mese
        WHERE d.AGENTE = @Agente
        ORDER BY (ISNULL(g.Fisso, 0) + ISNULL(g.Mobile, 0) + ISNULL(g.Energia, 0) + 
                  ISNULL((SELECT COUNT(*) FROM dbo.tbOrdini o INNER JOIN dbo.tbOfferte ofr ON ofr.idOfferta = o.idOfferta WHERE ofr.idOperatore = 16 AND o.idDealer = d.IDDealer AND o.DataStato >= @StartOfMonth AND o.DataStato < @StartOfNextMonth), 0)) DESC,
                 d.RagioneSociale;
        RETURN;
    END  
  
    -- Ultimo batch Fastweb (FW FISSI/MOBILI) nel periodo  
    DECLARE @LastFWBatch DATETIME;  
    SELECT @LastFWBatch = MAX(Batch)  
    FROM dbo.InseritoFW  
    WHERE Batch >= @StartOfMonth AND Batch < @StartOfNextMonth;  
  
    -- Ultimo batch Energy nel periodo (tabella FWEnergiaImporter, colonna Batch)  
    DECLARE @LastEnergyBatch DATETIME;  
    SELECT @LastEnergyBatch = MAX(Batch)  
    FROM dbo.FWEnergiaImporter  
    WHERE Batch >= @StartOfMonth AND Batch < @StartOfNextMonth;  
  
    ;WITH DealersMap AS (  
        SELECT  
            d.IDDealer,  
            d.RagioneSociale AS DealerName,  
            -- normalizzo i COMSY solo lato dealer (più leggero)  
            COMSY1N = UPPER(REPLACE(REPLACE(REPLACE(LTRIM(RTRIM(d.Comsy1)),' ',''),'.',''),'-','')),  
            COMSY2N = UPPER(REPLACE(REPLACE(REPLACE(LTRIM(RTRIM(d.Comsy2)),' ',''),'.',''),'-',''))  
        FROM dbo.tbDealers d  
        WHERE d.AGENTE = @Agente  
    ),  
  
    /* =======================  
       FASTWEB: Fissi / Mobili  
       ======================= */  
    ClassificatiFW AS (  
        SELECT  
            i.[Codice Comsy Tecnico Attuale],  
            Categoria =  
                CASE  
                    WHEN UPPER(i.[Tipo Ordine]) LIKE '%FISSO E MOBILE%'  
                        THEN pf.TIPO_Fastweb                       -- disambigua via piano  
                    WHEN UPPER(i.[Tipo Ordine]) LIKE '%FISSO%'  
                        THEN 'FISSO'  
                    WHEN UPPER(i.[Tipo Ordine]) LIKE '%MOBILE%'  
                        THEN 'MOBILE'  
                    ELSE pf.TIPO_Fastweb                           -- fallback (Tipo Ordine nullo/altro)  
                END  
        FROM dbo.InseritoFW i  
        LEFT JOIN dbo.tbPianiFastweb pf  
            ON LTRIM(RTRIM(i.Valore)) COLLATE Latin1_General_CI_AI  
             = LTRIM(RTRIM(pf.Valore)) COLLATE Latin1_General_CI_AI  
        WHERE @LastFWBatch IS NOT NULL  
          AND i.Batch = @LastFWBatch  
    ),  
    AggFW AS (  
        SELECT  
            dm.DealerName,  
            [FW FISSI]  = SUM(CASE WHEN c.Categoria = 'FISSO'  THEN 1 ELSE 0 END),  
            [FW MOBILI] = SUM(CASE WHEN c.Categoria = 'MOBILE' THEN 1 ELSE 0 END)  
        FROM DealersMap dm  
        LEFT JOIN ClassificatiFW c  
               ON UPPER(REPLACE(REPLACE(REPLACE(LTRIM(RTRIM(c.[Codice Comsy Tecnico Attuale])),' ',''),'.',''),'-',''))  
                  IN (dm.COMSY1N, dm.COMSY2N)  
        GROUP BY dm.DealerName  
    ),  
  
    /* ==============  
       FW ENERGY  
       ============== */  
    AggEnergy AS (  
        SELECT  
            dm.DealerName,  
            [FW ENERGY] = COUNT(1)  
        FROM DealersMap dm  
        INNER JOIN dbo.FWEnergiaImporter e  
            ON UPPER(REPLACE(REPLACE(REPLACE(LTRIM(RTRIM(e.[Codice Comsy/Order Owner (Report!DBSELLER)])),' ',''),'.',''),'-',''))  
               IN (dm.COMSY1N, dm.COMSY2N)  
        WHERE @LastEnergyBatch IS NOT NULL  
          AND e.Batch = @LastEnergyBatch  
        GROUP BY dm.DealerName  
    ),  
  
    /* ==================
       ENI (TUTTI GLI STATI)
       ================== */
    AggENI AS (
        SELECT
            dm.DealerName,
            [ENI] = COUNT(1)
        FROM DealersMap dm
        INNER JOIN dbo.tbOrdini o
            ON o.idDealer = dm.IDDealer
        INNER JOIN dbo.tbOfferte ofr
            ON ofr.idOfferta = o.idOfferta
        WHERE o.DataStato >= @StartOfMonth AND o.DataStato < @StartOfNextMonth
          AND ofr.idOperatore = 16
          -- NESSUN FILTRO SU o.Stato (conta tutti gli stati)
        GROUP BY dm.DealerName
    ),

    /* =====  
       SKY  
       ===== */  
    AggSky AS (  
        SELECT  
            dm.DealerName,  
            [SKY] = COUNT(1)  
        FROM DealersMap dm  
        INNER JOIN dbo.tbOrdini o  
            ON o.idDealer = dm.IDDealer  
        INNER JOIN dbo.tbOfferte ofr  
            ON ofr.idOfferta = o.idOfferta  
        WHERE o.DataOra >= @StartOfMonth AND o.DataOra < @StartOfNextMonth  
          AND ofr.idOperatore IN (3,8,12,14)  
          AND o.Stato = 1  
        GROUP BY dm.DealerName  
    )  
  
    -- ======== OUTPUT FINALE ========  
    SELECT  
        dm.DealerName AS [DealerName],  
        ISNULL(fw.[FW FISSI],0)   AS [FW FISSI],  
        ISNULL(fw.[FW MOBILI],0)  AS [FW MOBILI],  
        ISNULL(en.[FW ENERGY],0)  AS [FW ENERGY],  
        ISNULL(eni.[ENI],0)       AS [ENI],
        ISNULL(sk.[SKY],0)        AS [SKY]  
    FROM DealersMap dm  
    LEFT JOIN AggFW     fw  ON fw.DealerName  = dm.DealerName  
    LEFT JOIN AggEnergy en  ON en.DealerName  = dm.DealerName  
    LEFT JOIN AggENI    eni ON eni.DealerName = dm.DealerName
    LEFT JOIN AggSky    sk  ON sk.DealerName  = dm.DealerName  
    ORDER BY (ISNULL(fw.[FW FISSI],0) + ISNULL(fw.[FW MOBILI],0) + ISNULL(en.[FW ENERGY],0) + ISNULL(eni.[ENI],0) + ISNULL(sk.[SKY],0)) DESC,  
             dm.DealerName;  
END
GO
