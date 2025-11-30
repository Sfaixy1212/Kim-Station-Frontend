// Modulo dedicato alle API per l'andamento mensile degli agenti
import sql from 'mssql';
import { authenticateToken } from './auth-middleware.mjs';

export default function(app) {
  // GET: Andamento mensile per l'agente corrente (basato sul token)
  app.get('/api/agente/andamento', authenticateToken, async (req, res) => {
    try {
      console.log('[AndamentoAgente] Richiesta ricevuta, token user:', req.user);
      
      // Controllo token e dati utente
      if (!req.user) {
        console.error('[AndamentoAgente] Errore: token utente mancante');
        return res.status(401).json({ 
          success: false, 
          error: 'Token di autenticazione non valido' 
        });
      }
      
      // Estrai nome agente dal token (preferisci agenteNome)
      const agenteNome = req.user.agenteNome || req.user.nome || req.user.username;
      if (!agenteNome) {
        console.error('[AndamentoAgente] Errore: agenteNome non trovato nel token');
        // Produzione: nessun dato demo. Restituisci array vuoto.
        return res.json({
          success: true,
          esempioGenerato: false,
          data: [],
          message: 'Nessun dato disponibile: agenteNome assente nel token'
        });
      }
      
      // Legge ?year dal query string e valida, altrimenti anno corrente
      const qYear = parseInt(req.query?.year, 10);
      const currentYear = new Date().getFullYear();
      const annoRichiesto = Number.isInteger(qYear) && qYear >= 2000 && qYear <= 2100 ? qYear : currentYear;
      console.log(`[AndamentoAgente] Query ufnGetAndamentoMensile per agente: ${agenteNome}, anno: ${annoRichiesto}`);

      const sqlReq = new sql.Request();
      sqlReq.input('agenteNome', sql.NVarChar, agenteNome);
      sqlReq.input('anno', sql.Int, annoRichiesto);
      const query = 'SELECT * FROM dbo.ufnGetAndamentoMensile(@agenteNome, @anno)';
      const qResult = await sqlReq.query(query);

      // Mappa i campi nel formato atteso dal frontend, senza taglio: penserà il frontend a prendere gli ultimi 6
      const transformedData = (qResult.recordset || []).map(r => ({
        ANNO_MESE: String(r.AnnoMese || ''),
        MOBILE: Number(r.MOBILE || 0),
        FISSO: Number(r.FISSO || 0),
        ENERGIA: Number(r.ENERGIA || 0),
        PRODOTTI: Number(r.PRODOTTI || 0)
      }));

      const result = { recordset: transformedData };
      console.log('[AndamentoAgente] Righe ottenute:', result.recordset.length);
      
      // Se non ci sono risultati, NON usare dati di esempio: restituisci vuoto
      if (!result.recordset || result.recordset.length === 0) {
        console.log('[AndamentoAgente] Nessun dato reale trovato, ritorno array vuoto');
        return res.json({
          success: true,
          esempioGenerato: false,
          data: [],
          message: 'Nessun dato reale trovato per questo agente/anno'
        });
      }
      
      // Restituisci i dati
      res.json({ 
        success: true, 
        data: result.recordset,
        esempioGenerato: false
      });
      
    } catch (err) {
      console.error('[AndamentoAgente] Errore:', err);
      res.status(500).json({ 
        success: false, 
        error: 'Errore nel recupero andamento mensile', 
        details: err.message 
      });
    }
  });
}
