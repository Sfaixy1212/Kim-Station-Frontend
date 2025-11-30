USE [KAM]
GO

/****** Object:  View [dbo].[vw_compensi_agenti_mese_compensi]    Script Date: 15/11/2025 08:21:43 ******/
SET ANSI_NULLS ON
GO

SET QUOTED_IDENTIFIER ON
GO


CREATE OR ALTER     VIEW [dbo].[vw_compensi_agenti_mese_compensi]
AS
/* =========================
   BASE KPI (mese × agente) dalla vista aggregata
   ========================= */
WITH B AS (
    SELECT
        MonthStart,
        MESE_LABEL,
        Agente,
        /* KPI Fastweb */
        FW_FISSI_QTY,
        FW_RA_SIMS_QTY,
        FW_CONV_RA,
        FW_ONLYMOB_RA,
        /* Energy / Sky */
        FW_ENERGY_QTY,
        SKY_QTY,
        /* SIM vendute */
        SIM_FASTWEB_QTY,
        SIM_ILIAD_QTY,
        SIM_1MOBILE_QTY,
        SIM_SKY_QTY,
        SIM_KENA_QTY,
        TOT_SIM_QTY
    FROM dbo.vw_compensi_agenti_mese_agg
),
/* =========================
   TOTALE MOBILE (RA + PURA) dal dettaglio last-day
   ========================= */
MOB_TOT AS (
    SELECT
        MonthStart,
        Agente,
        COUNT(*)                                              AS MOBILE_TOT_QTY,
        SUM(CASE WHEN TipoRicaNorm='PURA' THEN 1 ELSE 0 END) AS MOBILE_PURA_QTY,
        SUM(CASE WHEN TipoRicaNorm='RA'   THEN 1 ELSE 0 END) AS MOBILE_RA_QTY
    FROM dbo.vw_compensi_agenti_full_dettaglio
    WHERE TIPO='MOBILE'
    GROUP BY MonthStart, Agente
),
/* =========================
   RA per Famiglia / Convergenza (last-day)
   (mappo RA -> AUTOMATICA per match alla cfg)
   ========================= */
RA_SRC AS (
    SELECT
        MonthStart,
        Agente,
        CASE
            WHEN OffertaMOBILE_RAW IN ('FASTWEB MOBILE BUSINESS','FASTWEB MOBILE BUSINESS UNLIMITED','FASTWEB MOBILE BUSINESS FREEDOM') THEN 'BUSINESS'
            WHEN OffertaMOBILE_RAW IN ('FASTWEB MOBILE ULTRA','FASTWEB MOBILE MAXI') THEN 'MAXI'
            WHEN OffertaMOBILE_RAW IN ('FASTWEB MOBILE PRO','FASTWEB MOBILE FULL','FASTWEB MOBILE FULL+','FASTWEB MOBILE FULL PLUS') THEN 'FULL'
            ELSE 'FW MOBILE'
        END AS FamigliaMobile,
        CASE WHEN IsConvergenzaMobile = 1 THEN 1 ELSE 0 END AS InConvergenza,
        CASE WHEN TipoRicaNorm = 'RA' THEN 'AUTOMATICA' ELSE 'PURA' END AS TipoRicaricaMatch,
        COUNT(*) AS Qty
    FROM dbo.vw_compensi_agenti_full_dettaglio
    WHERE TIPO = 'MOBILE' AND TipoRicaNorm IN ('RA','PURA')
    GROUP BY
        MonthStart, Agente,
        CASE
            WHEN OffertaMOBILE_RAW IN ('FASTWEB MOBILE BUSINESS','FASTWEB MOBILE BUSINESS UNLIMITED','FASTWEB MOBILE BUSINESS FREEDOM') THEN 'BUSINESS'
            WHEN OffertaMOBILE_RAW IN ('FASTWEB MOBILE ULTRA','FASTWEB MOBILE MAXI') THEN 'MAXI'
            WHEN OffertaMOBILE_RAW IN ('FASTWEB MOBILE PRO','FASTWEB MOBILE FULL','FASTWEB MOBILE FULL+','FASTWEB MOBILE FULL PLUS') THEN 'FULL'
            ELSE 'FW MOBILE'
        END,
        CASE WHEN IsConvergenzaMobile = 1 THEN 1 ELSE 0 END,
        CASE WHEN TipoRicaNorm = 'RA' THEN 'AUTOMATICA' ELSE 'PURA' END
),
/* =========================
   Valorizzazione RA (precedenza: Agente > ALL)
   ========================= */
