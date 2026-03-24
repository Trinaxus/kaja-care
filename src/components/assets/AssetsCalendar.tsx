import { useEffect, useMemo, useState } from 'react';
import { fetchAsset, saveAsset, type AssetEnvelope } from '../../api/assets';

type CalendarItem = {
  id: string;
  date: string; // YYYY-MM-DD
  title: string;
  createdAt: number;
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function AssetsCalendar() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'error' | 'ready'>('idle');
  const [error, setError] = useState<string>('');
  const [envelope, setEnvelope] = useState<AssetEnvelope<CalendarItem> | null>(null);

  const [date, setDate] = useState(todayIso());
  const [title, setTitle] = useState('');

  const items = useMemo(() => {
    const arr = envelope?.items || [];
    return [...arr].sort((a, b) => (a.date === b.date ? b.createdAt - a.createdAt : a.date.localeCompare(b.date)));
  }, [envelope]);

  const load = async () => {
    setStatus('loading');
    setError('');
    try {
      const data = await fetchAsset<CalendarItem>('calendar');
      setEnvelope(data);
      setStatus('ready');
    } catch (e: any) {
      setStatus('error');
      setError(e?.message || 'Kalender konnte nicht geladen werden');
    }
  };

  useEffect(() => {
    load();
  }, []);

  const addItem = async () => {
    if (!envelope) return;
    if (!title.trim()) return;

    const next: AssetEnvelope<CalendarItem> = {
      ...envelope,
      items: [
        {
          id: crypto.randomUUID(),
          date,
          title: title.trim(),
          createdAt: Date.now()
        },
        ...envelope.items
      ]
    };

    setEnvelope(next);
    setTitle('');

    try {
      await saveAsset('calendar', next);
    } catch (e: any) {
      setError(e?.message || 'Speichern fehlgeschlagen');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-3 flex-wrap">
        <div className="flex-1 min-w-[220px]">
          <label className="block text-sm font-semibold text-slate-700 mb-2">Datum</label>
          <input type="date" className="input-field" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="flex-[2] min-w-[220px]">
          <label className="block text-sm font-semibold text-slate-700 mb-2">Eintrag</label>
          <input className="input-field" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="z.B. Termin / Erinnerung" />
        </div>
        <button className="btn-primary" type="button" onClick={addItem}>
          Hinzufügen
        </button>
        <button className="btn-secondary" type="button" onClick={load}>
          Neu laden
        </button>
      </div>

      {status === 'loading' && <div className="text-slate-600">Lade Kalender…</div>}
      {status === 'error' && <div className="text-red-700 font-medium">{error}</div>}
      {error && status === 'ready' && <div className="text-red-700 font-medium">{error}</div>}

      <div className="divide-y divide-slate-200/60">
        {items.length === 0 ? (
          <div className="text-slate-600">Noch keine Einträge.</div>
        ) : (
          items.map((it) => (
            <div key={it.id} className="py-3">
              <div className="text-sm text-slate-500">{it.date}</div>
              <div className="text-slate-900 font-semibold">{it.title}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
