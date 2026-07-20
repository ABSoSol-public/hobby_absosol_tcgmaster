// Login-Gate für die gesamte App: solange kein User feststeht, wird nur
// LoginPage gerendert — GameProvider/App (und damit alle API-Aufrufe) starten
// erst danach. Das Backend meldet eine abgelaufene/fehlende Session per 401,
// worauf `api.ts` das Event "auth:unauthorized" feuert; wir hören hier drauf
// und fallen sofort zurück auf den Login, egal wo in der App das passiert ist.
import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { api } from './api';
import LoginPage from './pages/LoginPage';
import { AuthUser } from './types';

interface AuthContextValue {
  user: AuthUser;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [checking, setChecking] = useState(true);

  const checkSession = useCallback(() => {
    api
      .me()
      .then((r) => setUser(r.data))
      .catch(() => setUser(null))
      .finally(() => setChecking(false));
  }, []);

  useEffect(checkSession, [checkSession]);

  useEffect(() => {
    const onUnauthorized = () => setUser(null);
    window.addEventListener('auth:unauthorized', onUnauthorized);
    return () => window.removeEventListener('auth:unauthorized', onUnauthorized);
  }, []);

  const logout = useCallback(() => {
    api.logout().finally(() => setUser(null));
  }, []);

  if (checking) return null;
  if (!user) return <LoginPage onLoggedIn={(u) => setUser(u)} />;

  return <AuthContext.Provider value={{ user, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth muss innerhalb von AuthProvider verwendet werden');
  return ctx;
}