RA_VAL AS (
    SELECT
        r.MonthStart,
        r.Agente,
        SUM( r.Qty * COALESCE(c.EuroUnit, 0) ) AS EURO_FW_RA
    FROM RA_SRC r
    OUTER APPLY (
        SELECT TOP (1) c.*
        FROM dbo.cfg_compensi_agente c
        WHERE c.IsActive   = 1
          AND c.MonthStart = r.MonthStart
          AND c.Categoria  = 'FW_RA'
          AND (c.Agente = r.Agente OR c.Agente = 'ALL')
          AND COALESCE(c.FamigliaMobile, r.FamigliaMobile) = r.FamigliaMobile
          AND COALESCE(c.TipoRicarica,   r.TipoRicaricaMatch) = r.TipoRicaricaMatch
          AND COALESCE(c.InConvergenza,  r.InConvergenza)    = r.InConvergenza
        ORDER BY CASE WHEN c.Agente = r.Agente THEN 1 ELSE 0 END DESC
    ) c
    GROUP BY r.MonthStart, r.Agente
),
/* =========================
   PRODOTTO (FW_ENERGY, FW_FISSO, SKY_CORE)
   ========================= */
PROD_VAL AS (
    SELECT
        b.MonthStart,
        b.Agente,
        CAST(COALESCE(b.FW_ENERGY_QTY,0) * COALESCE(c_energy.EuroUnit,0) AS decimal(18,2)) +
        CAST(COALESCE(b.FW_FISSI_QTY, 0) * COALESCE(c_fisso.EuroUnit ,0) AS decimal(18,2)) +
        CAST(COALESCE(b.SKY_QTY,     0) * COALESCE(c_sky  .EuroUnit ,0) AS decimal(18,2)) AS EURO_PRODOTTO
    FROM B b
    OUTER APPLY (
        SELECT TOP (1) EuroUnit FROM dbo.cfg_compensi_agente c
        WHERE c.IsActive=1 AND c.MonthStart=b.MonthStart
          AND c.Categoria='PRODOTTO' AND c.SottoVoce='FW_ENERGY'
          AND (c.Agente=b.Agente OR c.Agente='ALL')
        ORDER BY CASE WHEN c.Agente=b.Agente THEN 1 ELSE 0 END DESC
    ) c_energy
    OUTER APPLY (
        SELECT TOP (1) EuroUnit FROM dbo.cfg_compensi_agente c
        WHERE c.IsActive=1 AND c.MonthStart=b.MonthStart
          AND c.Categoria='PRODOTTO' AND c.SottoVoce='FW_FISSO'
          AND (c.Agente=b.Agente OR c.Agente='ALL')
        ORDER BY CASE WHEN c.Agente=b.Agente THEN 1 ELSE 0 END DESC
    ) c_fisso
    OUTER APPLY (
        SELECT TOP (1) EuroUnit FROM dbo.cfg_compensi_agente c
        WHERE c.IsActive=1 AND c.MonthStart=b.MonthStart
          AND c.Categoria='PRODOTTO' AND c.SottoVoce='SKY_CORE'
          AND (c.Agente=b.Agente OR c.Agente='ALL')
        ORDER BY CASE WHEN c.Agente=b.Agente THEN 1 ELSE 0 END DESC
    ) c_sky
),
/* =========================
   SIM_BASE (FASTWEB, ILIAD, 1MOBILE, SKY, KENA)
   ========================= */
