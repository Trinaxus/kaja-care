import { useEffect, useMemo, useState } from 'react';
import type { Profile } from '../lib/database.types';
import { PawPrint, Calendar, BookOpen, DollarSign, LogOut, Settings, UserCog, Sun, Moon, Maximize2, Minimize2, PieChart } from 'lucide-react';
import { CalendarView } from './CalendarView';
import { WeekView } from './WeekView';
import { DayDetailModal } from './DayDetailModal';
import { LogBook } from './LogBook';
import { ExpenseTracker } from './ExpenseTracker';
import { SettingsPanel } from './SettingsPanel';
import { FairnessView } from './FairnessView';
import { fetchUsers } from '../api/users';
import { listItems } from '../api/collections';
import { resolveProfileById } from '../lib/knownProfiles';

interface EnhancedDashboardServerProps {
  currentProfile: Profile;
  onSignOut: () => void;
}

type MonthAssignment = { date: string; caretaker_id: string };
type MonthHandover = {
  date: string;
  from_user_id?: string | null;
  to_user_id?: string | null;
  brings_user_id?: string | null;
  picks_up_user_id?: string | null;
};

function ymd(d: Date) {
  return d.toISOString().slice(0, 10);
}

function buildMonthDates(month: Date): string[] {
  const y = month.getFullYear();
  const m = month.getMonth();
  const first = new Date(y, m, 1);
  const last = new Date(y, m + 1, 0);
  const out: string[] = [];
  const cur = new Date(first);
  while (cur <= last) {
    out.push(ymd(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

function Donut({
  segments,
  size = 44,
  strokeWidth = 6
}: {
  segments: Array<{ value: number; className: string; label: string }>;
  size?: number;
  strokeWidth?: number;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const total = segments.reduce((s, x) => s + x.value, 0);

  let acc = 0;
  const normalized = segments.map((s) => {
    const frac = total > 0 ? s.value / total : 0;
    const dash = frac * circumference;
    const offset = circumference - acc;
    acc += dash;
    return { ...s, dash, offset };
  });

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="block">
      <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          className="text-slate-200 dark:text-slate-800"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          fill="transparent"
        />
        {normalized.map((s) => (
          <circle
            key={s.label}
            cx={size / 2}
            cy={size / 2}
            r={radius}
            className={s.className}
            stroke="currentColor"
            strokeWidth={strokeWidth}
            fill="transparent"
            strokeDasharray={`${s.dash} ${circumference - s.dash}`}
            strokeDashoffset={s.offset}
            strokeLinecap="butt"
          />
        ))}
      </g>
    </svg>
  );
}

export function EnhancedDashboardServer({ currentProfile, onSignOut }: EnhancedDashboardServerProps) {
  const accessRole = useMemo(() => localStorage.getItem('accessRole') || 'user', []);
  const [activeView, setActiveView] = useState<'calendar' | 'expenses' | 'logbook' | 'fairness' | 'settings'>('calendar');

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [calendarMode, setCalendarMode] = useState<'month' | 'week' | 'day'>('month');
  const [ringMonth, setRingMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [ringCounts, setRingCounts] = useState<Record<string, number>>({});
  const [dayDate, setDayDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [showDayModal, setShowDayModal] = useState(false);

  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'));
  const [isFullscreen, setIsFullscreen] = useState(() => Boolean(document.fullscreenElement));

  const toggleTheme = () => {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem('theme', next ? 'dark' : 'light');
  };

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenEnabled) {
        return;
      }

      if (document.fullscreenElement) {
        await document.exitFullscreen();
        setIsFullscreen(false);
        return;
      }

      await document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } catch {
      // ignore
    }
  };

  const navItems = [
    { id: 'calendar', label: 'Kalender', icon: Calendar },
    { id: 'expenses', label: 'Ausgaben', icon: DollarSign },
    { id: 'logbook', label: 'Logbuch', icon: BookOpen },
    { id: 'fairness', label: 'Fairness', icon: PieChart },
    { id: 'settings', label: 'Einstellungen', icon: accessRole === 'admin' ? UserCog : Settings }
  ] as const;

  useEffect(() => {
    const run = async () => {
      try {
        const users = await fetchUsers();

        const nowIso = new Date().toISOString();
        const mapped: Profile[] = users
          .map((u) => ({
          id: u.id,
          name: u.displayName || u.email,
          color: (u.color as any) || 'blue',
          email: u.email || null,
          preferences: {},
          created_at: nowIso,
          updated_at: nowIso
          }));

        const unique = new Map<string, Profile>();
        unique.set(currentProfile.id, currentProfile);
        for (const p of mapped) unique.set(p.id, p);
        setProfiles(Array.from(unique.values()));
      } catch {
        setProfiles([currentProfile]);
      }
    };

    run();

    const onUsersUpdated = () => {
      run();
    };
    window.addEventListener('kc-users-updated', onUsersUpdated);

    return () => {
      window.removeEventListener('kc-users-updated', onUsersUpdated);
    };
  }, [currentProfile]);

  const canonicalProfileId = useMemo(() => {
    return (rawId: string): string | null => {
      const direct = profiles.find((p) => p.id === rawId);
      if (direct) return direct.id;

      const resolved = resolveProfileById(profiles, rawId);
      if (!resolved) return null;

      const byName = profiles.find(
        (p) => String(p.name || '').trim().toLowerCase() === String(resolved.name || '').trim().toLowerCase()
      );

      return byName?.id || null;
    };
  }, [profiles]);

  useEffect(() => {
    const run = async () => {
      if (activeView !== 'calendar' || calendarMode !== 'month') return;
      if (profiles.length === 0) return;

      try {
        const dates = buildMonthDates(ringMonth);

        const [assignments, handovers] = await Promise.all([
          listItems<MonthAssignment>('care_assignments', { date: dates }),
          listItems<MonthHandover>('handovers', { date: dates })
        ]);

        const assignmentMap = new Map(assignments.map((a) => [a.date, a]));
        const handoverMap = new Map(handovers.map((h) => [h.date, h]));

        const martin = profiles.find((p) => String(p.name || '').trim().toLowerCase() === 'martin');
        let currentOwnerId: string | null = martin?.id || (profiles[0]?.id ?? null);

        const nextCounts: Record<string, number> = {};
        for (const p of profiles) nextCounts[p.id] = 0;

        for (const date of dates) {
          const a = assignmentMap.get(date);
          const h = handoverMap.get(date);

          const assignmentOwnerRaw = a?.caretaker_id ? String(a.caretaker_id) : '';

          const fromRaw = h?.from_user_id ? String(h.from_user_id) : '';
          const toRaw = h?.to_user_id ? String(h.to_user_id) : '';
          const bringsRaw = h?.brings_user_id ? String(h.brings_user_id) : '';
          const picksRaw = h?.picks_up_user_id ? String(h.picks_up_user_id) : '';

          if (h) {
            const fromCandidate = fromRaw || bringsRaw;
            const toCandidate = toRaw || picksRaw;

            const fromId = fromCandidate ? canonicalProfileId(fromCandidate) : null;
            const toId = toCandidate ? canonicalProfileId(toCandidate) : null;

            if (fromId && toId && fromId !== toId) {
              nextCounts[fromId] = (nextCounts[fromId] || 0) + 0.5;
              nextCounts[toId] = (nextCounts[toId] || 0) + 0.5;
              currentOwnerId = toId;
              continue;
            }

            const involvedRaw = [fromRaw, toRaw, bringsRaw, picksRaw].filter(Boolean) as string[];
            const involvedCanonical = Array.from(
              new Set(involvedRaw.map((id) => canonicalProfileId(id)).filter(Boolean) as string[])
            );

            if (involvedCanonical.length === 2) {
              const [x, y] = involvedCanonical;
              nextCounts[x] = (nextCounts[x] || 0) + 0.5;
              nextCounts[y] = (nextCounts[y] || 0) + 0.5;

              const receiverId =
                toId ||
                (toRaw ? canonicalProfileId(toRaw) : null) ||
                (picksRaw ? canonicalProfileId(picksRaw) : null);
              if (receiverId) currentOwnerId = receiverId;
              continue;
            }
          }

          const rawNextOwner = toRaw || picksRaw || assignmentOwnerRaw;
          if (rawNextOwner) {
            const next = canonicalProfileId(rawNextOwner);
            if (next) currentOwnerId = next;
          }

          if (currentOwnerId) {
            nextCounts[currentOwnerId] = (nextCounts[currentOwnerId] || 0) + 1;
          }
        }

        setRingCounts(nextCounts);
      } catch {
        setRingCounts({});
      }
    };

    run();
  }, [activeView, calendarMode, profiles, ringMonth, canonicalProfileId]);

  const ringSegments = useMemo(() => {
    const total = Object.values(ringCounts).reduce((s, v) => s + v, 0);
    if (total <= 0) return [];

    return profiles
      .map((p) => {
        const value = ringCounts[p.id] || 0;
        const c = String(p.color || '').toLowerCase();
        const cls =
          c === 'green'
            ? 'text-emerald-500'
            : c === 'red'
              ? 'text-red-500'
              : c === 'orange'
                ? 'text-orange-500'
                : c === 'purple'
                  ? 'text-purple-500'
                  : c === 'pink'
                    ? 'text-pink-500'
                    : c === 'yellow'
                      ? 'text-amber-500'
                      : c === 'teal'
                        ? 'text-teal-500'
                        : c === 'indigo'
                          ? 'text-indigo-500'
                          : c === 'slate'
                            ? 'text-slate-500'
                            : 'text-blue-500';
        return { value, className: cls, label: p.name || p.id };
      })
      .filter((x) => x.value > 0);
  }, [profiles, ringCounts]);

  const ringBreakdown = useMemo(() => {
    const total = Object.values(ringCounts).reduce((s, v) => s + v, 0);
    if (total <= 0) return [];

    return profiles
      .map((p) => {
        const value = ringCounts[p.id] || 0;
        if (value <= 0) return null;

        const pct = (value / total) * 100;
        const c = String(p.color || '').toLowerCase();
        const cls =
          c === 'green'
            ? 'text-emerald-500'
            : c === 'red'
              ? 'text-red-500'
              : c === 'orange'
                ? 'text-orange-500'
                : c === 'purple'
                  ? 'text-purple-500'
                  : c === 'pink'
                    ? 'text-pink-500'
                    : c === 'yellow'
                      ? 'text-amber-500'
                      : c === 'teal'
                        ? 'text-teal-500'
                        : c === 'indigo'
                          ? 'text-indigo-500'
                          : c === 'slate'
                            ? 'text-slate-500'
                            : 'text-blue-500';

        return { id: p.id, name: p.name || p.id, pct, className: cls };
      })
      .filter(Boolean)
      .sort((a, b) => (b!.pct ?? 0) - (a!.pct ?? 0)) as Array<{ id: string; name: string; pct: number; className: string }>;
  }, [profiles, ringCounts]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-cyan-50/30 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900">
      <div className="pointer-events-none fixed inset-0 -z-10 opacity-0 dark:opacity-100 transition-opacity duration-500">
        <div className="absolute inset-0 bg-[radial-gradient(80rem_80rem_at_20%_10%,rgba(34,211,238,0.12),transparent_55%),radial-gradient(70rem_70rem_at_80%_30%,rgba(59,130,246,0.10),transparent_60%),radial-gradient(60rem_60rem_at_50%_90%,rgba(168,85,247,0.10),transparent_55%)]" />
      </div>

      <header className="glass-effect sticky top-0 z-40 border-b border-slate-200/50 dark:border-slate-700/50">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-3 sm:py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="w-10 h-10 sm:w-14 sm:h-14 gradient-primary rounded-xl sm:rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/30">
                <PawPrint className="w-5 h-5 sm:w-7 sm:h-7 text-white" />
              </div>
              <div>
                <h1 className="text-lg sm:text-2xl font-bold bg-gradient-to-r from-slate-900 to-slate-700 dark:from-slate-100 dark:to-slate-300 bg-clip-text text-transparent">
                  KajaCare
                </h1>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 font-medium">Willkommen, {currentProfile?.name}</p>
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-3">
              <button
                onClick={toggleTheme}
                className="p-2 sm:p-3 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg sm:rounded-xl transition-all duration-200"
                title={isDark ? 'Light Mode' : 'Dark Mode'}
                type="button"
              >
                {isDark ? (
                  <Sun className="w-5 h-5 text-slate-600 dark:text-slate-200" />
                ) : (
                  <Moon className="w-5 h-5 text-slate-600 dark:text-slate-200" />
                )}
              </button>
              <button
                onClick={toggleFullscreen}
                className="p-2 sm:p-3 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg sm:rounded-xl transition-all duration-200"
                title={isFullscreen ? 'Fullscreen verlassen' : 'Fullscreen'}
                type="button"
              >
                {isFullscreen ? (
                  <Minimize2 className="w-5 h-5 text-slate-600 dark:text-slate-200" />
                ) : (
                  <Maximize2 className="w-5 h-5 text-slate-600 dark:text-slate-200" />
                )}
              </button>
              <button
                onClick={onSignOut}
                className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-900/60 dark:hover:bg-slate-900 rounded-lg sm:rounded-xl transition-all duration-200 font-medium text-slate-700 dark:text-slate-100 text-sm sm:text-base"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Abmelden</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-8">
        <div className="mb-4">
          <div className="flex flex-wrap gap-1 p-1 rounded-2xl border border-slate-200/70 dark:border-slate-700/60 bg-white/70 dark:bg-slate-900/50 backdrop-blur shadow-sm">
            {navItems.map((item) => {
              const Icon = item.icon;
              const selected = activeView === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveView(item.id)}
                  className={
                    selected
                      ? 'px-4 py-2.5 rounded-xl bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-semibold shadow-sm border border-slate-200/70 dark:border-slate-700/60 transition active:scale-[0.98]'
                      : 'px-4 py-2.5 rounded-xl text-slate-600 dark:text-slate-300 font-semibold transition hover:bg-white/60 dark:hover:bg-slate-800/60 active:scale-[0.98]'
                  }
                >
                  <span className="inline-flex items-center gap-2">
                    <Icon className="w-4 h-4" />
                    {item.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="glass-effect rounded-3xl p-4 sm:p-6">
          {activeView === 'calendar' && (
            <div className="fade-in">
              <div className="flex items-center justify-between mb-4 sm:mb-6 gap-2 flex-wrap">
                <div className="flex items-center gap-3">
                  <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-slate-100">Kalenderansicht</h2>
                  {calendarMode === 'month' && ringSegments.length > 0 && (
                    <div className="relative group">
                      <div className="w-11 h-11 flex items-center justify-center rounded-xl bg-white/60 dark:bg-slate-950/20">
                        <Donut segments={ringSegments} />
                      </div>

                      {ringBreakdown.length > 0 && (
                        <div className="pointer-events-none absolute left-1/2 top-full mt-2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                          <div className="min-w-[160px] rounded-xl border border-slate-200/70 dark:border-slate-700/70 bg-white/95 dark:bg-slate-900/95 shadow-lg px-3 py-2">
                            <div className="space-y-1">
                              {ringBreakdown.map((x) => (
                                <div key={x.id} className="flex items-center justify-between gap-3">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span className={`h-2.5 w-2.5 rounded-full ${x.className}`} aria-hidden="true" />
                                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-100 truncate">{x.name}</span>
                                  </div>
                                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-100 tabular-nums">{x.pct.toFixed(0)}%</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div className="inline-flex rounded-lg sm:rounded-xl border-2 border-slate-200 dark:border-slate-700 p-0.5 sm:p-1 bg-slate-50 dark:bg-slate-950/30">
                  <button
                    onClick={() => setCalendarMode('month')}
                    className={`px-3 sm:px-6 py-1.5 sm:py-2 rounded-md sm:rounded-lg font-semibold text-sm sm:text-base transition-all duration-200 ${
                      calendarMode === 'month'
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-md'
                        : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100'
                    }`}
                  >
                    Monat
                  </button>
                  <button
                    onClick={() => setCalendarMode('week')}
                    className={`px-3 sm:px-6 py-1.5 sm:py-2 rounded-md sm:rounded-lg font-semibold text-sm sm:text-base transition-all duration-200 ${
                      calendarMode === 'week'
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-md'
                        : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100'
                    }`}
                  >
                    Woche
                  </button>
                  <button
                    onClick={() => setCalendarMode('day')}
                    className={`px-3 sm:px-6 py-1.5 sm:py-2 rounded-md sm:rounded-lg font-semibold text-sm sm:text-base transition-all duration-200 ${
                      calendarMode === 'day'
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-md'
                        : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100'
                    }`}
                  >
                    Tag
                  </button>
                </div>
              </div>

              {calendarMode === 'month' && (
                <CalendarView
                  profiles={profiles.length > 0 ? profiles : [currentProfile]}
                  currentProfile={currentProfile}
                  onMonthChange={(d) => setRingMonth(new Date(d.getFullYear(), d.getMonth(), 1))}
                  onUpdate={() => {
                    // reload is triggered inside CalendarView anyway
                  }}
                />
              )}

              {calendarMode === 'week' && (
                <WeekView
                  profiles={profiles.length > 0 ? profiles : [currentProfile]}
                  currentProfile={currentProfile}
                  onUpdate={() => {
                    // reload is triggered inside WeekView anyway
                  }}
                />
              )}

              {calendarMode === 'day' && (
                <div className="space-y-4">
                  <div className="flex items-end gap-3 flex-wrap">
                    <div className="min-w-[220px]">
                      <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">Datum</label>
                      <input
                        type="date"
                        className="input-field"
                        value={dayDate}
                        onChange={(e) => setDayDate(e.target.value)}
                      />
                    </div>
                    <button className="btn-primary" type="button" onClick={() => setShowDayModal(true)}>
                      Öffnen
                    </button>
                  </div>

                  {showDayModal && (
                    <DayDetailModal
                      date={dayDate}
                      profiles={profiles.length > 0 ? profiles : [currentProfile]}
                      currentProfile={currentProfile}
                      onUpdate={() => {
                        // modal actions reload itself
                      }}
                      onClose={() => setShowDayModal(false)}
                    />
                  )}
                </div>
              )}
            </div>
          )}

          {activeView === 'expenses' && (
            <div className="fade-in">
              <ExpenseTracker profiles={profiles.length > 0 ? profiles : [currentProfile]} currentProfile={currentProfile} />
            </div>
          )}

          {activeView === 'logbook' && (
            <div className="fade-in">
              <LogBook profiles={profiles.length > 0 ? profiles : [currentProfile]} currentProfile={currentProfile} />
            </div>
          )}

          {activeView === 'settings' && (
            <div className="fade-in">
              <SettingsPanel />
            </div>
          )}

          {activeView === 'fairness' && (
            <div className="fade-in">
              <FairnessView profiles={profiles.length > 0 ? profiles : [currentProfile]} />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
