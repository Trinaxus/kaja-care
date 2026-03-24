import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, X } from 'lucide-react';
import { fetchAsset, saveAsset, type AssetEnvelope } from '../api/assets';
import { fetchUsers, type PublicUser } from '../api/users';

type CalendarItem = {
  id: string;
  date: string; // YYYY-MM-DD
  title: string;
  createdAt: number;
  userId?: string;
  color?: string;
};

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

function addDays(d: Date, days: number): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + days);
  return next;
}

function startOfCalendarGrid(month: Date): Date {
  const first = startOfMonth(month);
  const weekday = (first.getDay() + 6) % 7; // Monday=0
  return addDays(first, -weekday);
}

export function CalendarViewServer({ accentColor, currentUserId }: { accentColor?: string; currentUserId: string }) {
  return <CalendarViewServerInner accentColor={accentColor} currentUserId={currentUserId} />;
}

function colorToAccentClasses(color: string) {
  switch (color) {
    case 'green':
      return { today: 'gradient-success', badge: 'bg-green-100/80 text-green-700 dark:bg-green-950/40 dark:text-green-200' };
    case 'orange':
      return { today: 'gradient-warning', badge: 'bg-orange-100/80 text-orange-700 dark:bg-orange-950/40 dark:text-orange-200' };
    case 'red':
      return { today: 'gradient-danger', badge: 'bg-red-100/80 text-red-700 dark:bg-red-950/40 dark:text-red-200' };
    case 'blue':
    default:
      return { today: 'gradient-primary', badge: 'bg-slate-100/80 text-slate-700 dark:bg-slate-800/70 dark:text-slate-200' };
  }
}

function chipClasses(color: string) {
  switch (color) {
    case 'green':
      return 'bg-green-100/80 text-green-800 dark:bg-green-950/35 dark:text-green-200 border border-green-200/60 dark:border-green-800/40';
    case 'orange':
      return 'bg-orange-100/80 text-orange-800 dark:bg-orange-950/35 dark:text-orange-200 border border-orange-200/60 dark:border-orange-800/40';
    case 'red':
      return 'bg-red-100/80 text-red-800 dark:bg-red-950/35 dark:text-red-200 border border-red-200/60 dark:border-red-800/40';
    case 'blue':
    default:
      return 'bg-blue-100/80 text-blue-800 dark:bg-blue-950/35 dark:text-blue-200 border border-blue-200/60 dark:border-blue-800/40';
  }
}

