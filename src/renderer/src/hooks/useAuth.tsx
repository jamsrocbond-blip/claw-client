import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { User, AuthStatus } from '../../../shared/types';

interface AuthContextType {
  isLoggedIn: boolean;
  loading: boolean;
  user: User | null;
  token: string | null;
  login: (email: string, password: string, apiUrl: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  apiUrl: string | null;
}

const AuthContext = createContext<AuthContextType>({
  isLoggedIn: false,
  loading: true,
  user: null,
  token: null,
  login: async () => ({ success: false }),
  logout: async () => {},
  apiUrl: null,
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [apiUrl, setApiUrl] = useState<string | null>(null);

  // 初始化检查
  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      if (!window.electronAPI || typeof window.electronAPI.getAuthStatus !== 'function') {
        console.warn('electronAPI not available. Ensure app is launched via Electron (npm run dev at project root).');
        setIsLoggedIn(false);
        return;
      }
      const status: AuthStatus = await window.electronAPI.getAuthStatus();
      setIsLoggedIn(status.isLoggedIn);
      setUser(status.user || null);
      setToken(status.token || null);
      setApiUrl(status.apiUrl || null);

      // 已登录（含 test-token 自动登录）则自动连接 Gateway
      if (status.isLoggedIn) {
        try {
          await window.electronAPI.wsConnect();
        } catch (err) {
          console.warn('[Auth] Auto WS connect failed:', err);
        }
      }
    } catch (err) {
      console.error('Auth check failed:', err);
    } finally {
      setLoading(false);
    }
  };

  const login = useCallback(async (email: string, password: string, api: string) => {
    const result = await window.electronAPI.login(email, password, api);
    if (result.success) {
      setIsLoggedIn(true);
      setUser(result.user || null);
      setToken(result.token || null);
      setApiUrl(api);
      // 登录成功后主进程已自动触发 wsConnect，无需重复调用
    }
    return result;
  }, []);

  const logout = useCallback(async () => {
    await window.electronAPI.logout();
    setIsLoggedIn(false);
    setUser(null);
    setToken(null);
  }, []);

  return (
    <AuthContext.Provider value={{ isLoggedIn, loading, user, token, login, logout, apiUrl }}>
      {children}
    </AuthContext.Provider>
  );
};
