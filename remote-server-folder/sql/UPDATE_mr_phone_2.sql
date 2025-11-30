-- Aggiorna indirizzo Mr Phone 2
UPDATE dbo.tbAgendaPointNonAffiliati
SET IndirizzoCompleto = 'PIAZZA VITTORIO EMANUELE 5',
    CAP = '74016',
    Citta = 'MASSAFRA',
    Provincia = 'TA'
WHERE ID = 4;

-- Verifica aggiornamento
SELECT 
  ID,
  RagioneSociale,
  IndirizzoCompleto,
  CAP,
  Citta,
  Provincia,
  Latitudine,
  Longitudine
FROM dbo.tbAgendaPointNonAffiliati
WHERE ID = 4;
