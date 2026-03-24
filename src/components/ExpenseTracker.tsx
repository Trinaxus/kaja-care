import { useState, useEffect } from 'react';
import type { Profile, Expense } from '../lib/database.types';
import { Plus, Trash2, CreditCard as Edit2, ShoppingCart, Stethoscope, Scissors, Package, MoreHorizontal, TrendingUp, TrendingDown, Minus, Calendar } from 'lucide-react';
import { deleteItems, listItems, upsertItems } from '../api/collections';
import { resolveProfileById } from '../lib/knownProfiles';
import { profileColorClass } from '../lib/profileColor';

interface ExpenseTrackerProps {
  profiles: Profile[];
  currentProfile: Profile;
}

const CATEGORY_CONFIG = {
  food: { icon: ShoppingCart, label: 'Futter', color: 'bg-orange-100 text-orange-700 dark:bg-orange-950/35 dark:text-orange-200' },
  toys: { icon: Package, label: 'Spielzeug', color: 'bg-blue-100 text-blue-700 dark:bg-blue-950/35 dark:text-blue-200' },
  vet: { icon: Stethoscope, label: 'Tierarzt', color: 'bg-red-100 text-red-700 dark:bg-rose-950/35 dark:text-rose-200' },
  grooming: { icon: Scissors, label: 'Pflege', color: 'bg-green-100 text-green-700 dark:bg-emerald-950/30 dark:text-emerald-200' },
  accessories: { icon: Package, label: 'Zubehör', color: 'bg-purple-100 text-purple-700 dark:bg-purple-950/35 dark:text-purple-200' },
  other: { icon: MoreHorizontal, label: 'Sonstiges', color: 'bg-slate-100 text-slate-700 dark:bg-slate-800/60 dark:text-slate-200' }
};

