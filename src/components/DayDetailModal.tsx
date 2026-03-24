import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type {
  Profile,
  CareAssignment,
  CareDayEvent,
  CareDayNote,
  Handover,
  EventType,
  NoteType,
  PreferenceLevel,
  Availability,
  ShortVisit,
  VisitType
} from '../lib/database.types';
import { X, Calendar, Stethoscope, GraduationCap, Pill, Star, Users, Plus, Trash2, AlertCircle, StickyNote, ArrowLeftRight, CreditCard as Edit2, UserX, Clock, Heart, Circle, AlertTriangle, Ban, Dog } from 'lucide-react';
import { deleteItems, listItems, upsertItems } from '../api/collections';
import { profileColorClass } from '../lib/profileColor';
import { resolveProfileById } from '../lib/knownProfiles';

interface DayDetailModalProps {
  date: string;
  currentProfile: Profile;
  profiles: Profile[];
  onClose: () => void;
  onUpdate: () => void;
}

interface DayDetails {
  assignment?: CareAssignment;
  events: CareDayEvent[];
  notes: CareDayNote[];
  handover?: Handover;
  availabilities: Availability[];
  preferences: { profile_id: string; preference_level: PreferenceLevel; reason: string | null }[];
  shortVisits: ShortVisit[];
}

const PREFERENCE_CONFIG: Record<PreferenceLevel, { icon: typeof Heart; label: string; color: string }> = {
  very_happy: { icon: Heart, label: 'Sehr gerne', color: 'bg-pink-100 text-pink-700 border-pink-300' },
  nice: { icon: Star, label: 'Wäre schön', color: 'bg-yellow-100 text-yellow-700 border-yellow-300' },
  neutral: { icon: Circle, label: 'Neutral', color: 'bg-slate-100 text-slate-600 border-slate-300' },
  rather_not: { icon: AlertTriangle, label: 'Lieber nicht', color: 'bg-orange-100 text-orange-700 border-orange-300' },
  impossible: { icon: Ban, label: 'Nicht möglich', color: 'bg-red-100 text-red-700 border-red-300' }
};

