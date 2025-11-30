# 📧 Sistema Email Personalizzate - Kim Station

## 🧪 Modalità Test (ATTUALE)

**Stato attuale:** MODALITÀ TEST ATTIVA
- Tutte le email vengono reindirizzate a: `comunicazioni@kimweb.it`
- Le email mostrano i destinatari originali nel contenuto
- Oggetto prefissato con `[TEST MODE]`

### Configurazione Attuale (.env)
```env
EMAIL_TEST_MODE=true
EMAIL_TEST_RECIPIENT=comunicazioni@kimweb.it
```

## 🚀 Passaggio alla Produzione

**Per attivare l'invio reale alle email degli utenti:**

1. **Modifica il file `.env`:**
```env
EMAIL_TEST_MODE=false
# EMAIL_TEST_RECIPIENT=comunicazioni@kimweb.it  # Commenta o rimuovi questa riga
```

2. **Riavvia il backend:**
```bash
pm2 restart developers-back
```

3. **Verifica il cambio:**
- Le email verranno inviate ai destinatari reali
- Nessun prefisso `[TEST MODE]` nell'oggetto
- Nessun banner di test nel contenuto

## 🔧 Test del Sistema

### Test Rapido
Visita: `https://arm.kimweb.agency/test-email-simple.html`

### Test Completo
1. Accedi come MASTER/SUPERMASTER
2. Vai su: `https://arm.kimweb.agency/email-templates.html`
3. Crea/modifica template e invia test

### Test Automatico
```bash
curl -X POST https://arm.kimweb.agency/api/email-templates/system/test \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{}'
```

## 📋 Eventi Email Supportati

| Evento | Trigger | Destinatario |
|--------|---------|--------------|
| `NUOVA_ATTIVAZIONE` | Nuovo ordine creato | Dealer |
| `CAMBIO_STATO` | Stato ordine modificato | Dealer |
| `RICARICA_PLAFOND` | Ricarica completata | Dealer |
| `RICHIESTA_ASSISTENZA` | Richiesta assistenza | Team + Dealer |
| `OBIETTIVO_RAGGIUNTO` | Obiettivo completato | Agente |
| `OBIETTIVO_MANCATO` | Obiettivo non raggiunto | Agente |
| `NUOVO_DEALER` | Dealer registrato | Master + Dealer |
| `CONTRATTO_APPROVATO` | Contratto accettato | Dealer |
| `CONTRATTO_RIFIUTATO` | Contratto rifiutato | Dealer |
| `REPORT_SETTIMANALE` | Report automatico | Master/SuperMaster |
| `REPORT_MENSILE` | Report automatico | Master/SuperMaster |

## 🎯 Placeholder Disponibili

### Ordini e Attivazioni
- `{{IDORDINE}}` - ID dell'ordine
- `{{DEALERNOME}}` - Nome del dealer
- `{{RAGIONESOCIALE}}` - Ragione sociale dealer
- `{{OFFERTATITOLO}}` - Titolo dell'offerta
- `{{OPERATORE}}` - Nome operatore
- `{{STATOESTESO}}` - Stato esteso ordine
- `{{NOTEDEALER}}` - Note del dealer

### Cliente
- `{{CLIENTENOME}}` - Nome cliente
- `{{CLIENTECOGNOME}}` - Cognome cliente
- `{{CLIENTEEMAIL}}` - Email cliente

### Ricariche
- `{{AMOUNT}}` - Importo ricarica
- `{{TRANSACTIONID}}` - ID transazione

### Obiettivi (Agenti)
- `{{GOALTYPE}}` - Tipo obiettivo
- `{{GOALTARGET}}` - Target obiettivo
- `{{GOALACHIEVED}}` - Valore raggiunto
- `{{GOALPERCENTAGE}}` - Percentuale completamento

### Date e Orari
- `{{DATE}}` - Data corrente (formato italiano)
- `{{TIME}}` - Ora corrente
- `{{DATETIME}}` - Data e ora complete

## ⚙️ Configurazione SMTP

```env
EMAIL_HOST=mail.kimweb.agency
EMAIL_PORT=465
EMAIL_SECURE=true
EMAIL_USER=kimstation.noreply@kimweb.agency
EMAIL_PASSWORD='#k2oOf$$#6km'
ADMIN_EMAIL=comunicazioni@kimweb.it
```

## 🔍 Troubleshooting

### Email non arrivano
1. Verifica configurazione SMTP
2. Controlla log backend: `pm2 logs developers-back`
3. Verifica che `EMAIL_TEST_MODE=true` per test

### Errori di autenticazione
1. Verifica credenziali EMAIL_USER/EMAIL_PASSWORD
2. Controlla che l'account email sia attivo
3. Verifica firewall/porte (465 per SSL)

### Template non funzionano
1. Verifica che la tabella `tbEmailTemplates` esista
2. Esegui script SQL di popolamento
3. Controlla che i template siano attivi (`IsActive=1`)

## 📝 Log di Debug

Il sistema logga tutte le operazioni email:
```bash
pm2 logs developers-back | grep EMAIL
```

Esempi di log:
- `[EMAIL] MODALITÀ TEST ATTIVA - Email reindirizzata da: dealer@test.com a: comunicazioni@kimweb.it`
- `[EMAIL] Email inviata in MODALITÀ TEST a: comunicazioni@kimweb.it - MessageID: xxx`
- `[EMAIL] Email di conferma inviata per ordine: 12345`
