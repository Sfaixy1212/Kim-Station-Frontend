-- Script per correggere le coordinate delle visite che usano point non affiliati
-- Sovrascrive Latitudine/Longitudine della visita con quelle del point quando disponibili

UPDATE v
SET 
  v.Latitudine = p.Latitudine,
  v.Longitudine = p.Longitudine
FROM dbo.tbAgendaVisite v
INNER JOIN dbo.tbAgendaPointNonAffiliati p ON v.IDPointNonAffiliato = p.ID
WHERE v.IDPointNonAffiliato IS NOT NULL
  AND p.Latitudine IS NOT NULL
  AND p.Longitudine IS NOT NULL
  AND (v.Latitudine IS NULL OR v.Latitudine != p.Latitudine OR v.Longitudine != p.Longitudine);

-- Verifica risultati
SELECT 
  v.ID,
  v.RagioneSocialeDealer,
  v.IDPointNonAffiliato,
  v.Latitudine as LatitudineVisita,
  v.Longitudine as LongitudineVisita,
  p.Latitudine as LatitudinePoint,
  p.Longitudine as LongitudinePoint,
  p.Citta
FROM dbo.tbAgendaVisite v
INNER JOIN dbo.tbAgendaPointNonAffiliati p ON v.IDPointNonAffiliato = p.ID
WHERE v.IDPointNonAffiliato IS NOT NULL
ORDER BY v.DataVisita DESC;
