import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { api } from '../api';
import { tokenStore } from '../api/client';
import type { User } from '../types';

const USER_KEY = 'ccp.user';

interface AuthState {
  user: User | null;
  login(username: string, password: string): Promise<User>;
  logout(): void;
}

const AuthContext = createContext<AuthState | null>(null);

function loadUser(): User | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw && tokenStore.get() ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  // The cached user lets drivers open the app offline; the backend re-checks the token on every call.
  const [user, setUser] = useState<User | null>(loadUser);

  const logout = useCallback(() => {
    tokenStore.set(null);
    try {
      localStorage.removeItem(USER_KEY);
    } catch {
      /* ignore */
    }
    setUser(null);
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const session = await api.login(username, password);
    tokenStore.set(session.token);
    try {
      localStorage.setItem(USER_KEY, JSON.stringify(session.user));
    } catch {
      /* ignore */
    }
    setUser(session.user);
    return session.user;
  }, []);

  useEffect(() => {
    window.addEventListener('auth:expired', logout);
    return () => window.removeEventListener('auth:expired', logout);
  }, [logout]);

  const value = useMemo(() => ({ user, login, logout }), [user, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
