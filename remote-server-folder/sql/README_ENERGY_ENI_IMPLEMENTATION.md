# Implementazione Energy ENI - Documentazione

## 📋 Panoramica

Questa implementazione aggiunge il supporto per le attivazioni **ENI** nel sistema di obiettivi Energy, con la particolarità che **ENI non deve essere filtrato per stato** (a differenza di FASTWEB ENERGIA che filtra per stati INSERITO/ATTIVO/LAVORAZIONE).

---

## 🎯 Requisiti

### Energy Objectives Structure:
- **FASTWEB ENERGIA** (con filtro stato):
  - Core
  - Flex
  - Fix
  
- **ENI** (SENZA filtro stato):
  - Tutte le attivazioni ENI, indipendentemente dallo stato

- **% FASTWEB minima**:
  - Percentuale minima di attivazioni FASTWEB sul totale Energy
  - Calcolo: `(Core + Flex + Fix) / (Core + Flex + Fix + ENI) * 100`

---

## ✅ Modifiche Completate

### 1. Database Schema
**File**: `/home/ubuntu/remote-server-folder/sql/ALTER_ObiettiviAgenti_AddEnergyFields.sql`

```sql
ALTER TABLE [dbo].[ObiettiviAgenti]
ADD [EnergyEni] INT NOT NULL DEFAULT 0;

ALTER TABLE [dbo].[ObiettiviAgenti]
ADD [EnergyPercentFastweb] DECIMAL(10, 2) NOT NULL DEFAULT 0;
```

**Status**: ✅ Script creato, da eseguire

---

### 2. Backend API - Obiettivi Agenti
**File**: `/home/ubuntu/remote-server-folder/obiettivi-agenti.mjs`

**Modifiche**:
- ✅ Aggiunto `EnergyEni` e `EnergyPercentFastweb` nella query SELECT
- ✅ Aggiunto input parameters per POST
- ✅ Aggiunto nelle query UPDATE e INSERT

**Status**: ✅ Completato e deployato

---

### 3. Backend API - Obiettivi Compensi
**File**: `/home/ubuntu/remote-server-folder/obiettivi-compensi-api.mjs`

**Modifiche**:
- ✅ Aggiunto `EnergyEni` e `EnergyPercentFastweb` in targetsDetailed
- ✅ Aggiunto nei progressi
- ✅ `energyAttuali` calcolato come: `Core + Flex + Fix + Eni`

**Status**: ✅ Completato e deployato

---

### 4. Frontend - SuperMaster Strumenti
**File**: `/home/ubuntu/app/src/pages/Strumenti.jsx`

**Modifiche**:
- ✅ Aggiunto campo input "ENI"
- ✅ Aggiunto campo input "% FW minima"
- ✅ Aggiornata tabella con colonne ENI e % FW
- ✅ Layout Energy da 4 a 6 colonne

**Status**: ✅ Completato e deployato

---

### 5. Frontend - Agente Obiettivi & Compensi
**File**: `/home/ubuntu/app/src/pages/agent/ObiettiviCompensi.jsx`

**Modifiche**:
- ✅ Aggiunto ENI nei details Energy
- ✅ Aggiunto % FW con hint del target
- ✅ Calcolo totali Energy include ENI

**Status**: ✅ Completato e deployato

---

### 6. Frontend - Agente Dashboard
**File**: `/home/ubuntu/app/src/pages/AgentDashboard.jsx`

**Modifiche**:
- ✅ Aggiunto ENI e % FW nella card Energy
- ✅ Calcolo totali Energy include ENI

**Status**: ✅ Completato e deployato

---

## ⚠️ AZIONE RICHIESTA: Stored Procedure

### Problema
La stored procedure `GetOrderStatisticsByAgent_V3` attualmente restituisce:
- `EnergyCore` (con filtro stato)
- `EnergyFlex` (con filtro stato)
- `EnergyFix` (con filtro stato)

Ma NON restituisce ancora:
- `EnergyEni` (SENZA filtro stato)
- `EnergyPercentFastweb`

### Soluzione
Modificare la stored procedure per aggiungere queste colonne.

**File di riferimento**: `/home/ubuntu/remote-server-folder/sql/UPDATE_SP_GetOrderStatisticsByAgent_V3_AddEni.sql`

### Istruzioni

1. **Aprire SQL Server Management Studio**

2. **Navigare a**: 
   ```
   Database: KAM
   > Programmability 
   > Stored Procedures 
   > dbo.GetOrderStatisticsByAgent_V3
   ```

3. **Fare clic destro** > **Modify**

4. **Aggiungere nella sezione SELECT**:

```sql
-- Energy ENI (SENZA filtro stato)
EnergyEni = COUNT(DISTINCT CASE 
    WHEN Operatore LIKE '%ENI%'  -- Verificare la condizione corretta
    -- NESSUN FILTRO SU Stato
    THEN [Codice Contratto] 
END),

-- Percentuale FASTWEB su Energy
EnergyPercentFastweb = CASE 
    WHEN (
        COUNT(DISTINCT CASE WHEN Operatore = 'FASTWEB ENERGIA' AND Stato IN (...) THEN [Codice Contratto] END) + 
        COUNT(DISTINCT CASE WHEN Operatore LIKE '%ENI%' THEN [Codice Contratto] END)
    ) > 0
    THEN CAST(
        (COUNT(DISTINCT CASE WHEN Operatore = 'FASTWEB ENERGIA' AND Stato IN (...) THEN [Codice Contratto] END) * 100.0) / 
        (COUNT(DISTINCT CASE WHEN Operatore = 'FASTWEB ENERGIA' AND Stato IN (...) THEN [Codice Contratto] END) + 
         COUNT(DISTINCT CASE WHEN Operatore LIKE '%ENI%' THEN [Codice Contratto] END))
        AS DECIMAL(10,2))
    ELSE 0
END
```

