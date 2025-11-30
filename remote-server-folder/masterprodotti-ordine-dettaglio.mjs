import express from 'express';
import sql from 'mssql';
import { authenticateToken } from './auth-middleware.mjs';

const router = express.Router();

// Endpoint dettaglio ordine MasterProdotti
router.get('/api/masterprodotti/ordine/:id', authenticateToken, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'ID non valido' });
  try {
    // Query testata ordine
    const testataRes = await sql.query`
      SELECT 
        o.IDOrdineProdotto,
        -- Alias usato dal frontend della modale
        o.IDOrdineProdotto AS [IDOrdine],
        FORMAT(o.[DataOra], 'dd.MM.yy') AS [Data],
        d.[RagioneSociale],
        o.[idStatoOrdineProdotto] AS [IdStatoOrdineProdotto],
        -- Totale ordine prodotti (euro)
        CAST(o.[TotaleOrdine] AS DECIMAL(10,2)) AS [TotaleOrdine],
        -- Spese di spedizione (euro)
        CAST(ISNULL(o.[SpeseSpedizione], 0) AS DECIMAL(10,2)) AS [SpeseSpedizione],
        -- Importo totale: prima del 16/08/2025 TotaleOrdine includeva già la spedizione; dopo, si somma.
        CAST(
          CASE 
            WHEN o.[DataOra] < '2025-08-16' THEN o.[TotaleOrdine]
            ELSE o.[TotaleOrdine] + ISNULL(o.[SpeseSpedizione], 0)
          END AS DECIMAL(10,2)
        ) AS [ImportoTotale],
        o.[NoteOrdine] AS [NOTE],
        s.[StatoEsteso],
        o.[OrdineDaAgente],
        o.[OrdineDA],
        o.[Payload],
        -- Stato spedizione risolto via ID numerico
        COALESCE(ss.[StatoEsteso], NULLIF(o.[stato_spedizione], '')) AS [StatoSpedizione],
        o.[idStatoSpedizione]       AS [IdStatoSpedizione],
        CASE 
          WHEN o.[idStatoOrdineProdotto] IN (20,22) THEN 'Pagato'
          WHEN o.[idStatoOrdineProdotto] = 21 THEN 'Bonifico (in attesa)'
          WHEN o.[idStatoOrdineProdotto] = 0 THEN 'In attesa pagamento'
          WHEN o.[idStatoOrdineProdotto] = 1 THEN 'Annullato'
          ELSE '-'
        END AS [StatoPagamento],
        -- Metodo di pagamento basato sullo stato
        CASE 
          WHEN o.[idStatoOrdineProdotto] = 20 THEN 'Carta di credito'
          WHEN o.[idStatoOrdineProdotto] = 21 THEN 'Bonifico SEPA'
          WHEN o.[idStatoOrdineProdotto] = 22 THEN 'Pagato (manuale)'
          ELSE 'Non specificato'
        END AS [MetodoPagamento]
      FROM [dbo].[tbOrdiniProdotti] o
      INNER JOIN [dbo].[tbDealers] d ON o.[idDealer] = d.[idDealer]
      INNER JOIN [dbo].[tbStatiOrdiniProdotti] s ON o.[idStatoOrdineProdotto] = s.[IDStato]
      LEFT JOIN [dbo].[tbStatiSpedizioneOrdiniProdotti] ss ON ss.[IDStato] = o.[idStatoSpedizione]
      WHERE o.IDOrdineProdotto = ${id}
    `;
    if (!testataRes.recordset.length) return res.status(404).json({ error: 'Ordine non trovato' });
    const testata = testataRes.recordset[0];

    // Query dettagli prodotti
    const dettagliRes = await sql.query`
      SELECT 
        dop.IDDettagliOrdiniProdotti,
        dop.idOrdineProdotto,
        dop.idOfferta,
        -- Nome prodotto con alias atteso dal frontend
        o.Titolo AS Titolo,
        dop.Quantita,
        dop.CostoUnitario,
        -- Prezzo unitario in euro (coerente con dealer)
        CAST(dop.CostoUnitario AS DECIMAL(10,2)) AS PrezzoUnitario,
        dop.SIMTYPE,
        dop.SIMCOUNT
      FROM dbo.tbDettagliOrdiniProdotti dop
      LEFT JOIN dbo.tbOfferte o ON dop.idOfferta = o.IDOfferta
      WHERE dop.idOrdineProdotto = ${id}
    `;
    let prodotti = dettagliRes.recordset;

    if ((!prodotti || prodotti.length === 0) && testata.Payload) {
      try {
        const parsed = JSON.parse(testata.Payload);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const offerIds = Array.from(new Set(parsed
            .map(p => Number(p?.idOfferta))
            .filter(id => Number.isInteger(id) && id > 0)));

          const offerteMap = new Map();
          if (offerIds.length > 0) {
            const idsList = offerIds.join(',');
            const offerteRes = await sql.query(`
              SELECT IDOfferta, Titolo
              FROM dbo.tbOfferte
              WHERE IDOfferta IN (${idsList})
            `);
            offerteRes.recordset.forEach(row => {
              offerteMap.set(Number(row.IDOfferta), row.Titolo);
            });
          }

          prodotti = parsed.map(item => {
            const idOfferta = Number(item?.idOfferta) || null;
            const quantita = Number(item?.quantita ?? item?.qty ?? 1) || 1;
            const prezzoRaw = Number(item?.prezzo ?? item?.Prezzo ?? 0);
            const prezzo = prezzoRaw >= 1000 ? prezzoRaw / 100 : prezzoRaw;
            return {
              IDDettagliOrdiniProdotti: null,
              idOrdineProdotto: testata.IDOrdineProdotto,
              idOfferta,
              Titolo: offerteMap.get(idOfferta) || item?.nome || 'Prodotto',
              Quantita: quantita,
              PrezzoUnitario: prezzo,
              CostoUnitario: prezzo,
            };
          });
        }
      } catch (parseErr) {
        console.warn('[MASTERPRODOTTI][DETTAGLIO ORDINE] Impossibile parsare Payload ordine:', parseErr?.message || parseErr);
      }
    }

    const fotoRes = await sql.query`
      SELECT ID, IDOrdineProdotto, S3Key, Url, OriginalName, CreatedAt
      FROM dbo.tbOrdiniProdottiFoto
      WHERE IDOrdineProdotto = ${id}
      ORDER BY ID DESC
    `;

    const bucket = (process.env.S3_BUCKET_NAME && process.env.S3_BUCKET_NAME.trim()) || 'contrattistation';
    const region = (process.env.AWS_REGION && process.env.AWS_REGION.trim()) || 'eu-west-1';

    const allegati = fotoRes.recordset.map((row) => {
      const rawUrl = typeof row.Url === 'string' ? row.Url.trim() : '';
      const fallbackUrl = row.S3Key
        ? `https://${bucket}.s3.${region}.amazonaws.com/${row.S3Key}`
        : null;
      return {
        id: row.ID,
        ordineId: row.IDOrdineProdotto,
        nome: row.OriginalName || 'allegato.jpg',
        key: row.S3Key || null,
        url: rawUrl || fallbackUrl,
        createdAt: row.CreatedAt || null,
      };
    }).filter((item) => !!item.url);

    const responsePayload = { ...testata, prodotti, allegati };
    delete responsePayload.Payload;
    return res.json(responsePayload);
  } catch (err) {
    console.error('[MASTERPRODOTTI][DETTAGLIO ORDINE] Errore:', err);
    res.status(500).json({ error: 'Errore server', details: err.message });
  }
});

export default router;