SIM_VAL AS (
    SELECT
        b.MonthStart,
        b.Agente,
        CAST(COALESCE(b.SIM_FASTWEB_QTY,0) * COALESCE(c_fw.EuroUnit,0) AS decimal(18,2)) +
        CAST(COALESCE(b.SIM_ILIAD_QTY  ,0) * COALESCE(c_il.EuroUnit,0) AS decimal(18,2)) +
        CAST(COALESCE(b.SIM_1MOBILE_QTY,0) * COALESCE(c_1m.EuroUnit,0) AS decimal(18,2)) +
        CAST(COALESCE(b.SIM_SKY_QTY    ,0) * COALESCE(c_s.EuroUnit ,0) AS decimal(18,2)) +
        CAST(COALESCE(b.SIM_KENA_QTY   ,0) * COALESCE(c_k.EuroUnit ,0) AS decimal(18,2)) AS EURO_SIM_BASE
    FROM B b
    OUTER APPLY (SELECT TOP (1) EuroUnit FROM dbo.cfg_compensi_agente c
        WHERE c.IsActive=1 AND c.MonthStart=b.MonthStart AND c.Categoria='SIM_BASE' AND c.SottoVoce='FASTWEB'
          AND (c.Agente=b.Agente OR c.Agente='ALL')
        ORDER BY CASE WHEN c.Agente=b.Agente THEN 1 ELSE 0 END DESC) c_fw
    OUTER APPLY (SELECT TOP (1) EuroUnit FROM dbo.cfg_compensi_agente c
        WHERE c.IsActive=1 AND c.MonthStart=b.MonthStart AND c.Categoria='SIM_BASE' AND c.SottoVoce='ILIAD'
          AND (c.Agente=b.Agente OR c.Agente='ALL')
        ORDER BY CASE WHEN c.Agente=b.Agente THEN 1 ELSE 0 END DESC) c_il
    OUTER APPLY (SELECT TOP (1) EuroUnit FROM dbo.cfg_compensi_agente c
        WHERE c.IsActive=1 AND c.MonthStart=b.MonthStart AND c.Categoria='SIM_BASE' AND c.SottoVoce='1MOBILE'
          AND (c.Agente=b.Agente OR c.Agente='ALL')
        ORDER BY CASE WHEN c.Agente=b.Agente THEN 1 ELSE 0 END DESC) c_1m
    OUTER APPLY (SELECT TOP (1) EuroUnit FROM dbo.cfg_compensi_agente c
        WHERE c.IsActive=1 AND c.MonthStart=b.MonthStart AND c.Categoria='SIM_BASE' AND c.SottoVoce='SKY'
          AND (c.Agente=b.Agente OR c.Agente='ALL')
        ORDER BY CASE WHEN c.Agente=b.Agente THEN 1 ELSE 0 END DESC) c_s
    OUTER APPLY (SELECT TOP (1) EuroUnit FROM dbo.cfg_compensi_agente c
        WHERE c.IsActive=1 AND c.MonthStart=b.MonthStart AND c.Categoria='SIM_BASE' AND c.SottoVoce='KENA'
          AND (c.Agente=b.Agente OR c.Agente='ALL')
        ORDER BY CASE WHEN c.Agente=b.Agente THEN 1 ELSE 0 END DESC) c_k
),
/* =========================
   BONUS (precedenza: Agente > ALL)
   ========================= */
