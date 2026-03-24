import { useEffect, useMemo, useState } from 'react';
import { fetchAsset, saveAsset, type AssetEnvelope } from '../../api/assets';

type ExpenseItem = {
  id: string;
  createdAt: number;
  amount: number;
  description: string;
};

export function AssetsExpenses() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'error' | 'ready'>('idle');
  const [error, setError] = useState<string>('');
  const [envelope, setEnvelope] = useState<AssetEnvelope<ExpenseItem> | null>(null);

  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');

  const items = useMemo(() => {
    const arr = envelope?.items || [];
    return [...arr].sort((a, b) => b.createdAt - a.createdAt);
  }, [envelope]);

  const total = useMemo(() => items.reduce((sum, it) => sum + (Number.isFinite(it.amount) ? it.amount : 0), 0), [items]);

  const load = async () => {
    setStatus('loading');
    setError('');
    try {
      const data = await fetchAsset<ExpenseItem>('expenses');
      setEnvelope(data);
      setStatus('ready');
    } catch (e: any) {
      setStatus('error');
      setError(e?.message || 'Expenses konnten nicht geladen werden');
    }
  };

  useEffect(() => {
    load();
  }, []);

  const addItem = async () => {
    if (!envelope) return;

    const parsed = Number(String(amount).replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed <= 0) return;

    const next: AssetEnvelope<ExpenseItem> = {
      ...envelope,
      items: [
        {
          id: crypto.randomUUID(),
          createdAt: Date.now(),
          amount: parsed,
          description: description.trim()
        },
        ...envelope.items
      ]
    };

    setEnvelope(next);
    setAmount('');
    setDescription('');

    try {
      await saveAsset('expenses', next);
    } catch (e: any) {
      setError(e?.message || 'Speichern fehlgeschlagen');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-3 flex-wrap">
        <div className="min-w-[140px]">
          <label className="block text-sm font-semibold text-slate-700 mb-2">Betrag (€)</label>
          <input className="input-field" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="12,50" />
        </div>
        <div className="flex-1 min-w-[220px]">
          <label className="block text-sm font-semibold text-slate-700 mb-2">Beschreibung</label>
          <input className="input-field" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="z.B. Futter" />
        </div>
        <button className="btn-primary" type="button" onClick={addItem}>
          Hinzufügen
        </button>
        <button className="btn-secondary" type="button" onClick={load}>
          Neu laden
        </button>
      </div>

      <div className="text-slate-900 font-bold">Summe: {total.toFixed(2)}€</div>

      {status === 'loading' && <div className="text-slate-600">Lade Expenses…</div>}
      {status === 'error' && <div className="text-red-700 font-medium">{error}</div>}
      {error && status === 'ready' && <div className="text-red-700 font-medium">{error}</div>}

      <div className="space-y-3">
        {items.length === 0 ? (
          <div className="text-slate-600">Noch keine Einträge.</div>
        ) : (
          items.map((it) => (
            <div key={it.id} className="bg-white/60 border border-white/40 rounded-2xl p-4 flex items-start justify-between gap-3">
              <div>
                <div className="text-slate-900 font-semibold">{it.amount.toFixed(2)}€</div>
                <div className="text-slate-700">{it.description || '—'}</div>
                <div className="text-xs text-slate-500 mt-1">{new Date(it.createdAt).toLocaleString()}</div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
