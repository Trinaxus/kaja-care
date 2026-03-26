import { useEffect, useState } from 'react';
import type { Profile, CareDayNote, CareDayEvent } from '../lib/database.types';
import { BookOpen, AlertCircle, Stethoscope, Calendar, Filter, Heart, Activity, Plus, X, Trash2 } from 'lucide-react';
import { useToast } from '../hooks/useToast';
import { Toast } from './ui/Toast';
import { deleteItems, listItems, upsertItems } from '../api/collections';

interface LogBookProps {
  profiles: Profile[];
  currentProfile?: Profile;
}

interface LogEntry {
  date: string;
  type: 'note' | 'event';
  data: CareDayNote | CareDayEvent;
}

export function LogBook({ profiles, currentProfile }: LogBookProps) {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [filter, setFilter] = useState<'all' | 'important' | 'health'>('all');
  const [showAddNote, setShowAddNote] = useState(false);
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [noteContent, setNoteContent] = useState('');
  const [noteType, setNoteType] = useState<'general' | 'health' | 'behavior'>('general');
  const [isImportant, setIsImportant] = useState(false);
  const [eventTitle, setEventTitle] = useState('');
  const [eventType, setEventType] = useState<CareDayEvent['event_type']>('vet');
  const [eventNotes, setEventNotes] = useState('');
  const [eventLocation, setEventLocation] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const toast = useToast();

  useEffect(() => {
    if (!currentProfile?.id) return;

    const key = `logbookLastSeenAt:${String(currentProfile.id)}`;
    localStorage.setItem(key, new Date().toISOString());
    window.dispatchEvent(new CustomEvent('logbook-read'));
  }, [currentProfile?.id]);

  useEffect(() => {
    loadLogEntries();
  }, [filter]);

  const loadLogEntries = async () => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const startDate = thirtyDaysAgo.toISOString().split('T')[0];

    let notes: CareDayNote[] = [];
    let events: CareDayEvent[] = [];
    try {
      const [allNotes, allEvents] = await Promise.all([
        listItems<CareDayNote>('care_day_notes'),
        listItems<CareDayEvent>('care_day_events')
      ]);
      notes = allNotes.filter((n) => String(n.date || '').localeCompare(startDate) >= 0);
      events = allEvents.filter((e) => String(e.date || '').localeCompare(startDate) >= 0);
    } catch (e) {
      console.error('Error loading logbook entries:', e);
      notes = [];
      events = [];
    }

    const allEntries: LogEntry[] = [
      ...notes.map((note) => ({ date: note.date, type: 'note' as const, data: note })),
      ...events.map((event) => ({ date: event.date, type: 'event' as const, data: event }))
    ];

    let filtered = allEntries;

    if (filter === 'important') {
      filtered = allEntries.filter(e => e.type === 'note' && (e.data as CareDayNote).is_important);
    } else if (filter === 'health') {
      filtered = allEntries.filter(e =>
        (e.type === 'note' && (e.data as CareDayNote).note_type === 'health') ||
        (e.type === 'event' && (e.data as CareDayEvent).event_type === 'vet')
      );
    }

    filtered.sort((a, b) => {
      const dateCompare = b.date.localeCompare(a.date);
      if (dateCompare !== 0) return dateCompare;

      const aTime = a.type === 'note'
        ? (a.data as CareDayNote).created_at
        : (a.data as CareDayEvent).created_at;
      const bTime = b.type === 'note'
        ? (b.data as CareDayNote).created_at
        : (b.data as CareDayEvent).created_at;

      return bTime.localeCompare(aTime);
    });

    setEntries(filtered);
  };

  const getProfile = (id: string) => profiles.find(p => p.id === id);

  const getDotClass = (color?: string) => {
    switch (color) {
      case 'blue':
        return 'bg-blue-500';
      case 'green':
        return 'bg-green-500';
      case 'red':
        return 'bg-red-500';
      case 'orange':
        return 'bg-orange-500';
      case 'purple':
        return 'bg-purple-500';
      case 'pink':
        return 'bg-pink-500';
      case 'yellow':
        return 'bg-yellow-500';
      default:
        return 'bg-slate-400';
    }
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('de-DE', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  };

  const handleAddNote = async () => {
    if (!noteContent.trim() || !currentProfile) return;

    try {
      const nowIso = new Date().toISOString();
      const next: CareDayNote = {
        id: crypto.randomUUID(),
        date: selectedDate,
        caretaker_id: currentProfile.id,
        content: noteContent.trim(),
        note_type: noteType,
        is_important: isImportant,
        created_at: nowIso
      };
      await upsertItems('care_day_notes', next, ['id']);

      toast.success('Notiz hinzugefügt');
      setNoteContent('');
      setNoteType('general');
      setIsImportant(false);
      setShowAddNote(false);
      loadLogEntries();
    } catch (error) {
      toast.error('Fehler beim Hinzufügen der Notiz');
    }
  };

  const handleAddEvent = async () => {
    if (!eventTitle.trim() || !currentProfile) return;

    try {
      const nowIso = new Date().toISOString();
      const next: CareDayEvent = {
        id: crypto.randomUUID(),
        date: selectedDate,
        created_by: currentProfile.id,
        title: eventTitle.trim(),
        event_type: eventType,
        time: null,
        notes: eventNotes.trim() || null,
        location: eventLocation.trim() || null,
        created_at: nowIso,
        updated_at: nowIso
      };
      await upsertItems('care_day_events', next, ['id']);

      toast.success('Ereignis hinzugefügt');
      setEventTitle('');
      setEventType('vet');
      setEventNotes('');
      setEventLocation('');
      setShowAddEvent(false);
      loadLogEntries();
    } catch (error) {
      toast.error('Fehler beim Hinzufügen des Ereignisses');
    }
  };

  const handleDeleteEntry = async (entry: LogEntry) => {
    if (!confirm('Möchtest du diesen Eintrag wirklich löschen?')) return;

    try {
      const table = entry.type === 'note' ? 'care_day_notes' : 'care_day_events';
      await deleteItems(table, { id: entry.data.id });

      toast.success('Eintrag gelöscht');
      loadLogEntries();
    } catch (error) {
      toast.error('Fehler beim Löschen');
    }
  };

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center shadow-md">
            <BookOpen className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Logbuch</h2>
            <p className="text-sm text-slate-500 dark:text-slate-300">Alle Notizen und Ereignisse</p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <button
            onClick={() => setShowAddNote(true)}
            className="px-3 sm:px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium flex items-center justify-center gap-2 transition-all shadow-sm text-sm sm:text-base"
          >
            <Plus className="w-4 h-4 flex-shrink-0" />
            <span>Notiz</span>
          </button>
          <button
            onClick={() => setShowAddEvent(true)}
            className="px-3 sm:px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg font-medium flex items-center justify-center gap-2 transition-all shadow-sm text-sm sm:text-base"
          >
            <Plus className="w-4 h-4 flex-shrink-0" />
            <span>Ereignis</span>
          </button>
        </div>
      </div>

      <div className="mb-4 sm:mb-6 flex items-center gap-2 overflow-x-auto">
        <Filter className="w-4 h-4 text-slate-400 flex-shrink-0" />
        <button
          onClick={() => setFilter('all')}
          className={`px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-all whitespace-nowrap ${
            filter === 'all'
              ? 'bg-blue-500 text-white shadow-sm'
              : 'surface text-slate-600 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700'
          }`}
        >
          Alle
        </button>
        <button
          onClick={() => setFilter('important')}
          className={`px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-all flex items-center gap-1.5 whitespace-nowrap ${
            filter === 'important'
              ? 'bg-red-500 text-white shadow-sm'
              : 'surface text-slate-600 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700'
          }`}
        >
          <AlertCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
          <span>Wichtig</span>
        </button>
        <button
          onClick={() => setFilter('health')}
          className={`px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-all flex items-center gap-1.5 whitespace-nowrap ${
            filter === 'health'
              ? 'bg-emerald-500 text-white shadow-sm'
              : 'surface text-slate-600 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700'
          }`}
        >
          <Heart className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
          <span>Gesundheit</span>
        </button>
      </div>

      <div className="surface rounded-xl sm:rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-4 sm:p-6">
        <div className="space-y-3">
          {entries.map((entry, idx) => {
            const showDate = idx === 0 || entries[idx - 1].date !== entry.date;

            return (
              <div key={`${entry.type}-${entry.data.id}`}>
                {showDate && (
                  <div className="flex items-center gap-3 mb-3 mt-6 first:mt-0">
                    <Calendar className="w-4 h-4 text-slate-400" />
                    <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                      {formatDate(entry.date)}
                    </span>
                    <div className="h-px flex-1 bg-gradient-to-r from-slate-200 dark:from-slate-700 to-transparent"></div>
                  </div>
                )}

                {entry.type === 'note' ? (
                  <div
                    className={`p-4 rounded-xl border-l-4 transition-all hover:shadow-md relative group ${
                      (entry.data as CareDayNote).is_important
                        ? 'bg-gradient-to-r from-red-50 to-white dark:from-red-950/30 dark:to-slate-900/40 border-red-500 shadow-sm'
                        : 'surface border-slate-300 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-600'
                    }`}
                  >
                    {currentProfile && (entry.data as CareDayNote).caretaker_id === currentProfile.id && (
                      <button
                        onClick={() => handleDeleteEntry(entry)}
                        className="absolute top-3 right-3 p-2 bg-red-100 dark:bg-red-950/30 hover:bg-red-200 dark:hover:bg-red-900/30 text-red-600 dark:text-red-200 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                        title="Löschen"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded-lg ${
                        (entry.data as CareDayNote).is_important
                          ? 'bg-red-100 dark:bg-red-950/30'
                          : (entry.data as CareDayNote).note_type === 'health'
                          ? 'bg-emerald-100 dark:bg-emerald-950/30'
                          : (entry.data as CareDayNote).note_type === 'behavior'
                          ? 'bg-purple-100 dark:bg-purple-950/30'
                          : 'bg-blue-100 dark:bg-blue-950/30'
                      }`}>
                        {(entry.data as CareDayNote).is_important ? (
                          <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-200" />
                        ) : (entry.data as CareDayNote).note_type === 'health' ? (
                          <Heart className="w-5 h-5 text-emerald-600 dark:text-emerald-200" />
                        ) : (entry.data as CareDayNote).note_type === 'behavior' ? (
                          <Activity className="w-5 h-5 text-purple-600 dark:text-purple-200" />
                        ) : (
                          <BookOpen className="w-5 h-5 text-blue-600 dark:text-blue-200" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <span className={`text-xs font-bold px-2 py-1 rounded-md ${
                            (entry.data as CareDayNote).is_important
                              ? 'bg-red-200 dark:bg-red-900/30 text-red-800 dark:text-red-200'
                              : (entry.data as CareDayNote).note_type === 'health'
                              ? 'bg-emerald-200 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-200'
                              : (entry.data as CareDayNote).note_type === 'behavior'
                              ? 'bg-purple-200 dark:bg-purple-900/30 text-purple-800 dark:text-purple-200'
                              : 'bg-blue-200 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200'
                          }`}>
                            {(entry.data as CareDayNote).note_type === 'general' ? 'Notiz' :
                             (entry.data as CareDayNote).note_type === 'health' ? 'Gesundheit' :
                             (entry.data as CareDayNote).note_type === 'behavior' ? 'Verhalten' :
                             (entry.data as CareDayNote).note_type}
                          </span>
                          <div
                            className={`w-2 h-2 rounded-full ${getDotClass(
                              getProfile((entry.data as CareDayNote).caretaker_id)?.color
                            )}`}
                          ></div>
                          <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                            {getProfile((entry.data as CareDayNote).caretaker_id)?.name}
                          </span>
                        </div>
                        <p className={`text-base leading-relaxed ${
                          (entry.data as CareDayNote).is_important
                            ? 'text-red-900 dark:text-red-100 font-medium'
                            : 'text-slate-700 dark:text-slate-200'
                        }`}>
                          {(entry.data as CareDayNote).content}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 rounded-xl bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-950/30 dark:to-slate-900/40 border-l-4 border-blue-500 shadow-sm hover:shadow-md transition-all relative group">
                    {currentProfile && (entry.data as CareDayEvent).created_by === currentProfile.id && (
                      <button
                        onClick={() => handleDeleteEntry(entry)}
                        className="absolute top-3 right-3 p-2 bg-red-100 dark:bg-red-950/30 hover:bg-red-200 dark:hover:bg-red-900/30 text-red-600 dark:text-red-200 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                        title="Löschen"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                    <div className="flex items-start gap-3">
                      <div className="p-2 bg-blue-100 dark:bg-blue-950/30 rounded-lg">
                        <Stethoscope className="w-5 h-5 text-blue-600 dark:text-blue-200" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-xs font-bold px-2 py-1 rounded-md bg-blue-200 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200">
                            {(entry.data as CareDayEvent).event_type === 'vet' ? 'Tierarzt' :
                             (entry.data as CareDayEvent).event_type === 'special' ? 'Pflege' :
                             (entry.data as CareDayEvent).event_type}
                          </span>
                          <div
                            className={`w-2 h-2 rounded-full ${getDotClass(
                              getProfile((entry.data as CareDayEvent).created_by)?.color
                            )}`}
                          ></div>
                          <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                            {getProfile((entry.data as CareDayEvent).created_by)?.name}
                          </span>
                        </div>
                        <p className="text-base font-semibold text-blue-900 dark:text-blue-100 mb-1">
                          {(entry.data as CareDayEvent).title}
                        </p>
                        {(entry.data as CareDayEvent).notes && (
                          <p className="text-sm text-blue-800 dark:text-slate-200 mt-2 leading-relaxed">
                            {(entry.data as CareDayEvent).notes}
                          </p>
                        )}
                        {(entry.data as CareDayEvent).location && (
                          <p className="text-sm text-blue-700 dark:text-slate-300 mt-2 flex items-center gap-1">
                            <span className="font-medium">📍</span>
                            {(entry.data as CareDayEvent).location}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {entries.length === 0 && (
            <div className="text-center py-16">
              <div className="w-20 h-20 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
                <BookOpen className="w-10 h-10 text-slate-400 dark:text-slate-300" />
              </div>
              <p className="text-lg font-medium text-slate-700 dark:text-slate-200 mb-1">Keine Einträge gefunden</p>
              <p className="text-sm text-slate-500 dark:text-slate-300">Versuche einen anderen Filter oder füge einen Eintrag hinzu</p>
            </div>
          )}
        </div>
      </div>

      {showAddNote && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="surface rounded-2xl shadow-2xl max-w-md w-full p-6 border border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100">Neue Notiz</h3>
              <button
                onClick={() => setShowAddNote(false)}
                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-slate-500 dark:text-slate-200" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">Datum</label>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 surface text-slate-900 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">Typ</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setNoteType('general')}
                    className={`flex-1 px-3 py-2 rounded-lg font-medium text-sm transition-all ${
                      noteType === 'general'
                        ? 'bg-blue-500 text-white'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    Allgemein
                  </button>
                  <button
                    onClick={() => setNoteType('health')}
                    className={`flex-1 px-3 py-2 rounded-lg font-medium text-sm transition-all ${
                      noteType === 'health'
                        ? 'bg-emerald-500 text-white'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    Gesundheit
                  </button>
                  <button
                    onClick={() => setNoteType('behavior')}
                    className={`flex-1 px-3 py-2 rounded-lg font-medium text-sm transition-all ${
                      noteType === 'behavior'
                        ? 'bg-purple-500 text-white'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    Verhalten
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">Notiz</label>
                <textarea
                  value={noteContent}
                  onChange={(e) => setNoteContent(e.target.value)}
                  rows={4}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 surface text-slate-900 dark:text-slate-100"
                  placeholder="Was ist passiert?"
                />
              </div>

              <label className="flex items-center gap-3 p-3 bg-red-50 dark:bg-red-950/30 border-2 border-red-200 dark:border-red-900/50 rounded-lg cursor-pointer hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors">
                <input
                  type="checkbox"
                  checked={isImportant}
                  onChange={(e) => setIsImportant(e.target.checked)}
                  className="w-5 h-5 text-red-500 rounded focus:ring-2 focus:ring-red-500"
                />
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-200" />
                  <span className="font-medium text-red-900 dark:text-red-100">Als wichtig markieren</span>
                </div>
              </label>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setShowAddNote(false)}
                  className="flex-1 px-4 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg font-medium transition-colors"
                >
                  Abbrechen
                </button>
                <button
                  onClick={handleAddNote}
                  disabled={!noteContent.trim()}
                  className="flex-1 px-4 py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Hinzufügen
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showAddEvent && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="surface rounded-2xl shadow-2xl max-w-md w-full p-6 border border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100">Neues Ereignis</h3>
              <button
                onClick={() => setShowAddEvent(false)}
                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-slate-500 dark:text-slate-400" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">Datum</label>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 surface text-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">Typ</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setEventType('vet')}
                    className={`flex-1 px-3 py-2 rounded-lg font-medium text-sm transition-all ${
                      eventType === 'vet'
                        ? 'bg-blue-500 text-white'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    Tierarzt
                  </button>
                  <button
                    onClick={() => setEventType('special')}
                    className={`flex-1 px-3 py-2 rounded-lg font-medium text-sm transition-all ${
                      eventType === 'special'
                        ? 'bg-blue-500 text-white'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    Pflege
                  </button>
                  <button
                    onClick={() => setEventType('other')}
                    className={`flex-1 px-3 py-2 rounded-lg font-medium text-sm transition-all ${
                      eventType === 'other'
                        ? 'bg-blue-500 text-white'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    Sonstiges
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">Titel</label>
                <input
                  type="text"
                  value={eventTitle}
                  onChange={(e) => setEventTitle(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 surface text-slate-900 dark:text-slate-100"
                  placeholder="z.B. Impfung, Krallen schneiden"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">Ort (optional)</label>
                <input
                  type="text"
                  value={eventLocation}
                  onChange={(e) => setEventLocation(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 surface text-slate-900 dark:text-slate-100"
                  placeholder="z.B. Tierarztpraxis Dr. Müller"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">Notizen (optional)</label>
                <textarea
                  value={eventNotes}
                  onChange={(e) => setEventNotes(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 surface text-slate-900 dark:text-slate-100"
                  placeholder="Zusätzliche Details..."
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setShowAddEvent(false)}
                  className="flex-1 px-4 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg font-medium transition-colors"
                >
                  Abbrechen
                </button>
                <button
                  onClick={handleAddEvent}
                  disabled={!eventTitle.trim()}
                  className="flex-1 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Hinzufügen
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="fixed top-4 right-4 z-50 flex flex-col gap-3">
        {toast.toasts.map((t) => (
          <Toast key={t.id} type={t.type} message={t.message} onClose={() => toast.remove(t.id)} />
        ))}
      </div>
    </div>
  );
}