BONUS_VAL AS (
    SELECT
        b.MonthStart,
        b.Agente,
        CAST(
            COALESCE(chosen_energy.EuroBonus,0) +
            COALESCE(chosen_fissi.EuroBonus ,0)
        AS decimal(18,2)) AS EURO_BONUS
    FROM B b
    OUTER APPLY (
        SELECT TOP (1) c.EuroBonus
        FROM dbo.cfg_compensi_agente c
        WHERE c.IsActive   = 1 AND c.MonthStart = b.MonthStart
          AND c.Categoria  = 'BONUS' AND c.SottoVoce='ENERGY'
          AND (c.Agente = b.Agente OR c.Agente = 'ALL')
          AND COALESCE(b.FW_ENERGY_QTY,0) >= COALESCE(c.Soglia, 999999)
        ORDER BY CASE WHEN c.Agente = b.Agente THEN 1 ELSE 0 END DESC
    ) chosen_energy
    OUTER APPLY (
        SELECT TOP (1) c.EuroBonus
        FROM dbo.cfg_compensi_agente c
        WHERE c.IsActive   = 1 AND c.MonthStart = b.MonthStart
          AND c.Categoria  = 'BONUS' AND c.SottoVoce='FISSI'
          AND (c.Agente = b.Agente OR c.Agente = 'ALL')
          AND COALESCE(b.FW_FISSI_QTY,0) >= COALESCE(c.Soglia, 999999)
        ORDER BY CASE WHEN c.Agente = b.Agente THEN 1 ELSE 0 END DESC
    ) chosen_fissi
),
/* =========================
   CONTRIBUTO fisso per agente/mese
   ========================= */
CONTRIB_VAL AS (
    SELECT
        b.MonthStart,
        b.Agente,
        CAST(SUM(COALESCE(c.EuroUnit,0)) AS decimal(18,2)) AS EURO_CONTRIBUTO
    FROM B b
    JOIN dbo.cfg_compensi_agente c
      ON c.IsActive   = 1
     AND c.MonthStart = b.MonthStart
     AND c.Categoria  = 'CONTRIBUTO'
     AND (c.Agente = b.Agente OR c.Agente = 'ALL')
    GROUP BY b.MonthStart, b.Agente
),
/* =========================
   BONUS MOBILE: TotSIM >= TargetTotSIM AND %RA >= TargetAutoPerc
   ========================= */
BONUS_MOBILE_AUTO AS (
    SELECT
        b.MonthStart,
        b.Agente,
        CASE
          WHEN COALESCE(b.TOT_SIM_QTY,0) >= COALESCE(r.TargetTotSIM, 999999)
           AND (1.0 * COALESCE(mob.MOBILE_RA_QTY,0)) / NULLIF(COALESCE(b.TOT_SIM_QTY,0),0) >= COALESCE(r.TargetAutoPerc,0)/100.0
          THEN COALESCE(r.EuroBonus,0.00)
          ELSE 0.00
        END AS EURO_BONUS_MOBILE_AUTO
    FROM B b
    LEFT JOIN MOB_TOT mob
           ON mob.MonthStart = b.MonthStart AND mob.Agente = b.Agente
    OUTER APPLY (
        SELECT TOP (1) r.*
        FROM dbo.cfg_bonus_mobile_auto r
        WHERE r.IsActive=1
          AND r.MonthStart = b.MonthStart
          AND (r.Agente = b.Agente OR r.Agente = N'ALL')
        ORDER BY CASE WHEN r.Agente = b.Agente THEN 0 ELSE 1 END, r.ID DESC
    ) r
),
/* =========================
   EXTRA FISSI composizione
   ========================= */
