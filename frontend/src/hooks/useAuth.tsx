import {
  createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { tokens } from '@/services/api';
import { authApi } from '@/services/endpoints';
import type { User } from '@/types';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (fullName: string, email: string, password: string) => Promise<User>;
  startGuest: () => Promise<User>;
  logout: () => void;
  setUser: (user: User) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Shared so a double-mounted effect (React StrictMode) creates one guest, not two.
let guestRequest: ReturnType<typeof authApi.guest> | null = null;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();

  // Restore the session on boot. A stale token is cleared rather than looping on 401s.
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!tokens.access()) {
        setLoading(false);
        return;
      }
      try {
        const me = await authApi.me();
        if (alive) setUser(me);
      } catch {
        tokens.clear();
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const data = await authApi.login({ email, password });
    tokens.set(data.tokens);
    setUser(data.user);
    return data.user;
  }, []);

  const register = useCallback(async (fullName: string, email: string, password: string) => {
    const data = await authApi.register({ full_name: fullName, email, password });
    tokens.set(data.tokens);
    setUser(data.user);
    return data.user;
  }, []);

  const startGuest = useCallback(async () => {
    guestRequest ??= authApi.guest().finally(() => { guestRequest = null; });
    const data = await guestRequest;
    tokens.set(data.tokens);
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(() => {
    authApi.logout().catch(() => {});
    tokens.clear();
    setUser(null);
    queryClient.clear();
  }, [queryClient]);

  const value = useMemo(
    () => ({ user, loading, login, register, startGuest, logout, setUser }),
    [user, loading, login, register, startGuest, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
