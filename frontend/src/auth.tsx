import React, { createContext, useContext, useMemo, useState } from 'react';
import { api, getToken, setToken } from './api';

type User = { id: number; email: string };

type AuthContextValue = {
  user: User | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setTokenState] = useState<string | null>(getToken());
  const [user, setUser] = useState<User | null>(null);

  React.useEffect(() => {
    if (!token) {
      setUser(null);
      return;
    }
    api<User>('/auth/me')
      .then(setUser)
      .catch(() => {
        setToken(null);
        setTokenState(null);
        setUser(null);
      });
  }, [token]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      async login(email, password) {
        const data = await api<{ token: string; user: User }>('/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email, password }),
        });
        setToken(data.token);
        setTokenState(data.token);
        setUser(data.user);
      },
      async signup(email, password) {
        const data = await api<{ token: string; user: User }>('/auth/signup', {
          method: 'POST',
          body: JSON.stringify({ email, password }),
        });
        setToken(data.token);
        setTokenState(data.token);
        setUser(data.user);
      },
      logout() {
        setToken(null);
        setTokenState(null);
        setUser(null);
      },
    }),
    [token, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}