FISSI_SRC AS (
    SELECT
        d.MonthStart,
        d.Agente,
        COUNT(*) AS TotFissi,
        /* TODO: sostituisci 0 con il conteggio dei FISSI START:
           es. SUM(CASE WHEN UPPER(d.OffertaFISSO_RAW) LIKE '%START%' THEN 1 ELSE 0 END) */
        CAST(0 AS int) AS TotStart
    FROM dbo.vw_compensi_agenti_full_dettaglio d
    WHERE d.TIPO='FISSO'
    GROUP BY d.MonthStart, d.Agente
),
BONUS_FISSI_COMP AS (
    SELECT
        b.MonthStart,
        b.Agente,
        CASE
          WHEN fs.TotFissi >= ISNULL(cfg.SogliaBase, 999999)
            THEN CAST( (fs.TotFissi - fs.TotStart) * ISNULL(cfg.ExtraPerFissoNonStart,0.00) AS decimal(18,2))
          ELSE CAST(0.00 AS decimal(18,2))
        END AS EURO_EXTRA_FISSI_COMP
    FROM B b
    LEFT JOIN FISSI_SRC fs
           ON fs.MonthStart = b.MonthStart AND fs.Agente = b.Agente
    OUTER APPLY (
        SELECT TOP (1) x.*
        FROM dbo.cfg_bonus_composizione_fissi x
        CROSS APPLY (
          SELECT CAST(100.0 * ISNULL(fs.TotStart,0) / NULLIF(ISNULL(fs.TotFissi,0),0) AS decimal(5,2)) AS PercStart
        ) p
        WHERE x.IsActive=1
          AND x.MonthStart = b.MonthStart
          AND (x.Agente = b.Agente OR x.Agente = N'ALL')
          AND x.MaxPercStart >= ISNULL(p.PercStart, 100.00)
        ORDER BY CASE WHEN x.Agente = b.Agente THEN 0 ELSE 1 END, x.MaxPercStart ASC
    ) cfg
)
,
/* =========================
   ENI – conteggio contratti e RID
   ========================= */
ENI_DATA AS (
    SELECT
        e.MonthStart,
        d.Agente,
        COUNT(*) AS ENI_Totali,
        SUM(CASE WHEN e.IsRID = 1 THEN 1 ELSE 0 END) AS ENI_RID_Totali,
        SUM(CASE WHEN e.IsFW_Convergente = 1 THEN 1 ELSE 0 END) AS ENI_FW_Totali
    FROM dbo.ENI_Dettaglio e
    JOIN dbo.tbDealers d
        ON d.IDDealer = e.idDealer
    GROUP BY e.MonthStart, d.Agente
),
/* =========================
   ENI COMPENSI (Base + Addebito + Boost)
   ========================= */
ENI_VAL AS (
    SELECT
        b.MonthStart,
        b.Agente,
        CAST(COALESCE(e.ENI_Totali, 0) * COALESCE(c_base.EuroUnit, 0) AS decimal(18,2)) AS EURO_ENI_BASE,
        CAST(COALESCE(e.ENI_RID_Totali, 0) * COALESCE(c_rid.EuroUnit, 0) AS decimal(18,2)) AS EURO_ENI_ADDEBITO,
        CASE
            WHEN (b.FW_ENERGY_QTY + COALESCE(e.ENI_Totali, 0)) >= COALESCE(c_boost.Soglia, 999999)
             AND (1.0 * COALESCE(b.FW_ENERGY_QTY, 0) / NULLIF(b.FW_ENERGY_QTY + COALESCE(e.ENI_Totali, 0), 0)) >= 
                 CASE WHEN b.Agente = 'GIACOMO' THEN 0.20 WHEN b.Agente = 'LUIGI' THEN 0.30 ELSE 1.00 END
            THEN COALESCE(c_boost.EuroBonus, 0.00)
            ELSE 0.00
        END AS EURO_ENI_BOOST,
        CAST(
            COALESCE(e.ENI_Totali, 0) * COALESCE(c_base.EuroUnit, 0)
          + COALESCE(e.ENI_RID_Totali, 0) * COALESCE(c_rid.EuroUnit, 0)
          + CASE
                WHEN (b.FW_ENERGY_QTY + COALESCE(e.ENI_Totali, 0)) >= COALESCE(c_boost.Soglia, 999999)
                 AND (1.0 * COALESCE(b.FW_ENERGY_QTY, 0) / NULLIF(b.FW_ENERGY_QTY + COALESCE(e.ENI_Totali, 0), 0)) >= 
                     CASE WHEN b.Agente = 'GIACOMO' THEN 0.20 WHEN b.Agente = 'LUIGI' THEN 0.30 ELSE 1.00 END
                THEN COALESCE(c_boost.EuroBonus, 0.00)
                ELSE 0.00
            END
            AS decimal(18,2)
        ) AS EURO_ENI_TOTALE
    FROM B b
    LEFT JOIN ENI_DATA e ON e.MonthStart = b.MonthStart AND e.Agente = b.Agente
    OUTER APPLY (
        SELECT TOP (1) EuroUnit FROM dbo.cfg_compensi_agente c
        WHERE c.IsActive = 1 AND c.MonthStart = b.MonthStart
          AND c.Categoria = 'PRODOTTO' AND c.SottoVoce = 'ENI_BASE'
          AND (c.Agente = b.Agente OR c.Agente = 'ALL')
        ORDER BY CASE WHEN c.Agente = b.Agente THEN 1 ELSE 0 END DESC
    ) c_base
    OUTER APPLY (
        SELECT TOP (1) EuroUnit FROM dbo.cfg_compensi_agente c
        WHERE c.IsActive = 1 AND c.MonthStart = b.MonthStart
          AND c.Categoria = 'PRODOTTO' AND c.SottoVoce = 'ENI_ADDEBITO'
          AND (c.Agente = b.Agente OR c.Agente = 'ALL')
        ORDER BY CASE WHEN c.Agente = b.Agente THEN 1 ELSE 0 END DESC
    ) c_rid
    OUTER APPLY (
        SELECT TOP (1) Soglia, EuroBonus FROM dbo.cfg_compensi_agente c
        WHERE c.IsActive = 1 AND c.MonthStart = b.MonthStart
          AND c.Categoria = 'BONUS' AND c.SottoVoce = 'ENERGY_FW_BOOST'
          AND c.Agente = b.Agente
    ) c_boost
),
/* =========================
   BONUS SIM RA 50% per LUIGI
   ========================= */
