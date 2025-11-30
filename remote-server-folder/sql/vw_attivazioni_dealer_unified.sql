USE [KAM]
GO

/****** Object:  View [dbo].[vw_attivazioni_dealer_unified]    Script Date: 22/11/2025 11:23:28 ******/
SET ANSI_NULLS ON
GO

SET QUOTED_IDENTIFIER ON
GO


-- Usa ALTER invece di DROP + CREATE
CREATE OR ALTER   VIEW [dbo].[vw_attivazioni_dealer_unified]
AS
WITH tlc_base AS (
    SELECT i.*, TRY_CONVERT(date, i.[Batch], 23) AS BatchDate, DATEFROMPARTS(YEAR(TRY_CONVERT(date, i.[Batch], 23)), MONTH(TRY_CONVERT(date, i.[Batch], 23)), 1) AS MS
    FROM dbo.InseritoFW i WHERE TRY_CONVERT(date, i.[Batch], 23) IS NOT NULL
), energy_base AS (
    SELECT e.*, TRY_CONVERT(date, e.[Batch], 23) AS BatchDate, DATEFROMPARTS(YEAR(TRY_CONVERT(date, e.[Batch], 23)), MONTH(TRY_CONVERT(date, e.[Batch], 23)), 1) AS MS
    FROM dbo.FWEnergiaImporter e WHERE TRY_CONVERT(date, e.[Batch], 23) IS NOT NULL
), last_batch_tlc AS ( 
    SELECT MS, MAX(BatchDate) AS lb_date FROM tlc_base GROUP BY MS
), last_batch_energy AS ( 
    SELECT MS, MAX(BatchDate) AS lb_date FROM energy_base GROUP BY MS
), fw_tlc_raw AS ( 
    SELECT b.* FROM tlc_base b JOIN last_batch_tlc lb ON lb.MS = b.MS AND lb.lb_date = b.BatchDate
), fw_tlc_norm AS (
    SELECT
        d.IDDealer, r.MS AS MonthStart, 'FASTWEB' AS Operatore,
        CASE
            WHEN UPPER(LTRIM(RTRIM(r.[Tipo Ordine]))) IN ('FISSO','FIX','FTTH','FTTC','ADSL') THEN 'FISSO'
            WHEN UPPER(LTRIM(RTRIM(r.[Tipo Ordine]))) = 'MOBILE' THEN 'MOBILE'
            WHEN UPPER(LTRIM(RTRIM(r.[Tipo Ordine]))) IN ('FISSO E MOBILE','FISSO&MOBILE','FISSO/MOBILE','FISSO E  MOBILE') THEN
                CASE WHEN UPPER(LTRIM(RTRIM(p.[TIPO_Fastweb])))='FISSO'  THEN 'FISSO' WHEN UPPER(LTRIM(RTRIM(p.[TIPO_Fastweb])))='MOBILE' THEN 'MOBILE' ELSE 'ALTRO' END
            ELSE 'ALTRO'
        END AS Categoria,
        CASE WHEN r.Segmento = 'SHP' THEN 'SHP' ELSE 'RES' END AS Segmento,
        CAST(CASE WHEN UPPER(LTRIM(RTRIM(r.[tipo ricarica])))='AUTOMATICA' THEN 1 ELSE 0 END AS bit) AS IsRA,
        CASE WHEN UPPER(LTRIM(RTRIM(r.[Tipo Ordine]))) IN ('FISSO E MOBILE','FISSO&MOBILE','FISSO/MOBILE','FISSO E  MOBILE') THEN 1 ELSE 0 END AS InConvergenza,
        UPPER(LTRIM(RTRIM(r.[Valore]))) AS SottoVoce,
        CAST(1 AS int) AS Qty,
        r.BatchDate AS DataAttivazione,
        r.[usim flag mnp] AS MNP_Operator,
        CAST(CASE WHEN NULLIF(LTRIM(RTRIM(r.[usim flag mnp])), '') IS NOT NULL THEN 1 ELSE 0 END AS bit) AS IsMNP,
        CAST(NULL AS nvarchar(100)) AS ModalitaPagamento,
        CAST(NULL AS nvarchar(100)) AS TipoContratto
    FROM fw_tlc_raw r
    LEFT JOIN dbo.tbPianiFastweb p ON UPPER(LTRIM(RTRIM(p.[VALORE]))) = UPPER(LTRIM(RTRIM(r.[Valore])))
    CROSS APPLY (SELECT TOP (1) t.IDDealer FROM dbo.TbDealers t WHERE (UPPER(LTRIM(RTRIM(r.[Codice Comsy Tecnico Attuale]))) IN (UPPER(LTRIM(RTRIM(t.COMSY1))), UPPER(LTRIM(RTRIM(t.COMSY2))))) OR (((UPPER(LTRIM(RTRIM(r.[Codice Comsy Tecnico Attuale]))) LIKE 'NR.1217.0601NA.C%' OR UPPER(LTRIM(RTRIM(r.[Codice Comsy Tecnico Attuale]))) LIKE 'NS.1638.0601NA.C%') AND CHARINDEX('.C', UPPER(LTRIM(RTRIM(r.[Codice Comsy Tecnico Attuale])))) > 0 AND SUBSTRING(UPPER(LTRIM(RTRIM(r.[Codice Comsy Tecnico Attuale]))), CHARINDEX('.C', UPPER(LTRIM(RTRIM(r.[Codice Comsy Tecnico Attuale])))) + 2, 100) IN (CASE WHEN t.COMSY1 LIKE 'NR.1217.0601NA.C%' AND CHARINDEX('.C', t.COMSY1) > 0 THEN SUBSTRING(t.COMSY1, CHARINDEX('.C', t.COMSY1)+2, 100) END, CASE WHEN t.COMSY2 LIKE 'NS.1638.0601NA.C%' AND CHARINDEX('.C', t.COMSY2) > 0 THEN SUBSTRING(t.COMSY2, CHARINDEX('.C', t.COMSY2)+2, 100) END)))) d
    WHERE CASE WHEN UPPER(LTRIM(RTRIM(r.[Tipo Ordine]))) IN ('FISSO','FIX','FTTH','FTTC','ADSL') THEN 'FISSO' WHEN UPPER(LTRIM(RTRIM(r.[Tipo Ordine]))) = 'MOBILE' THEN 'MOBILE' WHEN UPPER(LTRIM(RTRIM(r.[Tipo Ordine]))) IN ('FISSO E MOBILE','FISSO&MOBILE','FISSO/MOBILE','FISSO E  MOBILE') THEN CASE WHEN UPPER(LTRIM(RTRIM(p.[TIPO_Fastweb])))='FISSO'  THEN 'FISSO' WHEN UPPER(LTRIM(RTRIM(p.[TIPO_Fastweb])))='MOBILE' THEN 'MOBILE' ELSE 'ALTRO' END ELSE 'ALTRO' END IN ('FISSO','MOBILE')
),
fw_energy_raw AS (
    SELECT b.* FROM energy_base b JOIN last_batch_energy lb ON lb.MS = b.MS AND lb.lb_date = b.BatchDate
    WHERE UPPER(ISNULL(b.[Nome Offerta Vendita],'')) NOT LIKE '%PLACET%'
),
fw_energy_norm AS (
    SELECT
        d.IDDealer, r.MS AS MonthStart, 'FASTWEB' AS Operatore, 'ENERGIA' AS Categoria,
        CASE WHEN r.Segmento = 'SHP' THEN 'SHP' ELSE 'RES' END AS Segmento,
        CAST(0 AS int) AS IsRA, CAST(0 AS int) AS InConvergenza,
        r.[Nome Offerta Vendita] AS SottoVoce, CAST(1 AS int) AS Qty,
        NULL AS DataAttivazione,
        NULL AS MNP_Operator, CAST(0 AS bit) AS IsMNP,
        CAST(NULL AS nvarchar(100)) AS ModalitaPagamento,
        CAST(NULL AS nvarchar(100)) AS TipoContratto
    FROM fw_energy_raw r
    CROSS APPLY (SELECT TOP (1) t.IDDealer FROM dbo.TbDealers t WHERE (UPPER(LTRIM(RTRIM(r.[Codice Comsy/Order Owner (Report!DBSELLER)]))) IN (UPPER(LTRIM(RTRIM(t.COMSY1))), UPPER(LTRIM(RTRIM(t.COMSY2))))) OR (((UPPER(LTRIM(RTRIM(r.[Codice Comsy/Order Owner (Report!DBSELLER)]))) LIKE 'NR.1217.0601NA.C%' OR UPPER(LTRIM(RTRIM(r.[Codice Comsy/Order Owner (Report!DBSELLER)]))) LIKE 'NS.1638.0601NA.C%') AND CHARINDEX('.C', UPPER(LTRIM(RTRIM(r.[Codice Comsy/Order Owner (Report!DBSELLER)])))) > 0 AND SUBSTRING(UPPER(LTRIM(RTRIM(r.[Codice Comsy/Order Owner (Report!DBSELLER)]))), CHARINDEX('.C', UPPER(LTRIM(RTRIM(r.[Codice Comsy/Order Owner (Report!DBSELLER)])))) + 2, 100) IN (CASE WHEN t.COMSY1 LIKE 'NR.1217.0601NA.C%' AND CHARINDEX('.C', t.COMSY1) > 0 THEN SUBSTRING(t.COMSY1, CHARINDEX('.C', t.COMSY1)+2, 100) END, CASE WHEN t.COMSY2 LIKE 'NS.1638.0601NA.C%' AND CHARINDEX('.C', t.COMSY2) > 0 THEN SUBSTRING(t.COMSY2, CHARINDEX('.C', t.COMSY2)+2, 100) END)))) d
),
eni_plenitude_norm AS (
    SELECT
        o.idDealer AS IDDealer,
        o.MonthStart,
        'ENI PLENITUDE' AS Operatore,
        'ENERGIA' AS Categoria,
        ofr.Segmento,
        CAST(0 AS int) AS IsRA,
        CAST(0 AS int) AS InConvergenza,
        ofr.Titolo AS SottoVoce,
        CAST(1 AS int) AS Qty,
        TRY_CONVERT(date, o.DataOra) AS DataAttivazione,
        NULL AS MNP_Operator,
        CAST(0 AS bit) AS IsMNP,
        JSON_VALUE(do.Payload, '$.modalita_pagamento') AS ModalitaPagamento,
        JSON_VALUE(do.Payload, '$.tipo_contratto') AS TipoContratto
    FROM dbo.tbOrdini o
    JOIN dbo.tbOfferte ofr ON o.idOfferta = ofr.IDOfferta
    LEFT JOIN dbo.tbDatiOrdine do ON do.IDOrdine = o.IDOrdine
    WHERE ofr.idOperatore = 16
      AND ofr.Tipo = 'ENERGIA'
      AND o.Stato IN (2, 3)
      AND ofr.IDOfferta NOT IN (526)
),
ui_norm_filtered AS (
    SELECT IDDealer, MonthStart, Operatore, Categoria, Segmento, IsRA, InConvergenza, SottoVoce, Qty,
           NULL AS DataAttivazione,
           NULL AS MNP_Operator, CAST(0 AS bit) AS IsMNP,
           CAST(NULL AS nvarchar(100)) AS ModalitaPagamento,
           CAST(NULL AS nvarchar(100)) AS TipoContratto
    FROM dbo.vw_ordini_ui_normalized WHERE Operatore <> 'FASTWEB'
)
SELECT IDDealer, MonthStart, Operatore, Categoria, Segmento, IsRA, InConvergenza, SottoVoce, Qty, DataAttivazione, MNP_Operator, IsMNP, ModalitaPagamento, TipoContratto FROM fw_tlc_norm
UNION ALL
SELECT IDDealer, MonthStart, Operatore, Categoria, Segmento, IsRA, InConvergenza, SottoVoce, Qty, DataAttivazione, MNP_Operator, IsMNP, ModalitaPagamento, TipoContratto FROM fw_energy_norm
UNION ALL
SELECT IDDealer, MonthStart, Operatore, Categoria, Segmento, IsRA, InConvergenza, SottoVoce, Qty, DataAttivazione, MNP_Operator, IsMNP, ModalitaPagamento, TipoContratto FROM eni_plenitude_norm
UNION ALL
SELECT IDDealer, MonthStart, Operatore, Categoria, Segmento, IsRA, InConvergenza, SottoVoce, Qty, DataAttivazione, MNP_Operator, IsMNP, ModalitaPagamento, TipoContratto FROM ui_norm_filtered;
GO


