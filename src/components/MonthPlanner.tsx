import { useEffect, useState } from 'react';
import type { Profile, CareAssignment, CareDayPreference, PreferenceLevel, Availability } from '../lib/database.types';
import {
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Check,
  X,
  AlertCircle,
  Heart,
  Star,
  Circle,
  AlertTriangle,
  Ban,
  RotateCcw,
  Save,
  UserX,
  Copy,
  Calendar,
  Zap
} from 'lucide-react';
import { DayDetailModal } from './DayDetailModal';
import { AbsenceModal } from './AbsenceModal';

interface MonthPlannerProps {
  profiles: Profile[];
  currentProfile: Profile;
  onUpdate: () => void;
}

interface DayPlan {
  date: string;
  assignment?: CareAssignment;
  preferences: Record<string, CareDayPreference>;
  hasConflict: boolean;
  absences: Availability[];
}

type PlanningMode = 'view' | 'preferences' | 'assign';

const PREFERENCE_CONFIG: Record<PreferenceLevel, { icon: typeof Heart; label: string; color: string; score: number }> = {
  very_happy: { icon: Heart, label: 'Sehr gerne', color: 'text-pink-600 bg-pink-100', score: 5 },
  nice: { icon: Star, label: 'Wäre schön', color: 'text-yellow-600 bg-yellow-100', score: 3 },
  neutral: { icon: Circle, label: 'Neutral', color: 'text-slate-400 bg-slate-100', score: 0 },
  rather_not: { icon: AlertTriangle, label: 'Lieber nicht', color: 'text-orange-600 bg-orange-100', score: -3 },
  impossible: { icon: Ban, label: 'Nicht möglich', color: 'text-red-600 bg-red-100', score: -10 }
};

