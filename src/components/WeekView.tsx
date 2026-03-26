import { useEffect, useState } from 'react';
import type { Profile, CareAssignment, CareDayPreference, PreferenceLevel, CareDayEvent, Handover, Availability, ShortVisit, CareDayNote } from '../lib/database.types';
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
  ArrowRightLeft,
  Dog
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
  notes: CareDayNote[];
  hasNotes: boolean;
  hasImportantNotes: boolean;
  absences: Availability[];
  shortVisits: ShortVisit[];
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

    const [assignments, preferences, events, handovers, notes, absences, visits] = await Promise.all([
      listItems<CareAssignment>('care_assignments', { date: dateRange }),
      listItems<CareDayPreference>('care_day_preferences', { date: dateRange }),
      listItems<CareDayEvent>('care_day_events', { date: dateRange }),
      listItems<Handover>('handovers', { date: dateRange }),
      listItems<CareDayNote>('care_day_notes', { date: dateRange }),
      listItems<Availability>('availability', { date: dateRange, type: 'unavailable' }),
      listItems<ShortVisit>('short_visits', { date: dateRange }),
    ]);

    const daysData: DayData[] = dateRange.map(date => {
      const assignment = assignments.find(a => a.date === date);
      const dayPrefs = preferences.filter(p => p.date === date);
      const prefsMap: Record<string, CareDayPreference> = {};
      dayPrefs.forEach(p => (prefsMap[(p as any).profile_id] = p));

      const dayNotes = (notes || []).filter(n => n.date === date);

      const dayAbsences = (absences || []).filter(a => (a as any).date === date);

      const hasConflict = assignment ? dayAbsences.some(a => a.user_id === assignment.caretaker_id) : false;

      return {
        date,
        assignment,
        preferences: prefsMap,
        events: (events || []).filter(e => e.date === date),
        handover: (handovers || []).find(h => h.date === date),
        notes: dayNotes,
        hasNotes: dayNotes.length > 0,
        hasImportantNotes: dayNotes.some(n => n.is_important),
        absences: dayAbsences,
        shortVisits: (visits || []).filter(v => (v as any).date === date),
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

  const formatTime = (time: string | null | undefined) => {
    if (!time) return '';
    return String(time).substring(0, 5);
  };

  const MarqueeOrText = ({ text }: { text: string }) => {
    const clean = String(text || '');
    const isLongText = clean.length > 18;
    return isLongText ? (
      <div className="marquee">
        <span>{clean}</span>
      </div>
    ) : (
      <span>{clean}</span>
    );
  };

  const formatWeekRange = () => {
    if (weekDays.length === 0) return '';
    const start = new Date(weekDays[0].date + 'T12:00:00');
    const end = new Date(weekDays[6].date + 'T12:00:00');
    return `${start.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })} - ${end.toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' })}`;
  };

  return (
    <div className="space-y-6 overflow-x-hidden">
      <div className="sm:static sticky top-0 z-20 w-full px-4 sm:px-0 py-3 sm:py-0 bg-white/85 dark:bg-slate-950/85 backdrop-blur border-b border-slate-200/70 dark:border-slate-800/70 sm:border-b-0">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
          <div className="relative flex items-center gap-2 sm:gap-3 w-full sm:w-auto justify-center sm:justify-start">
            <button
              onClick={previousWeek}
              className="absolute left-0 sm:static w-10 h-10 flex items-center justify-center rounded-xl hover:bg-gradient-to-br hover:from-slate-100 hover:to-slate-200 dark:hover:from-slate-800 dark:hover:to-slate-700 transition-all duration-200 active:scale-95 border border-slate-200 dark:border-slate-700 surface"
            >
              <ChevronLeft className="w-5 h-5 text-slate-700 dark:text-slate-200" />
            </button>

            <div className="min-w-0 flex items-center justify-center sm:justify-start gap-2 px-12 sm:px-0">
              <Calendar className="w-5 h-5 text-slate-600 dark:text-slate-300 flex-shrink-0" />
              <h2 className="text-base sm:text-2xl font-bold text-slate-900 dark:text-slate-100 truncate">
                {formatWeekRange()}
              </h2>
            </div>

            <button
              onClick={nextWeek}
              className="absolute right-0 sm:static w-10 h-10 flex items-center justify-center rounded-xl hover:bg-gradient-to-br hover:from-slate-100 hover:to-slate-200 dark:hover:from-slate-800 dark:hover:to-slate-700 transition-all duration-200 active:scale-95 border border-slate-200 dark:border-slate-700 surface"
            >
              <ChevronRight className="w-5 h-5 text-slate-700 dark:text-slate-200" />
            </button>
          </div>

          <button
            onClick={thisWeek}
            className="btn-secondary text-sm w-full sm:w-auto"
          >
            Diese Woche
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        {weekDays.map((day) => {
          const dayDate = new Date(day.date + 'T12:00:00');
          const isToday = new Date().toDateString() === dayDate.toDateString();
          const isWeekend = dayDate.getDay() === 0 || dayDate.getDay() === 6;
          const assignedProfile = day.assignment ? resolveProfileById(profiles, day.assignment?.caretaker_id) : null;

          const currentProfilePref = day.preferences[currentProfile.id];
          const otherProfile = profiles.find(p => p.id !== currentProfile.id);
          const otherPreference = otherProfile ? day.preferences[otherProfile.id] : null;

          const getTileBackgroundClass = () => {
            if (day.hasConflict) return 'ring-2 ring-inset ring-red-400 bg-red-50 dark:bg-red-950/30';
            if (day.handover) return 'surface hover:bg-slate-50 hover:shadow-sm dark:hover:bg-slate-900/60';
            if (assignedProfile) return profileColorClass(assignedProfile, 'tile');
            if (isWeekend) return 'bg-slate-50/50 dark:bg-slate-950/30';
            return 'surface hover:bg-slate-50 hover:shadow-sm dark:hover:bg-slate-900/60';
          };

          return (
            <div
              key={day.date}
              onClick={() => setSelectedDate(day.date)}
              className={`relative min-h-[240px] sm:min-h-[260px] rounded-2xl p-4 sm:p-3 cursor-pointer transition-all duration-200 border-2 card-hover ${getTileBackgroundClass()} ${
                isToday
                  ? '!border-blue-500 ring-2 ring-inset ring-blue-400/60 shadow-xl shadow-blue-500/20'
                  : 'border-slate-200 dark:border-slate-700'
              }`}
            >
              {day.handover && !day.hasConflict && (() => {
                const fromProfile = resolveProfileById(profiles, day.handover!.from_user_id);
                const toProfile = resolveProfileById(profiles, day.handover!.to_user_id);
                const fromColor = fromProfile ? profileColorClass(fromProfile, 'soft') : 'bg-slate-50/60 dark:bg-slate-950/25';
                const toColor = toProfile ? profileColorClass(toProfile, 'soft') : 'bg-slate-50/60 dark:bg-slate-950/25';

                return (
                  <>
                    <div
                      className={`absolute inset-0 ${fromColor} pointer-events-none`}
                      style={{ clipPath: 'polygon(0 0, 100% 0, 0 100%)' }}
                    ></div>
                    <div
                      className={`absolute inset-0 ${toColor} pointer-events-none`}
                      style={{ clipPath: 'polygon(100% 0, 100% 100%, 0 100%)' }}
                    ></div>
                  </>
                );
              })()}

              <div className="relative z-10">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className={`text-xs font-bold uppercase tracking-wide ${isToday ? 'text-blue-600' : 'text-slate-500 dark:text-slate-400'}`}>
                      {dayDate.toLocaleDateString('de-DE', { weekday: 'short' })}
                    </div>
                    <div className={`text-xl font-bold ${isToday ? 'text-blue-600' : 'text-slate-900 dark:text-slate-100'}`}>
                      {dayDate.getDate()}
                    </div>
                  </div>

                  <div className="flex gap-1.5 flex-wrap justify-end">
                    {day.handover && (
                      <div
                        className="w-4 h-4 rounded-full bg-orange-100 dark:bg-orange-950/35 flex items-center justify-center cursor-help"
                        title={`Übergabe um ${day.handover.time || '12:00'}`}
                      >
                        <ArrowRightLeft className="w-3 h-3 text-orange-600 dark:text-orange-200" />
                      </div>
                    )}
                    {day.events.length > 0 && (
                      <div
                        className="w-4 h-4 rounded-full bg-blue-100 dark:bg-blue-950/35 flex items-center justify-center cursor-help"
                        title={`${day.events.length} Ereignis(se)`}
                      >
                        <Home className="w-3 h-3 text-blue-600 dark:text-blue-200" />
                      </div>
                    )}
                    {day.shortVisits.length > 0 && (
                      <div
                        className="w-4 h-4 rounded-full bg-slate-100 dark:bg-slate-800/60 flex items-center justify-center cursor-help"
                        title={`${day.shortVisits.length} Kurzbesuch(e)`}
                      >
                        <Dog className="w-3 h-3 text-slate-600 dark:text-slate-200" />
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-start gap-1.5 flex-wrap mb-2">
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
                      const p = resolveProfileById(profiles, id);
                      if (p) unique.set(p.id, p);
                    }
                    const involvedProfiles = Array.from(unique.values());

                    return (
                      <div className="flex items-center gap-1 flex-nowrap">
                        {involvedProfiles.map((profile) => (
                          <div
                            key={profile.id}
                            className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shadow-sm flex-shrink-0 cursor-help ${profileColorClass(profile, 'solid')}`}
                            title={`Übergabe: ${profile.name}`}
                          >
                            {profile.name.charAt(0)}
                          </div>
                        ))}
                      </div>
                    );
                  })()
                ) : assignedProfile ? (
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shadow-sm flex-shrink-0 cursor-help ${profileColorClass(assignedProfile, 'solid')}`}
                    title={`Betreuer: ${assignedProfile.name}`}
                  >
                    {assignedProfile.name.charAt(0)}
                  </div>
                ) : (
                  <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">Nicht eingeteilt</div>
                )}

                {day.handover && (
                  (() => {
                    const createdById = (day.handover as any)?.created_by as string | undefined;
                    const creator = createdById ? resolveProfileById(profiles, createdById) : null;
                    const bubbleClass = creator
                      ? `${profileColorClass(creator, 'solid')} text-white dark:brightness-125 dark:saturate-125 dark:ring-1 dark:ring-white/10`
                      : 'bg-orange-100 dark:bg-orange-900/50 text-orange-700 dark:text-orange-100 dark:ring-1 dark:ring-white/10';

                    return (
                      <div
                        className={`flex items-center justify-center gap-1 text-xs px-2 py-1 ${bubbleClass} rounded-lg font-medium cursor-help leading-none w-full overflow-hidden whitespace-nowrap`}
                        title={`Übergabe um ${(day.handover.time || '12:00').substring(0, 5)}`}
                      >
                        {(() => {
                          const t = String(day.handover?.time || '12:00');
                          const hh = t.substring(0, 2);
                          const h = Number.parseInt(hh, 10);
                          return Number.isFinite(h) ? `${h} Uhr` : (t || '12:00').substring(0, 5);
                        })()}
                      </div>
                    );
                  })()
                )}
              </div>

              {(currentProfilePref || otherPreference) && (
                <div className="flex flex-wrap gap-1 mb-2 sm:mb-3">
                  {currentProfilePref && (
                    <div
                      className={`inline-flex items-center gap-1 px-1.5 py-1 rounded-lg shadow-sm ${PREFERENCE_CONFIG[currentProfilePref.preference_level].color}`}
                      title={`${currentProfile.name}: ${PREFERENCE_CONFIG[currentProfilePref.preference_level].label}`}
                    >
                      {getPreferenceIcon(currentProfilePref.preference_level)}
                      <span className="text-xs font-semibold">{currentProfile.name[0]}</span>
                    </div>
                  )}
                  {otherPreference && (
                    <div
                      className={`inline-flex items-center gap-1 px-1.5 py-1 rounded-lg shadow-sm ${PREFERENCE_CONFIG[otherPreference.preference_level].color}`}
                      title={`${otherProfile?.name}: ${PREFERENCE_CONFIG[otherPreference.preference_level].label}`}
                    >
                      {getPreferenceIcon(otherPreference.preference_level)}
                      <span className="text-xs font-semibold">{otherProfile?.name[0]}</span>
                    </div>
                  )}
                </div>
              )}

              {day.notes.length > 0 && (
                (() => {
                  const important = day.notes.find(n => n.is_important);
                  const note = important || day.notes[0];
                  const icon = note.is_important ? <AlertCircle className="w-3 h-3 flex-shrink-0" /> : <StickyNote className="w-3 h-3 flex-shrink-0" />;
                  const bubbleClass = note.is_important
                    ? 'bg-red-100 dark:bg-red-950/35 text-red-700 dark:text-red-200'
                    : 'bg-yellow-100 dark:bg-yellow-950/35 text-yellow-800 dark:text-yellow-200';
                  const prefix = note.is_important ? 'Auffälligkeit' : 'Notiz';
                  const text = `${prefix}: ${String(note.content || '').trim()}`.trim();

                  return (
                    <div
                      className={`flex items-center gap-1 text-xs px-2 py-1 ${bubbleClass} rounded-lg font-medium cursor-help leading-none w-full overflow-hidden whitespace-nowrap mb-2`}
                      title={text}
                    >
                      {icon}
                      <span className="opacity-90 truncate flex-1">
                        <span className="px-2 sm:px-0 inline-block">
                          <MarqueeOrText text={text} />
                        </span>
                      </span>
                    </div>
                  );
                })()
              )}

              {day.absences.length > 0 && (
                <div className="flex flex-col gap-1 mb-2">
                  {day.absences.map((absence) => {
                    const absentProfile = resolveProfileById(profiles, absence.user_id);
                    const tooltipText = !absence.is_full_day && (absence as any).start_time && (absence as any).end_time
                      ? `${absentProfile?.name} abwesend: ${formatTime((absence as any).start_time)} - ${formatTime((absence as any).end_time)}`
                      : `${absentProfile?.name} ganztägig abwesend`;
                    return absentProfile ? (
                      <div
                        key={absence.id}
                        className={`flex items-center gap-1 text-xs px-2 py-1 ${profileColorClass(absentProfile, 'solid')} rounded-lg font-medium cursor-help leading-none w-full overflow-hidden whitespace-nowrap`}
                        title={tooltipText}
                      >
                        <UserX className="w-3 h-3 flex-shrink-0" />
                        <span className="opacity-90 truncate flex-1">
                          <span className="px-2 sm:px-0 inline-block">
                            {(absence as any).is_full_day ? (
                              <MarqueeOrText text="ganztägig abwesend" />
                            ) : (
                              <MarqueeOrText text={`${formatTime((absence as any).start_time)}-${formatTime((absence as any).end_time)}`} />
                            )}
                          </span>
                        </span>
                      </div>
                    ) : null;
                  })}
                </div>
              )}

              {day.events.length > 0 && (
                <div className="flex flex-col gap-1 mb-2">
                  {day.events.map((event) => {
                    const author = resolveProfileById(profiles, (event as any).created_by);
                    const when = formatTime((event as any).time);
                    const label = `${when ? when + ' ' : ''}${event.title || ''}`.trim();
                    return author ? (
                      <div
                        key={(event as any).id || `${day.date}-${event.title}`}
                        className={`flex items-center gap-1 text-xs px-2 py-1 ${profileColorClass(author, 'solid')} rounded-lg font-medium cursor-help leading-none w-full overflow-hidden whitespace-nowrap`}
                        title={`${author.name}${when ? `: ${when}` : ''}${event.title ? ` ${event.title}` : ''}`.trim()}
                      >
                        <Home className="w-3 h-3 flex-shrink-0" />
                        <span className="opacity-90 truncate flex-1">
                          <span className="px-2 sm:px-0 inline-block">
                            <MarqueeOrText text={label} />
                          </span>
                        </span>
                      </div>
                    ) : (
                      <div
                        key={(event as any).id || `${day.date}-${event.title}`}
                        className="flex items-center gap-1 text-xs px-2 py-1 bg-slate-100 dark:bg-slate-800/60 text-slate-700 dark:text-slate-200 rounded-lg font-medium leading-none w-full overflow-hidden whitespace-nowrap"
                        title={label}
                      >
                        <Home className="w-3 h-3 flex-shrink-0" />
                        <span className="opacity-90 truncate flex-1">
                          <span className="px-2 sm:px-0 inline-block">
                            <MarqueeOrText text={label} />
                          </span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

                {day.shortVisits.length > 0 && (
                  <div className="flex flex-col gap-1 mb-2">
                    {day.shortVisits.map((visit) => {
                      const visitor = resolveProfileById(profiles, (visit as any).visitor_id);
                      const start = formatTime((visit as any).start_time);
                      const end = formatTime((visit as any).end_time);
                      const duration = (visit as any).duration_minutes ? ` (${(visit as any).duration_minutes} Min.)` : '';
                      const timeText = end ? `${start}-${end}` : `${start}${duration}`;
                      const visitTypeLabels: Record<string, string> = {
                        walk: '🐕',
                        short_stay: '⏱️',
                        vet_visit: '🏥',
                        grooming: '✂️',
                        playtime: '🎾',
                        other: '📌'
                      };
                      const icon = visitTypeLabels[String((visit as any).visit_type || 'other')] || '📌';
                      const tooltipText = visitor
                        ? `${visitor.name}: ${timeText}`
                        : timeText;

                      return visitor ? (
                        <div
                          key={(visit as any).id || `${day.date}-${timeText}`}
                          className={`flex items-center gap-1 text-xs px-2 py-1 ${profileColorClass(visitor, 'solid')} rounded-lg font-medium cursor-help leading-none w-full overflow-hidden whitespace-nowrap`}
                          title={tooltipText}
                        >
                          <span className="flex-shrink-0">{icon}</span>
                          <span className="opacity-90 truncate flex-1">
                            <span className="px-2 sm:px-0 inline-block">
                              <MarqueeOrText text={timeText} />
                            </span>
                          </span>
                        </div>
                      ) : (
                        <div
                          key={(visit as any).id || `${day.date}-${timeText}`}
                          className="flex items-center gap-1 text-xs px-2 py-1 bg-slate-100 dark:bg-slate-800/60 text-slate-700 dark:text-slate-200 rounded-lg font-medium leading-none w-full overflow-hidden whitespace-nowrap"
                          title={tooltipText}
                        >
                          <span className="flex-shrink-0">{icon}</span>
                          <span className="opacity-90 truncate flex-1">
                            <span className="px-2 sm:px-0 inline-block">
                              <MarqueeOrText text={timeText} />
                            </span>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}

              </div>
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
