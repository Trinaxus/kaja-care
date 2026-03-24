import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

type AdminUser = {
  id: string;
  email: string;
  displayName: string;
  accessRole: string;
  userType: string;
  color?: string;
  disabled?: boolean;
};

const COLORS = ['blue', 'green', 'red', 'orange', 'yellow', 'purple', 'pink', 'teal', 'indigo', 'slate'] as const;

const COLOR_DOT_CLASS: Record<(typeof COLORS)[number], string> = {
  blue: 'bg-blue-500',
  green: 'bg-emerald-500',
  red: 'bg-red-500',
  orange: 'bg-orange-500',
  yellow: 'bg-amber-400',
  purple: 'bg-purple-500',
  pink: 'bg-pink-500',
  teal: 'bg-teal-500',
  indigo: 'bg-indigo-500',
  slate: 'bg-slate-500'
};

export function SettingsPanel() {
  const { refreshMe } = useAuth();
  const baseUrl = import.meta.env.VITE_SERVER_BASE_URL as string | undefined;
  const token = useMemo(() => localStorage.getItem('authToken') || '', []);
  const accessRole = useMemo(() => localStorage.getItem('accessRole') || 'user', []);
  const currentProfileId = useMemo(() => {
    const raw = localStorage.getItem('currentProfile');
    if (!raw) return '';
    try {
      return (JSON.parse(raw)?.id as string) || '';
    } catch {
      return '';
    }
  }, []);

  const [status, setStatus] = useState<'idle' | 'loading' | 'error' | 'ready'>('idle');
  const [error, setError] = useState('');
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = async () => {
    if (!baseUrl) {
      setStatus('error');
      setError('VITE_SERVER_BASE_URL fehlt');
      return;
    }
    if (!token) {
      setStatus('error');
      setError('Kein Token gefunden. Bitte neu anmelden.');
      return;
    }
    if (accessRole !== 'admin') {
      setStatus('error');
      setError('Nur Admins können User verwalten.');
      return;
    }

    setStatus('loading');
    setError('');

    try {
      const res = await fetch(`${baseUrl}/api/admin/users`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        throw new Error(json?.message || 'User-Liste konnte nicht geladen werden');
      }

      setUsers(Array.isArray(json.users) ? json.users : []);
      setStatus('ready');
    } catch (e: any) {
      setStatus('error');
      setError(e?.message || 'User-Liste konnte nicht geladen werden');
    }
  };

  useEffect(() => {
    load();
  }, []);

  const patchUser = async (user: AdminUser) => {
    if (!baseUrl || !token) return;

    setSavingId(user.id);
    setError('');

    try {
      const res = await fetch(`${baseUrl}/api/admin/users`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          id: user.id,
          displayName: user.displayName,
          accessRole: user.accessRole,
          color: user.color || 'blue',
          disabled: !!user.disabled
        })
      });

      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        throw new Error(json?.message || 'Speichern fehlgeschlagen');
      }

      const updated = json.user as AdminUser;
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? { ...u, ...updated } : u)));

      window.dispatchEvent(new Event('kc-users-updated'));

      if (currentProfileId && updated.id === currentProfileId) {
        await refreshMe();
      }
    } catch (e: any) {
      setError(e?.message || 'Speichern fehlgeschlagen');
    } finally {
      setSavingId(null);
    }
  };

  if (status === 'loading') {
    return <div className="text-slate-600 dark:text-slate-300">Lade Einstellungen…</div>;
  }

  if (status === 'error') {
    return (
      <div className="space-y-3">
        <div className="text-red-700 dark:text-red-300 font-medium">{error}</div>
        <button className="btn-secondary" type="button" onClick={load}>
          Neu versuchen
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="text-xl font-bold text-slate-900 dark:text-slate-100">Einstellungen</div>
          <div className="text-slate-600 dark:text-slate-300 font-medium">User verwalten (Admin)</div>
        </div>
        <button className="btn-secondary" type="button" onClick={load}>
          Neu laden
        </button>
      </div>

      {error && <div className="text-red-700 dark:text-red-300 font-medium">{error}</div>}

      <div className="space-y-3">
        {users.map((u) => (
          <div
            key={u.id}
            className="bg-white/60 dark:bg-slate-950/30 border border-white/40 dark:border-slate-800 rounded-2xl p-5"
          >
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="min-w-[220px]">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">E-Mail</div>
                <div className="font-semibold text-slate-900 dark:text-slate-100 break-all">{u.email}</div>
              </div>

              <div className="min-w-[180px]">
                <button
                  className="btn-primary w-full"
                  type="button"
                  disabled={savingId === u.id}
                  onClick={() => patchUser(u)}
                >
                  {savingId === u.id ? 'Speichere…' : 'Speichern'}
                </button>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">Anzeigename</label>
                <input
                  className="input-field"
                  value={u.displayName}
                  onChange={(e) => setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, displayName: e.target.value } : x)))}
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">Rolle</label>
                <select
                  className="input-field dark:[color-scheme:dark]"
                  value={u.accessRole}
                  onChange={(e) => setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, accessRole: e.target.value } : x)))}
                >
                  <option value="user">user</option>
                  <option value="admin">admin</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">Farbe</label>
                <div className="relative">
                  <span
                    className={`pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 h-2.5 w-2.5 rounded-full ${
                      COLOR_DOT_CLASS[(u.color as (typeof COLORS)[number]) || 'blue']
                    }`}
                    aria-hidden="true"
                  />
                  <select
                    className="input-field pl-10 dark:[color-scheme:dark]"
                    value={u.color || 'blue'}
                    onChange={(e) => setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, color: e.target.value } : x)))}
                  >
                    {COLORS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">Status</label>
                <label className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl transition-all duration-200 dark:bg-slate-950/30 dark:border-slate-700/80 dark:text-slate-100 flex items-center gap-3">
                  <input
                    className="h-4 w-4 rounded border-slate-300 dark:border-slate-600"
                    type="checkbox"
                    checked={!!u.disabled}
                    onChange={(e) =>
                      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, disabled: e.target.checked } : x)))
                    }
                  />
                  <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Deaktiviert</span>
                </label>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