export function DayDetailModal({ date, currentProfile, profiles, onClose, onUpdate }: DayDetailModalProps) {
  const [details, setDetails] = useState<DayDetails>({ events: [], notes: [], availabilities: [], preferences: [], shortVisits: [] });
  const [newEvent, setNewEvent] = useState({ type: 'vet' as EventType, title: '', time: '', location: '', notes: '' });
  const [newNote, setNewNote] = useState({ type: 'health' as NoteType, content: '', is_important: false });
  const [newAbsence, setNewAbsence] = useState({ user_id: '', is_full_day: true, start_time: '', end_time: '', reason: '' });
  const [showEventForm, setShowEventForm] = useState(false);
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [showAbsenceForm, setShowAbsenceForm] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CareDayEvent | null>(null);
  const [editingNote, setEditingNote] = useState<CareDayNote | null>(null);
  const [editingAbsence, setEditingAbsence] = useState<Availability | null>(null);
  const [isAssigning, setIsAssigning] = useState(false);
  const [showHandoverForm, setShowHandoverForm] = useState(false);
  const [handoverTime, setHandoverTime] = useState('12:00');
  const [handoverLocation, setHandoverLocation] = useState('');
  const [handoverNotes, setHandoverNotes] = useState('');
  const [bringsUserId, setBringsUserId] = useState<string>('');
  const [picksUpUserId, setPicksUpUserId] = useState<string>('');
  const [handoverFromUserId, setHandoverFromUserId] = useState<string>('');
  const [handoverToUserId, setHandoverToUserId] = useState<string>('');
  const [showPreferenceEdit, setShowPreferenceEdit] = useState(false);
  const [selectedPreference, setSelectedPreference] = useState<PreferenceLevel>('very_happy');
  const [preferenceReason, setPreferenceReason] = useState('');
  const [showVisitForm, setShowVisitForm] = useState(false);
  const [editingVisit, setEditingVisit] = useState<ShortVisit | null>(null);
  const [newVisit, setNewVisit] = useState({
    visitor_id: '',
    visit_type: 'walk' as VisitType,
    start_time: '',
    end_time: '',
    duration_minutes: '',
    notes: '',
    picked_up_from: '',
    returned_to: ''
  });

  useEffect(() => {
    loadDetails();
  }, [date]);

  const loadDetails = async () => {
    try {
      const [assignments, events, notes, handovers, availabilities, preferences, visits] = await Promise.all([
        listItems<CareAssignment>('care_assignments', { date }),
        listItems<CareDayEvent>('care_day_events', { date }),
        listItems<CareDayNote>('care_day_notes', { date }),
        listItems<Handover>('handovers', { date }),
        listItems<Availability>('availability', { date, type: 'unavailable' }),
        listItems<{ profile_id: string; preference_level: PreferenceLevel; reason: string | null }>('care_day_preferences', { date }),
        listItems<ShortVisit>('short_visits', { date }),
      ]);

      const assignment = (assignments || [])[0];
      const handover = (handovers || [])[0];

      const sortedNotes = [...(notes || [])].sort((a: any, b: any) => {
        const at = typeof a?.created_at === 'string' ? a.created_at : '';
        const bt = typeof b?.created_at === 'string' ? b.created_at : '';
        return bt.localeCompare(at);
      });

      const sortedVisits = [...(visits || [])].sort((a: any, b: any) => {
        const at = typeof a?.start_time === 'string' ? a.start_time : '';
        const bt = typeof b?.start_time === 'string' ? b.start_time : '';
        return at.localeCompare(bt);
      });

      setDetails({
        assignment: assignment || undefined,
        events: events || [],
        notes: sortedNotes,
        handover: handover || undefined,
        availabilities: availabilities || [],
        preferences: preferences || [],
        shortVisits: sortedVisits
      });

      const myPref = (preferences || []).find(p => p.profile_id === currentProfile.id);
      if (myPref) {
        setSelectedPreference(myPref.preference_level);
        setPreferenceReason(myPref.reason || '');
      }
    } catch (e: any) {
      console.error('Error loading day details:', e);
      alert('Fehler beim Laden der Details: ' + (e?.message || 'Unbekannter Fehler'));
    }
  };

  const nowIso = () => new Date().toISOString();

  const handleAddEvent = async () => {
    if (!newEvent.title) return;

    try {
      const payload: any = {
        id: editingEvent?.id,
        date,
        event_type: newEvent.type,
        title: newEvent.title,
        time: newEvent.time || null,
        location: newEvent.location || null,
        notes: newEvent.notes || null,
        created_by: editingEvent ? (editingEvent as any).created_by : currentProfile.id,
        created_at: editingEvent ? (editingEvent as any).created_at : nowIso(),
        updated_at: nowIso(),
      };

      await upsertItems('care_day_events', payload, []);
    } catch (e: any) {
      console.error('Error saving event:', e);
      alert('Fehler beim Speichern des Ereignisses: ' + (e?.message || 'Unbekannter Fehler'));
      return;
    }

    setNewEvent({ type: 'vet', title: '', time: '', location: '', notes: '' });
    setShowEventForm(false);
    setEditingEvent(null);
    await loadDetails();
    onUpdate();
  };

  const handleAddNote = async () => {
    if (!newNote.content) return;

    try {
      const payload: any = {
        id: editingNote?.id,
        date,
        caretaker_id: editingNote ? (editingNote as any).caretaker_id : currentProfile.id,
        note_type: newNote.type,
        content: newNote.content,
        is_important: newNote.is_important,
        created_at: editingNote ? (editingNote as any).created_at : nowIso(),
        updated_at: nowIso(),
      };

      await upsertItems('care_day_notes', payload, []);
    } catch (e: any) {
      console.error('Error saving note:', e);
      alert('Fehler beim Speichern der Notiz: ' + (e?.message || 'Unbekannter Fehler'));
      return;
    }

    setNewNote({ type: 'health', content: '', is_important: false });
    setShowNoteForm(false);
    setEditingNote(null);
    await loadDetails();
    onUpdate();
  };

  const startEditEvent = (event: CareDayEvent) => {
    setEditingEvent(event);
    setNewEvent({
      type: event.event_type,
      title: event.title,
      time: event.time || '',
      location: event.location || '',
      notes: event.notes || ''
    });
    setShowEventForm(true);
  };

  const startEditNote = (note: CareDayNote) => {
    setEditingNote(note);
    setNewNote({
      type: note.note_type,
      content: note.content,
      is_important: note.is_important
    });
    setShowNoteForm(true);
  };

  const cancelEventForm = () => {
    setShowEventForm(false);
    setEditingEvent(null);
    setNewEvent({ type: 'vet', title: '', time: '', location: '', notes: '' });
  };

  const cancelNoteForm = () => {
    setShowNoteForm(false);
    setEditingNote(null);
    setNewNote({ type: 'health', content: '', is_important: false });
  };

  const handleDeleteEvent = async (id: string) => {
    try {
      await deleteItems('care_day_events', { id });
    } catch (e: any) {
      console.error('Error deleting event:', e);
      alert('Fehler beim Löschen des Ereignisses: ' + (e?.message || 'Unbekannter Fehler'));
      return;
    }
    await loadDetails();
    onUpdate();
  };

  const handleDeleteNote = async (id: string) => {
    try {
      await deleteItems('care_day_notes', { id });
    } catch (e: any) {
      console.error('Error deleting note:', e);
      alert('Fehler beim Löschen der Notiz: ' + (e?.message || 'Unbekannter Fehler'));
      return;
    }
    await loadDetails();
    onUpdate();
  };

  const handleSaveHandover = async () => {
    if (!handoverFromUserId || !handoverToUserId) {
      alert('Bitte wähle sowohl "Von" als auch "An" aus');
      return;
    }

    try {
      const payload: any = {
        id: details.handover?.id,
        date,
        from_user_id: handoverFromUserId,
        to_user_id: handoverToUserId,
        time: handoverTime || null,
        location: handoverLocation || null,
        notes: handoverNotes || null,
        brings_user_id: bringsUserId || null,
        picks_up_user_id: picksUpUserId || null,
        created_at: details.handover ? (details.handover as any).created_at : nowIso(),
        updated_at: nowIso(),
      };
      await upsertItems('handovers', payload, ['date']);
    } catch (e: any) {
      console.error('Error saving handover:', e);
      alert('Fehler beim Speichern der Übergabe: ' + (e?.message || 'Unbekannter Fehler'));
      return;
    }

    setShowHandoverForm(false);
    await loadDetails();
    onUpdate();
  };

  const handleDeleteHandover = async () => {
    if (!details.handover) return;

    try {
      await deleteItems('handovers', { id: details.handover.id });
    } catch (e: any) {
      console.error('Error deleting handover:', e);
      alert('Fehler beim Löschen der Übergabe: ' + (e?.message || 'Unbekannter Fehler'));
      return;
    }
    await loadDetails();
    onUpdate();
  };

  const handleSavePreference = async () => {
    try {
      await upsertItems('care_day_preferences', {
        profile_id: currentProfile.id,
        date,
        preference_level: selectedPreference,
        reason: preferenceReason || null
      }, ['profile_id', 'date']);
    } catch (e: any) {
      console.error('Error saving preference:', e);
      alert('Fehler beim Speichern der Präferenz: ' + (e?.message || 'Unbekannter Fehler'));
      return;
    }

    setShowPreferenceEdit(false);
    await loadDetails();
    onUpdate();
  };

  const handleDeletePreference = async () => {
    try {
      await deleteItems('care_day_preferences', { date, profile_id: currentProfile.id });
    } catch (e: any) {
      console.error('Error deleting preference:', e);
      alert('Fehler beim Löschen der Präferenz: ' + (e?.message || 'Unbekannter Fehler'));
      return;
    }

    setSelectedPreference('very_happy');
    setPreferenceReason('');
    await loadDetails();
    onUpdate();
  };

  useEffect(() => {
    if (details.handover) {
      setHandoverTime(details.handover.time?.substring(0, 5) || '12:00');
      setHandoverLocation(details.handover.location || '');
      setHandoverNotes(details.handover.notes || '');
      setBringsUserId(details.handover.brings_user_id || '');
      setPicksUpUserId(details.handover.picks_up_user_id || '');
      setHandoverFromUserId(details.handover.from_user_id);
      setHandoverToUserId(details.handover.to_user_id);
    } else if (details.assignment && showHandoverForm) {
      const otherProfile = profiles.find(p => p.id !== details.assignment!.caretaker_id);
      if (otherProfile) {
        setHandoverFromUserId(details.assignment.caretaker_id);
        setHandoverToUserId(otherProfile.id);
      }
    }
  }, [details.handover, details.assignment, showHandoverForm, profiles]);

  const handleAddAbsence = async () => {
    if (!newAbsence.user_id) return;

    try {
      const payload: any = {
        id: editingAbsence?.id,
        user_id: newAbsence.user_id,
        date,
        type: 'unavailable',
        is_full_day: newAbsence.is_full_day,
        start_time: newAbsence.is_full_day ? null : newAbsence.start_time || null,
        end_time: newAbsence.is_full_day ? null : newAbsence.end_time || null,
        reason: newAbsence.reason || null,
        created_at: editingAbsence ? (editingAbsence as any).created_at : nowIso(),
        updated_at: nowIso(),
      };
      await upsertItems('availability', payload, []);
    } catch (e: any) {
      console.error('Error saving absence:', e);
      alert('Fehler beim Speichern der Abwesenheit: ' + (e?.message || 'Unbekannter Fehler'));
      return;
    }

    setNewAbsence({ user_id: '', is_full_day: true, start_time: '', end_time: '', reason: '' });
    setShowAbsenceForm(false);
    setEditingAbsence(null);
    await loadDetails();
    onUpdate();
  };

  const startEditAbsence = (absence: Availability) => {
    setEditingAbsence(absence);
    setNewAbsence({
      user_id: absence.user_id,
      is_full_day: absence.is_full_day,
      start_time: absence.start_time || '',
      end_time: absence.end_time || '',
      reason: absence.reason || ''
    });
    setShowAbsenceForm(true);
  };

  const cancelAbsenceForm = () => {
    setShowAbsenceForm(false);
    setEditingAbsence(null);
    setNewAbsence({ user_id: '', is_full_day: true, start_time: '', end_time: '', reason: '' });
  };

  const handleDeleteAbsence = async (id: string) => {
    try {
      await deleteItems('availability', { id });
    } catch (e: any) {
      console.error('Error deleting absence:', e);
      alert('Fehler beim Löschen der Abwesenheit: ' + (e?.message || 'Unbekannter Fehler'));
      return;
    }
    await loadDetails();
    onUpdate();
  };

  const handleAddVisit = async () => {
    if (!newVisit.visitor_id || !newVisit.start_time) return;

    try {
      const payload: any = {
        id: editingVisit?.id,
        date,
        visitor_id: newVisit.visitor_id,
        visit_type: newVisit.visit_type,
        start_time: newVisit.start_time,
        end_time: newVisit.end_time || null,
        duration_minutes: newVisit.duration_minutes ? parseInt(newVisit.duration_minutes) : null,
        notes: newVisit.notes || null,
        picked_up_from: newVisit.picked_up_from || null,
        returned_to: newVisit.returned_to || null,
        created_at: editingVisit ? (editingVisit as any).created_at : nowIso(),
        updated_at: nowIso(),
      };
      await upsertItems('short_visits', payload, []);
    } catch (e: any) {
      console.error('Error saving visit:', e);
      alert('Fehler beim Speichern des Besuchs: ' + (e?.message || 'Unbekannter Fehler'));
      return;
    }

    setNewVisit({
      visitor_id: '',
      visit_type: 'walk',
      start_time: '',
      end_time: '',
      duration_minutes: '',
      notes: '',
      picked_up_from: '',
      returned_to: ''
    });
    setShowVisitForm(false);
    setEditingVisit(null);
    await loadDetails();
    onUpdate();
  };

  const startEditVisit = (visit: ShortVisit) => {
    setEditingVisit(visit);
    setNewVisit({
      visitor_id: visit.visitor_id,
      visit_type: visit.visit_type,
      start_time: visit.start_time || '',
      end_time: visit.end_time || '',
      duration_minutes: visit.duration_minutes ? visit.duration_minutes.toString() : '',
      notes: visit.notes || '',
      picked_up_from: visit.picked_up_from || '',
      returned_to: visit.returned_to || ''
    });
    setShowVisitForm(true);
  };

  const cancelVisitForm = () => {
    setShowVisitForm(false);
    setEditingVisit(null);
    setNewVisit({
      visitor_id: '',
      visit_type: 'walk',
      start_time: '',
      end_time: '',
      duration_minutes: '',
      notes: '',
      picked_up_from: '',
      returned_to: ''
    });
  };

  const handleDeleteVisit = async (id: string) => {
    try {
      await deleteItems('short_visits', { id });
    } catch (e: any) {
      console.error('Error deleting visit:', e);
      alert('Fehler beim Löschen des Besuchs: ' + (e?.message || 'Unbekannter Fehler'));
      return;
    }
    await loadDetails();
    onUpdate();
  };

  const handleAssignCaretaker = async (caretakerId: string) => {
    try {
      await upsertItems('care_assignments', {
        date,
        caretaker_id: caretakerId,
        created_by: currentProfile.id,
        status: 'planned'
      }, ['date']);
    } catch (e: any) {
      console.error('Error assigning caretaker:', e);
      alert('Fehler beim Zuweisen: ' + (e?.message || 'Unbekannter Fehler'));
      return;
    }

    setIsAssigning(false);
    await loadDetails();
    onUpdate();
  };

  const handleRemoveAssignment = async () => {
    try {
      await deleteItems('care_assignments', { date });
    } catch (e: any) {
      console.error('Error removing assignment:', e);
      alert('Fehler beim Entfernen der Zuweisung: ' + (e?.message || 'Unbekannter Fehler'));
      return;
    }
    await loadDetails();
    onUpdate();
  };

  const getEventIcon = (type: EventType) => {
    switch (type) {
      case 'vet': return <Stethoscope className="w-4 h-4" />;
      case 'training': return <GraduationCap className="w-4 h-4" />;
      case 'medication': return <Pill className="w-4 h-4" />;
      case 'special': return <Star className="w-4 h-4" />;
      case 'visit': return <Users className="w-4 h-4" />;
      default: return <Calendar className="w-4 h-4" />;
    }
  };

  const getEventTypeLabel = (type: EventType) => {
    const labels: Record<EventType, string> = {
      vet: 'Tierarzt',
      training: 'Hundeschule',
      medication: 'Medikament',
      special: 'Besonderes',
      visit: 'Besuch',
      other: 'Sonstiges'
    };
    return labels[type];
  };

  const getNoteTypeLabel = (type: NoteType) => {
    const labels: Record<NoteType, string> = {
      health: 'Gesundheit',
      behavior: 'Verhalten',
      food: 'Futter',
      activity: 'Aktivität',
      medication: 'Medikation',
      general: 'Allgemein'
    };
    return labels[type];
  };

  const caretaker = details.assignment ? profiles.find(p => p.id === details.assignment!.caretaker_id) : null;
  const getProfile = (id: string | null | undefined) => {
    if (!id) return null;
    return resolveProfileById(profiles, id);
  };

  const getProfileName = (id: string | null | undefined) => getProfile(id)?.name || '';
  const formattedDate = new Date(date).toLocaleDateString('de-DE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  if (typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[1000] p-2 sm:p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="surface rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto border border-slate-200/80 dark:border-slate-700 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 surface/95 backdrop-blur border-b border-slate-200 dark:border-slate-700 px-4 sm:px-6 py-3 sm:py-4">
          <div className="flex items-center justify-between mb-3 sm:mb-4">
            <h2 className="text-lg sm:text-2xl font-bold text-slate-900 dark:text-slate-100">{formattedDate}</h2>
            <button onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition flex-shrink-0">
              <X className="w-6 h-6 text-slate-700 dark:text-slate-200" />
            </button>
          </div>

          <div className="space-y-3">
            {caretaker && !isAssigning && (
              <div className="flex items-center justify-between bg-gradient-to-r from-blue-50 to-green-50 dark:from-slate-900 dark:to-slate-900 rounded-xl p-4 border-2 border-blue-200 dark:border-slate-700">
                <div className="flex items-center gap-3">
                  <div className={`w-4 h-4 rounded-full ${profileColorClass(caretaker, 'solid')}`}></div>
                  <span className="font-semibold text-slate-900 dark:text-slate-100">Kaja bei {caretaker.name}</span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setIsAssigning(true)}
                    className="px-4 py-2 surface border-2 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-100 rounded-lg font-medium hover:border-slate-300 dark:hover:border-slate-600 transition text-sm"
                  >
                    Ändern
                  </button>
                  <button
                    onClick={handleRemoveAssignment}
                    className="px-4 py-2 bg-red-500 text-white rounded-lg font-medium hover:bg-red-600 transition text-sm"
                  >
                    Entfernen
                  </button>
                </div>
              </div>
            )}

            {!caretaker && !isAssigning && (
              <button
                onClick={() => setIsAssigning(true)}
                className="w-full px-6 py-4 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl font-semibold hover:from-blue-600 hover:to-blue-700 transition shadow-sm"
              >
                Tag zuweisen
              </button>
            )}

            {isAssigning && (
              <div className="bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-slate-950/40 dark:to-slate-900/30 border-2 border-blue-200 dark:border-slate-700 rounded-xl p-4">
                <div className="mb-3">
                  <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-1">Wer kümmert sich um Kaja?</h3>
                  <p className="text-sm text-slate-600 dark:text-slate-300">Wähle eine Person aus</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {profiles.map(profile => (
                    <button
                      key={profile.id}
                      onClick={() => handleAssignCaretaker(profile.id)}
                      className={`px-6 py-4 rounded-xl font-medium transition shadow-sm ${
                        profileColorClass(profile, 'solid')
                      }`}
                    >
                      {profile.name}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setIsAssigning(false)}
                  className="w-full px-4 py-2 surface border-2 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-100 rounded-lg font-medium hover:border-slate-300 dark:hover:border-slate-600 transition text-sm"
                >
                  Abbrechen
                </button>
              </div>
            )}

            {!showPreferenceEdit && (
              <div className="bg-gradient-to-r from-pink-50 to-purple-50 dark:from-slate-950/40 dark:to-slate-900/30 border border-pink-200 dark:border-slate-700 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-slate-900 dark:text-slate-100">Dein Wunsch für diesen Tag</h3>
                  <button
                    onClick={() => setShowPreferenceEdit(true)}
                    className="px-3 py-1.5 bg-pink-500 text-white rounded-lg text-sm font-medium hover:bg-pink-600 transition"
                  >
                    {details.preferences.find(p => p.profile_id === currentProfile.id) ? 'Bearbeiten' : 'Hinzufügen'}
                  </button>
                </div>
                {details.preferences.map(pref => {
                  const profile = profiles.find(p => p.id === pref.profile_id);
                  if (!profile) return null;
                  const config = PREFERENCE_CONFIG[pref.preference_level];
                  const Icon = config.icon;
                  return (
                    <div key={pref.profile_id} className={`flex items-center gap-3 p-3 rounded-lg border-2 ${config.color} mb-2`}>
                      <Icon className="w-5 h-5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">{profile.name}:</span>
                          <span>{config.label}</span>
                        </div>
                        {pref.reason && (
                          <p className="text-sm mt-1 opacity-90">{pref.reason}</p>
                        )}
                      </div>
                      {pref.profile_id === currentProfile.id && (
                        <button
                          onClick={handleDeletePreference}
                          className="p-1.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded transition flex-shrink-0"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  );
                })}
                {details.preferences.length === 0 && (
                  <p className="text-sm text-slate-600 dark:text-slate-300 text-center py-2">Noch keine Wünsche eingetragen</p>
                )}
              </div>
            )}

            {showPreferenceEdit && (
              <div className="bg-gradient-to-r from-pink-50 to-purple-50 dark:from-slate-950/40 dark:to-slate-900/30 border-2 border-pink-300 dark:border-slate-700 rounded-xl p-4">
                <div className="mb-3">
                  <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-1">Wunsch bearbeiten</h3>
                  <p className="text-sm text-slate-600 dark:text-slate-300">Wie fühlst du dich bei diesem Tag?</p>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3">
                  {(Object.entries(PREFERENCE_CONFIG) as [PreferenceLevel, typeof PREFERENCE_CONFIG[PreferenceLevel]][]).map(([level, config]) => {
                    const Icon = config.icon;
                    const isSelected = selectedPreference === level;
                    return (
                      <button
                        key={level}
                        onClick={() => setSelectedPreference(level)}
                        className={`px-3 py-3 rounded-lg font-medium text-sm transition border-2 ${
                          isSelected
                            ? config.color + ' scale-105 shadow-md'
                            : 'surface border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-100 hover:border-slate-300 dark:hover:border-slate-600'
                        }`}
                      >
                        <Icon className="w-4 h-4 inline mr-1.5" />
                        <span className="hidden sm:inline">{config.label}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="mb-3">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
                    Grund (optional)
                  </label>
                  <input
                    type="text"
                    value={preferenceReason}
                    onChange={(e) => setPreferenceReason(e.target.value)}
                    placeholder="z.B. Geburtstag, Termin, etc."
                    className="w-full px-4 py-2 border-2 border-pink-200 dark:border-slate-700 rounded-lg focus:border-pink-400 dark:focus:border-pink-400 focus:outline-none text-sm surface text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleSavePreference}
                    className="flex-1 px-4 py-2 bg-pink-500 text-white rounded-lg font-medium hover:bg-pink-600 transition text-sm"
                  >
                    Speichern
                  </button>
                  <button
                    onClick={() => setShowPreferenceEdit(false)}
                    className="px-4 py-2 surface border-2 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-100 rounded-lg font-medium hover:border-slate-300 dark:hover:border-slate-600 transition text-sm"
                  >
                    Abbrechen
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="p-6 space-y-6 bg-slate-50 dark:bg-slate-950/20">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <UserX className="w-5 h-5" />
                Abwesenheiten
              </h3>
              {!showAbsenceForm && (
                <button
                  onClick={() => setShowAbsenceForm(true)}
                  className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
                >
                  <Plus className="w-4 h-4" />
                  Hinzufügen
                </button>
              )}
            </div>

            {showAbsenceForm && (
              <div className="surface rounded-xl p-4 mb-4 space-y-3 border border-slate-200 dark:border-slate-700 shadow-sm">
                <h4 className="font-medium text-slate-900 dark:text-slate-100 mb-2">
                  {editingAbsence ? 'Abwesenheit bearbeiten' : 'Neue Abwesenheit'}
                </h4>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Person</label>
                  <select
                    value={newAbsence.user_id}
                    onChange={(e) => setNewAbsence({ ...newAbsence, user_id: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg surface text-slate-900 dark:text-slate-100"
                  >
                    <option value="">Bitte wählen...</option>
                    {profiles.map(profile => (
                      <option key={profile.id} value={profile.id}>{profile.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newAbsence.is_full_day}
                      onChange={(e) => setNewAbsence({ ...newAbsence, is_full_day: e.target.checked })}
                      className="rounded"
                    />
                    <span className="text-sm text-slate-700 dark:text-slate-200">Ganztägig abwesend</span>
                  </label>
                </div>
                {!newAbsence.is_full_day && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Von</label>
                      <input
                        type="time"
                        value={newAbsence.start_time}
                        onChange={(e) => setNewAbsence({ ...newAbsence, start_time: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg surface text-slate-900 dark:text-slate-100"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Bis</label>
                      <input
                        type="time"
                        value={newAbsence.end_time}
                        onChange={(e) => setNewAbsence({ ...newAbsence, end_time: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg surface text-slate-900 dark:text-slate-100"
                      />
                    </div>
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Grund</label>
                  <input
                    type="text"
                    value={newAbsence.reason}
                    onChange={(e) => setNewAbsence({ ...newAbsence, reason: e.target.value })}
                    placeholder="z.B. Termin, Urlaub, etc."
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg surface text-slate-900 dark:text-slate-100"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleAddAbsence}
                    className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition"
                  >
                    {editingAbsence ? 'Aktualisieren' : 'Speichern'}
                  </button>
                  <button
                    onClick={cancelAbsenceForm}
                    className="px-4 py-2 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-100 rounded-lg hover:bg-slate-300 dark:hover:bg-slate-700 transition"
                  >
                    Abbrechen
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-2">
              {details.availabilities.map(absence => {
                const user = profiles.find(p => p.id === absence.user_id);
                return (
                  <div key={absence.id} className="bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-900/40 rounded-lg p-3 group">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3 flex-1">
                        <div className="mt-1">
                          <UserX className="w-4 h-4 text-orange-600" />
                        </div>
                        <div className="flex-1">
                          <div className="font-medium text-slate-900 dark:text-slate-100">{user?.name}</div>
                          {absence.is_full_day ? (
                            <div className="text-sm text-orange-700">Ganzer Tag</div>
                          ) : (
                            <div className="text-sm text-orange-700 flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {absence.start_time?.substring(0, 5)} - {absence.end_time?.substring(0, 5)}
                            </div>
                          )}
                          {absence.reason && (
                            <div className="text-sm text-slate-600 dark:text-slate-300 mt-1">{absence.reason}</div>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition">
                        <button
                          onClick={() => startEditAbsence(absence)}
                          className="p-1 hover:bg-blue-50 rounded transition"
                          title="Bearbeiten"
                        >
                          <Edit2 className="w-4 h-4 text-blue-600" />
                        </button>
                        <button
                          onClick={() => handleDeleteAbsence(absence.id)}
                          className="p-1 hover:bg-red-50 rounded transition"
                          title="Löschen"
                        >
                          <Trash2 className="w-4 h-4 text-red-600" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
              {details.availabilities.length === 0 && !showAbsenceForm && (
                <div className="text-center text-slate-500 py-4">Keine Abwesenheiten</div>
              )}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Dog className="w-5 h-5" />
                Kurzbesuche
              </h3>
              {!showVisitForm && (
                <button
                  onClick={() => setShowVisitForm(true)}
                  className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
                >
                  <Plus className="w-4 h-4" />
                  Hinzufügen
                </button>
              )}
            </div>

            {showVisitForm && (
              <div className="surface rounded-xl p-4 mb-4 space-y-3 border border-slate-200 dark:border-slate-700 shadow-sm">
                <h4 className="font-medium text-slate-900 dark:text-slate-100 mb-2">
                  {editingVisit ? 'Besuch bearbeiten' : 'Neuer Kurzbesuch'}
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Besucher</label>
                    <select
                      value={newVisit.visitor_id}
                      onChange={(e) => setNewVisit({ ...newVisit, visitor_id: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 surface text-slate-900 dark:text-slate-100 rounded-lg"
                    >
                      <option value="">Wählen...</option>
                      {profiles.map(profile => (
                        <option key={profile.id} value={profile.id}>{profile.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Art des Besuchs</label>
                    <select
                      value={newVisit.visit_type}
                      onChange={(e) => setNewVisit({ ...newVisit, visit_type: e.target.value as VisitType })}
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 surface text-slate-900 dark:text-slate-100 rounded-lg"
                    >
                      <option value="walk">Spaziergang</option>
                      <option value="short_stay">Kurzaufenthalt</option>
                      <option value="vet_visit">Tierarztbesuch</option>
                      <option value="grooming">Fellpflege</option>
                      <option value="playtime">Spielzeit</option>
                      <option value="other">Sonstiges</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Start</label>
                    <input
                      type="time"
                      value={newVisit.start_time}
                      onChange={(e) => setNewVisit({ ...newVisit, start_time: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 surface text-slate-900 dark:text-slate-100 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Ende (opt.)</label>
                    <input
                      type="time"
                      value={newVisit.end_time}
                      onChange={(e) => setNewVisit({ ...newVisit, end_time: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 surface text-slate-900 dark:text-slate-100 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Dauer (Min.)</label>
                    <input
                      type="number"
                      value={newVisit.duration_minutes}
                      onChange={(e) => setNewVisit({ ...newVisit, duration_minutes: e.target.value })}
                      placeholder="z.B. 60"
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 surface text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 rounded-lg"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Abholen von (opt.)</label>
                    <select
                      value={newVisit.picked_up_from}
                      onChange={(e) => setNewVisit({ ...newVisit, picked_up_from: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 surface text-slate-900 dark:text-slate-100 rounded-lg"
                    >
                      <option value="">-- Nicht festgelegt --</option>
                      {profiles.map(profile => (
                        <option key={profile.id} value={profile.id}>{profile.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Zurückbringen zu (opt.)</label>
                    <select
                      value={newVisit.returned_to}
                      onChange={(e) => setNewVisit({ ...newVisit, returned_to: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 surface text-slate-900 dark:text-slate-100 rounded-lg"
                    >
                      <option value="">-- Nicht festgelegt --</option>
                      {profiles.map(profile => (
                        <option key={profile.id} value={profile.id}>{profile.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Notizen (optional)</label>
                  <textarea
                    value={newVisit.notes}
                    onChange={(e) => setNewVisit({ ...newVisit, notes: e.target.value })}
                    placeholder="z.B. Im Park, Bei schlechtem Wetter kürzer, etc."
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 surface text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 rounded-lg"
                    rows={2}
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleAddVisit}
                    className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition"
                  >
                    {editingVisit ? 'Aktualisieren' : 'Speichern'}
                  </button>
                  <button
                    onClick={cancelVisitForm}
                    className="px-4 py-2 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-100 rounded-lg hover:bg-slate-300 dark:hover:bg-slate-700 transition"
                  >
                    Abbrechen
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-2">
              {details.shortVisits.map(visit => {
                const visitor = getProfile(visit.visitor_id);
                const pickedFrom = visit.picked_up_from ? getProfile(visit.picked_up_from) : null;
                const returnedTo = visit.returned_to ? getProfile(visit.returned_to) : null;

                const visitTypeLabels: Record<VisitType, string> = {
                  walk: 'Spaziergang',
                  short_stay: 'Kurzaufenthalt',
                  vet_visit: 'Tierarztbesuch',
                  grooming: 'Fellpflege',
                  playtime: 'Spielzeit',
                  other: 'Sonstiges'
                };

                return (
                  <div key={visit.id} className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/40 rounded-lg p-3 group">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3 flex-1">
                        <div className="mt-1">
                          <Dog className="w-4 h-4 text-blue-600" />
                        </div>
                        <div className="flex-1">
                          <div className="font-medium text-slate-900 dark:text-slate-100">{visitor?.name || visit.visitor_id} - {visitTypeLabels[visit.visit_type]}</div>
                          <div className="text-sm text-blue-700 dark:text-blue-300 flex items-center gap-1 mt-1">
                            <Clock className="w-3 h-3" />
                            {visit.start_time.substring(0, 5)}
                            {visit.end_time && ` - ${visit.end_time.substring(0, 5)}`}
                            {visit.duration_minutes && ` (${visit.duration_minutes} Min.)`}
                          </div>
                          {(pickedFrom || returnedTo) && (
                            <div className="text-sm text-slate-600 dark:text-slate-300 mt-1 space-y-0.5">
                              {pickedFrom && <div>Abholen von: {pickedFrom.name}</div>}
                              {returnedTo && <div>Zurück zu: {returnedTo.name}</div>}
                            </div>
                          )}
                          {visit.notes && (
                            <div className="text-sm text-slate-600 dark:text-slate-400 mt-1 italic">{visit.notes}</div>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition">
                        <button
                          onClick={() => startEditVisit(visit)}
                          className="p-1 hover:bg-blue-100 dark:hover:bg-blue-950/40 rounded transition"
                          title="Bearbeiten"
                        >
                          <Edit2 className="w-4 h-4 text-blue-600" />
                        </button>
                        <button
                          onClick={() => handleDeleteVisit(visit.id)}
                          className="p-1 hover:bg-red-50 dark:hover:bg-red-950/40 rounded transition"
                          title="Löschen"
                        >
                          <Trash2 className="w-4 h-4 text-red-600" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
              {details.shortVisits.length === 0 && !showVisitForm && (
                <div className="text-center text-slate-500 py-4">Keine Kurzbesuche geplant</div>
              )}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <ArrowLeftRight className="w-5 h-5" />
                Übergabe
              </h3>
              {details.assignment && !details.handover && !showHandoverForm && (
                <button
                  onClick={() => setShowHandoverForm(true)}
                  className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
                >
                  <Plus className="w-4 h-4" />
                  Hinzufügen
                </button>
              )}
            </div>

            {details.handover && !showHandoverForm ? (
              <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div className="space-y-2 flex-1">
                    <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                      {getProfileName(details.handover!.from_user_id) || details.handover!.from_user_id} → {getProfileName(details.handover!.to_user_id) || details.handover!.to_user_id}
                    </div>
                    {details.handover.time && (
                      <div className="text-sm text-slate-700 dark:text-slate-300 flex items-center gap-2">
                        <Clock className="w-4 h-4" />
                        {details.handover.time.substring(0, 5)} Uhr
                      </div>
                    )}
                    {details.handover.location && (
                      <div className="text-sm text-slate-700 dark:text-slate-300">{details.handover.location}</div>
                    )}
                    {(details.handover.brings_user_id || details.handover.picks_up_user_id) && (
                      <div className="text-sm text-slate-700 dark:text-slate-300 space-y-1">
                        {details.handover.brings_user_id && (
                          <div>
                            Wird gebracht von: {getProfileName(details.handover!.brings_user_id) || details.handover!.brings_user_id}
                          </div>
                        )}
                        {details.handover.picks_up_user_id && (
                          <div>
                            Wird geholt von: {getProfileName(details.handover!.picks_up_user_id) || details.handover!.picks_up_user_id}
                          </div>
                        )}
                      </div>
                    )}
                    {details.handover.notes && (
                      <div className="text-sm text-slate-600 dark:text-slate-400 italic">{details.handover.notes}</div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setShowHandoverForm(true)}
                      className="p-1.5 text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950/40 rounded-lg transition-colors"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={handleDeleteHandover}
                      className="p-1.5 text-slate-600 dark:text-slate-300 hover:text-red-600 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ) : showHandoverForm ? (
              <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Von (übergibt)</label>
                    <select
                      value={handoverFromUserId}
                      onChange={(e) => setHandoverFromUserId(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 surface text-slate-900 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="">Wählen...</option>
                      {profiles.map(profile => (
                        <option key={profile.id} value={profile.id}>{profile.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">An (übernimmt)</label>
                    <select
                      value={handoverToUserId}
                      onChange={(e) => setHandoverToUserId(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 surface text-slate-900 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="">Wählen...</option>
                      {profiles.map(profile => (
                        <option key={profile.id} value={profile.id}>{profile.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Uhrzeit</label>
                  <input
                    type="time"
                    value={handoverTime}
                    onChange={(e) => setHandoverTime(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 surface text-slate-900 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Ort (optional)</label>
                  <input
                    type="text"
                    value={handoverLocation}
                    onChange={(e) => setHandoverLocation(e.target.value)}
                    placeholder="z.B. Bei Martin, Bei Lisa"
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 surface text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Wird gebracht von</label>
                    <select
                      value={bringsUserId}
                      onChange={(e) => setBringsUserId(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 surface text-slate-900 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="">-- Auswählen --</option>
                      {profiles.map(profile => (
                        <option key={profile.id} value={profile.id}>{profile.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Wird geholt von</label>
                    <select
                      value={picksUpUserId}
                      onChange={(e) => setPicksUpUserId(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 surface text-slate-900 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="">-- Auswählen --</option>
                      {profiles.map(profile => (
                        <option key={profile.id} value={profile.id}>{profile.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Notizen (optional)</label>
                  <textarea
                    value={handoverNotes}
                    onChange={(e) => setHandoverNotes(e.target.value)}
                    placeholder="Besondere Hinweise zur Übergabe..."
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 surface text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    rows={2}
                  />
                </div>
                <div className="flex gap-2 justify-end pt-2">
                  <button
                    onClick={() => {
                      setShowHandoverForm(false);
                      if (details.handover) {
                        setHandoverTime(details.handover.time?.substring(0, 5) || '12:00');
                        setHandoverLocation(details.handover.location || '');
                        setHandoverNotes(details.handover.notes || '');
                        setBringsUserId(details.handover.brings_user_id || '');
                        setPicksUpUserId(details.handover.picks_up_user_id || '');
                        setHandoverFromUserId(details.handover.from_user_id);
                        setHandoverToUserId(details.handover.to_user_id);
                      }
                    }}
                    className="px-4 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                  >
                    Abbrechen
                  </button>
                  <button
                    onClick={handleSaveHandover}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Speichern
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center text-slate-500 dark:text-slate-400 py-4">Keine Übergabe geplant</div>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Calendar className="w-5 h-5" />
                Ereignisse
              </h3>
              {!showEventForm && (
                <button
                  onClick={() => setShowEventForm(true)}
                  className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
                >
                  <Plus className="w-4 h-4" />
                  Hinzufügen
                </button>
              )}
            </div>

            {showEventForm && (
              <div className="bg-slate-50 dark:bg-slate-900 rounded-lg p-4 mb-4 space-y-3">
                <h4 className="font-medium text-slate-900 dark:text-slate-100 mb-2">
                  {editingEvent ? 'Ereignis bearbeiten' : 'Neues Ereignis'}
                </h4>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Art</label>
                  <select
                    value={newEvent.type}
                    onChange={(e) => setNewEvent({ ...newEvent, type: e.target.value as EventType })}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 surface text-slate-900 dark:text-slate-100 rounded-lg"
                  >
                    <option value="vet">Tierarzt</option>
                    <option value="medication">Medikament</option>
                    <option value="special">Besonderes</option>
                    <option value="visit">Besuch</option>
                    <option value="other">Sonstiges</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Titel</label>
                  <input
                    type="text"
                    value={newEvent.title}
                    onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })}
                    placeholder="z.B. Routineimpfung"
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 surface text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 rounded-lg"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Uhrzeit</label>
                    <input
                      type="time"
                      value={newEvent.time}
                      onChange={(e) => setNewEvent({ ...newEvent, time: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 surface text-slate-900 dark:text-slate-100 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Ort</label>
                    <input
                      type="text"
                      value={newEvent.location}
                      onChange={(e) => setNewEvent({ ...newEvent, location: e.target.value })}
                      placeholder="Optional"
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 surface text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 rounded-lg"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Notizen</label>
                  <textarea
                    value={newEvent.notes}
                    onChange={(e) => setNewEvent({ ...newEvent, notes: e.target.value })}
                    placeholder="Optional"
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 surface text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 rounded-lg"
                    rows={2}
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleAddEvent}
                    className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition"
                  >
                    {editingEvent ? 'Aktualisieren' : 'Speichern'}
                  </button>
                  <button
                    onClick={cancelEventForm}
                    className="px-4 py-2 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-100 rounded-lg hover:bg-slate-300 dark:hover:bg-slate-700 transition"
                  >
                    Abbrechen
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-2">
              {details.events.map(event => (
                <div key={event.id} className="surface border border-slate-200 dark:border-slate-700 rounded-lg p-3 group">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3 flex-1">
                      <div className="mt-1">{getEventIcon(event.event_type)}</div>
                      <div className="flex-1">
                        <div className="font-medium text-slate-900 dark:text-slate-100">{event.title}</div>
                        <div className="text-sm text-slate-600 dark:text-slate-400">{getEventTypeLabel(event.event_type)}</div>
                        {event.time && <div className="text-sm text-slate-600 dark:text-slate-400">Uhrzeit: {event.time.substring(0, 5)}</div>}
                        {event.location && <div className="text-sm text-slate-600 dark:text-slate-400">Ort: {event.location}</div>}
                        {event.notes && <div className="text-sm text-slate-700 dark:text-slate-300 mt-1">{event.notes}</div>}
                        {(event as any).created_by && (
                          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                            Von: {getProfileName((event as any).created_by) || (event as any).created_by}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition">
                      <button
                        onClick={() => startEditEvent(event)}
                        className="p-1 hover:bg-blue-50 dark:hover:bg-blue-950/40 rounded transition"
                        title="Bearbeiten"
                      >
                        <Edit2 className="w-4 h-4 text-blue-600" />
                      </button>
                      <button
                        onClick={() => handleDeleteEvent(event.id)}
                        className="p-1 hover:bg-red-50 dark:hover:bg-red-950/40 rounded transition"
                        title="Löschen"
                      >
                        <Trash2 className="w-4 h-4 text-red-600" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              {details.events.length === 0 && !showEventForm && (
                <div className="text-center text-slate-500 dark:text-slate-400 py-4">Keine Ereignisse</div>
              )}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <StickyNote className="w-5 h-5" />
                Auffälligkeiten & Notizen
              </h3>
              {!showNoteForm && (
                <button
                  onClick={() => setShowNoteForm(true)}
                  className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
                >
                  <Plus className="w-4 h-4" />
                  Hinzufügen
                </button>
              )}
            </div>

            {showNoteForm && (
              <div className="bg-slate-50 dark:bg-slate-900 rounded-lg p-4 mb-4 space-y-3">
                <h4 className="font-medium text-slate-900 dark:text-slate-100 mb-2">
                  {editingNote ? 'Notiz bearbeiten' : 'Neue Notiz'}
                </h4>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Kategorie</label>
                  <select
                    value={newNote.type}
                    onChange={(e) => setNewNote({ ...newNote, type: e.target.value as NoteType })}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 surface text-slate-900 dark:text-slate-100 rounded-lg"
                  >
                    <option value="health">Gesundheit</option>
                    <option value="behavior">Verhalten</option>
                    <option value="food">Futter</option>
                    <option value="activity">Aktivität</option>
                    <option value="medication">Medikation</option>
                    <option value="general">Allgemein</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Notiz</label>
                  <textarea
                    value={newNote.content}
                    onChange={(e) => setNewNote({ ...newNote, content: e.target.value })}
                    placeholder="z.B. Kaja hat heute wenig gefressen"
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 surface text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 rounded-lg"
                    rows={3}
                  />
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newNote.is_important}
                    onChange={(e) => setNewNote({ ...newNote, is_important: e.target.checked })}
                    className="rounded"
                  />
                  <span className="text-sm text-slate-700 dark:text-slate-200">Als wichtig markieren</span>
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={handleAddNote}
                    className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition"
                  >
                    {editingNote ? 'Aktualisieren' : 'Speichern'}
                  </button>
                  <button
                    onClick={cancelNoteForm}
                    className="px-4 py-2 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-100 rounded-lg hover:bg-slate-300 dark:hover:bg-slate-700 transition"
                  >
                    Abbrechen
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-2">
              {details.notes.map(note => {
                const noteCaretaker = getProfile(note.caretaker_id);
                return (
                  <div
                    key={note.id}
                    className={`surface border rounded-lg p-3 group ${
                      note.is_important ? 'border-red-300 bg-red-50 dark:border-red-900/50 dark:bg-red-950/20' : 'border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          {note.is_important && <AlertCircle className="w-4 h-4 text-red-600" />}
                          <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                            {getNoteTypeLabel(note.note_type)}
                          </span>
                          <span className="text-xs text-slate-400 dark:text-slate-600">•</span>
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            Von: {noteCaretaker?.name || note.caretaker_id}
                          </span>
                        </div>
                        <div
                          className={`text-sm ${
                            note.is_important ? 'text-red-900 dark:text-red-200 font-medium' : 'text-slate-700 dark:text-slate-200'
                          }`}
                        >
                          {note.content}
                        </div>
                        <div className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                          {new Date(note.created_at).toLocaleString('de-DE')}
                        </div>
                      </div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition">
                        <button
                          onClick={() => startEditNote(note)}
                          className="p-1 hover:bg-blue-50 dark:hover:bg-blue-950/40 rounded transition"
                          title="Bearbeiten"
                        >
                          <Edit2 className="w-4 h-4 text-blue-600" />
                        </button>
                        <button
                          onClick={() => handleDeleteNote(note.id)}
                          className="p-1 hover:bg-red-50 dark:hover:bg-red-950/40 rounded transition"
                          title="Löschen"
                        >
                          <Trash2 className="w-4 h-4 text-red-600" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
              {details.notes.length === 0 && !showNoteForm && (
                <div className="text-center text-slate-500 dark:text-slate-400 py-4">Keine Notizen</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
