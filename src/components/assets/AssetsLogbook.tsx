import { useEffect, useMemo, useState } from 'react';
import { fetchAsset, saveAsset, type AssetEnvelope } from '../../api/assets';

type LogItem = {
  id: string;
  createdAt: number;
  text: string;
};

export function AssetsLogbook() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'error' | 'ready'>('idle');
  const [error, setError] = useState<string>('');
  const [envelope, setEnvelope] = useState<AssetEnvelope<LogItem> | null>(null);

  const [text, setText] = useState('');

  const items = useMemo(() => {
    const arr = envelope?.items || [];
    return [...arr].sort((a, b) => b.createdAt - a.createdAt);
  }, [envelope]);

  const load = async () => {
    setStatus('loading');
    setError('');
    try {
      const data = await fetchAsset<LogItem>('logbook');
      setEnvelope(data);
      setStatus('ready');
    } catch (e: any) {
      setStatus('error');
      setError(e?.message || 'Logbook konnte nicht geladen werden');
    }
  };

  useEffect(() => {
    load();
  }, []);

  const addItem = async () => {
    if (!envelope) return;
    if (!text.trim()) return;

    const next: AssetEnvelope<LogItem> = {
      ...envelope,
      items: [
        {
          id: crypto.randomUUID(),
          createdAt: Date.now(),
          text: text.trim()
        },
        ...envelope.items
      ]
    };

    setEnvelope(next);
    setText('');

    try {
      await saveAsset('logbook', next);
    } catch (e: any) {
      setError(e?.message || 'Speichern fehlgeschlagen');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-3 flex-wrap">
        <div className="flex-1 min-w-[240px]">
          <label className="block text-sm font-semibold text-slate-700 mb-2">Neuer Eintrag</label>
          <textarea
            className="input-field min-h-[90px]"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Was ist passiert?"
          />
        </div>
        <div className="flex gap-3">
          <button className="btn-primary" type="button" onClick={addItem}>
            Speichern
          </button>
          <button className="btn-secondary" type="button" onClick={load}>
            Neu laden
          </button>
        </div>
      </div>

      {status === 'loading' && <div className="text-slate-600">Lade Logbook…</div>}
      {status === 'error' && <div className="text-red-700 font-medium">{error}</div>}
      {error && status === 'ready' && <div className="text-red-700 font-medium">{error}</div>}

      <div className="space-y-3">
        {items.length === 0 ? (
          <div className="text-slate-600">Noch keine Einträge.</div>
        ) : (
          items.map((it) => (
            <div key={it.id} className="bg-white/60 border border-white/40 rounded-2xl p-4">
              <div className="text-xs text-slate-500 mb-2">{new Date(it.createdAt).toLocaleString()}</div>
              <div className="text-slate-900 whitespace-pre-wrap">{it.text}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
