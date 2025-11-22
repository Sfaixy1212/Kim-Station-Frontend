import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  getToken as getBaseToken,
  getElevatedToken,
  saveElevatedToken,
  removeElevatedToken,
  getTokenBaseCache,
  setTokenBaseCache,
  verifyTotp,
} from '../services/api';

/**
 * Hook per gestire il token elevato (scope: incentivi) basato su TOTP.
 * - Invalida automaticamente se cambia il token base.
 * - Espone metodi per richiedere/verificare TOTP e ottenere il token elevato.
 */
export function useElevatedToken() {
  const [elevatedToken, setElevatedToken] = useState(() => getElevatedToken() || '');
  const [checking, setChecking] = useState(true);

  // invalida token elevato se è cambiato il token base
  const ensureCache = useCallback(() => {
    const base = getBaseToken() || '';
    const cached = getTokenBaseCache() || '';
    if (base !== cached) {
      removeElevatedToken();
      setElevatedToken('');
      setTokenBaseCache(base);
      return false;
    }
    return true;
  }, []);

  useEffect(() => {
    ensureCache();
    setChecking(false);
  }, [ensureCache]);

  const hasValidToken = useMemo(() => !!elevatedToken, [elevatedToken]);

  const request = useCallback(async (code6) => {
    if (!/^[0-9]{6}$/.test(code6 || '')) {
      throw new Error('Codice TOTP non valido');
    }
    // verify on backend -> returns { token }
    const res = await verifyTotp(code6);
    const token = res?.token;
    if (!token) throw new Error('Token elevato non ricevuto');
    saveElevatedToken(token);
    setElevatedToken(token);
    return token;
  }, []);

  const clear = useCallback(() => {
    removeElevatedToken();
    setElevatedToken('');
  }, []);

  return { elevatedToken, hasValidToken, checking, request, clear, ensureCache };
}
