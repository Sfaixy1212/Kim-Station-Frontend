-- Verifica coordinate delle visite del 18 novembre 2025
SELECT 
  v.ID,
  v.IDAgente,
  v.NomeAgente,
  v.RagioneSocialeDealer,
  v.DataVisita,
  v.OraInizio,
  v.IDDealer,
  v.IDPointNonAffiliato,
  v.Latitudine as LatVisita,
  v.Longitudine as LonVisita,
  d.Latitudine as LatDealer,
  d.Longitudine as LonDealer,
  d.Citta as CittaDealer,
  d.Provincia as ProvDealer,
  p.Latitudine as LatPoint,
  p.Longitudine as LonPoint,
  p.Citta as CittaPoint,
  COALESCE(v.Latitudine, d.Latitudine, p.Latitudine) as LatFinale,
  COALESCE(v.Longitudine, d.Longitudine, p.Longitudine) as LonFinale,
  CASE 
    WHEN v.Latitudine IS NOT NULL THEN 'Visita'
    WHEN d.Latitudine IS NOT NULL THEN 'Dealer'
    WHEN p.Latitudine IS NOT NULL THEN 'Point'
    ELSE 'NESSUNA'
  END as FonteCoordinate
FROM dbo.tbAgendaVisite v
LEFT JOIN dbo.tbDealers d ON v.IDDealer = d.IDDealer
LEFT JOIN dbo.tbAgendaPointNonAffiliati p ON v.IDPointNonAffiliato = p.ID
WHERE CAST(v.DataVisita AS DATE) = '2025-11-18'
ORDER BY v.OraInizio;
