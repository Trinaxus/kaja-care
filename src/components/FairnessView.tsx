import { useEffect, useMemo, useState } from 'react';
import type { Profile } from '../lib/database.types';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { listItems } from '../api/collections';
import { resolveProfileById } from '../lib/knownProfiles';
import { profileColorClass } from '../lib/profileColor';

type Assignment = { date: string; caretaker_id: string };
type Handover = {
  date: string;
  from_user_id?: string | null;
  to_user_id?: string | null;
  brings_user_id?: string | null;
  picks_up_user_id?: string | null;
};

type DayRow =
  | { date: string; kind: 'owner'; ownerProfileId: string; shares: Array<{ profileId: string; amount: number }> }
  | { date: string; kind: 'handover'; shares: Array<{ profileId: string; amount: number }> };

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

function formatCount(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function Donut({
  segments,
  size = 160,
  strokeWidth = 18
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

export function FairnessView({ profiles }: { profiles: Profile[] }) {
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [status, setStatus] = useState<'idle' | 'loading' | 'error' | 'ready'>('idle');
  const [error, setError] = useState('');

  const [rows, setRows] = useState<DayRow[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});

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
      setStatus('loading');
      setError('');

      try {
        const dates = buildMonthDates(month);

        const [assignments, handovers] = await Promise.all([
          listItems<Assignment>('care_assignments', { date: dates }),
          listItems<Handover>('handovers', { date: dates })
        ]);

        const assignmentMap = new Map(assignments.map((a) => [a.date, a]));
        const handoverMap = new Map(handovers.map((h) => [h.date, h]));

        const martin = profiles.find((p) => String(p.name || '').trim().toLowerCase() === 'martin');
        let currentOwnerId: string | null = martin?.id || (profiles[0]?.id ?? null);

        const nextCounts: Record<string, number> = {};
        for (const p of profiles) nextCounts[p.id] = 0;

        const nextRows: DayRow[] = [];

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
              nextRows.push({
                date,
                kind: 'handover',
                shares: [
                  { profileId: fromId, amount: 0.5 },
                  { profileId: toId, amount: 0.5 }
                ]
              });
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
              nextRows.push({
                date,
                kind: 'handover',
                shares: [
                  { profileId: x, amount: 0.5 },
                  { profileId: y, amount: 0.5 }
                ]
              });

              const receiverId = toId || (toRaw ? canonicalProfileId(toRaw) : null) || (picksRaw ? canonicalProfileId(picksRaw) : null);
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
            nextRows.push({
              date,
              kind: 'owner',
              ownerProfileId: currentOwnerId,
              shares: [{ profileId: currentOwnerId, amount: 1 }]
            });
          }
        }

        setCounts(nextCounts);
        setRows(nextRows);
        setStatus('ready');
      } catch (e: any) {
        setStatus('error');
        setError(e?.message || 'Fairness konnte nicht geladen werden');
      }
    };

    run();
  }, [month, profiles, canonicalProfileId]);

  const totals = useMemo(() => {
    const total = Object.values(counts).reduce((s, v) => s + v, 0);
    const perProfile = profiles.map((p) => {
      const value = counts[p.id] || 0;
      const pct = total > 0 ? (value / total) * 100 : 0;
      return { profile: p, value, pct };
    });
    return { total, perProfile };
  }, [counts, profiles]);

  // Donut needs stroke color via currentColor; we map profile color to a text color.
  const donutColors = useMemo(() => {
    return totals.perProfile.map((x) => {
      const c = String(x.profile.color || '').toLowerCase();
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
                    : c === 'slate'
                      ? 'text-slate-500'
                      : 'text-blue-500';
      return { ...x, cls };
    });
  }, [totals.perProfile]);

  const segmentsForSvg = useMemo(() => {
    return donutColors
      .filter((x) => x.value > 0)
      .map((x) => ({ value: x.value, className: x.cls, label: x.profile.name || x.profile.id }));
  }, [donutColors]);

  const previousMonth = () => {
    setMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={previousMonth}
            className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-gradient-to-br hover:from-slate-100 hover:to-slate-200 dark:hover:from-slate-800 dark:hover:to-slate-700 transition-all duration-200 active:scale-95 border border-slate-200 dark:border-slate-700 surface"
            title="Vorheriger Monat"
          >
            <ChevronLeft className="w-5 h-5 text-slate-700 dark:text-slate-200" />
          </button>
          <div>
            <div className="text-lg sm:text-xl font-bold text-slate-900 dark:text-slate-100">Fairness</div>
            <div className="text-slate-600 dark:text-slate-300 font-medium">
              {month.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })}
            </div>
          </div>
          <button
            type="button"
            onClick={nextMonth}
            className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-gradient-to-br hover:from-slate-100 hover:to-slate-200 dark:hover:from-slate-800 dark:hover:to-slate-700 transition-all duration-200 active:scale-95 border border-slate-200 dark:border-slate-700 surface"
            title="Nächster Monat"
          >
            <ChevronRight className="w-5 h-5 text-slate-700 dark:text-slate-200" />
          </button>
        </div>
      </div>

      {status === 'loading' && <div className="text-slate-600 dark:text-slate-300">Lade Fairness…</div>}
      {status === 'error' && <div className="text-red-700 dark:text-red-300 font-medium">{error}</div>}

      {status === 'ready' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="surface rounded-2xl p-5">
            <div className="text-sm font-semibold text-slate-700 dark:text-slate-100 mb-4">Anteile (Besitz-Tage)</div>

            <div className="flex items-center justify-center">
              <Donut segments={segmentsForSvg} />
            </div>

            <div className="mt-4 space-y-2">
              {donutColors.map(({ profile, value, pct }) => (
                <div key={profile.id} className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className={`w-2.5 h-2.5 rounded-full ${profileColorClass(profile, 'solid')}`} />
                    <div className="font-medium text-slate-700 dark:text-slate-100 truncate">{profile.name}</div>
                  </div>
                  <div className="text-sm font-semibold text-slate-700 dark:text-slate-100 tabular-nums">
                    {formatCount(value)} ({pct.toFixed(0)}%)
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-2 surface rounded-2xl p-5">
            <div className="text-sm font-semibold text-slate-700 dark:text-slate-100 mb-4">Details pro Tag</div>

            <div className="overflow-auto">
              <table className="min-w-[640px] w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500 dark:text-slate-400">
                    <th className="py-2 pr-3">Datum</th>
                    <th className="py-2 pr-3">Typ</th>
                    <th className="py-2 pr-3">Zählung</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const dt = new Date(r.date + 'T12:00:00');
                    const dateLabel = dt.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });

                    const shares = r.shares
                      .map((s) => {
                        const p = profiles.find((x) => x.id === s.profileId);
                        return p ? `${p.name} ${formatCount(s.amount)}` : `${s.profileId} ${formatCount(s.amount)}`;
                      })
                      .join(' + ');

                    return (
                      <tr key={r.date} className="border-t border-slate-200/70 dark:border-slate-800/70">
                        <td className="py-2 pr-3 text-slate-700 dark:text-slate-100 font-medium">{dateLabel}</td>
                        <td className="py-2 pr-3 text-slate-600 dark:text-slate-300">
                          {r.kind === 'handover' ? 'Übergabe (0.5/0.5)' : 'Besitz'}
                        </td>
                        <td className="py-2 pr-3 text-slate-700 dark:text-slate-100 tabular-nums">{shares}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
