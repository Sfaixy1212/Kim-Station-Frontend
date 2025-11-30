# Sistema Integrazione Manuale per GABRIELE

## 📋 Panoramica

GABRIELE ha un sistema di report **ibrido** che combina:
1. ✅ **Dati automatici** dalla stored procedure `sp_report_agente_fastweb_mese` (come tutti gli altri agenti)
2. ➕ **Dati manuali** dalla tabella `tbGabrieleIntegrazione` (per integrare report incompleti)

I due dataset vengono **sommati automaticamente** dal sistema.

---

## 🗄️ Struttura Tabella

```sql
tbGabrieleIntegrazione
├── ID (PK, auto-increment)
├── Anno (INT, NOT NULL)
├── Mese (INT, NOT NULL)
├── RagioneSociale (NVARCHAR(255), NOT NULL)
├── COMSY_NR (NVARCHAR(100), NULL)
├── COMSY_NS (NVARCHAR(100), NULL)
├── Citta (NVARCHAR(100), NULL)
├── Provincia (NVARCHAR(50), NULL)
├── Fisso (INT, DEFAULT 0)
├── Mobile (INT, DEFAULT 0)
├── FissoBU (INT, DEFAULT 0)          -- FISSO Business/SHP
├── Convergenza (INT, DEFAULT 0)
├── Totale (INT, DEFAULT 0)
├── Energia (INT, DEFAULT 0)
├── DataInserimento (DATETIME, DEFAULT GETDATE())
├── DataModifica (DATETIME, NULL)
├── UtenteInserimento (NVARCHAR(100), NULL)
└── Note (NVARCHAR(500), NULL)
```

---

## 🔄 Come Funziona l'Integrazione

### Scenario 1: Dealer NON presente nei dati automatici
**Azione:** Il dealer viene **AGGIUNTO** con i valori manuali

**Esempio:**
- Dati automatici: *(nessun dato per "MARCO GENTILE")*
- Dati manuali: MARCO GENTILE → Mobile: 1
- **Risultato finale:** MARCO GENTILE → Mobile: 1

### Scenario 2: Dealer GIÀ presente nei dati automatici
**Azione:** I valori vengono **SOMMATI**

**Esempio:**
- Dati automatici: AB MULTISERVICE → Fisso: 2, Mobile: 1
- Dati manuali: AB MULTISERVICE → Fisso: 1, Mobile: 3
- **Risultato finale:** AB MULTISERVICE → Fisso: 3, Mobile: 4

### Scenario 3: Dealer con COMSY/Provincia mancanti
**Azione:** I campi mancanti vengono **COMPLETATI** dai dati manuali

**Esempio:**
- Dati automatici: ORLANDO CONSULENZE → Mobile: 5, Provincia: *(vuoto)*
- Dati manuali: ORLANDO CONSULENZE → Provincia: "NAPOLI"
- **Risultato finale:** ORLANDO CONSULENZE → Mobile: 5, Provincia: "NAPOLI"

---

## 📝 Procedura di Inserimento

### 1️⃣ Ricevi il Report Excel/CSV

Esempio di formato ricevuto:
```
Agent    | RAGIONE SOCIALE          | COMSY NR | COMSY NS | CITTA | Provincia              | FISSO | MOBILE | di cui FISSO BU | di cui convergenza | TOTALE | ENERGIA
---------|--------------------------|----------|----------|-------|------------------------|-------|--------|-----------------|--------------------|---------|---------
GABRIELE | AB MULTISERVICE S.R.L.S  |          |          |       | SAN MARZANO DI SAN G.  | 1     | 3      | 1               | 1                  | 3       | 0
GABRIELE | ORLANDO CONSULENZE SRL   |          |          |       |                        | 0     | 2      | 0               | 0                  | 2       | 0
GABRIELE | MARCO GENTILE            |          |          |       |                        | 0     | 1      | 0               | 0                  | 1       | 0
```

### 2️⃣ Prepara lo Script SQL

Usa il template in `ESEMPIO_inserimento_dati_GABRIELE.sql`:

```sql
DECLARE @Anno INT = 2025;
DECLARE @Mese INT = 11;

INSERT INTO dbo.tbGabrieleIntegrazione 
    (Anno, Mese, RagioneSociale, Provincia, Fisso, Mobile, FissoBU, Convergenza, Totale, Energia, Note)
VALUES 
    (@Anno, @Mese, 'AB MULTISERVICE S.R.L.S', 'SAN MARZANO DI SAN GIUSTA', 1, 3, 1, 1, 5, 0, 'Report novembre 2025'),
    (@Anno, @Mese, 'ORLANDO CONSULENZE SRL', NULL, 0, 2, 0, 0, 2, 0, 'Report novembre 2025'),
    (@Anno, @Mese, 'MARCO GENTILE', NULL, 0, 1, 0, 0, 1, 0, 'Report novembre 2025');
```

### 3️⃣ Esegui lo Script

Connettiti al database SQL Server ed esegui lo script.

### 4️⃣ Verifica i Dati

```sql
SELECT * FROM dbo.tbGabrieleIntegrazione 
WHERE Anno = 2025 AND Mese = 11
ORDER BY RagioneSociale;
```

### 5️⃣ Controlla il Report