export function MonthPlanner({ profiles, currentProfile, onUpdate }: MonthPlannerProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [days, setDays] = useState<DayPlan[]>([]);
  const [mode, setMode] = useState<PlanningMode>('view');
  const [selectedPreference, setSelectedPreference] = useState<PreferenceLevel>('very_happy');
  const [selectedDays, setSelectedDays] = useState<Set<string>>(new Set());
  const [selectedCaretaker, setSelectedCaretaker] = useState<string | null>(null);
  const [showAbsenceModal, setShowAbsenceModal] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [originalAssignments, setOriginalAssignments] = useState<Map<string, CareAssignment>>(new Map());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [preferenceReason, setPreferenceReason] = useState('');
  const [showReasonInput, setShowReasonInput] = useState(false);

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

    const [assignmentsRes, preferencesRes, absencesRes] = await Promise.all([
      supabase.from('care_assignments').select('*').in('date', dateRange),
      supabase.from('care_day_preferences').select('*').in('date', dateRange),
      supabase.from('availability').select('*').in('date', dateRange).eq('type', 'unavailable')
    ]);

    const assignmentMap = new Map((assignmentsRes.data || []).map(a => [a.date, a]));
    setOriginalAssignments(new Map(assignmentMap));

    const preferenceMap = new Map<string, Record<string, CareDayPreference>>();
    (preferencesRes.data || []).forEach(p => {
      if (!preferenceMap.has(p.date)) preferenceMap.set(p.date, {});
      preferenceMap.get(p.date)![p.profile_id] = p;
    });

    const absenceMap = new Map<string, Availability[]>();
    (absencesRes.data || []).forEach(a => {
      if (!absenceMap.has(a.date)) absenceMap.set(a.date, []);
      absenceMap.get(a.date)!.push(a);
    });

    const daysData: DayPlan[] = dateRange.map(date => {
      const prefs = preferenceMap.get(date) || {};
      const hasConflict = Object.values(prefs).every(p => p.preference_level === 'impossible' || p.preference_level === 'rather_not');

      return {
        date,
        assignment: assignmentMap.get(date),
        preferences: prefs,
        hasConflict,
        absences: absenceMap.get(date) || []
      };
    });

    setDays(daysData);
    setHasUnsavedChanges(false);
  };

  const handleDayClick = (date: string) => {
    if (mode === 'preferences') {
      setSelectedDays(prev => {
        const next = new Set(prev);
        if (next.has(date)) {
          next.delete(date);
        } else {
          next.add(date);
        }
        return next;
      });
    } else if (mode === 'assign') {
      setSelectedDays(prev => {
        const next = new Set(prev);
        if (next.has(date)) {
          next.delete(date);
        } else {
          next.add(date);
        }
        return next;
      });
    } else {
      setSelectedDate(date);
    }
  };

  const handleSavePreferences = async () => {
    if (selectedDays.size === 0) return;

    for (const date of Array.from(selectedDays)) {
      await supabase.from('care_day_preferences').upsert({
        profile_id: currentProfile.id,
        date,
        preference_level: selectedPreference,
        reason: preferenceReason || null
      }, { onConflict: 'profile_id,date' });
    }

    setSelectedDays(new Set());
    setMode('view');
    setPreferenceReason('');
    setShowReasonInput(false);
    await loadMonthData();
    onUpdate();
  };

  const copyPreferencesFromLastMonth = async () => {
    const lastMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1);
    const lastMonthEnd = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 0);

    const startDate = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}-01`;
    const endDate = `${lastMonthEnd.getFullYear()}-${String(lastMonthEnd.getMonth() + 1).padStart(2, '0')}-${String(lastMonthEnd.getDate()).padStart(2, '0')}`;

    const { data: lastMonthPrefs } = await supabase
      .from('care_day_preferences')
      .select('*')
      .eq('profile_id', currentProfile.id)
      .gte('date', startDate)
      .lte('date', endDate);

    if (!lastMonthPrefs || lastMonthPrefs.length === 0) {
      alert('Keine Wünsche vom Vormonat gefunden.');
      return;
    }

    let copiedCount = 0;
    for (const pref of lastMonthPrefs) {
      const oldDate = new Date(pref.date);
      const dayOfMonth = oldDate.getDate();

      const newDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), dayOfMonth);
      if (newDate.getMonth() === currentMonth.getMonth()) {
        const dateStr = `${newDate.getFullYear()}-${String(newDate.getMonth() + 1).padStart(2, '0')}-${String(newDate.getDate()).padStart(2, '0')}`;

        await supabase.from('care_day_preferences').upsert({
          profile_id: currentProfile.id,
          date: dateStr,
          preference_level: pref.preference_level,
          reason: pref.reason
        }, { onConflict: 'profile_id,date' });

        copiedCount++;
      }
    }

    await loadMonthData();
    onUpdate();
    alert(`${copiedCount} Wünsche vom Vormonat kopiert.`);
  };

  const selectPattern = (pattern: 'weekends' | 'weekdays' | 'mondays' | 'fridays') => {
    const newSelected = new Set<string>();

    days.forEach(day => {
      if (!isCurrentMonth(day.date)) return;

      const date = new Date(day.date);
      const dayOfWeek = date.getDay();

      switch (pattern) {
        case 'weekends':
          if (dayOfWeek === 0 || dayOfWeek === 6) newSelected.add(day.date);
          break;
        case 'weekdays':
          if (dayOfWeek >= 1 && dayOfWeek <= 5) newSelected.add(day.date);
          break;
        case 'mondays':
          if (dayOfWeek === 1) newSelected.add(day.date);
          break;
        case 'fridays':
          if (dayOfWeek === 5) newSelected.add(day.date);
          break;
      }
    });

    setSelectedDays(newSelected);
  };

  const handleAssignDays = async () => {
    if (!selectedCaretaker || selectedDays.size === 0) return;

    for (const date of Array.from(selectedDays)) {
      const day = days.find(d => d.date === date);
      const newAssignment = {
        date,
        caretaker_id: selectedCaretaker,
        created_by: currentProfile.id,
        status: 'planned' as const
      };

      await supabase.from('care_assignments').upsert(newAssignment, { onConflict: 'date' });

      const updatedDays = days.map(d =>
        d.date === date ? { ...d, assignment: newAssignment as CareAssignment } : d
      );
      setDays(updatedDays);
    }

    setSelectedDays(new Set());
    setSelectedCaretaker(null);
    setMode('view');
    setHasUnsavedChanges(true);
  };

  const handleDeleteAssignment = async (date: string, e: React.MouseEvent) => {
    e.stopPropagation();

    await supabase.from('care_assignments').delete().eq('date', date);

    const updatedDays = days.map(d =>
      d.date === date ? { ...d, assignment: undefined } : d
    );
    setDays(updatedDays);
    setHasUnsavedChanges(true);
  };

  const handleDeletePreference = async (date: string, e: React.MouseEvent) => {
    e.stopPropagation();

    await supabase.from('care_day_preferences')
      .delete()
      .eq('date', date)
      .eq('profile_id', currentProfile.id);

    const updatedDays = days.map(d => {
      if (d.date === date) {
        const newPrefs = { ...d.preferences };
        delete newPrefs[currentProfile.id];
        return { ...d, preferences: newPrefs };
      }
      return d;
    });
    setDays(updatedDays);
    onUpdate();
  };

  const generateSmartPlan = async () => {
    const monthDays = days.filter(d => isCurrentMonth(d.date));
    const newAssignments: CareAssignment[] = [];

    const sortedDays = [...monthDays].sort((a, b) => {
      const aScore = calculateDayScore(a);
      const bScore = calculateDayScore(b);
      return bScore - aScore;
    });

    let martinCount = 0;
    let lisaCount = 0;
    let lastCaretaker: string | null = null;

    for (const day of sortedDays) {
      if (day.assignment) continue;

      const martinPref = day.preferences[profiles.find(p => p.name === 'Martin')?.id || ''];
      const lisaPref = day.preferences[profiles.find(p => p.name === 'Lisa')?.id || ''];

      const martinScore = martinPref ? PREFERENCE_CONFIG[martinPref.preference_level].score : 0;
      const lisaScore = lisaPref ? PREFERENCE_CONFIG[lisaPref.preference_level].score : 0;

      let selectedCaretaker: string;

      if (martinScore === -10 && lisaScore !== -10) {
        selectedCaretaker = profiles.find(p => p.name === 'Lisa')!.id;
      } else if (lisaScore === -10 && martinScore !== -10) {
        selectedCaretaker = profiles.find(p => p.name === 'Martin')!.id;
      } else if (Math.abs(martinCount - lisaCount) > 2) {
        selectedCaretaker = martinCount > lisaCount
          ? profiles.find(p => p.name === 'Lisa')!.id
          : profiles.find(p => p.name === 'Martin')!.id;
      } else if (martinScore > lisaScore) {
        selectedCaretaker = profiles.find(p => p.name === 'Martin')!.id;
      } else if (lisaScore > martinScore) {
        selectedCaretaker = profiles.find(p => p.name === 'Lisa')!.id;
      } else {
        selectedCaretaker = martinCount <= lisaCount
          ? profiles.find(p => p.name === 'Martin')!.id
          : profiles.find(p => p.name === 'Lisa')!.id;
      }

      if (selectedCaretaker === profiles.find(p => p.name === 'Martin')?.id) {
        martinCount++;
      } else {
        lisaCount++;
      }

      lastCaretaker = selectedCaretaker;

      newAssignments.push({
        id: '',
        date: day.date,
        caretaker_id: selectedCaretaker,
        created_by: currentProfile.id,
        status: 'planned',
        preference_score: 0,
        notes: null,
        start_time: null,
        end_time: null,
        is_full_day: true,
        created_at: '',
        updated_at: ''
      });
    }

    const updatedDays = days.map(d => {
      const newAssignment = newAssignments.find(a => a.date === d.date);
      return newAssignment ? { ...d, assignment: newAssignment } : d;
    });

    setDays(updatedDays);
    setHasUnsavedChanges(true);
  };

  const calculateDayScore = (day: DayPlan): number => {
    const scores = Object.values(day.preferences).map(p =>
      PREFERENCE_CONFIG[p.preference_level].score
    );
    return scores.reduce((sum, score) => sum + Math.abs(score), 0);
  };

  const savePlan = async () => {
    for (const day of days) {
      if (day.assignment) {
        await supabase.from('care_assignments').upsert(day.assignment, { onConflict: 'date' });
      }
    }

    await loadMonthData();
    onUpdate();
  };

  const resetPlan = () => {
    const resetDays = days.map(d => ({
      ...d,
      assignment: originalAssignments.get(d.date)
    }));
    setDays(resetDays);
    setHasUnsavedChanges(false);
  };

  const getISODayOfWeek = (date: Date) => {
    const day = date.getDay();
    return (day + 6) % 7;
  };

  const isCurrentMonth = (date: string) => {
    const d = new Date(date);
    return d.getMonth() === currentMonth.getMonth();
  };

  const previousMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1));
    setMode('view');
    setSelectedDays(new Set());
  };

  const nextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1));
    setMode('view');
    setSelectedDays(new Set());
  };

  const getPreferenceIcon = (level: PreferenceLevel) => {
    const config = PREFERENCE_CONFIG[level];
    const Icon = config.icon;
    return <Icon className="w-3 h-3" />;
  };

  return (
    <>
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

      <div>
      <div className="mb-4 sm:mb-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4 sm:mb-6">
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={previousMonth}
              className="w-8 h-8 sm:w-10 sm:h-10 rounded-full hover:bg-slate-100 flex items-center justify-center transition flex-shrink-0"
            >
              <ChevronLeft className="w-5 h-5 text-slate-600" />
            </button>
            <h2 className="text-lg sm:text-2xl font-semibold text-slate-900">
              {currentMonth.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })}
            </h2>
            <button
              onClick={nextMonth}
              className="w-8 h-8 sm:w-10 sm:h-10 rounded-full hover:bg-slate-100 flex items-center justify-center transition flex-shrink-0"
            >
              <ChevronRight className="w-5 h-5 text-slate-600" />
            </button>
          </div>

          {mode === 'view' && (
            <button
              onClick={generateSmartPlan}
              className="px-4 sm:px-6 py-2 sm:py-3 bg-blue-500 text-white rounded-xl font-medium hover:bg-blue-600 transition shadow-sm text-sm sm:text-base"
            >
              <Sparkles className="w-4 h-4 inline mr-2" />
              Monat planen
            </button>
          )}
        </div>

        {mode === 'view' && (
          <>
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 mb-3">
              <button
                onClick={() => setMode('preferences')}
                className="flex-1 px-3 sm:px-4 py-2 sm:py-3 surface border-2 border-slate-200 rounded-xl font-medium text-slate-700 hover:border-slate-300 transition text-sm sm:text-base"
              >
                <Heart className="w-4 h-4 inline mr-2 text-pink-500" />
                Wünsche markieren
              </button>
              <button
                onClick={() => setShowAbsenceModal(true)}
                className="flex-1 px-3 sm:px-4 py-2 sm:py-3 surface border-2 border-slate-200 rounded-xl font-medium text-slate-700 hover:border-slate-300 transition text-sm sm:text-base"
              >
                <UserX className="w-4 h-4 inline mr-2 text-orange-500" />
                Abwesenheit eintragen
              </button>
              <button
                onClick={() => setMode('assign')}
                className="flex-1 px-3 sm:px-4 py-2 sm:py-3 surface border-2 border-slate-200 rounded-xl font-medium text-slate-700 hover:border-slate-300 transition text-sm sm:text-base"
              >
                Manuell zuweisen
              </button>
            </div>
            <div className="bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200 rounded-xl p-3 sm:p-4">
              <div className="flex items-center gap-2 mb-2">
                <Zap className="w-4 h-4 text-purple-600" />
                <span className="text-sm font-semibold text-slate-700">Schnellaktionen</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={copyPreferencesFromLastMonth}
                  className="px-3 py-1.5 surface border border-purple-200 rounded-lg text-xs font-medium text-slate-700 hover:bg-purple-50 transition flex items-center gap-1.5"
                >
                  <Copy className="w-3 h-3" />
                  Wünsche vom Vormonat kopieren
                </button>
              </div>
            </div>
          </>
        )}

        {hasUnsavedChanges && mode === 'view' && (
          <div className="mt-3 sm:mt-4 flex flex-col sm:flex-row gap-2 sm:gap-3">
            <button
              onClick={savePlan}
              className="flex-1 px-4 sm:px-6 py-2 sm:py-3 bg-green-500 text-white rounded-xl font-medium hover:bg-green-600 transition text-sm sm:text-base"
            >
              <Save className="w-4 h-4 inline mr-2" />
              Änderungen speichern
            </button>
            <button
              onClick={resetPlan}
              className="px-4 sm:px-6 py-2 sm:py-3 bg-slate-100 text-slate-700 rounded-xl font-medium hover:bg-slate-200 transition text-sm sm:text-base"
            >
              <RotateCcw className="w-4 h-4 inline mr-2" />
              Verwerfen
            </button>
          </div>
        )}
      </div>

      {mode === 'preferences' && (
        <div className="mb-4 sm:mb-6 bg-gradient-to-r from-pink-50 to-purple-50 border-2 border-pink-200 rounded-2xl p-4 sm:p-6 shadow-sm">
          <div className="mb-3 sm:mb-4">
            <h3 className="text-base sm:text-lg font-semibold text-slate-900 mb-1">Wünsche markieren</h3>
            <p className="text-xs sm:text-sm text-slate-600">Wähle ein Gefühl und klicke auf die Tage</p>
          </div>

          <div className="mb-3 sm:mb-4">
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="w-4 h-4 text-purple-600" />
              <span className="text-sm font-semibold text-slate-700">Schnellauswahl</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => selectPattern('weekends')}
                className="px-3 py-1.5 surface border border-purple-200 rounded-lg text-xs font-medium text-slate-700 hover:bg-purple-50 transition"
              >
                Wochenenden
              </button>
              <button
                onClick={() => selectPattern('weekdays')}
                className="px-3 py-1.5 surface border border-purple-200 rounded-lg text-xs font-medium text-slate-700 hover:bg-purple-50 transition"
              >
                Werktage
              </button>
              <button
                onClick={() => selectPattern('mondays')}
                className="px-3 py-1.5 surface border border-purple-200 rounded-lg text-xs font-medium text-slate-700 hover:bg-purple-50 transition"
              >
                Montage
              </button>
              <button
                onClick={() => selectPattern('fridays')}
                className="px-3 py-1.5 surface border border-purple-200 rounded-lg text-xs font-medium text-slate-700 hover:bg-purple-50 transition"
              >
                Freitage
              </button>
              <button
                onClick={() => setSelectedDays(new Set())}
                className="px-3 py-1.5 surface border border-slate-200 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-100 transition"
              >
                Auswahl löschen
              </button>
            </div>
          </div>

          <div className="flex gap-1.5 sm:gap-2 mb-3 sm:mb-4 flex-wrap">
            {(Object.entries(PREFERENCE_CONFIG) as [PreferenceLevel, typeof PREFERENCE_CONFIG[PreferenceLevel]][]).map(([level, config]) => {
              const Icon = config.icon;
              return (
                <button
                  key={level}
                  onClick={() => setSelectedPreference(level)}
                  className={`px-2 sm:px-4 py-2 sm:py-3 rounded-xl font-medium text-xs sm:text-sm transition shadow-sm ${
                    selectedPreference === level
                      ? config.color.replace('text-', 'bg-').replace('bg-bg-', 'bg-').replace('-100', '-500') + ' text-white scale-105'
                      : 'surface border-2 border-slate-200 text-slate-700 hover:border-slate-300'
                  }`}
                >
                  <Icon className="w-3 h-3 sm:w-4 sm:h-4 inline mr-1 sm:mr-2" />
                  <span className="hidden sm:inline">{config.label}</span>
                </button>
              );
            })}
          </div>

          {selectedDays.size > 0 && (
            <div className="mb-3 sm:mb-4">
              <button
                onClick={() => setShowReasonInput(!showReasonInput)}
                className="text-sm text-purple-600 hover:text-purple-700 font-medium mb-2"
              >
                {showReasonInput ? '- Grund ausblenden' : '+ Grund hinzufügen (optional)'}
              </button>
              {showReasonInput && (
                <input
                  type="text"
                  value={preferenceReason}
                  onChange={(e) => setPreferenceReason(e.target.value)}
                  placeholder="z.B. Geburtstag, Termin, etc."
                  className="w-full px-4 py-2 border-2 border-purple-200 rounded-xl focus:border-purple-400 focus:outline-none text-sm"
                />
              )}
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
            <button
              onClick={handleSavePreferences}
              disabled={selectedDays.size === 0}
              className="flex-1 px-4 sm:px-6 py-2 sm:py-3 bg-pink-500 text-white rounded-xl font-medium hover:bg-pink-600 transition disabled:opacity-50 disabled:cursor-not-allowed shadow-sm text-sm sm:text-base"
            >
              <Check className="w-4 h-4 inline mr-2" />
              {selectedDays.size > 0 ? `${selectedDays.size} Tage speichern` : 'Speichern'}
            </button>
            <button
              onClick={() => {
                setMode('view');
                setSelectedDays(new Set());
                setPreferenceReason('');
                setShowReasonInput(false);
              }}
              className="px-4 sm:px-6 py-2 sm:py-3 surface border-2 border-slate-200 text-slate-700 rounded-xl font-medium hover:border-slate-300 transition text-sm sm:text-base"
            >
              Abbrechen
            </button>
          </div>
        </div>
      )}

      {mode === 'assign' && (
        <div className="mb-4 sm:mb-6 bg-gradient-to-r from-blue-50 to-cyan-50 border-2 border-blue-200 rounded-2xl p-4 sm:p-6 shadow-sm">
          <div className="mb-3 sm:mb-4">
            <h3 className="text-base sm:text-lg font-semibold text-slate-900 mb-1">Tage zuweisen</h3>
            <p className="text-xs sm:text-sm text-slate-600">Wähle eine Person und markiere die Tage</p>
          </div>
          <div className="flex gap-2 sm:gap-3 mb-3 sm:mb-4">
            {profiles.map(profile => (
              <button
                key={profile.id}
                onClick={() => setSelectedCaretaker(profile.id)}
                className={`flex-1 px-4 sm:px-6 py-3 sm:py-4 rounded-xl font-medium transition shadow-sm text-sm sm:text-base ${
                  selectedCaretaker === profile.id
                    ? profile.color === 'blue'
                      ? 'bg-blue-500 text-white scale-105'
                      : 'bg-green-500 text-white scale-105'
                    : 'surface border-2 border-slate-200 text-slate-700 hover:border-slate-300'
                }`}
              >
                {profile.name}
              </button>
            ))}
          </div>
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
            <button
              onClick={handleAssignDays}
              disabled={selectedDays.size === 0 || !selectedCaretaker}
              className="flex-1 px-4 sm:px-6 py-2 sm:py-3 bg-blue-500 text-white rounded-xl font-medium hover:bg-blue-600 transition disabled:opacity-50 disabled:cursor-not-allowed shadow-sm text-sm sm:text-base"
            >
              <Check className="w-4 h-4 inline mr-2" />
              {selectedDays.size > 0 ? `${selectedDays.size} Tage zuweisen` : 'Zuweisen'}
            </button>
            <button
              onClick={() => {
                setMode('view');
                setSelectedDays(new Set());
                setSelectedCaretaker(null);
              }}
              className="px-4 sm:px-6 py-2 sm:py-3 surface border-2 border-slate-200 text-slate-700 rounded-xl font-medium hover:border-slate-300 transition text-sm sm:text-base"
            >
              Abbrechen
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-7 gap-1 sm:gap-3">
        {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map(day => (
          <div key={day} className="text-center text-xs sm:text-sm font-semibold text-slate-500 py-2 sm:py-3">
            {day}
          </div>
        ))}

        {days.map(({ date, assignment, preferences, hasConflict, absences }) => {
          const caretaker = assignment ? profiles.find(p => p.id === assignment.caretaker_id) : null;
          const isSelected = selectedDays.has(date);
          const myPref = preferences[currentProfile.id];
          const otherProfile = profiles.find(p => p.id !== currentProfile.id);
          const otherPref = otherProfile ? preferences[otherProfile.id] : null;
          const isWeekend = new Date(date).getDay() === 0 || new Date(date).getDay() === 6;

          return (
            <div
              key={date}
              onClick={() => handleDayClick(date)}
              className={`
                min-h-16 sm:min-h-28 p-1.5 sm:p-3 rounded-lg sm:rounded-2xl transition cursor-pointer relative group
                ${!isCurrentMonth(date) ? 'opacity-30' : ''}
                ${isSelected ? 'ring-2 sm:ring-4 ring-blue-400 shadow-lg scale-105' : 'shadow-sm hover:shadow-md'}
                ${caretaker?.color === 'blue' && !isSelected ? 'bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200' : ''}
                ${caretaker?.color === 'green' && !isSelected ? 'bg-gradient-to-br from-green-50 to-green-100 border border-green-200' : ''}
                ${!caretaker && !isSelected ? 'surface border border-slate-200' : ''}
                ${hasConflict && !caretaker ? 'border-2 border-red-300 bg-red-50' : ''}
                ${isWeekend && !caretaker && !isSelected ? 'bg-slate-50' : ''}
              `}
            >
              <div className="flex items-center justify-between mb-1 sm:mb-2">
                <span className={`text-xs sm:text-base font-semibold ${
                  caretaker ? 'text-slate-700' : 'text-slate-500'
                }`}>
                  {new Date(date).getDate()}
                </span>
                {caretaker && mode === 'view' && (
                  <button
                    onClick={(e) => handleDeleteAssignment(date, e)}
                    className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-red-500 text-white hover:bg-red-600 transition flex items-center justify-center opacity-0 group-hover:opacity-100 shadow-sm flex-shrink-0"
                  >
                    <X className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                  </button>
                )}
                {!caretaker && hasConflict && (
                  <AlertCircle className="w-4 h-4 sm:w-5 sm:h-5 text-red-500 flex-shrink-0" />
                )}
              </div>

              {caretaker && (
                <div className={`text-xs sm:text-sm font-bold mb-1 sm:mb-2 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg shadow-sm ${
                  caretaker.color === 'blue' ? 'bg-blue-500 text-white' : 'bg-green-500 text-white'
                }`}>
                  {caretaker.name}
                </div>
              )}

              <div className="space-y-0.5 sm:space-y-1.5">
                {absences.length > 0 && (
                  <div>
                    {absences.map(absence => {
                      const user = profiles.find(p => p.id === absence.user_id);
                      return (
                        <div key={absence.id} className="text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 sm:py-1 rounded bg-orange-100 text-orange-700 flex items-center gap-1 mb-0.5 sm:mb-1 font-medium">
                          <UserX className="w-2.5 h-2.5 sm:w-3 sm:h-3 flex-shrink-0" />
                          <span className="truncate">{user?.name}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
                {myPref && (
                  <div className={`text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 sm:py-1 rounded flex items-center justify-between gap-1 ${PREFERENCE_CONFIG[myPref.preference_level].color}`}>
                    <div className="flex items-center gap-1 min-w-0">
                      <span className="hidden sm:inline flex-shrink-0">{getPreferenceIcon(myPref.preference_level)}</span>
                      <span className="font-medium truncate">{currentProfile.name}</span>
                    </div>
                    {mode === 'view' && (
                      <button
                        onClick={(e) => handleDeletePreference(date, e)}
                        className="opacity-0 group-hover:opacity-100 hover:scale-110 transition flex-shrink-0"
                      >
                        <X className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                      </button>
                    )}
                  </div>
                )}
                {otherPref && (
                  <div className={`text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 sm:py-1 rounded flex items-center gap-1 min-w-0 ${PREFERENCE_CONFIG[otherPref.preference_level].color}`}>
                    <span className="hidden sm:inline flex-shrink-0">{getPreferenceIcon(otherPref.preference_level)}</span>
                    <span className="font-medium truncate">{otherProfile?.name}</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-8 flex items-center justify-center gap-6 text-sm">
        {(Object.entries(PREFERENCE_CONFIG) as [PreferenceLevel, typeof PREFERENCE_CONFIG[PreferenceLevel]][]).map(([level, config]) => {
          const Icon = config.icon;
          return (
            <div key={level} className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${config.color} shadow-sm`}>
                <Icon className="w-4 h-4" />
              </div>
              <span className="font-medium text-slate-700">{config.label}</span>
            </div>
          );
        })}
      </div>
      </div>
    </>
  );
}