BONUS_SIM_RA AS (
    SELECT
        b.MonthStart,
        b.Agente,
        CASE
            WHEN b.Agente = 'LUIGI'
             AND COALESCE(b.TOT_SIM_QTY, 0) >= COALESCE(c_sim_ra.Soglia, 999999)
             AND (1.0 * COALESCE(mob.MOBILE_RA_QTY, 0) / NULLIF(COALESCE(b.TOT_SIM_QTY, 0), 0)) >= 0.50
            THEN COALESCE(c_sim_ra.EuroBonus, 0.00)
            ELSE 0.00
        END AS EURO_BONUS_SIM_RA
    FROM B b
    LEFT JOIN MOB_TOT mob ON mob.MonthStart = b.MonthStart AND mob.Agente = b.Agente
    OUTER APPLY (
        SELECT TOP (1) Soglia, EuroBonus FROM dbo.cfg_compensi_agente c
        WHERE c.IsActive = 1 AND c.MonthStart = b.MonthStart
          AND c.Categoria = 'BONUS' AND c.SottoVoce = 'SIM_RA_50PCT'
          AND c.Agente = 'LUIGI'
    ) c_sim_ra
),
/* =========================
   BONUS SIM MNP TARGET (periodo 15-30 Nov)
   Conta SIM con MNP valide: W3 (WindTre), Poste (Poste Mobile), Kena (Kena Mobile)
   ========================= */
