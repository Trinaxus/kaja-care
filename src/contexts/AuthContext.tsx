import { createContext, useContext, useEffect, useState } from 'react';
import type { Profile } from '../lib/database.types';

interface AuthContextType {
  profile: Profile | null;
  loading: boolean;
  switchProfile: (email: string, password: string) => Promise<void>;
  refreshMe: () => Promise<void>;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const run = async () => {
      const savedProfile = localStorage.getItem('currentProfile');
      if (savedProfile) {
        try {
          setProfile(JSON.parse(savedProfile));
        } catch (error) {
          console.error('Error loading saved profile:', error);
        }
      }

      const baseUrl = import.meta.env.VITE_SERVER_BASE_URL;
      const token = localStorage.getItem('authToken') || '';

      if (baseUrl && token) {
        try {
          const res = await fetch(`${baseUrl}/api/auth/me`, {
            headers: {
              Authorization: `Bearer ${token}`
            }
          });

          const json = await res.json().catch(() => null);
          if (res.ok && json?.success && json?.user) {
            const user = json.user as {
              id: string;
              displayName: string;
              email: string;
              accessRole?: string;
              color?: string;
            };

            const nowIso = new Date().toISOString();
            const nextProfile: Profile = {
              id: user.id,
              name: user.displayName || user.email,
              color: user.color || 'blue',
              email: user.email || null,
              preferences: {},
              created_at: nowIso,
              updated_at: nowIso
            };

            setProfile(nextProfile);
            localStorage.setItem('currentProfile', JSON.stringify(nextProfile));
            localStorage.setItem('accessRole', user.accessRole || 'user');
            localStorage.setItem('userColor', user.color || 'blue');
          }
        } catch (e) {
          console.warn('Auth refresh failed:', e);
        }
      }

      setLoading(false);
    };

    run();
  }, []);

  const switchProfile = async (email: string, password: string) => {
    const baseUrl = import.meta.env.VITE_SERVER_BASE_URL;
    if (!baseUrl) {
      throw new Error('Server URL fehlt (VITE_SERVER_BASE_URL)');
    }

    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email, password })
    });

    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.success) {
      throw new Error(json?.message || 'Login fehlgeschlagen');
    }

    const user = json.user as {
      id: string;
      displayName: string;
      email: string;
      accessRole?: string;
      color?: string;
    };
    const token = json.token as string;

    const nowIso = new Date().toISOString();

    const newProfile: Profile = {
      id: user.id,
      name: user.displayName || user.email,
      color: user.color || 'blue',
      email: user.email || null,
      preferences: {},
      created_at: nowIso,
      updated_at: nowIso
    };

    setProfile(newProfile);
    localStorage.setItem('currentProfile', JSON.stringify(newProfile));
    localStorage.setItem('authToken', token);
    localStorage.setItem('accessRole', user.accessRole || 'user');
    localStorage.setItem('userColor', user.color || 'blue');
  };

  const refreshMe = async () => {
    const baseUrl = import.meta.env.VITE_SERVER_BASE_URL;
    if (!baseUrl) {
      throw new Error('Server URL fehlt (VITE_SERVER_BASE_URL)');
    }

    const token = localStorage.getItem('authToken') || '';
    if (!token) {
      throw new Error('Kein Token gefunden. Bitte neu anmelden.');
    }

    const res = await fetch(`${baseUrl}/api/auth/me`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.success) {
      throw new Error(json?.message || 'Session konnte nicht aktualisiert werden');
    }

    const user = json.user as {
      id: string;
      displayName: string;
      email: string;
      accessRole?: string;
      color?: string;
    };

    const nowIso = new Date().toISOString();

    const nextProfile: Profile = {
      id: user.id,
      name: user.displayName || user.email,
      color: user.color || 'blue',
      email: user.email || null,
      preferences: {},
      created_at: profile?.created_at || nowIso,
      updated_at: nowIso
    };

    setProfile(nextProfile);
    localStorage.setItem('currentProfile', JSON.stringify(nextProfile));
    localStorage.setItem('accessRole', user.accessRole || 'user');
    localStorage.setItem('userColor', user.color || 'blue');
  };

  const signOut = () => {
    setProfile(null);
    localStorage.removeItem('currentProfile');
    localStorage.removeItem('authToken');
    localStorage.removeItem('accessRole');
    localStorage.removeItem('userColor');
  };

  return (
    <AuthContext.Provider value={{ profile, loading, switchProfile, refreshMe, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
