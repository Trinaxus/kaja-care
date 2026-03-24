import { useEffect, useState } from 'react';
import type { Profile, CareAssignment, CareDayPreference, PreferenceLevel, CareDayEvent, Handover, Availability, ShortVisit } from '../lib/database.types';
import {
  ChevronLeft,
  ChevronRight,
  Heart,
  Star,
  Circle,
  AlertTriangle,
  Ban,
  ArrowLeftRight,
  Home,
  StickyNote,
  AlertCircle,
  UserX,
  Check,
  X,
  Save
} from 'lucide-react';
import { DayDetailModal } from './DayDetailModal';
import { AbsenceModal } from './AbsenceModal';
import { CalendarSkeleton } from './ui/Skeleton';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { useUndoRedo } from '../hooks/useUndoRedo';
import { useDragAndDrop } from '../hooks/useDragAndDrop';
import { Undo2, Redo2 } from 'lucide-react';
import { deleteItems, listItems, upsertItems } from '../api/collections';
import { profileColorClass } from '../lib/profileColor';
import { resolveProfileById } from '../lib/knownProfiles';

interface CalendarViewProps {
  profiles: Profile[];
  currentProfile: Profile;
  onUpdate: () => void;
  onMonthChange?: (date: Date) => void;
  initialDate?: string;
}

interface DayData {
  date: string;
  assignment?: CareAssignment;
  preferences: Record<string, CareDayPreference>;
  events: CareDayEvent[];
  handover?: Handover;
  hasNotes: boolean;
  hasImportantNotes: boolean;
  absences: Availability[];
  hasConflict: boolean;
  shortVisits: ShortVisit[];
}

type ViewMode = 'overview' | 'preferences' | 'assign';

const icsEscape = (s: string) =>
  s
    .replace(/\r/g, '')
    .replace(/\n/g, '\\n')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');

const icsFoldLine = (line: string) => {
  const max = 75;
  let out = '';
  let rest = line;
  while (rest.length > max) {
    out += rest.slice(0, max) + '\r\n';
    rest = ' ' + rest.slice(max);
  }
  out += rest;
  return out;
};

const ymd = (d: Date) => d.toISOString().slice(0, 10);

const dateToIcs = (date: string) => date.replace(/-/g, '');

const nextDate = (date: string) => {
  const dt = new Date(date + 'T12:00:00');
  dt.setDate(dt.getDate() + 1);
  return ymd(dt);
};

const toUtcIcs = (date: string, timeHHMM: string) => {
  const hh = timeHHMM.slice(0, 2);
  const mm = timeHHMM.slice(3, 5);
  const dt = new Date(`${date}T${hh}:${mm}:00`);
  const iso = dt.toISOString();
  return iso.replace(/[-:]/g, '').replace('.000Z', 'Z');
};

const downloadBlob = (blob: Blob, filename: string) => {
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(blobUrl);
};

