import sql from 'mssql';
import { authenticateToken } from './auth-middleware.mjs';
import { withCache } from './redis-client.mjs';

export default function(app) {
  app.get('/api/supermaster/classifica-agenti', authenticateToken, async (req, res) => {
    try {
      const year = req.query.year ? parseInt(String(req.query.year), 10) : null;
      const month = req.query.month ? parseInt(String(req.query.month), 10) : null;
      
      // Cache key basata su anno/mese
      const cacheKey = `classifica:agenti:${year || 'current'}:${month || 'current'}`;
      
      const result = await withCache(cacheKey, 1800, async () => {
        // 1800 secondi = 30 minuti
        await sql.connect(process.env.SQL_CONNECTION_STRING);
        const dbName = (process.env.DB_NAME || '').trim() || 'KAM';
      const request = new sql.Request();
      request.input('anno', sql.Int, Number.isFinite(year) ? year : null);
      request.input('mese', sql.Int, Number.isFinite(month) ? month : null);
      const result = await request.query(`
        DECLARE @startOfMonth DATE = COALESCE(
          TRY_CONVERT(date, CONCAT(@anno, RIGHT(CONCAT('0', @mese), 2), '01'), 112),
          DATEADD(MONTH, DATEDIFF(MONTH, 0, GETDATE()), 0)
        );
        DECLARE @endOfMonth   DATE = DATEADD(MONTH, 1, @startOfMonth);
        DECLARE @annoEff INT = YEAR(@startOfMonth);
        DECLARE @meseEff INT = MONTH(@startOfMonth);

        WITH DealerPerAgente AS (
          SELECT UPPER(LTRIM(RTRIM(d.Agente))) AS Agente, d.IDDealer
          FROM dbo.tbDealers d
          WHERE d.Agente IS NOT NULL AND LTRIM(RTRIM(d.Agente)) <> ''
        ),
        TotaliVista AS (
          SELECT UPPER(LTRIM(RTRIM(AGENTE))) AS Agente,
                 SUM(tlc_fisso_inseriti)  AS Fissi,
                 SUM(tlc_mobile_inseriti) AS Mobili,
                 SUM(dealer_ingaggiati)   AS DealerIngaggiati
          FROM dbo.vw_agenti_province_mensile
          WHERE Anno = @annoEff AND Mese = @meseEff
          GROUP BY UPPER(LTRIM(RTRIM(AGENTE)))
        )
        SELECT d.Agente,
               COUNT(DISTINCT d.IDDealer) AS DealerTotali,
               ISNULL(tv.DealerIngaggiati, 0) AS DealerIngaggiati,
               ISNULL(tv.Fissi, 0) + ISNULL(tv.Mobili, 0) AS TotaleAttivazioni,
               CAST(ISNULL(tv.Fissi, 0) + ISNULL(tv.Mobili, 0) AS FLOAT) / NULLIF(COUNT(DISTINCT d.IDDealer), 0) AS MediaAttivazioniPerDealer
        FROM DealerPerAgente d
        LEFT JOIN TotaliVista tv ON tv.Agente = d.Agente
        WHERE LTRIM(RTRIM(d.Agente)) <> '' AND ISNULL(tv.Fissi, 0) + ISNULL(tv.Mobili, 0) > 0
        GROUP BY d.Agente, tv.DealerIngaggiati, tv.Fissi, tv.Mobili
        ORDER BY (ISNULL(tv.Fissi, 0) + ISNULL(tv.Mobili, 0)) DESC;
      `);
        return result.recordset || [];
      });
      
      res.json(result);
    } catch (e) {
      console.error('[SuperMaster] Errore classifica agenti:', e);
      res.status(500).json({ error: 'Errore classifica agenti', details: e.message });
    }
  });
}
