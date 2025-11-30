-- Query per credito residuo/plafond del dealer autenticato, esclusi alcuni dealer
SELECT SUM(CreditoResiduo) as credito
FROM dbo.tbDealers
WHERE IDDealer = @idDealer
  AND IDDealer NOT IN (99999, 88888, 77777)
