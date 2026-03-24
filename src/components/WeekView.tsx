import { useEffect, useState } from 'react';
import type { Profile, CareAssignment, CareDayPreference, PreferenceLevel, CareDayEvent, Handover, Availability } from '../lib/database.types';
import {
  ChevronLeft,
  ChevronRight,
  Heart,
  Star,
  Circle,
  AlertTriangle,
  Ban,
  Home,
  StickyNote,
  AlertCircle,
  UserX,
  Calendar,
  ArrowRightLeft
} from 'lucide-react';
import { DayDetailModal } from './DayDetailModal';
import { listItems } from '../api/collections';
import { profileColorClass } from '../lib/profileColor';
import { resolveProfileById } from '../lib/knownProfiles';

interface WeekViewProps {
  profiles: Profile[];
  currentProfile: Profile;
  onUpdate: () => void;
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
}

const PREFERENCE_CONFIG: Record<PreferenceLevel, { icon: typeof Heart; label: string; color: string }> = {
  very_happy: { icon: Heart, label: 'Sehr gerne', color: 'text-pink-600 bg-pink-100' },
  nice: { icon: Star, label: 'Wäre schön', color: 'text-yellow-600 bg-yellow-100' },
  neutral: { icon: Circle, label: 'Neutral', color: 'text-slate-400 bg-slate-100' },
  rather_not: { icon: AlertTriangle, label: 'Lieber nicht', color: 'text-orange-600 bg-orange-100' },
  impossible: { icon: Ban, label: 'Nicht möglich', color: 'text-red-600 bg-red-100' }
};

