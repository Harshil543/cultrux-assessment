import React, { createContext, useContext, useMemo, useState } from 'react';
import { api } from './api';

type User = { id: number; email: string };

type AuthContextValue = {
  user: User | null;
  isAuthenticated: boolean;
  authReady: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);

  React.useEffect(() => {
    // Migrate away from previous localStorage JWT approach
    localStorage.removeItem('cultrux_token');

    let cancelled = false;
    api<User>('/auth/me')
      .then((me) => {
        if (!cancelled) setUser(me);
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        if (!cancelled) setAuthReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: !!user,
      authReady,
      async login(email, password) {
        const data = await api<{ user: User }>('/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email, password }),
        });
        setUser(data.user);
      },
      async signup(email, password) {
        const data = await api<{ user: User }>('/auth/signup', {
          method: 'POST',
          body: JSON.stringify({ email, password }),
        });
        setUser(data.user);
      },
      async logout() {
        try {
          await api('/auth/logout', { method: 'POST' });
        } finally {
          setUser(null);
        }
      },
    }),
    [user, authReady],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}
