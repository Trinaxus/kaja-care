import { useEffect, useState } from 'react';
import type { Profile, CareAssignment, CareDayEvent, Handover, Availability } from '../lib/database.types';
import { ChevronLeft, ChevronRight, ArrowLeftRight, Syringe, StickyNote, AlertCircle, UserX, Clock } from 'lucide-react';
import { DayDetailModal } from './DayDetailModal';

interface EnhancedCalendarViewProps {
  profiles: Profile[];
  currentProfile: Profile;
  onUpdate: () => void;
}

interface DayData {
  date: string;
  assignment?: CareAssignment;
  events: CareDayEvent[];
  handover?: Handover;
  hasNotes: boolean;
  hasImportantNotes: boolean;
  absences: Availability[];
}

export function EnhancedCalendarView({ profiles, currentProfile, onUpdate }: EnhancedCalendarViewProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [days, setDays] = useState<DayData[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedCaretaker, setSelectedCaretaker] = useState<string | null>(null);
  const [selectedDays, setSelectedDays] = useState<Set<string>>(new Set());
  const [lastSelectedDate, setLastSelectedDate] = useState<string | null>(null);

  useEffect(() => {
    loadMonthData();
  }, [currentMonth]);

  const loadMonthData = async () => {
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

    const [assignmentsRes, eventsRes, handoversRes, notesRes, absencesRes] = await Promise.all([
      supabase.from('care_assignments').select('*').in('date', dateRange),
      supabase.from('care_day_events').select('*').in('date', dateRange),
      supabase.from('handovers').select('*').in('date', dateRange),
      supabase.from('care_day_notes').select('date, is_important').in('date', dateRange),
      supabase.from('availability').select('*').in('date', dateRange).eq('type', 'unavailable')
    ]);

    const assignmentMap = new Map((assignmentsRes.data || []).map(a => [a.date, a]));
    const handoverMap = new Map((handoversRes.data || []).map(h => [h.date, h]));

    const eventsMap = new Map<string, CareDayEvent[]>();
    (eventsRes.data || []).forEach(e => {
      if (!eventsMap.has(e.date)) eventsMap.set(e.date, []);
      eventsMap.get(e.date)!.push(e);
    });

    const notesMap = new Map<string, { count: number; important: number }>();
    (notesRes.data || []).forEach(n => {
      if (!notesMap.has(n.date)) notesMap.set(n.date, { count: 0, important: 0 });
      const stats = notesMap.get(n.date)!;
      stats.count++;
      if (n.is_important) stats.important++;
    });

    const absencesMap = new Map<string, Availability[]>();
    (absencesRes.data || []).forEach(a => {
      if (!absencesMap.has(a.date)) absencesMap.set(a.date, []);
      absencesMap.get(a.date)!.push(a);
    });

    const daysData: DayData[] = dateRange.map(date => ({
      date,
      assignment: assignmentMap.get(date),
      events: eventsMap.get(date) || [],
      handover: handoverMap.get(date),
      hasNotes: (notesMap.get(date)?.count || 0) > 0,
      hasImportantNotes: (notesMap.get(date)?.important || 0) > 0,
      absences: absencesMap.get(date) || []
    }));

    setDays(daysData);
  };

  const handleDayClick = (date: string, shiftKey: boolean) => {
    if (selectedCaretaker) {
      const newSelected = new Set(selectedDays);

      if (shiftKey && lastSelectedDate) {
        const allDates = days.map(d => d.date);
        const startIdx = allDates.indexOf(lastSelectedDate);
        const endIdx = allDates.indexOf(date);
        const [from, to] = startIdx < endIdx ? [startIdx, endIdx] : [endIdx, startIdx];

        for (let i = from; i <= to; i++) {
          newSelected.add(allDates[i]);
        }
      } else {
        if (newSelected.has(date)) {
          newSelected.delete(date);
        } else {
          newSelected.add(date);
        }
        setLastSelectedDate(date);
      }

      setSelectedDays(newSelected);
    } else {
      setSelectedDate(date);
    }
  };

  const handleAssign = async () => {
    if (!selectedCaretaker || selectedDays.size === 0) return;

    const dates = Array.from(selectedDays);

    for (const date of dates) {
      await supabase.from('care_assignments').upsert({
        date,
        caretaker_id: selectedCaretaker,
        created_by: currentProfile.id,
        status: 'planned'
      }, { onConflict: 'date' });
    }

    setSelectedDays(new Set());
    setSelectedCaretaker(null);
    setLastSelectedDate(null);
    await loadMonthData();
    await detectAndCreateHandovers();
    onUpdate();
  };

  const detectAndCreateHandovers = async () => {
    const sortedAssignments = await supabase
      .from('care_assignments')
      .select('*')
      .order('date', { ascending: true });

    if (!sortedAssignments.data || sortedAssignments.data.length < 2) return;

    const assignments = sortedAssignments.data;

    for (let i = 0; i < assignments.length - 1; i++) {
      const current = assignments[i];
      const next = assignments[i + 1];

      if (current.caretaker_id !== next.caretaker_id) {
        const currentDate = new Date(current.date);
        const nextDate = new Date(next.date);
        const dayDiff = Math.round((nextDate.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24));

        if (dayDiff === 1) {
          const existingHandover = await supabase
            .from('handovers')
            .select('id')
            .eq('date', current.date)
            .maybeSingle();

          if (!existingHandover.data) {
            await supabase.from('handovers').insert({
              date: current.date,
              from_user_id: current.caretaker_id,
              to_user_id: next.caretaker_id,
              status: 'planned'
            });
          }
        }
      }
    }
  };

  const getISODayOfWeek = (date: Date) => {
    const day = date.getDay();
    return (day + 6) % 7;
  };

  const isToday = (date: string) => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return date === `${year}-${month}-${day}`;
  };

  const isCurrentMonth = (date: string) => {
    const d = new Date(date);
    return d.getMonth() === currentMonth.getMonth();
  };

  const getProfileById = (id: string) => profiles.find(p => p.id === id);

  const previousMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1));
  };

  const nextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1));
  };

  return (
    <div>
      {selectedDate && (
        <DayDetailModal
          date={selectedDate}
          currentProfile={currentProfile}
          profiles={profiles}
          onClose={() => setSelectedDate(null)}
          onUpdate={() => {
            loadMonthData();
            onUpdate();
          }}
        />
      )}

      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <button
            onClick={previousMonth}
            className="p-2 hover:bg-slate-100 rounded-lg transition"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h2 className="text-xl font-bold text-slate-900">
            {currentMonth.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })}
          </h2>
          <button
            onClick={nextMonth}
            className="p-2 hover:bg-slate-100 rounded-lg transition"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        <div className="flex gap-3 items-center">
          {!selectedCaretaker ? (
            profiles.map(profile => (
              <button
                key={profile.id}
                onClick={() => setSelectedCaretaker(profile.id)}
                className={`px-4 py-2 rounded-lg font-medium transition ${
                  profile.color === 'blue'
                    ? 'bg-blue-500 text-white hover:bg-blue-600'
                    : 'bg-green-500 text-white hover:bg-green-600'
                }`}
              >
                Zuweisen an {profile.name}
              </button>
            ))
          ) : (
            <>
              <div className="flex gap-2">
                <button
                  onClick={handleAssign}
                  disabled={selectedDays.size === 0}
                  className="px-4 py-2 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 transition disabled:opacity-50"
                >
                  Bestätigen ({selectedDays.size})
                </button>
                <button
                  onClick={() => {
                    setSelectedCaretaker(null);
                    setSelectedDays(new Set());
                    setLastSelectedDate(null);
                  }}
                  className="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg font-medium hover:bg-slate-300 transition"
                >
                  Abbrechen
                </button>
              </div>
              <div className="text-sm text-slate-600 bg-slate-50 px-3 py-2 rounded-lg">
                💡 Shift + Klick für Bereichsauswahl
              </div>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-7 gap-2">
        {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map(day => (
          <div key={day} className="text-center text-sm font-medium text-slate-600 py-2">
            {day}
          </div>
        ))}

        {days.map(({ date, assignment, events, handover, hasNotes, hasImportantNotes, absences }) => {
          const caretaker = assignment ? getProfileById(assignment.caretaker_id) : null;
          const isSelected = selectedDays.has(date);
          const fromCaretaker = handover ? getProfileById(handover.from_user_id) : null;
          const toCaretaker = handover ? getProfileById(handover.to_user_id) : null;

          return (
            <div
              key={date}
              onClick={(e) => handleDayClick(date, e.shiftKey)}
              className={`
                min-h-32 rounded-xl border-2 transition cursor-pointer relative overflow-hidden
                ${!isCurrentMonth(date) ? 'opacity-40' : ''}
                ${isSelected ? 'border-blue-500' : isToday(date) ? 'border-orange-400 dark:border-orange-500 hover:border-orange-500 dark:hover:border-orange-400' : 'border-slate-200 hover:border-slate-300'}
                ${!handover && caretaker?.color === 'blue' && !isSelected && !isToday(date) ? 'border-blue-300' : ''}
                ${!handover && caretaker?.color === 'green' && !isSelected && !isToday(date) ? 'border-green-300' : ''}
              `}
            >
              {handover ? (
                <div className="absolute inset-0 flex">
                  <div className={`w-1/2 ${fromCaretaker?.color === 'blue' ? 'bg-blue-50 dark:bg-blue-950/30' : 'bg-green-50 dark:bg-green-950/30'}`}></div>
                  <div className={`w-1/2 ${toCaretaker?.color === 'blue' ? 'bg-blue-50 dark:bg-blue-950/30' : 'bg-green-50 dark:bg-green-950/30'}`}></div>
                </div>
              ) : (
                <div className={`absolute inset-0 ${
                  isSelected ? 'bg-blue-50 dark:bg-blue-950/30' :
                  caretaker?.color === 'blue' ? 'bg-blue-50 dark:bg-blue-950/30' :
                  caretaker?.color === 'green' ? 'bg-green-50 dark:bg-green-950/30' :
                  'surface'
                }`}></div>
              )}

              <div className="relative z-10 p-2">
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-sm font-medium ${
                    caretaker?.color === 'blue' ? 'text-blue-900' :
                    caretaker?.color === 'green' ? 'text-green-900' :
                    'text-slate-600'
                  }`}>
                    {new Date(date).getDate()}
                  </span>
                  {handover ? (
                    <div className="flex gap-0.5">
                      <div className={`w-3 h-3 rounded-full ${
                        fromCaretaker?.color === 'blue' ? 'bg-blue-500' : 'bg-green-500'
                      }`}></div>
                      <div className={`w-3 h-3 rounded-full ${
                        toCaretaker?.color === 'blue' ? 'bg-blue-500' : 'bg-green-500'
                      }`}></div>
                    </div>
                  ) : caretaker && (
                    <div className={`w-4 h-4 rounded-full ${
                      caretaker.color === 'blue' ? 'bg-blue-500' : 'bg-green-500'
                    }`}></div>
                  )}
                </div>

                <div className="flex flex-col gap-1 mt-2">
                  {absences.map((absence, idx) => {
                    const person = getProfileById(absence.user_id);
                    return (
                      <div key={idx} className="flex items-center gap-1 text-[9px] sm:text-xs bg-orange-100 text-orange-800 px-1 py-0.5 sm:px-1.5 rounded" title={`${person?.name}: ${absence.reason || 'Abwesend'}`}>
                        <UserX className="w-2 h-2 sm:w-3 sm:h-3 flex-shrink-0" />
                        <span className="truncate">{person?.name}</span>
                        {!absence.is_full_day && (
                          <Clock className="w-2 h-2 sm:w-3 sm:h-3 flex-shrink-0" />
                        )}
                      </div>
                    );
                  })}
                  <div className="flex flex-wrap gap-1">
                    {handover && (
                      <div className="flex items-center gap-1 text-[9px] sm:text-xs bg-amber-100 text-amber-800 px-1 py-0.5 sm:px-1.5 rounded" title="Übergabe">
                        <ArrowLeftRight className="w-2 h-2 sm:w-3 sm:h-3" />
                      </div>
                    )}
                    {events.some(e => e.event_type === 'vet') && (
                      <div className="flex items-center gap-1 text-[9px] sm:text-xs bg-red-100 text-red-800 px-1 py-0.5 sm:px-1.5 rounded" title="Tierarzt">
                        <Syringe className="w-2 h-2 sm:w-3 sm:h-3" />
                      </div>
                    )}
                    {hasImportantNotes && (
                      <div className="flex items-center gap-1 text-[9px] sm:text-xs bg-red-100 text-red-800 px-1 py-0.5 sm:px-1.5 rounded" title="Wichtige Notiz">
                        <AlertCircle className="w-2 h-2 sm:w-3 sm:h-3" />
                      </div>
                    )}
                    {hasNotes && !hasImportantNotes && (
                      <div className="flex items-center gap-1 text-[9px] sm:text-xs bg-slate-100 text-slate-600 px-1 py-0.5 sm:px-1.5 rounded" title="Notiz">
                        <StickyNote className="w-2 h-2 sm:w-3 sm:h-3" />
                      </div>
                    )}
                    {events.length > 0 && !events.some(e => e.event_type === 'vet') && (
                      <div className="text-[9px] sm:text-xs bg-slate-100 text-slate-600 px-1 py-0.5 sm:px-1.5 rounded">
                        {events.length}
                      </div>
                    )}
                  </div>
                </div>

                {handover && (!handover.confirmed_by_from || !handover.confirmed_by_to) && (
                  <div className="mt-1 text-xs text-amber-700 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    <span>Offen</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-blue-50 border-2 border-blue-300 rounded"></div>
          <span>{profiles.find(p => p.color === 'blue')?.name}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-green-50 border-2 border-green-300 rounded"></div>
          <span>{profiles.find(p => p.color === 'green')?.name}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-slate-300 rounded overflow-hidden flex">
            <div className="w-1/2 bg-green-50"></div>
            <div className="w-1/2 bg-blue-50"></div>
          </div>
          <span>Übergabetag</span>
        </div>
        <div className="flex items-center gap-2">
          <UserX className="w-4 h-4 text-orange-700" />
          <span>Abwesenheit</span>
        </div>
        <div className="flex items-center gap-2">
          <Syringe className="w-4 h-4 text-red-700" />
          <span>Tierarzt</span>
        </div>
        <div className="flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-700" />
          <span>Wichtig</span>
        </div>
        <div className="flex items-center gap-2">
          <StickyNote className="w-4 h-4 text-slate-600" />
          <span>Notiz</span>
        </div>
      </div>
    </div>
  );
}
