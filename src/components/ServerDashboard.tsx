import { useEffect, useMemo, useState } from 'react';
import type { Profile } from '../lib/database.types';
import { AssetsCalendar } from './assets/AssetsCalendar';
import { AssetsLogbook } from './assets/AssetsLogbook';
import { AssetsExpenses } from './assets/AssetsExpenses';

interface ServerDashboardProps {
  currentProfile: Profile;
  onSignOut: () => void;
}

type AdminUser = {
  id: string;
  email: string;
  displayName: string;
  accessRole: string;
  userType: string;
};

export function ServerDashboard({ currentProfile, onSignOut }: ServerDashboardProps) {
  const baseUrl = import.meta.env.VITE_SERVER_BASE_URL as string | undefined;
  const token = useMemo(() => localStorage.getItem('authToken') || '', []);
  const accessRole = useMemo(() => localStorage.getItem('accessRole') || 'user', []);

  const [meStatus, setMeStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const [meError, setMeError] = useState<string>('');
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [adminStatus, setAdminStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const [adminError, setAdminError] = useState<string>('');

  const [activeTab, setActiveTab] = useState<'calendar' | 'logbook' | 'expenses' | 'admin'>('calendar');

  useEffect(() => {
    const run = async () => {
      if (!baseUrl || !token) {
        return;
      }

      setMeStatus('loading');
      setMeError('');

      try {
        const res = await fetch(`${baseUrl}/api/auth/me`, {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });
        const json = await res.json().catch(() => null);

        if (!res.ok || !json?.success) {
          throw new Error(json?.message || 'auth/me failed');
        }

        setMeStatus('ok');
      } catch (e: any) {
        setMeStatus('error');
        setMeError(e?.message || 'auth/me failed');
      }
    };

    run();
  }, [baseUrl, token]);

  const loadAdminUsers = async () => {
    if (!baseUrl || !token) return;

    setAdminStatus('loading');
    setAdminError('');

    try {
      const res = await fetch(`${baseUrl}/api/admin/users`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      const json = await res.json().catch(() => null);

      if (!res.ok || !json?.success) {
        throw new Error(json?.message || 'admin/users failed');
      }

      setAdminUsers(Array.isArray(json.users) ? json.users : []);
      setAdminStatus('ok');
    } catch (e: any) {
      setAdminStatus('error');
      setAdminError(e?.message || 'admin/users failed');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-cyan-50/30 p-4">
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="glass-effect rounded-3xl p-6 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
            <div className="text-slate-600 font-medium">
              Eingeloggt als: {currentProfile.name}
            </div>
            <div className="text-slate-500 text-sm">
              Rolle: {accessRole}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button className="btn-secondary" onClick={onSignOut}>
              Abmelden
            </button>
          </div>
        </div>

        <div className="glass-effect rounded-3xl p-6">
          <div className="text-lg font-bold text-slate-900 mb-2">Verbindung</div>
          {!baseUrl ? (
            <div className="text-red-700 font-medium">VITE_SERVER_BASE_URL fehlt</div>
          ) : !token ? (
            <div className="text-amber-700 font-medium">Kein Token gefunden (bitte neu einloggen)</div>
          ) : meStatus === 'loading' ? (
            <div className="text-slate-600">Prüfe Sitzung...</div>
          ) : meStatus === 'error' ? (
            <div className="text-red-700 font-medium">{meError}</div>
          ) : (
            <div className="text-emerald-700 font-medium">Backend verbunden</div>
          )}
        </div>

        <div className="glass-effect rounded-3xl p-3">
          <div className="flex gap-2 flex-wrap">
            <button
              className={activeTab === 'calendar' ? 'btn-primary' : 'btn-secondary'}
              type="button"
              onClick={() => setActiveTab('calendar')}
            >
              Kalender
            </button>
            <button
              className={activeTab === 'logbook' ? 'btn-primary' : 'btn-secondary'}
              type="button"
              onClick={() => setActiveTab('logbook')}
            >
              Logbook
            </button>
            <button
              className={activeTab === 'expenses' ? 'btn-primary' : 'btn-secondary'}
              type="button"
              onClick={() => setActiveTab('expenses')}
            >
              Expenses
            </button>
            <button
              className={activeTab === 'admin' ? 'btn-primary' : 'btn-secondary'}
              type="button"
              onClick={() => setActiveTab('admin')}
              disabled={accessRole !== 'admin'}
            >
              Admin
            </button>
          </div>
        </div>

        <div className="glass-effect rounded-3xl p-6">
          {activeTab === 'calendar' && <AssetsCalendar />}
          {activeTab === 'logbook' && <AssetsLogbook />}
          {activeTab === 'expenses' && <AssetsExpenses />}
          {activeTab === 'admin' && (
            <>
              <div className="flex items-center justify-between gap-4 mb-3">
                <div className="text-lg font-bold text-slate-900">Admin: Users</div>
                <button className="btn-primary" onClick={loadAdminUsers}>
                  Users laden
                </button>
              </div>

              {adminStatus === 'loading' && <div className="text-slate-600">Lade...</div>}
              {adminStatus === 'error' && <div className="text-red-700 font-medium">{adminError}</div>}

              {adminUsers.length > 0 && (
                <div className="overflow-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-slate-500">
                        <th className="py-2 pr-4">Name</th>
                        <th className="py-2 pr-4">E-Mail</th>
                        <th className="py-2 pr-4">Rolle</th>
                        <th className="py-2 pr-4">Typ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {adminUsers.map((u) => (
                        <tr key={u.id} className="border-t border-slate-200/60">
                          <td className="py-2 pr-4 font-semibold text-slate-900">{u.displayName}</td>
                          <td className="py-2 pr-4 text-slate-700">{u.email}</td>
                          <td className="py-2 pr-4 text-slate-700">{u.accessRole}</td>
                          <td className="py-2 pr-4 text-slate-700">{u.userType}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {adminStatus === 'ok' && adminUsers.length === 0 && (
                <div className="text-slate-600">Keine Users gefunden.</div>
              )}
            </>
          )}
        </div>

        <div className="glass-effect rounded-3xl p-6">
          <div className="text-lg font-bold text-slate-900 mb-2">Migration-Status</div>
          <div className="text-slate-600">
            Supabase ist jetzt aus dem Login-Flow entfernt. Die Kalender/Logbook/Expenses Views sind als Nächstes zu portieren.
          </div>
        </div>
      </div>
    </div>
  );
}