export function CalendarViewServerInner({
  accentColor = 'blue',
  currentUserId
}: {
  accentColor?: string;
  currentUserId: string;
}) {
  const [month, setMonth] = useState(() => startOfMonth(new Date()));

  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [error, setError] = useState('');
  const [envelope, setEnvelope] = useState<AssetEnvelope<CalendarItem> | null>(null);
  const [users, setUsers] = useState<PublicUser[]>([]);

  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState('');

  const byDate = useMemo(() => {
    const map = new Map<string, CalendarItem[]>();
    for (const it of envelope?.items || []) {
      const arr = map.get(it.date) || [];
      arr.push(it);
      map.set(it.date, arr);
    }
    for (const [k, arr] of map.entries()) {
      arr.sort((a, b) => b.createdAt - a.createdAt);
      map.set(k, arr);
    }
    return map;
  }, [envelope]);

  const usersById = useMemo(() => {
    const map = new Map<string, PublicUser>();
    for (const u of users) {
      if (u?.id) {
        map.set(u.id, u);
      }
    }
    return map;
  }, [users]);

  const load = async () => {
    setStatus('loading');
    setError('');
    try {
      const [data, allUsers] = await Promise.all([
        fetchAsset<CalendarItem>('calendar', 'shared'),
        fetchUsers()
      ]);
      setEnvelope(data);
      setUsers(allUsers);
      setStatus('ready');
    } catch (e: any) {
      setStatus('error');
      setError(e?.message || 'Kalender konnte nicht geladen werden');
    }
  };

  useEffect(() => {
    load();
  }, []);

  const days = useMemo(() => {
    const start = startOfCalendarGrid(month);
    const last = endOfMonth(month);
    const end = addDays(last, (7 - ((last.getDay() + 6) % 7) - 1) % 7);

    const out: { date: Date; iso: string; inMonth: boolean; isToday: boolean }[] = [];
    let cur = start;
    while (cur <= end) {
      const iso = isoDate(cur);
      out.push({
        date: cur,
        iso,
        inMonth: cur.getMonth() === month.getMonth(),
        isToday: iso === isoDate(new Date())
      });
      cur = addDays(cur, 1);
    }
    return out;
  }, [month]);

  const monthLabel = useMemo(
    () =>
      month.toLocaleDateString('de-DE', {
        month: 'long',
        year: 'numeric'
      }),
    [month]
  );

  const addEntry = async () => {
    if (!selectedDate || !envelope) return;
    if (!newTitle.trim()) return;

    const next: AssetEnvelope<CalendarItem> = {
      ...envelope,
      items: [
        {
          id: crypto.randomUUID(),
          date: selectedDate,
          title: newTitle.trim(),
          createdAt: Date.now(),
          userId: currentUserId,
          color: accentColor
        },
        ...envelope.items
      ]
    };

    setEnvelope(next);
    setNewTitle('');

    try {
      await saveAsset('calendar', next, 'shared');
    } catch (e: any) {
      setError(e?.message || 'Speichern fehlgeschlagen');
    }
  };

  const selectedItems = useMemo(() => {
    if (!selectedDate) return [];
    return byDate.get(selectedDate) || [];
  }, [byDate, selectedDate]);

  const accent = useMemo(() => colorToAccentClasses(accentColor), [accentColor]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="p-2 rounded-xl surface border border-white/30 dark:border-slate-700/30 shadow-sm hover:shadow"
            onClick={() => setMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
          >
            <ChevronLeft className="w-5 h-5 text-slate-700" />
          </button>
          <button
            type="button"
            className="p-2 rounded-xl surface border border-white/30 dark:border-slate-700/30 shadow-sm hover:shadow"
            onClick={() => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
          >
            <ChevronRight className="w-5 h-5 text-slate-700" />
          </button>
          <div className="text-lg sm:text-xl font-bold text-slate-900 capitalize">{monthLabel}</div>
        </div>

        <div className="flex items-center gap-2">
          <button type="button" className="btn-secondary" onClick={load}>
            Neu laden
          </button>
        </div>
      </div>

      {status === 'loading' && <div className="text-slate-600">Lade Kalender…</div>}
      {status === 'error' && <div className="text-red-700 font-medium">{error}</div>}
      {error && status === 'ready' && <div className="text-red-700 font-medium">{error}</div>}

      <div className="grid grid-cols-7 gap-2">
        {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((d) => (
          <div key={d} className="text-xs font-bold text-slate-500 uppercase tracking-wide px-1">
            {d}
          </div>
        ))}

        {days.map((day) => {
          const items = byDate.get(day.iso) || [];
          return (
            <button
              key={day.iso}
              type="button"
              onClick={() => setSelectedDate(day.iso)}
              className={
                'text-left rounded-2xl border p-2 sm:p-3 min-h-[90px] sm:min-h-[110px] transition-all ' +
                (day.inMonth
                  ? 'surface border-white/40 dark:border-slate-700/40 hover:bg-slate-50 dark:hover:bg-slate-900/80'
                  : 'bg-slate-50/70 border-slate-200/50 text-slate-400 dark:bg-slate-950/30 dark:border-slate-800/60')
              }
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <div
                  className={
                    'w-7 h-7 rounded-lg flex items-center justify-center text-sm font-bold ' +
                    (day.isToday
                      ? `${accent.today} text-white shadow`
                      : 'text-slate-700 surface dark:text-slate-200')
                  }
                >
                  {day.date.getDate()}
                </div>
                {items.length > 0 && (
                  <div className={`text-[11px] font-bold rounded-full px-2 py-0.5 ${accent.badge}`}>
                    {items.length}
                  </div>
                )}
              </div>
              <div className="space-y-1">
                {items.slice(0, 2).map((it) => {
                  const mappedColor = it.userId ? usersById.get(it.userId)?.color : undefined;
                  const c = (mappedColor || it.color || accentColor || 'blue') as string;
                  const creatorName = it.userId ? usersById.get(it.userId)?.displayName : undefined;
                  return (
                    <div
                      key={it.id}
                      className={`text-xs font-semibold truncate px-2 py-1 rounded-lg ${chipClasses(c)}`}
                      title={creatorName ? `${creatorName}: ${it.title}` : it.title}
                    >
                      {it.title}
                    </div>
                  );
                })}
                {items.length > 2 && (
                  <div className="text-xs text-slate-500 dark:text-slate-400">+{items.length - 2} mehr</div>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {selectedDate && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/30">
          <div className="w-full max-w-xl surface rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-700">
            <div className="p-5 sm:p-6 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between gap-3">
              <div>
                <div className="text-sm text-slate-500 dark:text-slate-400">Tag</div>
                <div className="text-xl font-bold text-slate-900 dark:text-slate-100">
                  {new Date(selectedDate).toLocaleDateString('de-DE', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric'
                  })}
                </div>
              </div>
              <button
                type="button"
                className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800"
                onClick={() => {
                  setSelectedDate(null);
                  setNewTitle('');
                }}
              >
                <X className="w-5 h-5 text-slate-700 dark:text-slate-200" />
              </button>
            </div>

            <div className="p-5 sm:p-6 space-y-4">
              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Neuer Eintrag</label>
                  <input
                    className="input-field"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="z.B. Termin / Erinnerung"
                  />
                </div>
                <button type="button" className="btn-primary" onClick={addEntry}>
                  <span className="inline-flex items-center gap-2">
                    <Plus className="w-4 h-4" />
                    Hinzufügen
                  </span>
                </button>
              </div>

              <div className="space-y-2">
                {selectedItems.length === 0 ? (
                  <div className="text-slate-600 dark:text-slate-300">Keine Einträge.</div>
                ) : (
                  selectedItems.map((it) => (
                    <div
                      key={it.id}
                      className="bg-slate-50 border border-slate-200 rounded-2xl p-4 dark:bg-slate-950/40 dark:border-slate-800"
                    >
                      {(() => {
                        const u = it.userId ? usersById.get(it.userId) : undefined;
                        const mappedColor = u?.color;
                        const c = (mappedColor || it.color || accentColor || 'blue') as string;
                        return (
                          <>
                            <div className="flex items-start justify-between gap-3">
                              <div className="text-slate-900 font-semibold dark:text-slate-100">{it.title}</div>
                              <div className={`text-[11px] font-bold px-2 py-1 rounded-full ${chipClasses(c)}`}>{c}</div>
                            </div>
                            {u?.displayName && (
                              <div className="text-xs text-slate-600 dark:text-slate-300 mt-1">Erstellt von: {u.displayName}</div>
                            )}
                          </>
                        );
                      })()}
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        {new Date(it.createdAt).toLocaleString()}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