export function WeekView({ profiles, currentProfile, onUpdate }: WeekViewProps) {
  const [currentWeek, setCurrentWeek] = useState(new Date());
  const [weekDays, setWeekDays] = useState<DayData[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  useEffect(() => {
    loadWeekData();
  }, [currentWeek]);

  const getWeekStart = (date: Date): Date => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.setDate(diff));
  };

  const loadWeekData = async () => {
    const weekStart = getWeekStart(currentWeek);
    const dateRange: string[] = [];

    for (let i = 0; i < 7; i++) {
      const current = new Date(weekStart);
      current.setDate(current.getDate() + i);
      const year = current.getFullYear();
      const month = String(current.getMonth() + 1).padStart(2, '0');
      const day = String(current.getDate()).padStart(2, '0');
      dateRange.push(`${year}-${month}-${day}`);
    }

    const [assignments, preferences, events, handovers, notes, absences] = await Promise.all([
      listItems<CareAssignment>('care_assignments', { date: dateRange }),
      listItems<CareDayPreference>('care_day_preferences', { date: dateRange }),
      listItems<CareDayEvent>('care_day_events', { date: dateRange }),
      listItems<Handover>('handovers', { date: dateRange }),
      listItems<{ date: string; is_important: boolean }>('care_day_notes', { date: dateRange }),
      listItems<Availability>('availability', { date: dateRange, type: 'unavailable' }),
    ]);

    const daysData: DayData[] = dateRange.map(date => {
      const assignment = assignments.find(a => a.date === date);
      const dayPrefs = preferences.filter(p => p.date === date);
      const prefsMap: Record<string, CareDayPreference> = {};
      dayPrefs.forEach(p => (prefsMap[(p as any).profile_id] = p));

      const dayAbsences = (absences || []).filter(a => (a as any).date === date);

      const hasConflict = assignment ? dayAbsences.some(a => a.user_id === assignment.caretaker_id) : false;

      return {
        date,
        assignment,
        preferences: prefsMap,
        events: (events || []).filter(e => e.date === date),
        handover: (handovers || []).find(h => h.date === date),
        hasNotes: (notes || []).some(n => n.date === date),
        hasImportantNotes: (notes || []).some(n => n.date === date && (n as any).is_important),
        absences: dayAbsences,
        hasConflict
      };
    });

    setWeekDays(daysData);
  };

  const previousWeek = () => {
    const newWeek = new Date(currentWeek);
    newWeek.setDate(newWeek.getDate() - 7);
    setCurrentWeek(newWeek);
  };

  const nextWeek = () => {
    const newWeek = new Date(currentWeek);
    newWeek.setDate(newWeek.getDate() + 7);
    setCurrentWeek(newWeek);
  };

  const thisWeek = () => {
    setCurrentWeek(new Date());
  };

  const getPreferenceIcon = (level: PreferenceLevel) => {
    const Icon = PREFERENCE_CONFIG[level].icon;
    return <Icon className="w-4 h-4" />;
  };

  const formatWeekRange = () => {
    if (weekDays.length === 0) return '';
    const start = new Date(weekDays[0].date + 'T12:00:00');
    const end = new Date(weekDays[6].date + 'T12:00:00');
    return `${start.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })} - ${end.toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' })}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={previousWeek}
            className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-gradient-to-br hover:from-slate-100 hover:to-slate-200 dark:hover:from-slate-800 dark:hover:to-slate-700 transition-all duration-200 active:scale-95 border border-slate-200 dark:border-slate-700 surface"
          >
            <ChevronLeft className="w-5 h-5 text-slate-700 dark:text-slate-200" />
          </button>
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-slate-600 dark:text-slate-300" />
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100">
              {formatWeekRange()}
            </h2>
          </div>
          <button
            onClick={nextWeek}
            className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-gradient-to-br hover:from-slate-100 hover:to-slate-200 dark:hover:from-slate-800 dark:hover:to-slate-700 transition-all duration-200 active:scale-95 border border-slate-200 dark:border-slate-700 surface"
          >
            <ChevronRight className="w-5 h-5 text-slate-700 dark:text-slate-200" />
          </button>
        </div>
        <button
          onClick={thisWeek}
          className="btn-secondary text-sm"
        >
          Diese Woche
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-4">
        {weekDays.map((day) => {
          const dayDate = new Date(day.date + 'T12:00:00');
          const isToday = new Date().toDateString() === dayDate.toDateString();
          const isWeekend = dayDate.getDay() === 0 || dayDate.getDay() === 6;
          const assignedProfile = day.assignment ? resolveProfileById(profiles, day.assignment?.caretaker_id) : null;

          const currentProfilePref = day.preferences[currentProfile.id];
          const otherProfile = profiles.find(p => p.id !== currentProfile.id);
          const otherPreference = otherProfile ? day.preferences[otherProfile.id] : null;

          return (
            <div
              key={day.date}
              onClick={() => setSelectedDate(day.date)}
              className={`
                relative min-h-[220px] rounded-2xl p-4 cursor-pointer transition-all duration-200 border-2 card-hover
                ${isWeekend ? 'bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950/50 dark:to-slate-900/40' : 'surface'}
                ${isToday ? 'border-blue-500 shadow-xl shadow-blue-500/20' : 'border-slate-200 dark:border-slate-700'}
                ${day.hasConflict ? 'border-red-400' : ''}
              `}
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className={`text-xs font-bold uppercase tracking-wide mb-1 ${isToday ? 'text-blue-600' : 'text-slate-500 dark:text-slate-400'}`}>
                    {dayDate.toLocaleDateString('de-DE', { weekday: 'short' })}
                  </div>
                  <div className={`text-3xl font-bold ${isToday ? 'text-blue-600' : 'text-slate-900 dark:text-slate-100'}`}>
                    {dayDate.getDate()}
                  </div>
                </div>
                <div className="flex flex-col gap-1 items-end">
                  {isToday && (
                    <div className="px-2 py-1 rounded-full bg-blue-500 text-white text-xs font-bold">
                      Heute
                    </div>
                  )}
                  {day.handover && (
                    <div className="p-1.5 rounded-lg bg-orange-100 dark:bg-orange-950/30">
                      <ArrowRightLeft className="w-3.5 h-3.5 text-orange-600 dark:text-orange-300" />
                    </div>
                  )}
                </div>
              </div>

              {day.hasImportantNotes && (
                <div className="mb-2">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gradient-to-r from-red-100 to-red-200 dark:from-red-950/30 dark:to-red-900/20 text-red-700 dark:text-red-200 text-xs font-bold shadow-sm border border-red-200/60 dark:border-red-900/40">
                    <AlertCircle className="w-3.5 h-3.5" />
                    Wichtig!
                  </div>
                </div>
              )}

              {day.absences.length > 0 && (
                <div className="mb-3 space-y-1.5">
                  {day.absences.map((absence, idx) => {
                    const profile = resolveProfileById(profiles, absence.user_id);
                    return (
                      <div key={idx} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-100 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200 text-xs font-medium border border-amber-200 dark:border-amber-900/40">
                        <UserX className="w-3.5 h-3.5 flex-shrink-0" />
                        <span className="truncate">{profile?.name} nicht da</span>
                      </div>
                    );
                  })}
                </div>
              )}

              {assignedProfile ? (
                <div
                  className={`mb-3 p-3 rounded-xl shadow-sm transition-all border-2 ${
                    day.hasConflict
                      ? 'bg-gradient-to-br from-red-50 to-red-100 border-red-300'
                      : `${profileColorClass(assignedProfile, 'tile')} border-slate-200 dark:border-slate-700`
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${day.hasConflict ? 'bg-red-500' : profileColorClass(assignedProfile, 'solid')}`}>
                      <Home className="w-4 h-4 text-white" />
                    </div>
                    <div className="flex-1">
                      <div className={`font-bold text-sm ${day.hasConflict ? 'text-red-900' : 'text-slate-900 dark:text-slate-100'}`}>
                        {assignedProfile.name}
                      </div>
                      {day.hasConflict && (
                        <div className="text-xs text-red-700 font-semibold">Konflikt!</div>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mb-3 p-3 rounded-xl bg-slate-100 dark:bg-slate-900/40 border-2 border-dashed border-slate-300 dark:border-slate-600">
                  <div className="text-xs text-slate-500 dark:text-slate-400 text-center font-medium">Noch nicht eingeteilt</div>
                </div>
              )}

              {(currentProfilePref || otherPreference) && (
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {currentProfilePref && (
                    <div
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg shadow-sm ${PREFERENCE_CONFIG[currentProfilePref.preference_level].color}`}
                      title={`${currentProfile.name}: ${PREFERENCE_CONFIG[currentProfilePref.preference_level].label}`}
                    >
                      {getPreferenceIcon(currentProfilePref.preference_level)}
                      <span className="text-xs font-semibold">{currentProfile.name[0]}</span>
                    </div>
                  )}
                  {otherPreference && (
                    <div
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg shadow-sm ${PREFERENCE_CONFIG[otherPreference.preference_level].color}`}
                      title={`${otherProfile?.name}: ${PREFERENCE_CONFIG[otherPreference.preference_level].label}`}
                    >
                      {getPreferenceIcon(otherPreference.preference_level)}
                      <span className="text-xs font-semibold">{otherProfile?.name[0]}</span>
                    </div>
                  )}
                </div>
              )}

              {day.events.length > 0 && (
                <div className="space-y-1">
                  {day.events.slice(0, 2).map((event) => (
                    <div className="flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300 truncate">
                      <div className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0"></div>
                      <span className="truncate font-medium">{event.title}</span>
                    </div>
                  ))}
                  {day.events.length > 2 && (
                    <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">+{day.events.length - 2} weitere</div>
                  )}
                </div>
              )}

              {day.hasNotes && !day.hasImportantNotes && (
                <div className="absolute bottom-3 right-3">
                  <div className="p-1.5 rounded-lg bg-yellow-100 dark:bg-yellow-950/35">
                    <StickyNote className="w-3.5 h-3.5 text-yellow-600 dark:text-yellow-200" />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {selectedDate && (
        <DayDetailModal
          date={selectedDate}
          profiles={profiles}
          currentProfile={currentProfile}
          onUpdate={() => {
            loadWeekData();
            onUpdate();
          }}
          onClose={() => {
            setSelectedDate(null);
            loadWeekData();
            onUpdate();
          }}
        />
      )}
    </div>
  );
}
