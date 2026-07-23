'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { apiFetch } from './api-client';

const CLAVE_STORAGE = 'psdte.accessToken';

export interface SesionUsuario {
  accessToken: string;
  roles: string[];
}

interface LoginResultado {
  requiereMfa: boolean;
  mfaPendingToken?: string;
  accessToken?: string;
}

interface MfaVerifyResultado {
  accessToken: string;
}

interface AuthContextValor {
  sesion: SesionUsuario | null;
  cargando: boolean;
  login(username: string, password: string): Promise<{ requiereMfa: boolean; mfaPendingToken?: string }>;
  verificarMfa(mfaPendingToken: string, codigo: string): Promise<void>;
  logout(): void;
}

function decodificarRoles(accessToken: string): string[] {
  try {
    const payload = JSON.parse(atob(accessToken.split('.')[1]));
    return Array.isArray(payload.roles) ? payload.roles : [];
  } catch {
    return [];
  }
}

const AuthContext = createContext<AuthContextValor | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [sesion, setSesion] = useState<SesionUsuario | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    const guardado = typeof window !== 'undefined' ? window.sessionStorage.getItem(CLAVE_STORAGE) : null;
    if (guardado) {
      setSesion({ accessToken: guardado, roles: decodificarRoles(guardado) });
    }
    setCargando(false);
  }, []);

  const guardarSesion = useCallback((accessToken: string) => {
    window.sessionStorage.setItem(CLAVE_STORAGE, accessToken);
    setSesion({ accessToken, roles: decodificarRoles(accessToken) });
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const resultado = await apiFetch<LoginResultado>('/auth/login', { method: 'POST', body: { username, password } });
    if (!resultado.requiereMfa && resultado.accessToken) {
      guardarSesion(resultado.accessToken);
      return { requiereMfa: false };
    }
    return { requiereMfa: true, mfaPendingToken: resultado.mfaPendingToken };
  }, [guardarSesion]);

  const verificarMfa = useCallback(async (mfaPendingToken: string, codigo: string) => {
    const resultado = await apiFetch<MfaVerifyResultado>('/auth/mfa/verify', { method: 'POST', body: { mfaPendingToken, codigo } });
    guardarSesion(resultado.accessToken);
  }, [guardarSesion]);

  const logout = useCallback(() => {
    window.sessionStorage.removeItem(CLAVE_STORAGE);
    setSesion(null);
  }, []);

  const valor = useMemo(() => ({ sesion, cargando, login, verificarMfa, logout }), [sesion, cargando, login, verificarMfa, logout]);

  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValor {
  const contexto = useContext(AuthContext);
  if (!contexto) {
    throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  }
  return contexto;
}
