import { useState } from 'react';
import { X, Clock, Calendar, MessageSquare, CreditCard as Edit2, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Profile, Availability } from '../lib/database.types';

interface AvailabilityModalProps {
  date: string;
  currentProfile: Profile;
  existingAvailability?: Availability[];
  onClose: () => void;
  onSave: () => void;
}

export function AvailabilityModal({
  date,
  currentProfile,
  existingAvailability = [],
  onClose,
  onSave,
}: AvailabilityModalProps) {
  const [type, setType] = useState<'available' | 'preferred' | 'unavailable'>('unavailable');
  const [isFullDay, setIsFullDay] = useState(true);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('17:00');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const handleEdit = (avail: Availability) => {
    setEditingId(avail.id);
    setType(avail.type);
    setIsFullDay(avail.is_full_day);
    setStartTime(avail.start_time || '09:00');
    setEndTime(avail.end_time || '17:00');
    setReason(avail.reason || '');
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setType('unavailable');
    setIsFullDay(true);
    setStartTime('09:00');
    setEndTime('17:00');
    setReason('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const availability: any = {
        user_id: currentProfile.id,
        date,
        type,
        is_full_day: isFullDay,
        reason: reason || null,
        start_time: null,
        end_time: null,
      };

      if (!isFullDay) {
        availability.start_time = startTime;
        availability.end_time = endTime;
      }

      if (editingId) {
        const { error } = await supabase
          .from('availability')
          .update(availability)
          .eq('id', editingId);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('availability')
          .insert(availability);

        if (error) throw error;
      }

      handleCancelEdit();
      onSave();
    } catch (error) {
      console.error('Error saving availability:', error);
      alert('Fehler beim Speichern der Verfügbarkeit');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Diesen Eintrag wirklich löschen?')) return;

    try {
      const { error } = await supabase
        .from('availability')
        .delete()
        .eq('id', id);

      if (error) throw error;

      if (editingId === id) {
        handleCancelEdit();
      }
      onSave();
    } catch (error) {
      console.error('Error deleting availability:', error);
      alert('Fehler beim Löschen');
    }
  };

  const handleDeleteAll = async () => {
    if (!confirm('Alle Einträge für diesen Tag wirklich löschen?')) return;

    try {
      const { error } = await supabase
        .from('availability')
        .delete()
        .eq('user_id', currentProfile.id)
        .eq('date', date);

      if (error) throw error;

      handleCancelEdit();
      onSave();
    } catch (error) {
      console.error('Error deleting all availability:', error);
      alert('Fehler beim Löschen aller Einträge');
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('de-DE', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const formatTime = (time: string | null) => {
    if (!time) return '';
    return time.substring(0, 5);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto border border-slate-200 dark:border-slate-700">
        <div className="sticky top-0 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 p-6 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Verfügbarkeit</h2>
            <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
              <Calendar className="w-4 h-4 inline mr-1" />
              {formatDate(date)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition"
          >
            <X className="w-5 h-5 text-slate-700 dark:text-slate-200" />
          </button>
        </div>

        <div className="p-6">
          {existingAvailability.length > 0 && (
            <div className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                  Bestehende Einträge ({existingAvailability.length})
                </h3>
                {existingAvailability.length > 1 && (
                  <button
                    onClick={handleDeleteAll}
                    className="text-xs text-red-600 hover:text-red-700 font-medium flex items-center gap-1"
                  >
                    <Trash2 className="w-3 h-3" />
                    Alle löschen
                  </button>
                )}
              </div>
              <div className="space-y-2">
                {existingAvailability.map((avail) => (
                  <div
                    key={avail.id}
                    className={`p-4 rounded-xl border-2 transition ${
                      editingId === avail.id
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/20'
                        : avail.type === 'unavailable'
                        ? 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900/40'
                        : avail.type === 'preferred'
                        ? 'bg-yellow-50 dark:bg-yellow-950/15 border-yellow-200 dark:border-yellow-900/40'
                        : 'bg-green-50 dark:bg-green-950/15 border-green-200 dark:border-green-900/40'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-sm text-slate-900 dark:text-slate-100">
                            {avail.type === 'unavailable'
                              ? 'Nicht verfügbar'
                              : avail.type === 'preferred'
                              ? 'Bevorzugt'
                              : 'Verfügbar'}
                          </span>
                          {!avail.is_full_day && (
                            <span className="text-xs text-slate-600 dark:text-slate-300 flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {formatTime(avail.start_time)} - {formatTime(avail.end_time)}
                            </span>
                          )}
                          {avail.is_full_day && (
                            <span className="text-xs text-slate-600 dark:text-slate-300">Ganztägig</span>
                          )}
                        </div>
                        {avail.reason && (
                          <p className="text-sm text-slate-600 dark:text-slate-300">{avail.reason}</p>
                        )}
                        {editingId === avail.id && (
                          <p className="text-xs text-blue-600 mt-1 font-medium">
                            Wird bearbeitet
                          </p>
                        )}
                      </div>
                      <div className="flex gap-1 ml-2">
                        <button
                          onClick={() => handleEdit(avail)}
                          className={`p-2 rounded transition ${
                            editingId === avail.id
                              ? 'bg-blue-100 dark:bg-blue-950/30 text-blue-700 dark:text-blue-200'
                              : 'hover:bg-white/50 dark:hover:bg-slate-800/60'
                          }`}
                          title="Bearbeiten"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(avail.id)}
                          className="p-2 hover:bg-white/50 dark:hover:bg-slate-800/60 rounded transition"
                          title="Löschen"
                        >
                          <Trash2 className="w-4 h-4 text-red-600" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="border-t border-slate-200 dark:border-slate-700 my-6"></div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              {editingId ? 'Eintrag bearbeiten' : 'Neuer Eintrag'}
            </h3>
            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">
                Art der Verfügbarkeit
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setType('preferred')}
                  className={`p-3 rounded-xl border-2 transition ${
                    type === 'preferred'
                      ? 'bg-yellow-50 border-yellow-500 text-yellow-900'
                      : 'bg-slate-50 dark:bg-slate-950/40 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-200 hover:border-slate-300 dark:hover:border-slate-600'
                  }`}
                >
                  <div className="text-sm font-medium">Bevorzugt</div>
                </button>
                <button
                  type="button"
                  onClick={() => setType('available')}
                  className={`p-3 rounded-xl border-2 transition ${
                    type === 'available'
                      ? 'bg-green-50 border-green-500 text-green-900'
                      : 'bg-slate-50 dark:bg-slate-950/40 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-200 hover:border-slate-300 dark:hover:border-slate-600'
                  }`}
                >
                  <div className="text-sm font-medium">Verfügbar</div>
                </button>
                <button
                  type="button"
                  onClick={() => setType('unavailable')}
                  className={`p-3 rounded-xl border-2 transition ${
                    type === 'unavailable'
                      ? 'bg-red-50 border-red-500 text-red-900'
                      : 'bg-slate-50 dark:bg-slate-950/40 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-200 hover:border-slate-300 dark:hover:border-slate-600'
                  }`}
                >
                  <div className="text-sm font-medium">Nicht verfügbar</div>
                </button>
              </div>
            </div>

            <div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isFullDay}
                  onChange={(e) => setIsFullDay(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-blue-500 focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                  Ganztägig
                </span>
              </label>
            </div>

            {!isFullDay && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">
                    Von
                  </label>
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full px-4 py-2 rounded-lg border-2 border-slate-200 dark:border-slate-700 focus:border-blue-500 focus:outline-none bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">
                    Bis
                  </label>
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-full px-4 py-2 rounded-lg border-2 border-slate-200 dark:border-slate-700 focus:border-blue-500 focus:outline-none bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                    required
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">
                <MessageSquare className="w-4 h-4 inline mr-1" />
                Notiz (optional)
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="z.B. Urlaub, Arzttermin, Geschäftsreise..."
                rows={3}
                className="w-full px-4 py-2 rounded-lg border-2 border-slate-200 dark:border-slate-700 focus:border-blue-500 focus:outline-none resize-none bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
              />
            </div>

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={loading}
                className="flex-1 bg-blue-500 text-white py-3 rounded-xl font-semibold hover:bg-blue-600 transition disabled:opacity-50"
              >
                {loading ? 'Speichern...' : editingId ? 'Änderungen speichern' : 'Hinzufügen'}
              </button>
              {editingId ? (
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className="px-6 py-3 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-100 rounded-xl font-semibold hover:bg-slate-200 dark:hover:bg-slate-700 transition"
                >
                  Abbrechen
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onClose}
                  className="px-6 py-3 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-100 rounded-xl font-semibold hover:bg-slate-200 dark:hover:bg-slate-700 transition"
                >
                  Schließen
                </button>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
