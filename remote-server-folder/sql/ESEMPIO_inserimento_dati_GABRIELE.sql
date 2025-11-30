-- =============================================
-- ESEMPIO INSERIMENTO DATI MANUALI PER GABRIELE
-- =============================================
-- Basato sui dati ricevuti via Excel/CSV
-- =============================================

-- IMPORTANTE: Modificare Anno e Mese secondo necessità
DECLARE @Anno INT = 2025;
DECLARE @Mese INT = 11; -- Novembre

-- =============================================
-- STEP 1: Trova gli IDDealer dalla RagioneSociale
-- =============================================
SELECT 
    IDDealer, 
    RagioneSociale, 
    COMSY1, 
    COMSY2, 
    Provincia
FROM dbo.tbDealers
WHERE RagioneSociale IN (
    'AB MULTISERVICE S.R.L.S', 
    'ORLANDO CONSULENZE SRL', 
    'MARCO GENTILE'
)
AND AGENTE = 'GABRIELE';

-- =============================================
-- STEP 2: Inserisci i dati usando gli IDDealer trovati
-- =============================================
-- IMPORTANTE: Sostituisci i valori 123, 456, 789 con gli IDDealer reali trovati nello STEP 1

-- AB MULTISERVICE S.R.L.S - SAN MARZANO DI SAN GIUSTA
-- FISSO: 1, MOBILE: 3, di cui FISSO BU: 1, di cui convergenza: 1, ENERGIA: 3
INSERT INTO dbo.tbGabrieleIntegrazione 
    (Anno, Mese, IDDealer, Fisso, Mobile, FissoBU, Convergenza, Totale, Energia, Note)
VALUES 
    (@Anno, @Mese, 123, 1, 3, 1, 1, 5, 3, 'Inserimento manuale da report Excel');  -- Sostituisci 123 con IDDealer reale

-- ORLANDO CONSULENZE SRL
-- MOBILE: 2
INSERT INTO dbo.tbGabrieleIntegrazione 
    (Anno, Mese, IDDealer, Fisso, Mobile, FissoBU, Convergenza, Totale, Energia, Note)
VALUES 
    (@Anno, @Mese, 456, 0, 2, 0, 0, 2, 0, 'Inserimento manuale da report Excel');  -- Sostituisci 456 con IDDealer reale

-- MARCO GENTILE
-- MOBILE: 1
INSERT INTO dbo.tbGabrieleIntegrazione 
    (Anno, Mese, IDDealer, Fisso, Mobile, FissoBU, Convergenza, Totale, Energia, Note)
VALUES 
    (@Anno, @Mese, 789, 0, 1, 0, 0, 1, 0, 'Inserimento manuale da report Excel');  -- Sostituisci 789 con IDDealer reale

-- =============================================
-- VERIFICA INSERIMENTI
-- =============================================
SELECT 
    g.ID,
    g.IDDealer,
    d.RagioneSociale,
    d.Provincia,
    g.Fisso,
    g.Mobile,
    g.FissoBU AS [FISSO BU],
    g.Convergenza,
    g.Energia,
    g.Totale,
    g.Note,
    g.DataInserimento
FROM dbo.tbGabrieleIntegrazione g
INNER JOIN dbo.tbDealers d ON g.IDDealer = d.IDDealer
WHERE g.Anno = @Anno AND g.Mese = @Mese
ORDER BY d.RagioneSociale;

-- =============================================
-- TOTALI DEL MESE
-- =============================================
SELECT 
    'TOTALE MESE ' + CAST(@Mese AS VARCHAR(2)) + '/' + CAST(@Anno AS VARCHAR(4)) AS Periodo,
    COUNT(*) AS NumDealer,
    SUM(Fisso) AS TotaleFisso,
    SUM(Mobile) AS TotaleMobile,
    SUM(FissoBU) AS TotaleFissoBU,
    SUM(Convergenza) AS TotaleConvergenza,
    SUM(Energia) AS TotaleEnergia,
    SUM(Totale) AS TotaleComplessivo
FROM dbo.tbGabrieleIntegrazione
WHERE Anno = @Anno AND Mese = @Mese;

-- =============================================
-- TEMPLATE PER INSERIMENTO RAPIDO
-- =============================================
/*
-- Copia questo template e compilalo con i tuoi dati:

INSERT INTO dbo.tbGabrieleIntegrazione 
    (Anno, Mese, RagioneSociale, COMSY_NR, COMSY_NS, Citta, Provincia, Fisso, Mobile, FissoBU, Convergenza, Totale, Energia, Note)
VALUES 
    (2025, 11, 'NOME DEALER', NULL, NULL, NULL, 'PROVINCIA', 0, 0, 0, 0, 0, 0, 'Inserimento manuale');

-- LEGENDA CAMPI:
-- Anno: Anno di riferimento (es. 2025)
-- Mese: Mese di riferimento (1-12)
-- RagioneSociale: Nome completo del dealer (OBBLIGATORIO)
-- COMSY_NR: Codice COMSY NR (opzionale)
-- COMSY_NS: Codice COMSY NS (opzionale)
-- Citta: Città del dealer (opzionale)
-- Provincia: Provincia del dealer (opzionale)
-- Fisso: Numero attivazioni FISSO
-- Mobile: Numero attivazioni MOBILE
-- FissoBU: Numero attivazioni FISSO Business/SHP (sottoinsieme di Fisso)
-- Convergenza: Numero attivazioni CONVERGENZA
-- Totale: Totale attivazioni (calcolato automaticamente o inserito manualmente)
-- Energia: Numero attivazioni ENERGIA
-- Note: Note libere (opzionale)
*/

-- =============================================
-- CANCELLAZIONE DATI (SE NECESSARIO)
-- =============================================
/*
-- ATTENZIONE: Questa query cancella TUTTI i dati di un mese specifico
-- Usare con cautela!

DELETE FROM dbo.tbGabrieleIntegrazione
WHERE Anno = 2025 AND Mese = 11;

-- Per cancellare un singolo dealer:
DELETE FROM dbo.tbGabrieleIntegrazione
WHERE Anno = 2025 AND Mese = 11 AND RagioneSociale = 'NOME DEALER';
*/

-- =============================================
-- AGGIORNAMENTO DATI (SE NECESSARIO)
-- =============================================
/*
-- Esempio: Aggiorna le attivazioni di un dealer specifico

UPDATE dbo.tbGabrieleIntegrazione
SET 
    Fisso = 2,
    Mobile = 5,
    FissoBU = 1,
    Convergenza = 1,
    Energia = 3,
    Totale = 10,
    DataModifica = GETDATE(),
    Note = 'Dati aggiornati il ' + CONVERT(VARCHAR(10), GETDATE(), 103)
WHERE Anno = 2025 
  AND Mese = 11 
  AND RagioneSociale = 'AB MULTISERVICE S.R.L.S';
*/