export function ExpenseTracker({ profiles, currentProfile }: ExpenseTrackerProps) {
  const accessRole = localStorage.getItem('accessRole') || 'user';
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [showNewExpense, setShowNewExpense] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<Expense['category']>('food');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [paidBy, setPaidBy] = useState<string>(currentProfile.id);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  useEffect(() => {
    loadExpenses();
  }, [selectedYear]);

  const loadExpenses = async () => {
    try {
      const all = await listItems<Expense>('expenses');
      const filtered = all.filter((e) => String(e.date || '').startsWith(String(selectedYear)));
      filtered.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
      setExpenses(filtered);
    } catch (e) {
      console.error('Error loading expenses:', e);
      setExpenses([]);
    }
  };

  const handleCreateExpense = async () => {
    if (!amount || parseFloat(amount) <= 0) return;

    try {
      const nowIso = new Date().toISOString();
      const next: Expense & { paid_by_profile_id?: string } = {
        id: crypto.randomUUID(),
        profile_id: currentProfile.id,
        amount: parseFloat(amount),
        category,
        description: description || null,
        date,
        receipt_url: null,
        paid_by_profile_id: paidBy,
        created_at: nowIso,
        updated_at: nowIso
      };
      await upsertItems('expenses', next, ['id']);
    } catch (error: any) {
      console.error('Error creating expense:', error);
      alert('Fehler beim Speichern der Ausgabe: ' + (error?.message || String(error)));
      return;
    }

    resetForm();
    loadExpenses();
  };

  const handleUpdateExpense = async () => {
    if (!editingExpense || !amount || parseFloat(amount) <= 0) return;

    try {
      const nowIso = new Date().toISOString();
      const next: Expense & { paid_by_profile_id?: string } = {
        ...editingExpense,
        amount: parseFloat(amount),
        category,
        description: description || null,
        date,
        paid_by_profile_id: paidBy,
        updated_at: nowIso
      };
      await upsertItems('expenses', next, ['id']);
    } catch (error: any) {
      console.error('Error updating expense:', error);
      alert('Fehler beim Aktualisieren der Ausgabe: ' + (error?.message || String(error)));
      return;
    }

    resetForm();
    loadExpenses();
  };

  const handleDeleteExpense = async (id: string) => {
    if (!confirm('Ausgabe wirklich löschen?')) return;

    try {
      await deleteItems('expenses', { id });
    } catch (error: any) {
      console.error('Error deleting expense:', error);
      alert('Fehler beim Löschen der Ausgabe: ' + (error?.message || String(error)));
      return;
    }

    loadExpenses();
  };

  const resetForm = () => {
    setShowNewExpense(false);
    setEditingExpense(null);
    setAmount('');
    setCategory('food');
    setDescription('');
    setDate(new Date().toISOString().split('T')[0]);
    setPaidBy(currentProfile.id);
  };

  const startEdit = (expense: Expense) => {
    setEditingExpense(expense);
    setAmount(expense.amount.toString());
    setCategory(expense.category);
    setDescription(expense.description || '');
    setDate(expense.date);
    setPaidBy(String((expense as any).paid_by_profile_id || expense.profile_id || currentProfile.id));
    setShowNewExpense(false);
  };

  const getProfileById = (id: string) => resolveProfileById(profiles, id);

  const expensePaidById = (e: Expense) => String((e as any).paid_by_profile_id || e.profile_id || '');

  const canEditExpense = (e: Expense) => {
    if (accessRole === 'admin') return true;
    const payerId = expensePaidById(e);
    return payerId === currentProfile.id || e.profile_id === currentProfile.id;
  };

  const canonicalName = (raw: unknown) => String(raw || '').trim().toLowerCase();
  const isMartin = (p: Profile | null) => canonicalName(p?.name) === 'martin';
  const isLisa = (p: Profile | null) => canonicalName(p?.name) === 'lisa';

  const calculateStats = () => {
    const paidByMartin = expenses.filter((e) => isMartin(getProfileById(expensePaidById(e))));
    const paidByLisa = expenses.filter((e) => isLisa(getProfileById(expensePaidById(e))));

    const martinPaidTotal = paidByMartin.reduce((sum, e) => sum + Number(e.amount || 0), 0);
    const lisaPaidTotal = paidByLisa.reduce((sum, e) => sum + Number(e.amount || 0), 0);

    const total = martinPaidTotal + lisaPaidTotal;

    const balance = martinPaidTotal - lisaPaidTotal;

    return {
      martinTotal: martinPaidTotal,
      lisaTotal: lisaPaidTotal,
      total,
      balance,
      martinCount: paidByMartin.length,
      lisaCount: paidByLisa.length
    };
  };

  const stats = calculateStats();

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h3 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-slate-100">Kosten-Tracking</h3>
        {!showNewExpense && !editingExpense && (
          <button
            onClick={() => setShowNewExpense(true)}
            className="px-3 sm:px-4 py-2 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 transition text-sm sm:text-base w-full sm:w-auto"
            type="button"
          >
            <Plus className="w-4 h-4 inline mr-2" />
            <span>Neue Ausgabe</span>
          </button>
        )}
      </div>

      <div className="surface rounded-xl p-3 sm:p-4 shadow-sm">
        <button
          onClick={() => setSelectedYear(selectedYear - 1)}
          className="px-3 sm:px-4 py-2 text-slate-600 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition font-bold text-lg sm:text-xl"
          type="button"
        >
          ←
        </button>
        <h4 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-slate-100">{selectedYear}</h4>
        <button
          onClick={() => setSelectedYear(selectedYear + 1)}
          className="px-3 sm:px-4 py-2 text-slate-600 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition font-bold text-lg sm:text-xl"
          type="button"
        >
          →
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
        <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950/30 dark:to-blue-900/10 rounded-xl sm:rounded-2xl shadow-sm border border-blue-200 dark:border-blue-900/40 p-4 sm:p-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs sm:text-sm font-medium text-blue-700 dark:text-blue-200">Martin</p>
            <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-blue-500"></div>
          </div>
          <p className="text-2xl sm:text-3xl font-bold text-blue-900 dark:text-blue-100">{stats.martinTotal.toFixed(2)}€</p>
          <p className="text-xs text-blue-600 dark:text-blue-200/80 mt-1">{stats.martinCount} Ausgaben</p>
        </div>

        <div className="bg-gradient-to-br from-green-50 to-green-100 dark:from-emerald-950/25 dark:to-emerald-900/10 rounded-xl sm:rounded-2xl shadow-sm border border-green-200 dark:border-emerald-900/40 p-4 sm:p-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs sm:text-sm font-medium text-green-700 dark:text-emerald-200">Lisa</p>
            <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-green-500"></div>
          </div>
          <p className="text-2xl sm:text-3xl font-bold text-green-900 dark:text-emerald-100">{stats.lisaTotal.toFixed(2)}€</p>
          <p className="text-xs text-green-600 dark:text-emerald-200/80 mt-1">{stats.lisaCount} Ausgaben</p>
        </div>

        <div
          className={`bg-gradient-to-br rounded-xl sm:rounded-2xl shadow-sm border p-4 sm:p-6 ${
            stats.balance === 0
              ? 'from-slate-50 to-slate-100 dark:from-slate-950/40 dark:to-slate-900/30 border-slate-200 dark:border-slate-700'
              : stats.balance > 0
                ? 'from-orange-50 to-orange-100 dark:from-orange-950/25 dark:to-orange-900/10 border-orange-200 dark:border-orange-900/40'
                : 'from-teal-50 to-teal-100 dark:from-teal-950/25 dark:to-teal-900/10 border-teal-200 dark:border-teal-900/40'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <p
              className={`text-xs sm:text-sm font-medium ${
                stats.balance === 0
                  ? 'text-slate-700 dark:text-slate-200'
                  : stats.balance > 0
                    ? 'text-orange-700 dark:text-orange-200'
                    : 'text-teal-700 dark:text-teal-200'
              }`}
            >
              Balance
            </p>
            {stats.balance === 0 ? (
              <Minus className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-600 dark:text-slate-300" />
            ) : stats.balance > 0 ? (
              <TrendingUp className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-orange-600 dark:text-orange-200" />
            ) : (
              <TrendingDown className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-teal-600 dark:text-teal-200" />
            )}
          </div>
          <p
            className={`text-2xl sm:text-3xl font-bold ${
              stats.balance === 0
                ? 'text-slate-900 dark:text-slate-100'
                : stats.balance > 0
                  ? 'text-orange-900 dark:text-orange-100'
                  : 'text-teal-900 dark:text-teal-100'
            }`}
          >
            {Math.abs(stats.balance).toFixed(2)}€
          </p>
          <p
            className={`text-xs mt-1 ${
              stats.balance === 0
                ? 'text-slate-600 dark:text-slate-300'
                : stats.balance > 0
                  ? 'text-orange-600 dark:text-orange-200/80'
                  : 'text-teal-600 dark:text-teal-200/80'
            }`}
          >
            {stats.balance === 0 ? 'Ausgeglichen' : `${stats.balance > 0 ? 'Martin' : 'Lisa'} hat mehr ausgegeben`}
          </p>
        </div>
      </div>

      {(showNewExpense || editingExpense) && (
        <div className="surface-muted rounded-xl p-6">
          <h4 className="font-bold text-slate-900 dark:text-slate-100 mb-4">
            {editingExpense ? 'Ausgabe bearbeiten' : 'Neue Ausgabe'}
          </h4>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">Betrag (€)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 surface text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">Datum</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 surface text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">Kategorie</label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {(Object.keys(CATEGORY_CONFIG) as Expense['category'][]).map((cat) => {
                const config = CATEGORY_CONFIG[cat];
                const Icon = config.icon;
                const isSelected = category === cat;
                return (
                  <button
                    key={cat}
                    onClick={() => setCategory(cat)}
                    type="button"
                    className={`px-3 py-2 rounded-lg font-medium text-sm transition-all flex items-center gap-2 justify-center ${
                      isSelected
                        ? 'bg-blue-500 text-white'
                        : 'surface text-slate-600 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{config.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">Beschreibung</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional"
              className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 surface text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">Bezahlt von</label>
              <select
                className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 surface text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={paidBy}
                onChange={(e) => setPaidBy(e.target.value)}
              >
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={editingExpense ? handleUpdateExpense : handleCreateExpense}
              className="px-6 py-2 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 transition"
              type="button"
            >
              {editingExpense ? 'Aktualisieren' : 'Speichern'}
            </button>
            <button
              onClick={resetForm}
              className="px-6 py-2 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-lg font-medium hover:bg-slate-300 dark:hover:bg-slate-700 transition"
              type="button"
            >
              Abbrechen
            </button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {expenses.length === 0 ? (
          <div className="text-center text-slate-500 dark:text-slate-400 py-8">Noch keine Ausgaben für {selectedYear}</div>
        ) : (
          expenses.map((expense) => {
            const config = CATEGORY_CONFIG[expense.category];
            const Icon = config.icon;
            const paidByProfile = getProfileById(expensePaidById(expense));
            const canEdit = canEditExpense(expense);

            return (
              <div
                key={expense.id}
                className="surface rounded-xl p-4 shadow-sm hover:shadow-md transition-all"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 flex-1">
                    <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg">
                      <Icon className="w-5 h-5 text-slate-600 dark:text-slate-200" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-lg font-bold text-slate-900 dark:text-slate-100">{expense.amount.toFixed(2)}€</span>
                        <span className={`text-xs font-bold px-2 py-1 rounded-md ${config.color}`}>{config.label}</span>
                      </div>
                      {expense.description && <p className="text-slate-700 dark:text-slate-200 mb-1">{expense.description}</p>}
                      <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
                        <div className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5" />
                          <span>{new Date(expense.date).toLocaleDateString('de-DE')}</span>
                        </div>
                        {paidByProfile && (
                          <div className="flex items-center gap-1">
                            <div className={`w-2 h-2 rounded-full ${profileColorClass(paidByProfile, 'solid')}`}></div>
                            <span>Bezahlt von {paidByProfile.name}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {canEdit && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => startEdit(expense)}
                        className="p-2 bg-blue-100 dark:bg-blue-950/30 hover:bg-blue-200 dark:hover:bg-blue-900/30 text-blue-600 dark:text-blue-200 rounded-lg transition"
                        title="Bearbeiten"
                        type="button"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteExpense(expense.id)}
                        className="p-2 bg-red-100 dark:bg-red-950/30 hover:bg-red-200 dark:hover:bg-red-900/30 text-red-600 dark:text-red-200 rounded-lg transition"
                        title="Löschen"
                        type="button"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