const downloadIcs = async (
  profiles: Profile[],
  opts?: { from?: string; to?: string; filename?: string }
) => {
  const inRange = (date: string) => {
    if (opts?.from && date < opts.from) return false;
    if (opts?.to && date > opts.to) return false;
    return true;
  };

  try {
    const [assignments, availability, handovers, events, shortVisits, notes, preferences] = await Promise.all([
      listItems<any>('care_assignments'),
      listItems<any>('availability'),
      listItems<any>('handovers'),
      listItems<any>('care_day_events'),
      listItems<any>('short_visits'),
      listItems<any>('care_day_notes'),
      listItems<any>('care_day_preferences')
    ]);

    const getProfile = (id: string) => resolveProfileById(profiles, id);

    const getProfileName = (id: string) => getProfile(id)?.name || id;
    const getProfileColor = (id: string) => (getProfile(id)?.color as any) || '';

    const now = new Date();
    const dtstamp = now.toISOString().replace(/[-:]/g, '').replace('.000Z', 'Z');

    const lines: string[] = [];
    lines.push('BEGIN:VCALENDAR');
    lines.push('VERSION:2.0');
    lines.push('PRODID:-//KajaCare//Calendar Export//DE');
    lines.push('CALSCALE:GREGORIAN');
    lines.push('METHOD:PUBLISH');
    lines.push('X-WR-CALNAME:' + icsEscape('KajaCare'));
    lines.push('X-WR-TIMEZONE:Europe/Berlin');

    const pushAllDay = (uid: string, date: string, summary: string, description?: string) => {
      if (!inRange(date)) return;
      lines.push('BEGIN:VEVENT');
      lines.push('UID:' + icsEscape(uid));
      lines.push('DTSTAMP:' + icsEscape(dtstamp));
      lines.push('DTSTART;VALUE=DATE:' + icsEscape(dateToIcs(date)));
      lines.push('DTEND;VALUE=DATE:' + icsEscape(dateToIcs(nextDate(date))));
      lines.push('SUMMARY:' + icsEscape(summary));
      if (description) lines.push('DESCRIPTION:' + icsEscape(description));
      lines.push('END:VEVENT');
    };

    const pushTimed = (uid: string, date: string, time: string, minutes: number, summary: string, description?: string) => {
      if (!inRange(date)) return;
      const start = toUtcIcs(date, time);
      const endDt = new Date(`${date}T${time}:00`);
      endDt.setMinutes(endDt.getMinutes() + minutes);
      const end = endDt.toISOString().replace(/[-:]/g, '').replace('.000Z', 'Z');

      lines.push('BEGIN:VEVENT');
      lines.push('UID:' + icsEscape(uid));
      lines.push('DTSTAMP:' + icsEscape(dtstamp));
      lines.push('DTSTART:' + icsEscape(start));
      lines.push('DTEND:' + icsEscape(end));
      lines.push('SUMMARY:' + icsEscape(summary));
      if (description) lines.push('DESCRIPTION:' + icsEscape(description));
      lines.push('END:VEVENT');
    };

    for (const it of assignments) {
      const date = String(it?.date || '');
      const caretakerId = String(it?.caretaker_id || '');
      if (!date || !caretakerId) continue;
      const name = getProfileName(caretakerId);
      const color = getProfileColor(caretakerId);
      pushAllDay(
        `${String(it?.id || `assign-${date}-${caretakerId}`)}@kajacare`,
        date,
        `Kaja bei ${name}`,
        color ? `Person: ${name}\nFarbe: ${color}` : `Person: ${name}`
      );
    }

    for (const it of availability) {
      const date = String(it?.date || '');
      const userId = String(it?.user_id || '');
      if (!date || !userId) continue;
      const status = String(it?.status || '');
      const name = getProfileName(userId);
      const color = getProfileColor(userId);
      const s = status ? `Abwesenheit: ${name} (${status})` : `Abwesenheit: ${name}`;
      const desc = color ? `Person: ${name}\nFarbe: ${color}` : `Person: ${name}`;
      pushAllDay(`${String(it?.id || `absence-${date}-${userId}`)}@kajacare`, date, s, desc);
    }

    for (const it of handovers) {
      const date = String(it?.date || '');
      if (!date) continue;
      const time = String(it?.time || '12:00').slice(0, 5);
      const fromId = String(it?.from_user_id || '');
      const toId = String(it?.to_user_id || '');
      const fromName = fromId ? getProfileName(fromId) : '—';
      const toName = toId ? getProfileName(toId) : '—';
      const fromColor = fromId ? getProfileColor(fromId) : '';
      const toColor = toId ? getProfileColor(toId) : '';
      const descParts = [
        fromId ? `Von: ${fromName}${fromColor ? ` (Farbe: ${fromColor})` : ''}` : '',
        toId ? `Zu: ${toName}${toColor ? ` (Farbe: ${toColor})` : ''}` : ''
      ].filter(Boolean);
      pushTimed(
        `${String(it?.id || `handover-${date}-${time}-${fromId}-${toId}`)}@kajacare`,
        date,
        time,
        30,
        `Übergabe: ${fromName} → ${toName}`,
        descParts.length ? descParts.join('\n') : undefined
      );
    }

    for (const it of events) {
      const date = String(it?.date || '');
      const title = String(it?.title || '');
      if (!date || !title) continue;
      const time = String(it?.time || '').slice(0, 5);
      const loc = String(it?.location || '');
      const notesText = String(it?.notes || '');
      const desc = [loc ? `Ort: ${loc}` : '', notesText].filter(Boolean).join('\n') || undefined;
      const uid = `${String(it?.id || `event-${date}-${title}-${time}`)}@kajacare`;
      if (time) pushTimed(uid, date, time, 60, title, desc);
      else pushAllDay(uid, date, title, desc);
    }

    for (const it of shortVisits) {
      const date = String(it?.date || '');
      const visitorId = String(it?.visitor_id || '');
      const startTime = String(it?.start_time || '').slice(0, 5);
      if (!date || !visitorId || !startTime) continue;
      const endTime = String(it?.end_time || '').slice(0, 5);
      const dur = Number(it?.duration_minutes || 0);
      const mins = endTime ? Math.max(1, Math.round((new Date(`${date}T${endTime}:00`).getTime() - new Date(`${date}T${startTime}:00`).getTime()) / 60000)) : (dur > 0 ? dur : 30);
      const visitType = String(it?.visit_type || '');
      const name = getProfileName(visitorId);
      const color = getProfileColor(visitorId);
      const summary = visitType ? `Kurzbesuch: ${name} (${visitType})` : `Kurzbesuch: ${name}`;
      const desc = color ? `Person: ${name}\nFarbe: ${color}` : `Person: ${name}`;
      pushTimed(`${String(it?.id || `visit-${date}-${visitorId}-${startTime}`)}@kajacare`, date, startTime, mins, summary, desc);
    }

    for (const it of notes) {
      const date = String(it?.date || '');
      const title = String(it?.title || '');
      if (!date || !title) continue;
      const createdBy = String(it?.created_by || '');
      const author = createdBy ? getProfileName(createdBy) : '';
      const authorColor = createdBy ? getProfileColor(createdBy) : '';
      const content = String(it?.content || '');
      const authorLine = author ? `Von: ${author}${authorColor ? ` (Farbe: ${authorColor})` : ''}` : '';
      const desc = [authorLine, content].filter(Boolean).join('\n') || undefined;
      pushAllDay(`${String(it?.id || `note-${date}-${title}`)}@kajacare`, date, `Notiz: ${title}`, desc);
    }

    for (const it of preferences) {
      const date = String(it?.date || '');
      const profileId = String(it?.profile_id || '');
      const level = String(it?.preference_level || '');
      if (!date || !profileId || !level) continue;
      const reason = String(it?.reason || '');
      const desc = reason ? `Grund: ${reason}` : undefined;
      const name = getProfileName(profileId);
      const color = getProfileColor(profileId);
      const desc2 = [
        color ? `Person: ${name}\nFarbe: ${color}` : `Person: ${name}`,
        desc
      ].filter(Boolean).join('\n') || undefined;
      pushAllDay(
        `${String(it?.id || `pref-${date}-${profileId}-${level}`)}@kajacare`,
        date,
        `Wunsch: ${name} (${level})`,
        desc2
      );
    }

    lines.push('END:VCALENDAR');

    const out = lines.map(icsFoldLine).join('\r\n') + '\r\n';
    const blob = new Blob([out], { type: 'text/calendar;charset=utf-8' });
    downloadBlob(blob, opts?.filename || 'kajacare-calendar.ics');
  } catch (e: any) {
    alert('Export fehlgeschlagen: ' + (e?.message || String(e)));
  }
};