Vai su **Station → SuperMaster → Analisi → Seleziona GABRIELE**

I dati manuali saranno automaticamente integrati con quelli automatici.

---

## 🔍 Query Utili

### Vedi tutti i dati di un mese
```sql
SELECT 
    RagioneSociale,
    Provincia,
    Fisso,
    Mobile,
    FissoBU AS [FISSO BU],
    Convergenza,
    Energia,
    Totale,
    Note
FROM dbo.tbGabrieleIntegrazione
WHERE Anno = 2025 AND Mese = 11
ORDER BY RagioneSociale;
```

### Totali mensili
```sql
SELECT 
    Anno,
    Mese,
    COUNT(*) AS NumDealer,
    SUM(Fisso) AS TotaleFisso,
    SUM(Mobile) AS TotaleMobile,
    SUM(FissoBU) AS TotaleFissoBU,
    SUM(Convergenza) AS TotaleConvergenza,
    SUM(Energia) AS TotaleEnergia,
    SUM(Totale) AS TotaleComplessivo
FROM dbo.tbGabrieleIntegrazione
GROUP BY Anno, Mese
ORDER BY Anno DESC, Mese DESC;
```

### Cancella dati di un mese (ATTENZIONE!)
```sql
DELETE FROM dbo.tbGabrieleIntegrazione
WHERE Anno = 2025 AND Mese = 11;
```

### Aggiorna un dealer specifico
```sql
UPDATE dbo.tbGabrieleIntegrazione
SET 
    Fisso = 2,
    Mobile = 5,
    DataModifica = GETDATE(),
    Note = 'Dati aggiornati'
WHERE Anno = 2025 
  AND Mese = 11 
  AND RagioneSociale = 'AB MULTISERVICE S.R.L.S';
```

---

## ⚠️ Note Importanti

1. **Ragione Sociale**: Deve corrispondere ESATTAMENTE al nome nel database (case-insensitive)
2. **Anno/Mese**: Devono corrispondere al periodo del report
3. **Duplicati**: Il constraint `IX_tbGabrieleIntegrazione_AnnoMese` impedisce duplicati (Anno + Mese + RagioneSociale)
4. **Totale**: Può essere calcolato automaticamente o inserito manualmente
5. **FISSO BU**: È un sottoinsieme di FISSO (FISSO RES = FISSO - FISSO BU)

---

## 🐛 Troubleshooting

### Errore: "Violation of UNIQUE KEY constraint"
**Causa:** Stai tentando di inserire un dealer già presente per quel mese.

**Soluzione:** Usa UPDATE invece di INSERT, oppure cancella prima il record esistente.

### I dati non appaiono nel report
**Causa:** Anno/Mese non corrispondono al periodo selezionato nel frontend.

**Soluzione:** Verifica che Anno e Mese siano corretti nella tabella.

### I totali non tornano
**Causa:** Possibile somma errata tra dati automatici e manuali.

**Soluzione:** Controlla i log del backend (`[GABRIELE] Report completato`) per vedere i conteggi.

---

## 📊 Esempio Completo

**Situazione:**
- Report Excel ricevuto per Novembre 2025
- 3 dealer da integrare manualmente

**Script SQL:**
```sql
-- 1. Imposta periodo
DECLARE @Anno INT = 2025;
DECLARE @Mese INT = 11;

-- 2. Inserisci dati
INSERT INTO dbo.tbGabrieleIntegrazione 
    (Anno, Mese, RagioneSociale, Provincia, Fisso, Mobile, FissoBU, Convergenza, Totale, Energia, Note)
VALUES 
    (@Anno, @Mese, 'AB MULTISERVICE S.R.L.S', 'SAN MARZANO DI SAN GIUSTA', 1, 3, 1, 1, 5, 0, 'Report nov 2025'),
    (@Anno, @Mese, 'ORLANDO CONSULENZE SRL', NULL, 0, 2, 0, 0, 2, 0, 'Report nov 2025'),
    (@Anno, @Mese, 'MARCO GENTILE', NULL, 0, 1, 0, 0, 1, 0, 'Report nov 2025');

-- 3. Verifica
SELECT * FROM dbo.tbGabrieleIntegrazione WHERE Anno = @Anno AND Mese = @Mese;

-- 4. Totali
SELECT 
    SUM(Fisso) AS Fisso,
    SUM(Mobile) AS Mobile,
    SUM(Energia) AS Energia,
    SUM(Totale) AS Totale
FROM dbo.tbGabrieleIntegrazione 
WHERE Anno = @Anno AND Mese = @Mese;
```

**Risultato nel Frontend:**
- Dashboard SuperMaster → Analisi → GABRIELE → Novembre 2025
- I 3 dealer appariranno nella tabella con i dati integrati
- I KPI includeranno sia i dati automatici che quelli manuali

---

## 📞 Supporto

Per problemi o domande, contatta il team di sviluppo.

**File di riferimento:**
- `/home/ubuntu/remote-server-folder/supermaster-report-agente.mjs` (logica backend)
- `/home/ubuntu/remote-server-folder/sql/CREATE_tbGabrieleIntegrazione.sql` (creazione tabella)
- `/home/ubuntu/remote-server-folder/sql/ESEMPIO_inserimento_dati_GABRIELE.sql` (esempi)
