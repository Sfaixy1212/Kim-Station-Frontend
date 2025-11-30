-- Aggiorna coordinate visite Mr Phone 2 con quelle corrette del point
UPDATE v
SET 
  v.Latitudine = p.Latitudine,
  v.Longitudine = p.Longitudine
FROM dbo.tbAgendaVisite v
INNER JOIN dbo.tbAgendaPointNonAffiliati p ON v.IDPointNonAffiliato = p.ID
WHERE v.IDPointNonAffiliato = 4
  AND p.Latitudine IS NOT NULL
  AND p.Longitudine IS NOT NULL;

-- Verifica aggiornamento
SELECT 
  v.ID,
  v.RagioneSocialeDealer,
  v.DataVisita,
  v.Latitudine as LatVisita,
  v.Longitudine as LonVisita,
  p.Latitudine as LatPoint,
  p.Longitudine as LonPoint,
  p.Citta
FROM dbo.tbAgendaVisite v
INNER JOIN dbo.tbAgendaPointNonAffiliati p ON v.IDPointNonAffiliato = p.ID
WHERE v.IDPointNonAffiliato = 4;