const PREFERENCE_CONFIG: Record<PreferenceLevel, { icon: typeof Heart; label: string; color: string; score: number }> = {
  very_happy: { icon: Heart, label: 'Sehr gerne', color: 'text-pink-600 bg-pink-100', score: 5 },
  nice: { icon: Star, label: 'Wäre schön', color: 'text-yellow-600 bg-yellow-100', score: 3 },
  neutral: { icon: Circle, label: 'Neutral', color: 'text-slate-400 bg-slate-100', score: 0 },
  rather_not: { icon: AlertTriangle, label: 'Lieber nicht', color: 'text-orange-600 bg-orange-100', score: -3 },
  impossible: { icon: Ban, label: 'Nicht möglich', color: 'text-red-600 bg-red-100', score: -10 }
};

export function CalendarView({ profiles, currentProfile, onUpdate, onMonthChange, initialDate }: CalendarViewProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [days, setDays] = useState<DayData[]>([]);
  const [mode, setMode] = useState<ViewMode>('overview');
  const [selectedPreference, setSelectedPreference] = useState<PreferenceLevel>('very_happy');
  const [selectedDays, setSelectedDays] = useState<Set<string>>(new Set());
  const [selectedCaretaker, setSelectedCaretaker] = useState<string | null>(null);
  const [showAbsenceModal, setShowAbsenceModal] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [originalAssignments, setOriginalAssignments] = useState<Map<string, CareAssignment>>(new Map());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (initialDate) {
      const date = new Date(initialDate);
      setCurrentMonth(new Date(date.getFullYear(), date.getMonth(), 1));
      setSelectedDate(initialDate);
    }
  }, [initialDate]);

  const undoRedo = useUndoRedo<Map<string, string | null>>(new Map());
  const dragDrop = useDragAndDrop();

  const previousMonth = () => {
    const newMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1);
    setCurrentMonth(newMonth);
    setMode('overview');
    setSelectedDays(new Set());
    if (onMonthChange) {
      onMonthChange(newMonth);
    }
  };

  const nextMonth = () => {
    const newMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1);
    setCurrentMonth(newMonth);
    setMode('overview');
    setSelectedDays(new Set());
    if (onMonthChange) {
      onMonthChange(newMonth);
    }
  };

  useEffect(() => {
    loadMonthData();
  }, [currentMonth]);

  useKeyboardShortcuts([
    {
      key: 'ArrowLeft',
      handler: previousMonth,
    },
    {
      key: 'ArrowRight',
      handler: nextMonth,
    },
    {
      key: 'Escape',
      handler: () => {
        if (selectedDate) setSelectedDate(null);
        else if (showAbsenceModal) setShowAbsenceModal(false);
        else if (mode !== 'overview') {
          setMode('overview');
          setSelectedDays(new Set());
          setSelectedCaretaker(null);
        }
      },
    },
    {
      key: 'p',
      handler: () => {
        if (mode === 'overview') setMode('preferences');
      },
    },
    {
      key: 'a',
      handler: () => {
        if (mode === 'overview') setMode('assign');
      },
    },
    {
      key: 's',
      ctrlKey: true,
      handler: () => {
        if (mode === 'preferences' && selectedDays.size > 0) {
          savePreferences();
        } else if (mode === 'assign' && selectedCaretaker && selectedDays.size > 0) {
          assignDaysToCaretaker();
        }
      },
    },
    {
      key: 'z',
      ctrlKey: true,
      handler: () => {
        if (undoRedo.canUndo) {
          handleUndo();
        }
      },
    },
    {
      key: 'y',
      ctrlKey: true,
      handler: () => {
        if (undoRedo.canRedo) {
          handleRedo();
        }
      },
    },
  ]);

  const handleUndo = async () => {
    if (!undoRedo.canUndo) return;

    const previousState = undoRedo.state;
    undoRedo.undo();

    for (const [date, caretakerId] of previousState.entries()) {
      if (caretakerId) {
        await upsertItems('care_assignments', {
          date,
          caretaker_id: caretakerId,
          created_by: currentProfile.id,
          status: 'planned'
        }, ['date']);
      } else {
        await deleteItems('care_assignments', { date });
      }
    }

    loadMonthData();
    onUpdate();
  };

  const handleRedo = async () => {
    if (!undoRedo.canRedo) return;

    undoRedo.redo();
    const nextState = undoRedo.state;

    for (const [date, caretakerId] of nextState.entries()) {
      if (caretakerId) {
        await upsertItems('care_assignments', {
          date,
          caretaker_id: caretakerId,
          created_by: currentProfile.id,
          status: 'planned'
        }, ['date']);
      } else {
        await deleteItems('care_assignments', { date });
      }
    }

    loadMonthData();
    onUpdate();
  };

  const getISODayOfWeek = (date: Date): number => {
    const day = date.getDay();
    return day === 0 ? 6 : day - 1;
  };

  const loadMonthData = async () => {
    setIsLoading(true);
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    const startDate = new Date(firstDay);
    const startISODay = getISODayOfWeek(startDate);
    startDate.setDate(startDate.getDate() - startISODay);

    const endDate = new Date(lastDay);
    const endISODay = getISODayOfWeek(endDate);
    endDate.setDate(endDate.getDate() + (6 - endISODay));

    const dateRange: string[] = [];
    const current = new Date(startDate);
    while (current <= endDate) {
      const year = current.getFullYear();
      const month = String(current.getMonth() + 1).padStart(2, '0');
      const day = String(current.getDate()).padStart(2, '0');
      dateRange.push(`${year}-${month}-${day}`);
      current.setDate(current.getDate() + 1);
    }

    const [assignments, preferences, events, handovers, notes, absences, visits] = await Promise.all([
      listItems<CareAssignment>('care_assignments', { date: dateRange }),
      listItems<CareDayPreference>('care_day_preferences', { date: dateRange }),
      listItems<CareDayEvent>('care_day_events', { date: dateRange }),
      listItems<Handover>('handovers', { date: dateRange }),
      listItems<{ date: string; is_important: boolean }>('care_day_notes', { date: dateRange }),
      listItems<Availability>('availability', { date: dateRange, type: 'unavailable' }),
      listItems<ShortVisit>('short_visits', { date: dateRange }),
    ]);

    const assignmentMap = new Map((assignments || []).map(a => [a.date, a]));
    setOriginalAssignments(new Map(assignmentMap));

    const preferenceMap = new Map<string, Record<string, CareDayPreference>>();
    (preferences || []).forEach(p => {
      if (!preferenceMap.has(p.date)) preferenceMap.set(p.date, {});
      preferenceMap.get(p.date)![p.profile_id] = p;
    });

    const handoverMap = new Map((handovers || []).map(h => [h.date, h]));

    const eventsMap = new Map<string, CareDayEvent[]>();
    (events || []).forEach(e => {
      if (!eventsMap.has(e.date)) eventsMap.set(e.date, []);
      eventsMap.get(e.date)!.push(e);
    });

    const notesMap = new Map<string, { count: number; important: number }>();
    (notes || []).forEach(n => {
      if (!notesMap.has(n.date)) notesMap.set(n.date, { count: 0, important: 0 });
      const stats = notesMap.get(n.date)!;
      stats.count++;
      if (n.is_important) stats.important++;
    });

    const absencesMap = new Map<string, Availability[]>();
    (absences || []).forEach(a => {
      if (!absencesMap.has(a.date)) absencesMap.set(a.date, []);
      absencesMap.get(a.date)!.push(a);
    });

    const visitsMap = new Map<string, ShortVisit[]>();
    (visits || []).forEach(v => {
      if (!visitsMap.has(v.date)) visitsMap.set(v.date, []);
      visitsMap.get(v.date)!.push(v);
    });

    const daysData: DayData[] = dateRange.map(date => {
      const prefs = preferenceMap.get(date) || {};
      const absences = absencesMap.get(date) || [];
      const assignment = assignmentMap.get(date);

      const hasConflict = assignment ? absences.some(a => a.user_id === assignment.caretaker_id) : false;

      return {
        date,
        assignment,
        preferences: prefs,
        events: eventsMap.get(date) || [],
        handover: handoverMap.get(date),
        hasNotes: (notesMap.get(date)?.count || 0) > 0,
        hasImportantNotes: (notesMap.get(date)?.important || 0) > 0,
        absences,
        hasConflict,
        shortVisits: visitsMap.get(date) || []
      };
    });

    setDays(daysData);
    setHasUnsavedChanges(false);
    setIsLoading(false);
  };

  const handleDayClick = (day: DayData) => {
    if (mode === 'overview') {
      setSelectedDate(day.date);
      return;
    }

    if (mode === 'preferences' || mode === 'assign') {
      toggleDaySelection(day.date);
    }
  };

  const toggleDaySelection = (date: string) => {
    setSelectedDays(prev => {
      const newSelection = new Set(prev);
      if (newSelection.has(date)) {
        newSelection.delete(date);
      } else {
        newSelection.add(date);
      }
      return newSelection;
    });
  };

  const savePreferences = async () => {
    if (selectedDays.size === 0) return;

    const preferencesToSave = Array.from(selectedDays).map(date => ({
      profile_id: currentProfile.id,
      date,
      preference_level: selectedPreference,
      reason: null
    }));

    await upsertItems('care_day_preferences', preferencesToSave, ['profile_id', 'date']);

    await upsertItems('activity_log', {
      activity_type: 'preferences_updated',
      description: `${currentProfile.name} hat Präferenzen für ${selectedDays.size} Tag(e) aktualisiert`,
      actor_id: currentProfile.id,
      metadata: { count: selectedDays.size, level: selectedPreference }
    }, []);

    setSelectedDays(new Set());
    setMode('overview');
    loadMonthData();
    onUpdate();
  };

  const assignDaysToCaretaker = async () => {
    if (!selectedCaretaker || selectedDays.size === 0) return;

    const currentAssignments = new Map<string, string | null>();
    days.forEach(day => {
      if (selectedDays.has(day.date)) {
        currentAssignments.set(day.date, day.assignment?.caretaker_id || null);
      }
    });
    undoRedo.set(currentAssignments);

    const assignmentsToSave = Array.from(selectedDays).map(date => ({
      date,
      caretaker_id: selectedCaretaker,
      created_by: currentProfile.id,
      status: 'planned' as const
    }));

    await upsertItems('care_assignments', assignmentsToSave, ['date']);

    await upsertItems('activity_log', {
      activity_type: 'assignment_created',
      description: `${currentProfile.name} hat ${selectedDays.size} Tag(e) zugewiesen`,
      actor_id: currentProfile.id,
      metadata: { count: selectedDays.size, caretaker_id: selectedCaretaker }
    }, []);

    setSelectedDays(new Set());
    setSelectedCaretaker(null);
    setMode('overview');
    setHasUnsavedChanges(false);
    loadMonthData();
    onUpdate();
  };

  const calculateDayScore = (day: DayData): number => {
    const scores = Object.values(day.preferences).map(p =>
      PREFERENCE_CONFIG[p.preference_level].score
    );
    return scores.reduce((sum, score) => sum + Math.abs(score), 0);
  };

  const isCurrentMonth = (date: string) => {
    const d = new Date(date);
    return d.getMonth() === currentMonth.getMonth() && d.getFullYear() === currentMonth.getFullYear();
  };

  const isToday = (date: string) => {
    const today = new Date().toISOString().split('T')[0];
    return date === today;
  };

  const getProfileById = (id: string) => resolveProfileById(profiles, id);

  const getPreferenceIcon = (level: PreferenceLevel) => {
    const config = PREFERENCE_CONFIG[level];
    const Icon = config.icon;
    return <Icon className="w-3 h-3" />;
  };

  if (isLoading) {
    return <CalendarSkeleton />;
  }

  return (
    <div className="space-y-4 sm:space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3 sm:gap-6">
          <button
            onClick={previousMonth}
            className="w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-all duration-200 active:scale-95 flex-shrink-0"
          >
            <ChevronLeft className="w-5 h-5 text-slate-700 dark:text-slate-200" />
          </button>
          <h2 className="text-xl sm:text-3xl font-semibold text-slate-900 dark:text-slate-100 tracking-tight">
            {currentMonth.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })}
          </h2>
          <button
            onClick={nextMonth}
            className="w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-all duration-200 active:scale-95 flex-shrink-0"
          >
            <ChevronRight className="w-5 h-5 text-slate-700 dark:text-slate-200" />
          </button>
        </div>

        <div className="flex gap-2 sm:gap-3 flex-wrap">
          <button
            type="button"
            onClick={() => downloadIcs(profiles, { filename: 'kajacare-calendar-all.ics' })}
            className="px-3 sm:px-5 py-2 sm:py-2.5 bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-100 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-900 transition-all duration-200 flex items-center gap-1 sm:gap-2 shadow-sm active:scale-95 font-medium text-sm sm:text-base"
            title="Export für Google/Apple Kalender (.ics)"
          >
            Export (alles .ics)
          </button>
          {mode === 'overview' && (
            <>
              {(undoRedo.canUndo || undoRedo.canRedo) && (
                <div className="flex gap-1 bg-white dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-700 p-1">
                  <button
                    onClick={handleUndo}
                    disabled={!undoRedo.canUndo}
                    className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition"
                    title="Rückgängig (Ctrl+Z)"
                  >
                    <Undo2 className="w-4 h-4 text-slate-700 dark:text-slate-200" />
                  </button>
                  <button
                    onClick={handleRedo}
                    disabled={!undoRedo.canRedo}
                    className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition"
                    title="Wiederherstellen (Ctrl+Y)"
                  >
                    <Redo2 className="w-4 h-4 text-slate-700 dark:text-slate-200" />
                  </button>
                </div>
              )}

              <button
                onClick={() => setMode('preferences')}
                className="px-3 sm:px-5 py-2 sm:py-2.5 bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-100 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-900 transition-all duration-200 flex items-center gap-1 sm:gap-2 shadow-sm active:scale-95 font-medium text-sm sm:text-base"
              >
                <Heart className="w-4 h-4" />
                <span className="hidden sm:inline">Wünsche</span>
              </button>
              <button
                onClick={() => setMode('assign')}
                className="px-3 sm:px-5 py-2 sm:py-2.5 bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-100 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-900 transition-all duration-200 flex items-center gap-1 sm:gap-2 shadow-sm active:scale-95 font-medium text-sm sm:text-base"
              >
                <Check className="w-4 h-4" />
                <span className="hidden sm:inline">Zuweisen</span>
              </button>
              <button
                onClick={() => setShowAbsenceModal(true)}
                className="px-3 sm:px-5 py-2 sm:py-2.5 bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-100 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-900 transition-all duration-200 flex items-center gap-1 sm:gap-2 shadow-sm active:scale-95 font-medium text-sm sm:text-base"
              >
                <UserX className="w-4 h-4" />
                <span className="hidden sm:inline">Abwesenheit</span>
              </button>
            </>
          )}

          {mode === 'preferences' && (
            <>
              <div className="flex gap-1 sm:gap-2 bg-white dark:bg-slate-900/60 rounded-xl p-1.5 sm:p-2 shadow-sm border border-slate-200 dark:border-slate-700">
                {(Object.entries(PREFERENCE_CONFIG) as [PreferenceLevel, typeof PREFERENCE_CONFIG[PreferenceLevel]][]).map(([level, config]) => {
                  const Icon = config.icon;
                  return (
                    <button
                      key={level}
                      onClick={() => setSelectedPreference(level)}
                      className={`px-2 sm:px-4 py-1.5 sm:py-2 rounded-lg transition-all duration-200 ${
                        selectedPreference === level
                          ? config.color + ' shadow-sm scale-105'
                          : 'text-slate-400 dark:text-slate-300 hover:text-slate-600 dark:hover:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                      }`}
                      title={config.label}
                    >
                      <Icon className="w-3 h-3 sm:w-4 sm:h-4" />
                    </button>
                  );
                })}
              </div>
              <button
                onClick={savePreferences}
                disabled={selectedDays.size === 0}
                className="px-3 sm:px-5 py-2 sm:py-2.5 bg-gradient-to-br from-green-500 to-green-600 text-white rounded-xl hover:from-green-600 hover:to-green-700 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1 sm:gap-2 shadow-sm hover:shadow-md active:scale-95 font-medium text-sm sm:text-base"
              >
                <Save className="w-4 h-4" />
                <span className="hidden sm:inline">Speichern</span> ({selectedDays.size})
              </button>
              <button
                onClick={() => {
                  setMode('overview');
                  setSelectedDays(new Set());
                }}
                className="px-3 sm:px-5 py-2 sm:py-2.5 bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-100 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-900 transition-all duration-200 flex items-center gap-1 sm:gap-2 shadow-sm active:scale-95 font-medium text-sm sm:text-base"
              >
                <X className="w-4 h-4" />
                <span className="hidden sm:inline">Abbrechen</span>
              </button>
            </>
          )}

          {mode === 'assign' && (
            <>
              <div className="flex gap-2">
                {profiles.map(profile => (
                  <button
                    key={profile.id}
                    onClick={() => setSelectedCaretaker(profile.id)}
                    className={`px-4 sm:px-6 py-2 sm:py-2.5 rounded-xl transition-all duration-200 font-medium shadow-sm active:scale-95 text-sm sm:text-base ${
                      selectedCaretaker === profile.id
                        ? `${profileColorClass(profile, 'solid')} shadow-md scale-105`
                        : 'bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-900'
                    }`}
                  >
                    {profile.name}
                  </button>
                ))}
              </div>
              <button
                onClick={assignDaysToCaretaker}
                disabled={!selectedCaretaker || selectedDays.size === 0}
                className="px-3 sm:px-5 py-2 sm:py-2.5 bg-gradient-to-br from-green-500 to-green-600 text-white rounded-xl hover:from-green-600 hover:to-green-700 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1 sm:gap-2 shadow-sm hover:shadow-md active:scale-95 font-medium text-sm sm:text-base"
              >
                <Check className="w-4 h-4" />
                <span className="hidden sm:inline">Zuweisen</span> ({selectedDays.size})
              </button>
              <button
                onClick={() => {
                  setMode('overview');
                  setSelectedDays(new Set());
                  setSelectedCaretaker(null);
                }}
                className="px-3 sm:px-5 py-2 sm:py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 transition-all duration-200 flex items-center gap-1 sm:gap-2 shadow-sm active:scale-95 font-medium text-sm sm:text-base"
              >
                <X className="w-4 h-4" />
                Abbrechen
              </button>
            </>
          )}
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900/50 rounded-2xl shadow-lg border border-slate-200/50 dark:border-slate-700/50 overflow-hidden">
        <div className="grid grid-cols-7 bg-gradient-to-b from-slate-50 to-white dark:from-slate-950/40 dark:to-slate-900/30 border-b border-slate-200/50 dark:border-slate-700/50">
          {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map(day => (
            <div key={day} className="px-3 py-4 text-center text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              {day}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 divide-x divide-y divide-slate-200/50 dark:divide-slate-800/60">
          {days.map((day) => {
            const caretaker = day.assignment ? getProfileById(day.assignment.caretaker_id) : null;
            const myPreference = day.preferences[currentProfile.id];
            const otherProfile = profiles.find(p => p.id !== currentProfile.id);
            const otherPreference = otherProfile ? day.preferences[otherProfile.id] : null;
            const isSelected = selectedDays.has(day.date);
            const hasAbsence = day.absences.length > 0;

            const getTileBackgroundClass = () => {
              if (!isCurrentMonth(day.date)) return 'bg-slate-50/50 opacity-30 dark:bg-slate-950/20 dark:opacity-30';
              if (isSelected) return 'bg-blue-50 ring-2 ring-inset ring-blue-500 shadow-inner scale-[0.98] dark:bg-blue-950/30';
              if (day.hasConflict) return 'ring-2 ring-inset ring-red-400 bg-red-50 dark:bg-red-950/25';

              if (day.handover) {
                return 'hover:shadow-sm';
              }

              if (caretaker) {
                return profileColorClass(caretaker, 'tile');
              }
              if (new Date(day.date).getDay() === 0 || new Date(day.date).getDay() === 6) return 'bg-slate-50/50 dark:bg-slate-950/25';
              return 'bg-white hover:bg-slate-50 hover:shadow-sm dark:bg-slate-950/10 dark:hover:bg-slate-900/40';
            };

            return (
              <div
                key={day.date}
                onClick={() => handleDayClick(day)}
                draggable={mode === 'overview' && !!caretaker}
                onDragStart={(e) => {
                  if (caretaker) {
                    dragDrop.onDragStart(e, JSON.stringify({ date: day.date, caretakerId: caretaker.id }));
                  }
                }}
                onDragOver={dragDrop.onDragOver}
                onDrop={(e) => {
                  if (mode === 'overview') {
                    dragDrop.onDrop(e, async (data) => {
                      const dragData = JSON.parse(data);
                      if (dragData.date !== day.date) {
                        await deleteItems('care_assignments', { date: dragData.date });

                        if (day.assignment) {
                          await upsertItems('care_assignments', {
                            date: dragData.date,
                            caretaker_id: day.assignment.caretaker_id,
                            created_by: currentProfile.id,
                            status: 'planned'
                          }, ['date']);
                        }

                        await upsertItems('care_assignments', {
                          date: day.date,
                          caretaker_id: dragData.caretakerId,
                          created_by: currentProfile.id,
                          status: 'planned'
                        }, ['date']);

                        loadMonthData();
                        onUpdate();
                      }
                    });
                  }
                }}
                className={`min-h-32 p-3 cursor-pointer transition-all duration-200 relative group ${getTileBackgroundClass()} ${
                  isToday(day.date) && !isSelected ? 'ring-2 ring-inset ring-orange-400 dark:ring-orange-500' : ''
                }`}
              >
                {day.handover && isCurrentMonth(day.date) && (() => {
                  const fromProfile = getProfileById(day.handover.from_user_id);
                  const toProfile = getProfileById(day.handover.to_user_id);
                  const fromColor = fromProfile ? profileColorClass(fromProfile, 'soft') : 'bg-slate-50/60 dark:bg-slate-950/25';
                  const toColor = toProfile ? profileColorClass(toProfile, 'soft') : 'bg-slate-50/60 dark:bg-slate-950/25';
                  return (
                    <>
                      <div className={`absolute inset-0 ${fromColor} pointer-events-none`} style={{
                        clipPath: 'polygon(0 0, 100% 0, 0 100%)'
                      }}></div>
                      <div className={`absolute inset-0 ${toColor} pointer-events-none`} style={{
                        clipPath: 'polygon(100% 0, 100% 100%, 0 100%)'
                      }}></div>
                    </>
                  );
                })()}
                <div className="flex items-start justify-between mb-2 relative z-10">
                  <span className={`text-sm font-semibold relative z-10 ${
                    !isCurrentMonth(day.date) ? 'text-slate-400' :
                    new Date(day.date).getDay() === 0 || new Date(day.date).getDay() === 6 ? 'text-slate-500' :
                    'text-slate-700'
                  }`}>
                    {new Date(day.date).getDate()}
                  </span>
                  <div className="flex gap-1.5 flex-wrap justify-end relative z-10">
                    {day.hasImportantNotes && <div className="w-5 h-5 rounded-full bg-red-100 flex items-center justify-center cursor-help" title="Wichtige Notizen vorhanden"><AlertCircle className="w-3 h-3 text-red-600" /></div>}
                    {day.hasNotes && !day.hasImportantNotes && <div className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center cursor-help" title="Notizen vorhanden"><StickyNote className="w-3 h-3 text-blue-600" /></div>}
                    {day.handover && <div className="w-5 h-5 rounded-full bg-orange-100 flex items-center justify-center cursor-help" title={`Übergabe um ${day.handover.time || '12:00'}`}><ArrowLeftRight className="w-3 h-3 text-orange-600" /></div>}
                    {day.events.length > 0 && <div className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center cursor-help" title={`${day.events.length} Termin(e)`}><Home className="w-3 h-3 text-blue-600" /></div>}
                  </div>
                </div>

                <div className="flex items-start gap-1.5 flex-wrap relative z-10">
                  {day.handover ? (
                    (() => {
                      const involvedIds = [
                        day.handover?.from_user_id,
                        day.handover?.to_user_id,
                        day.handover?.brings_user_id,
                        day.handover?.picks_up_user_id
                      ].filter(Boolean) as string[];

                      const unique = new Map<string, Profile>();
                      for (const id of involvedIds) {
                        const p = getProfileById(id);
                        if (p) unique.set(p.id, p);
                      }
                      const involvedProfiles = Array.from(unique.values());

                      return (
                        <div className="flex items-center gap-1 flex-nowrap">
                          {involvedProfiles.map((profile) => (
                            <div
                              key={profile.id}
                              className={`w-5 h-5 sm:w-7 sm:h-7 rounded-full flex items-center justify-center text-[10px] sm:text-xs font-bold shadow-sm flex-shrink-0 cursor-help ${profileColorClass(profile, 'solid')}`}
                              title={`Übergabe: ${profile.name}`}
                            >
                              {profile.name.charAt(0)}
                            </div>
                          ))}
                        </div>
                      );
                    })()
                  ) : caretaker && (
                    <div
                      className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shadow-sm flex-shrink-0 cursor-help ${
                        profileColorClass(caretaker, 'solid')
                      }`}
                      title={`Betreuer: ${caretaker.name}`}
                    >
                      {caretaker.name.charAt(0)}
                    </div>
                  )}
                  {day.handover && (
                    <div
                      className="flex items-center gap-1 text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 sm:py-1 bg-orange-100 text-orange-700 rounded-full font-medium cursor-help max-w-full"
                      title={`Übergabe um ${(day.handover.time || '12:00').substring(0, 5)}`}
                    >
                      <span className="truncate">
                        {(() => {
                          const t = String(day.handover?.time || '12:00');
                          const hh = t.substring(0, 2);
                          const h = Number.parseInt(hh, 10);
                          if (Number.isFinite(h)) return `${h} Uhr`;
                          return (t || '12:00').substring(0, 5);
                        })()}
                      </span>
                    </div>
                  )}
                </div>

                {day.shortVisits.length > 0 && (
                  <div className="flex flex-col gap-1 mt-2 relative z-10">
                    {day.shortVisits.map((visit) => {
                      const visitor = getProfileById(visit.visitor_id);
                      const formatTime = (time: string | null) => {
                        if (!time) return '';
                        return time.substring(0, 5);
                      };
                      const visitTypeLabels = {
                        walk: '🐕',
                        short_stay: '⏱️',
                        vet_visit: '🏥',
                        grooming: '✂️',
                        playtime: '🎾',
                        other: '📌'
                      };
                      const tooltipText = visit.end_time
                        ? `${visitor?.name}: ${formatTime(visit.start_time)} - ${formatTime(visit.end_time)}`
                        : `${visitor?.name}: ${formatTime(visit.start_time)}${visit.duration_minutes ? ` (${visit.duration_minutes} Min.)` : ''}`;

                      const mobileTime = formatTime(visit.start_time);
                      const desktopTime = visit.end_time
                        ? `${formatTime(visit.start_time)}-${formatTime(visit.end_time)}`
                        : `${formatTime(visit.start_time)}${visit.duration_minutes ? ` (${visit.duration_minutes} Min.)` : ''}`;

                      return visitor ? (
                        <div
                          key={visit.id}
                          className="flex items-center gap-1 text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 sm:py-1 bg-purple-100 text-purple-700 rounded-lg font-medium cursor-help max-w-full"
                          title={tooltipText}
                        >
                          <span>{visitTypeLabels[visit.visit_type as keyof typeof visitTypeLabels]}</span>
                          <span className="hidden sm:inline truncate">{visitor.name}</span>
                          <span className="opacity-75 truncate">
                            <span className="sm:hidden">{mobileTime}</span>
                            <span className="hidden sm:inline">{desktopTime}</span>
                          </span>
                        </div>
                      ) : null;
                    })}
                  </div>
                )}

                {hasAbsence && (
                  <div className="flex flex-col gap-1 mt-2 relative z-10">
                    {day.absences.map((absence) => {
                      const absentProfile = getProfileById(absence.user_id);
                      const formatTime = (time: string | null) => {
                        if (!time) return '';
                        return time.substring(0, 5);
                      };
                      const tooltipText = !absence.is_full_day && absence.start_time && absence.end_time
                        ? `${absentProfile?.name} abwesend: ${formatTime(absence.start_time)} - ${formatTime(absence.end_time)}`
                        : `${absentProfile?.name} ganztägig abwesend`;
                      return absentProfile ? (
                        <div
                          key={absence.id}
                          className="flex items-center gap-1 text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 sm:py-1 bg-orange-100 text-orange-700 rounded-lg font-medium cursor-help max-w-full"
                          title={tooltipText}
                        >
                          <UserX className="w-3 h-3" />
                          <span className="hidden sm:inline truncate">{absentProfile.name}</span>
                          {!absence.is_full_day && absence.start_time && absence.end_time && (
                            <span className="opacity-75 truncate">
                              <span className="sm:hidden">{formatTime(absence.start_time)}</span>
                              <span className="hidden sm:inline">
                                {formatTime(absence.start_time)}-{formatTime(absence.end_time)}
                              </span>
                            </span>
                          )}
                        </div>
                      ) : null;
                    })}
                  </div>
                )}

                {mode !== 'assign' && (myPreference || otherPreference) && (
                  <div className="flex flex-col gap-1.5 mt-2 relative z-10">
                    {myPreference && (
                      <div
                        className="flex items-center gap-1.5 cursor-help"
                        title={`${currentProfile.name}: ${PREFERENCE_CONFIG[myPreference.preference_level].label}`}
                      >
                        <div className={`inline-flex p-1.5 rounded-lg shadow-sm ${PREFERENCE_CONFIG[myPreference.preference_level].color}`}>
                          {getPreferenceIcon(myPreference.preference_level)}
                        </div>
                        <span className="text-xs font-medium text-slate-600">{currentProfile.name}</span>
                      </div>
                    )}
                    {otherPreference && (
                      <div
                        className="flex items-center gap-1.5 cursor-help"
                        title={`${otherProfile?.name}: ${PREFERENCE_CONFIG[otherPreference.preference_level].label}`}
                      >
                        <div className={`inline-flex p-1.5 rounded-lg shadow-sm ${PREFERENCE_CONFIG[otherPreference.preference_level].color}`}>
                          {getPreferenceIcon(otherPreference.preference_level)}
                        </div>
                        <span className="text-xs font-medium text-slate-600">{otherProfile?.name}</span>
                      </div>
                    )}
                  </div>
                )}

                {isSelected && (
                  <div className="absolute bottom-2 right-2">
                    <div className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center shadow-md">
                      <Check className="w-3 h-3 text-white" />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {selectedDate && (
        <DayDetailModal
          date={selectedDate}
          profiles={profiles}
          currentProfile={currentProfile}
          onUpdate={() => {
            loadMonthData();
            onUpdate();
          }}
          onClose={() => {
            setSelectedDate(null);
            loadMonthData();
            onUpdate();
          }}
        />
      )}

      {showAbsenceModal && (
        <AbsenceModal
          profiles={profiles}
          onClose={() => setShowAbsenceModal(false)}
          onUpdate={() => {
            loadMonthData();
            onUpdate();
          }}
        />
      )}
    </div>
  );
}