SIM_MNP_COUNT AS (
    SELECT
        DATEFROMPARTS(YEAR(ins.Batch), MONTH(ins.Batch), 1) AS MonthStart,
        d.Agente,
        COUNT(*) AS SIM_MNP_Valide
    FROM dbo.InseritoFW ins
    JOIN dbo.tbDealers d ON ins.[Codice Comsy Tecnico Attuale] IN (d.COMSY1, d.COMSY2)
    WHERE ins.[usim flag mnp] IN ('W3', 'Poste', 'Kena')
      AND ins.Batch >= '2025-11-15'
      AND ins.Batch <= '2025-11-30'
    GROUP BY DATEFROMPARTS(YEAR(ins.Batch), MONTH(ins.Batch), 1), d.Agente
),
BONUS_SIM_MNP_TARGET AS (
    SELECT
        b.MonthStart,
        b.Agente,
        CAST(SUM(COALESCE(cfg.EuroBonus, 0.00)) AS decimal(18,2)) AS EURO_BONUS_SIM_MNP_TARGET
    FROM B b
    LEFT JOIN SIM_MNP_COUNT mnp ON mnp.MonthStart = b.MonthStart AND mnp.Agente = b.Agente
    LEFT JOIN dbo.cfg_bonus_sim_mnp_target cfg
        ON cfg.MonthStart = b.MonthStart
       AND cfg.Agente = b.Agente
       AND cfg.IsActive = 1
       AND COALESCE(mnp.SIM_MNP_Valide, 0) >= cfg.Soglia
    GROUP BY b.MonthStart, b.Agente
)

/* =========================
   OUTPUT
   ========================= */
SELECT
    b.MonthStart,
    b.MESE_LABEL,
    b.Agente,

    /* KPI e quantità */
    b.FW_FISSI_QTY                  AS Fissi_Pda,
    COALESCE(mob.MOBILE_TOT_QTY,0)  AS Mobile_Pda,
    CAST(CASE WHEN COALESCE(mob.MOBILE_TOT_QTY,0) > 0
              THEN (CAST(b.FW_RA_SIMS_QTY AS decimal(18,4)) / CAST(mob.MOBILE_TOT_QTY AS decimal(18,4))) * 100
              ELSE 0 END AS decimal(5,2)) AS Perc_RA_su_Mobile,
    b.FW_RA_SIMS_QTY                AS Sim_RA_Tot,
    b.FW_CONV_RA                    AS Sim_RA_Conv,
    b.FW_ONLYMOB_RA                 AS Sim_RA_OnlyMobile,
    COALESCE(mob.MOBILE_PURA_QTY,0) AS Mobile_Pura_Pda,
    b.FW_ENERGY_QTY                 AS Energy_Pda,
    b.SKY_QTY                       AS Sky_Pda,
    b.SIM_FASTWEB_QTY               AS SimFastweb_Vendute,
    b.SIM_ILIAD_QTY                 AS SimIliad_Vendute,
    b.SIM_1MOBILE_QTY               AS Sim1Mobile_Vendute,
    b.SIM_SKY_QTY                   AS SimSky_Vendute,
    b.SIM_KENA_QTY                  AS SimKena_Vendute,
    b.TOT_SIM_QTY                   AS SimTotali_Vendute,

    /* Componenti economiche */
    COALESCE(ra.EURO_FW_RA,      0) AS Euro_RA,
    COALESCE(p.EURO_PRODOTTO,    0) AS Euro_Prodotti,
    COALESCE(s.EURO_SIM_BASE,    0) AS Euro_SimVendute,

    /* BONUS = bonus soglia (ENERGY+FISSI) + bonus mobile auto + extra fissi comp + bonus SIM RA + bonus SIM MNP target */
    CAST(
      COALESCE(bn.EURO_BONUS,0)
      + COALESCE(bma.EURO_BONUS_MOBILE_AUTO,0)
      + COALESCE(bfc.EURO_EXTRA_FISSI_COMP,0)
      + COALESCE(bsr.EURO_BONUS_SIM_RA,0)
      + COALESCE(bsm.EURO_BONUS_SIM_MNP_TARGET,0)
      AS decimal(18,2)
    ) AS Euro_Bonus,
    COALESCE(bn.EURO_BONUS,0)               AS Euro_Bonus_Soglie,
    COALESCE(bma.EURO_BONUS_MOBILE_AUTO,0)  AS Euro_Bonus_MobileAuto,
    COALESCE(bfc.EURO_EXTRA_FISSI_COMP,0)   AS Euro_Bonus_ExtraFissi,
    COALESCE(bsr.EURO_BONUS_SIM_RA,0)       AS Euro_Bonus_SimRA,
    COALESCE(bsm.EURO_BONUS_SIM_MNP_TARGET,0) AS Euro_Bonus_SimMNP,

    COALESCE(ct.EURO_CONTRIBUTO, 0) AS Euro_Contributo,

    /* ENI */
    COALESCE(e.ENI_Totali,0)       AS ENI_Totali,
    COALESCE(e.ENI_RID_Totali,0)   AS ENI_RID_Totali,
    COALESCE(e.ENI_FW_Totali,0)    AS ENI_FW_Totali,
    CAST(
        CASE WHEN COALESCE(e.ENI_Totali,0) > 0
             THEN 1.0 * COALESCE(e.ENI_FW_Totali,0) / NULLIF(e.ENI_Totali,0)
             ELSE 0 END * 100
        AS decimal(5,2)
    ) AS ENI_Perc_FW,

    /* ENI - Compensi */
    COALESCE(eni.EURO_ENI_BASE, 0)     AS Euro_ENI_Base,
    COALESCE(eni.EURO_ENI_ADDEBITO, 0) AS Euro_ENI_Addebito,
    COALESCE(eni.EURO_ENI_BOOST, 0)    AS Euro_ENI_Boost,
    COALESCE(eni.EURO_ENI_TOTALE, 0)   AS Euro_ENI,

    /* TOTALE € - Include ENI, bonus SIM RA e bonus SIM MNP target */
    CAST(
        COALESCE(ra.EURO_FW_RA,0)
      + COALESCE(p.EURO_PRODOTTO,0)
      + COALESCE(s.EURO_SIM_BASE,0)
      + ( COALESCE(bn.EURO_BONUS,0)
          + COALESCE(bma.EURO_BONUS_MOBILE_AUTO,0)
          + COALESCE(bfc.EURO_EXTRA_FISSI_COMP,0)
          + COALESCE(bsr.EURO_BONUS_SIM_RA,0)
          + COALESCE(bsm.EURO_BONUS_SIM_MNP_TARGET,0) )
      + COALESCE(ct.EURO_CONTRIBUTO,0)
      + COALESCE(eni.EURO_ENI_TOTALE,0)
      AS decimal(18,2)
    ) AS Euro_Totale
