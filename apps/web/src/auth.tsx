import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { UserProfile } from "@osa/shared-types";
import { api, getStoredToken, setStoredToken } from "./api.js";

interface AuthContextValue {
  user: UserProfile | null;
  token: string | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string, displayName?: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  token: null,
  loading: true,
  login: async () => {},
  register: async () => {},
  logout: () => {},
});

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [token, setToken] = useState<string | null>(getStoredToken);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    api.getMe().then((me) => {
      if (me) {
        setUser({ id: me.userId, username: me.username, displayName: me.username, role: me.role as UserProfile["role"], createdAt: "" });
      } else {
        setStoredToken(null);
        setToken(null);
      }
      setLoading(false);
    });
  }, [token]);

  const login = useCallback(async (username: string, password: string) => {
    const res = await api.login(username, password);
    setStoredToken(res.token);
    setToken(res.token);
    setUser(res.user);
  }, []);

  const register = useCallback(async (username: string, password: string, displayName?: string) => {
    const res = await api.register(username, password, displayName);
    setStoredToken(res.token);
    setToken(res.token);
    setUser(res.user);
  }, []);

  const logout = useCallback(() => {
    setStoredToken(null);
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