5. **Verificare**:
   - `EnergyCore`, `EnergyFlex`, `EnergyFix` mantengano il filtro stato
   - `EnergyEni` NON abbia filtro stato
   - La condizione per identificare ENI sia corretta (verificare con query di test)

6. **Eseguire** `ALTER PROCEDURE` per salvare

---

## 🧪 Testing

### 1. Eseguire Script Database
```sql
-- File: ALTER_ObiettiviAgenti_AddEnergyFields.sql
USE [KAM];
GO
-- Eseguire tutto lo script
```

### 2. Modificare Stored Procedure
Seguire le istruzioni sopra per `GetOrderStatisticsByAgent_V3`

### 3. Test SuperMaster
1. Login come SuperMaster
2. Andare in **Strumenti** > **Obiettivi Agenti**
3. Impostare obiettivi Energy:
   - Totali: 30
   - Core: 2
   - Flex: 2
   - Fix: 2
   - **ENI: 24**
   - **% FW minima: 20%**
4. Salvare

### 4. Test Agente
1. Login come Agente
2. Verificare **Dashboard** > Card Energy:
   - Mostra ENI
   - Mostra % FW
   - Totale = Core + Flex + Fix + ENI
3. Verificare **Obiettivi & Compensi**:
   - Mostra tutti i campi Energy
   - Progressi corretti

---

## 📊 Logica di Calcolo

### Energy Totale (Agente)
```javascript
energyAttuali = energyCore + energyFlex + energyFix + energyEni
```

### Percentuale FASTWEB Attuale
```javascript
energyFastweb = energyCore + energyFlex + energyFix
energyPercentFastweb = (energyFastweb / energyAttuali) * 100
```

### Validazione Obiettivo % FW
```javascript
if (energyPercentFastweb >= targetPercentFastweb) {
  // ✅ Obiettivo % FW raggiunto
} else {
  // ❌ Serve più FASTWEB
}
```

---

## 🔍 Query di Test

### Verificare dati ENI disponibili
```sql
SELECT TOP 100
    Operatore,
    Segmento,
    Stato,
    [Codice Contratto],
    [Data Inserimento],
    Agente
FROM FWEnergiaImporter
WHERE Operatore LIKE '%ENI%'
ORDER BY [Data Inserimento] DESC;
```

### Contare attivazioni ENI per agente
```sql
SELECT 
    Agente,
    COUNT(DISTINCT [Codice Contratto]) AS TotaleENI,
    COUNT(DISTINCT CASE WHEN Stato = 'INSERITO' THEN [Codice Contratto] END) AS ENI_Inserito,
    COUNT(DISTINCT CASE WHEN Stato = 'ATTIVO' THEN [Codice Contratto] END) AS ENI_Attivo,
    COUNT(DISTINCT CASE WHEN Stato = 'ANNULLATO' THEN [Codice Contratto] END) AS ENI_Annullato
FROM FWEnergiaImporter
WHERE Operatore LIKE '%ENI%'
    AND YEAR([Data Inserimento]) = 2025
    AND MONTH([Data Inserimento]) = 11
GROUP BY Agente
ORDER BY TotaleENI DESC;
```

---

## 📝 Note Importanti

1. **ENI senza filtro stato**: 
   - A differenza di FASTWEB ENERGIA, ENI conta TUTTE le attivazioni
   - Questo include: INSERITO, ATTIVO, LAVORAZIONE, ANNULLATO, etc.

2. **Percentuale FASTWEB**:
   - Serve per garantire un mix minimo di attivazioni FASTWEB
   - Esempio: se target è 20%, su 30 Energy totali almeno 6 devono essere FASTWEB

3. **Stored Procedure**:
   - La modifica alla SP è CRITICA per il funzionamento
   - Senza questa modifica, `EnergyEni` sarà sempre 0

4. **Compatibilità**:
   - Il sistema funziona anche senza dati ENI (default 0)
   - Gli obiettivi esistenti non sono impattati

---

## 🚀 Status Implementazione

| Componente | Status | Note |
|------------|--------|------|
| Database Schema | ⏳ Pending | Script creato, da eseguire |
| Backend API | ✅ Completato | Deployato |
| Frontend SuperMaster | ✅ Completato | Deployato |
| Frontend Agente | ✅ Completato | Deployato |
| Stored Procedure | ⚠️ Da Modificare | Istruzioni fornite |

---

## 📞 Supporto

Per problemi o domande:
1. Verificare i log del backend: `pm2 logs react-back`
2. Controllare la console del browser per errori frontend
3. Verificare che la SP restituisca le colonne `EnergyEni` e `EnergyPercentFastweb`

---

**Ultimo aggiornamento**: 2025-11-12
