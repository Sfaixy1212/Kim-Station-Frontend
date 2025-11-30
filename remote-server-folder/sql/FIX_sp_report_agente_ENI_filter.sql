-- =============================================
-- Fix: Allinea filtro ENI nella stored procedure con le KPI globali
-- Problema: MonthStart = @start_date non matcha se MonthStart ha anche l'ora
-- Soluzione: Usa >= @start_date AND < @end_date_next_month
-- =============================================

USE [KAM]
GO

-- Trova la sezione ENI nella stored procedure e aggiorna il filtro
-- Cerca la riga:
--   WHERE ofr.idOperatore = 16
--     AND ofr.IDOfferta <> 526
--     AND o.MonthStart = @start_date
--
-- Sostituisci con:
--   WHERE ofr.idOperatore = 16
--     AND ofr.IDOfferta <> 526
--     AND o.MonthStart >= @start_date 
--     AND o.MonthStart < DATEADD(MONTH, 1, @start_date)

-- Verifica prima il problema con questa query di test:
DECLARE @year INT = 2025;
DECLARE @month INT = 11;
DECLARE @start_date DATE = DATEFROMPARTS(@year, @month, 1);
DECLARE @end_date_next DATE = DATEADD(MONTH, 1, @start_date);

SELECT 
    'Metodo OLD (=)' AS Metodo,
    COUNT(DISTINCT o.IDORDINE) as Totale_ENI
FROM dbo.tbOrdini o
JOIN dbo.tbOfferte ofr ON o.idOfferta = ofr.IDOfferta
JOIN dbo.tbDealers d ON o.idDealer = d.IDDealer
WHERE ofr.idOperatore = 16
  AND ofr.IDOfferta <> 526
  AND o.MonthStart = @start_date
  AND d.Agente IN ('GABRIELE', 'GIACOMO', 'LUIGI', 'RAFFAELE')

UNION ALL

SELECT 
    'Metodo NEW (>=<)' AS Metodo,
    COUNT(DISTINCT o.IDORDINE) as Totale_ENI
FROM dbo.tbOrdini o
JOIN dbo.tbOfferte ofr ON o.idOfferta = ofr.IDOfferta
JOIN dbo.tbDealers d ON o.idDealer = d.IDDealer
WHERE ofr.idOperatore = 16
  AND ofr.IDOfferta <> 526
  AND o.MonthStart >= @start_date
  AND o.MonthStart < @end_date_next
  AND d.Agente IN ('GABRIELE', 'GIACOMO', 'LUIGI', 'RAFFAELE');

-- Se il Metodo NEW restituisce 27 e il Metodo OLD restituisce 3,
-- allora il problema è confermato e devi aggiornare la stored procedure.
