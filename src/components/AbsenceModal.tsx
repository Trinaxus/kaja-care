import { useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Profile } from '../lib/database.types';
import { X, UserX, Calendar } from 'lucide-react';

interface AbsenceModalProps {
  profiles: Profile[];
  onClose: () => void;
  onUpdate: () => void;
}

export function AbsenceModal({ profiles, onClose, onUpdate }: AbsenceModalProps) {
  const [absence, setAbsence] = useState({
    user_id: '',
    start_date: new Date().toISOString().split('T')[0],
    end_date: new Date().toISOString().split('T')[0],
    is_full_day: true,
    start_time: '09:00',
    end_time: '17:00',
    reason: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!absence.user_id || !absence.start_date || !absence.end_date) return;

    if (new Date(absence.end_date) < new Date(absence.start_date)) {
      alert('Das Enddatum muss nach dem Startdatum liegen');
      return;
    }

    setIsSubmitting(true);

    const startDate = new Date(absence.start_date + 'T00:00:00');
    const endDate = new Date(absence.end_date + 'T00:00:00');
    const absenceEntries = [];

    const currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      const year = currentDate.getFullYear();
      const month = String(currentDate.getMonth() + 1).padStart(2, '0');
      const day = String(currentDate.getDate()).padStart(2, '0');
      const dateString = `${year}-${month}-${day}`;

      absenceEntries.push({
        user_id: absence.user_id,
        date: dateString,
        type: 'unavailable' as const,
        is_full_day: absence.is_full_day,
        start_time: absence.is_full_day ? null : absence.start_time,
        end_time: absence.is_full_day ? null : absence.end_time,
        reason: absence.reason || null
      });

      currentDate.setDate(currentDate.getDate() + 1);
    }

    const { error } = await supabase.from('availability').insert(absenceEntries);

    if (error) {
      console.error('Error creating absence:', error);
      alert('Fehler beim Eintragen der Abwesenheit');
    } else {
      onUpdate();
      onClose();
    }

    setIsSubmitting(false);
  };

  const selectedProfile = profiles?.find(p => p.id === absence.user_id);
  const dayCount = Math.max(1, Math.ceil((new Date(absence.end_date).getTime() - new Date(absence.start_date).getTime()) / (1000 * 60 * 60 * 24)) + 1);

  if (!profiles || profiles.length === 0) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="surface rounded-xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto border border-slate-200 dark:border-slate-700">
        <div className="sticky top-0 surface border-b border-slate-200 dark:border-slate-700 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <UserX className="w-6 h-6 text-orange-600" />
            Abwesenheit eintragen
          </h2>
          <button
            onClick={onClose}
            className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Person</label>
            <select
              value={absence.user_id}
              onChange={(e) => setAbsence({ ...absence, user_id: e.target.value })}
              className="w-full px-4 py-2.5 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 surface text-slate-900 dark:text-slate-100"
            >
              <option value="">Bitte wählen...</option>
              {profiles.map(profile => (
                <option key={profile.id} value={profile.id}>{profile.name}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Von</label>
              <input
                type="date"
                value={absence.start_date}
                onChange={(e) => setAbsence({ ...absence, start_date: e.target.value })}
                className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Bis</label>
              <input
                type="date"
                value={absence.end_date}
                onChange={(e) => setAbsence({ ...absence, end_date: e.target.value })}
                className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          {dayCount > 1 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center gap-2 text-sm text-blue-900">
              <Calendar className="w-4 h-4" />
              <span>{dayCount} Tage ausgewählt</span>
            </div>
          )}

          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={absence.is_full_day}
                onChange={(e) => setAbsence({ ...absence, is_full_day: e.target.checked })}
                className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
              />
              <span className="text-sm font-medium text-slate-700">Ganztägig abwesend</span>
            </label>
          </div>

          {!absence.is_full_day && (
            <div className="grid grid-cols-2 gap-4 pl-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Von</label>
                <input
                  type="time"
                  value={absence.start_time}
                  onChange={(e) => setAbsence({ ...absence, start_time: e.target.value })}
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Bis</label>
                <input
                  type="time"
                  value={absence.end_time}
                  onChange={(e) => setAbsence({ ...absence, end_time: e.target.value })}
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Grund</label>
            <input
              type="text"
              value={absence.reason}
              onChange={(e) => setAbsence({ ...absence, reason: e.target.value })}
              placeholder="z.B. Urlaub, Termin, Krankheit..."
              className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {selectedProfile && absence.start_date && absence.end_date && (
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 space-y-2">
              <div className="font-medium text-slate-900">Zusammenfassung</div>
              <div className="text-sm text-slate-700">
                <strong>{selectedProfile.name}</strong> ist{' '}
                {absence.is_full_day ? 'ganztägig' : `von ${absence.start_time} bis ${absence.end_time}`}{' '}
                abwesend
              </div>
              <div className="text-sm text-slate-600">
                {new Date(absence.start_date).toLocaleDateString('de-DE', { day: '2-digit', month: 'short' })} bis{' '}
                {new Date(absence.end_date).toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' })}
                {' '}({dayCount} Tag{dayCount > 1 ? 'e' : ''})
              </div>
              {absence.reason && (
                <div className="text-sm text-slate-600">Grund: {absence.reason}</div>
              )}
            </div>
          )}
        </div>

        <div className="sticky bottom-0 bg-slate-50 border-t border-slate-200 px-6 py-4 flex gap-3">
          <button
            onClick={handleSubmit}
            disabled={!absence.user_id || !absence.start_date || !absence.end_date || isSubmitting}
            className="flex-1 px-4 py-2.5 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition disabled:opacity-50 disabled:cursor-not-allowed font-medium"
          >
            {isSubmitting ? 'Wird gespeichert...' : 'Abwesenheit eintragen'}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2.5 surface border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition font-medium"
          >
            Abbrechen
          </button>
        </div>
      </div>
    </div>
  );
}