FROM B b
LEFT JOIN MOB_TOT           mob ON mob.MonthStart = b.MonthStart AND mob.Agente = b.Agente
LEFT JOIN RA_VAL            ra  ON ra.MonthStart  = b.MonthStart AND ra.Agente  = b.Agente
LEFT JOIN PROD_VAL          p   ON p.MonthStart   = b.MonthStart AND p.Agente   = b.Agente
LEFT JOIN SIM_VAL           s   ON s.MonthStart   = b.MonthStart AND s.Agente   = b.Agente
LEFT JOIN BONUS_VAL         bn  ON bn.MonthStart  = b.MonthStart AND bn.Agente  = b.Agente
LEFT JOIN CONTRIB_VAL       ct  ON ct.MonthStart  = b.MonthStart AND ct.Agente  = b.Agente
LEFT JOIN BONUS_MOBILE_AUTO bma ON bma.MonthStart = b.MonthStart AND bma.Agente = b.Agente
LEFT JOIN BONUS_FISSI_COMP     bfc ON bfc.MonthStart = b.MonthStart AND bfc.Agente = b.Agente
LEFT JOIN ENI_DATA             e   ON e.MonthStart   = b.MonthStart AND e.Agente   = b.Agente
LEFT JOIN ENI_VAL              eni ON eni.MonthStart = b.MonthStart AND eni.Agente = b.Agente
LEFT JOIN BONUS_SIM_RA         bsr ON bsr.MonthStart = b.MonthStart AND bsr.Agente = b.Agente
LEFT JOIN BONUS_SIM_MNP_TARGET bsm ON bsm.MonthStart = b.MonthStart AND bsm.Agente = b.Agente;

GO


