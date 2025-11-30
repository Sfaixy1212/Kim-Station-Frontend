-- ============================================================================
-- Modifica vista vw_compensi_agenti_mese_compensi per aggiungere calcolo compensi ENI
-- ============================================================================
-- Data: 2025-11-15
-- Descrizione: Aggiunge CTE per calcolare compensi ENI (base + addebito + boost)
-- ============================================================================

USE [KAM]
GO

-- NOTA: Questo script aggiunge le seguenti CTE alla vista esistente:
-- 1. ENI_VAL: Calcola compensi ENI (base €5 + addebito €2 + boost €250)
-- 2. BONUS_SIM_RA: Calcola bonus 50% RA per LUIGI (€200)
--
-- Modifica anche il SELECT finale per includere:
-- - Euro_ENI_Base, Euro_ENI_Addebito, Euro_ENI_Boost, Euro_ENI
-- - Euro_Bonus (include anche BONUS_SIM_RA)
-- - Euro_Totale (include Euro_ENI)

-- ISTRUZIONI:
-- 1. Eseguire prima INSERT_Regole_ENI_Novembre_2025.sql
-- 2. Aprire la vista esistente vw_compensi_agenti_mese_compensi
-- 3. Aggiungere le CTE ENI_VAL e BONUS_SIM_RA dopo BONUS_FISSI_COMP
-- 4. Modificare il SELECT finale per includere i campi ENI
-- 5. Aggiungere i LEFT JOIN per ENI_VAL e BONUS_SIM_RA

-- CTE DA AGGIUNGERE DOPO BONUS_FISSI_COMP:

/*
,
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
)
*/

-- MODIFICHE AL SELECT FINALE:

-- 1. Aggiungere dopo "Euro_Contributo":
/*
    COALESCE(eni.EURO_ENI_BASE, 0)     AS Euro_ENI_Base,
    COALESCE(eni.EURO_ENI_ADDEBITO, 0) AS Euro_ENI_Addebito,
    COALESCE(eni.EURO_ENI_BOOST, 0)    AS Euro_ENI_Boost,
    COALESCE(eni.EURO_ENI_TOTALE, 0)   AS Euro_ENI,
*/

-- 2. Modificare Euro_Bonus per includere BONUS_SIM_RA:
/*
    CAST(
      COALESCE(bn.EURO_BONUS,0)
      + COALESCE(bma.EURO_BONUS_MOBILE_AUTO,0)
      + COALESCE(bfc.EURO_EXTRA_FISSI_COMP,0)
      + COALESCE(bsr.EURO_BONUS_SIM_RA,0)
      AS decimal(18,2)
    ) AS Euro_Bonus,
*/

-- 3. Modificare Euro_Totale per includere Euro_ENI:
/*
    CAST(
        COALESCE(ra.EURO_FW_RA,0)
      + COALESCE(p.EURO_PRODOTTO,0)
      + COALESCE(s.EURO_SIM_BASE,0)
      + ( COALESCE(bn.EURO_BONUS,0)
          + COALESCE(bma.EURO_BONUS_MOBILE_AUTO,0)
          + COALESCE(bfc.EURO_EXTRA_FISSI_COMP,0)
          + COALESCE(bsr.EURO_BONUS_SIM_RA,0) )
      + COALESCE(ct.EURO_CONTRIBUTO,0)
      + COALESCE(eni.EURO_ENI_TOTALE,0)
      AS decimal(18,2)
    ) AS Euro_Totale
*/

-- 4. Aggiungere LEFT JOIN prima del punto e virgola finale:
/*
LEFT JOIN ENI_VAL           eni ON eni.MonthStart = b.MonthStart AND eni.Agente = b.Agente
LEFT JOIN BONUS_SIM_RA      bsr ON bsr.MonthStart = b.MonthStart AND bsr.Agente = b.Agente;
*/

GO

PRINT 'Script di istruzioni completato!';
PRINT 'Seguire le istruzioni nei commenti per modificare la vista.';
