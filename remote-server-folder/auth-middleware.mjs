// auth-middleware.mjs
import jwt from 'jsonwebtoken';

const PUBLIC_ROUTES = [
  '/api/login',
  '/api/test-password',
  '/health',
  '/api/password-reset-request',
  '/api/password-reset-confirm',
  '/api/reset-password',
  '/api/reset-password/',
  '/api/logout'
];

export function authenticateToken(req, res, next) {
  // Debug: log path for troubleshooting
  console.log('[AUTH DEBUG] Path richiesta:', req.path);
  // Allow public routes (match any path that starts with a public route)
  if (PUBLIC_ROUTES.some(route => req.path === route || req.path.startsWith(route))) return next();
  if (PUBLIC_ROUTES.includes(req.path)) return next();

  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.sendStatus(401);
  try {
    const rawUser = jwt.verify(token, process.env.JWT_SECRET || 'secret');

    // Normalize roles to uppercase array
    const ruoliRaw = rawUser?.ruoli ?? rawUser?.Ruoli ?? rawUser?.roles ?? rawUser?.role ?? rawUser?.ruolo ?? rawUser?.Ruolo;
    const ruoliArr = Array.isArray(ruoliRaw) ? ruoliRaw : (ruoliRaw != null ? [ruoliRaw] : []);
    const ruoli = ruoliArr
      .map(r => (r == null ? '' : r.toString()).toUpperCase())
      .filter(r => r.length > 0);
    const ruolo = ruoli[0] || (rawUser?.ruolo || rawUser?.Ruolo || '')?.toString().toUpperCase() || undefined;

    // Common IDs/claims normalization
    const rawDealerId = rawUser?.dealerId ?? rawUser?.idDealer;
    const rawIdDealer = rawUser?.idDealer ?? rawUser?.dealerId;
    const rawIdAgente = rawUser?.idAgente ?? rawUser?.agenteId;
    const rawUserId = rawUser?.userId ?? rawUser?.id ?? rawUser?.ID;
    const rawRagioneSociale = rawUser?.ragioneSociale ?? rawUser?.dealerName ?? rawUser?.RagioneSociale;

    // Normalize names for agente
    const agenteNomeNorm = (
      rawUser?.agenteNome ??
      rawUser?.nomeAgente ??
      rawUser?.nome ??
      rawUser?.Nome ??
      rawUser?.username ??
      undefined
    );

    // Normalize IDs taking into account roles
    const hasRole = (r) => ruoli.includes(String(r).toUpperCase());
    const normalizedDealerId = (() => {
      // prefer explicit dealer id claims
      let d = rawDealerId ?? rawIdDealer;
      // if user is DEALER and no explicit dealerId, fallback to userId
      if ((d == null || d === '') && (hasRole('DEALER') || hasRole('MASTERPRODOTTI') || hasRole('MASTER'))) {
        d = rawUserId;
      }
      d = Number(d);
      return Number.isInteger(d) && d > 0 ? d : undefined;
    })();
    const normalizedIdDealer = normalizedDealerId; // alias
    const normalizedIdAgente = (() => {
      let a = rawIdAgente;
      if ((a == null || a === '') && hasRole('AGENTE')) {
        a = rawUserId;
      }
      a = Number(a);
      return Number.isInteger(a) && a > 0 ? a : undefined;
    })();

    // SUPERMASTER: set readable defaults for strings only (no fake numeric IDs)
    const ragioneSocialeNorm = rawRagioneSociale || (ruoli.includes('SUPERMASTER') ? 'SUPERMASTER' : undefined);
    const agenteNomeFinal = agenteNomeNorm || (ruoli.includes('SUPERMASTER') ? 'GIACOMO' : undefined);

    req.user = {
      ...rawUser,
      // normalized identifiers
      userId: rawUserId,
      email: rawUser.email,
      nome: rawUser.nome || rawUser.Nome,
      cognome: rawUser.cognome || rawUser.Cognome,
      // normalized roles
      ruoli,
      ruolo,
      // attach commonly used claims
      dealerId: normalizedDealerId,
      idDealer: normalizedIdDealer,
      idAgente: normalizedIdAgente,
      agenteNome: agenteNomeFinal,
      ragioneSociale: ragioneSocialeNorm,
      idGruppo: rawUser.idGruppo
    };

    console.log('[AUTH DEBUG] Utente normalizzato:', {
      email: req.user.email,
      ruolo: req.user.ruolo,
      ruoli: req.user.ruoli,
      dealerId: req.user.dealerId,
      idDealer: req.user.idDealer,
      idAgente: req.user.idAgente,
      agenteNome: req.user.agenteNome,
      ragioneSociale: req.user.ragioneSociale,
      idGruppo: req.user.idGruppo
    });
    next();
  } catch (err) {
    // Estrai info dal token scaduto per debug (senza verificare la firma)
    let tokenInfo = 'unknown';
    try {
      const decoded = jwt.decode(token);
      tokenInfo = decoded?.email || decoded?.UserName || decoded?.userId || 'unknown';
    } catch {}
    
    console.error(`[AUTH] Errore jwt.verify: ${err.message} | User: ${tokenInfo} | Path: ${req.path}`);
    
    // Se il token è scaduto o non valido, forza logout lato client
    if (err.message === 'jwt expired' || err.message === 'invalid signature') {
      return res.status(401).json({ error: 'Token scaduto', forceLogout: true });
    }
    return res.sendStatus(403); // se il token non è valido, proibito
  }
}

