import { useState, useEffect } from 'react';
import type { User } from '@supabase/supabase-js';
import { X, Brain, Calendar, TrendingUp, Zap, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface Profile {
  id: string;
  full_name: string;
  role: string;
}

interface SmartPlanningModalProps {
  profiles: Profile[];
  currentMonth: Date;
  onClose: () => void;
  onUpdate: (assignmentCount: number) => void;
}

interface PlanningOptions {
  respectPreferences: boolean;
  balanceWorkload: boolean;
  avoidConsecutiveDays: boolean;
  considerAbsences: boolean;
  prioritizeWishes: boolean;
  minDaysOff: number;
}

interface PreferenceData {
  profile_id: string;
  date: string;
  preference_level: 'very_happy' | 'nice' | 'neutral' | 'rather_not' | 'impossible';
}

interface AbsenceData {
  user_id: string;
  date: string;
  type: string;
}

export default function SmartPlanningModal({ profiles, currentMonth, onClose, onUpdate }: SmartPlanningModalProps) {
  const [options, setOptions] = useState<PlanningOptions>({
    respectPreferences: true,
    balanceWorkload: true,
    avoidConsecutiveDays: true,
    considerAbsences: true,
    prioritizeWishes: true,
    minDaysOff: 1,
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [preview, setPreview] = useState<{ date: string; profile: Profile; score: number }[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  useEffect(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    setStartDate(`${year}-${String(month + 1).padStart(2, '0')}-01`);
    const lastDay = new Date(year, month + 1, 0).getDate();
    setEndDate(`${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`);

    supabase.auth.getUser().then((res: { data: { user: User | null } }) => {
      const user: User | null = res.data.user;
      setCurrentUser(user);
    });
  }, [currentMonth]);

  const getDaysInRange = () => {
    if (!startDate || !endDate) return [];

    const start = new Date(startDate + 'T00:00:00');
    const end = new Date(endDate + 'T00:00:00');
    const days: Date[] = [];

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      days.push(new Date(d));
    }
    return days;
  };

  const calculatePlan = async () => {
    if (!startDate || !endDate) {
      alert('Bitte wähle einen Zeitraum aus');
      return;
    }

    setIsProcessing(true);
    try {
      const days = getDaysInRange();

      const { data: preferences, error: prefError } = await supabase
        .from('care_day_preferences')
        .select('*')
        .gte('date', startDate)
        .lte('date', endDate);

      if (prefError) {
        console.error('Error loading preferences:', prefError);
      }

      const { data: absences, error: absError } = await supabase
        .from('availability')
        .select('*')
        .eq('type', 'unavailable')
        .gte('date', startDate)
        .lte('date', endDate);

      if (absError) {
        console.error('Error loading absences:', absError);
      }

      const { data: existingAssignments, error: assignError } = await supabase
        .from('care_assignments')
        .select('*')
        .gte('date', startDate)
        .lte('date', endDate);

      if (assignError) {
        console.error('Error loading assignments:', assignError);
      }

      const plan: { date: string; profile: Profile; score: number }[] = [];
      const assignmentCount: Record<string, number> = {};
      profiles.forEach(p => assignmentCount[p.id] = 0);

      for (const day of days) {
        const dateStr = day.toISOString().split('T')[0];

        if ((existingAssignments as { date: string }[] | null)?.some((a) => a.date === dateStr)) {
          continue;
        }

        const dayPreferences = (preferences as PreferenceData[] || []).filter(p => p.date === dateStr);
        const scores: { profile: Profile; score: number }[] = [];

        for (const profile of profiles) {
          let score = 50;

          if (options.considerAbsences) {
            const isAbsent = (absences as AbsenceData[] || []).some(
              a => a.user_id === profile.id && a.date === dateStr
            );
            if (isAbsent) {
              score = -1000;
            }
          }

          if (options.respectPreferences && score > 0) {
            const pref = dayPreferences.find(p => p.profile_id === profile.id);
            if (pref) {
              switch (pref.preference_level) {
                case 'very_happy':
                  score += options.prioritizeWishes ? 100 : 50;
                  break;
                case 'nice':
                  score += 25;
                  break;
                case 'neutral':
                  score += 0;
                  break;
                case 'rather_not':
                  score -= 30;
                  break;
                case 'impossible':
                  score = -1000;
                  break;
              }
            }
          }

          if (options.balanceWorkload && score > 0) {
            const currentCount = assignmentCount[profile.id];
            const avgCount =
              Object.values(assignmentCount).reduce((a: number, b: number) => a + b, 0) / profiles.length;
            score -= (currentCount - avgCount) * 10;
          }

          if (options.avoidConsecutiveDays && score > 0) {
            const yesterday = new Date(day);
            yesterday.setDate(yesterday.getDate() - 1);
            const yesterdayStr = yesterday.toISOString().split('T')[0];

            const workedYesterday = plan.some((p) => p.date === yesterdayStr && p.profile.id === profile.id);
            if (workedYesterday) {
              score -= 40;
            }
          }

          scores.push({ profile, score });
        }

        scores.sort((a, b) => b.score - a.score);

        const bestMatch = scores[0];
        if (bestMatch && bestMatch.score > -500) {
          plan.push({ date: dateStr, profile: bestMatch.profile, score: bestMatch.score });
          assignmentCount[bestMatch.profile.id]++;
        }
      }

      setPreview(plan);
      setShowPreview(true);
    } catch (error) {
      console.error('Error calculating plan:', error);
      alert('Fehler beim Berechnen des Plans');
    } finally {
      setIsProcessing(false);
    }
  };

  const applyPlan = async () => {
    setIsProcessing(true);
    try {
      if (!currentUser) {
        throw new Error('Nicht angemeldet');
      }

      const { data: profileData } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', currentUser.id)
        .maybeSingle();

      const createdBy = profileData?.id || currentUser.id;

      const assignments = preview.map(p => ({
        date: p.date,
        caretaker_id: p.profile.id,
        status: 'planned' as const,
        preference_score: p.score,
        created_by: createdBy
      }));

      const { error } = await supabase
        .from('care_assignments')
        .insert(assignments);

      if (error) throw error;

      onUpdate(preview.length);
      onClose();
    } catch (error) {
      console.error('Error applying plan:', error);
      alert('Fehler beim Anwenden des Plans');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-2 sm:p-4">
      <div className="surface rounded-xl sm:rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col border border-slate-200 dark:border-slate-700">
        <div className="p-4 sm:p-6 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
                <Brain className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
              </div>
              <div>
                <h2 className="text-lg sm:text-2xl font-bold text-slate-900 dark:text-slate-100">Intelligente Planung</h2>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300">
                  {currentMonth.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition flex-shrink-0"
            >
              <X className="w-4 h-4 sm:w-5 sm:h-5 text-slate-600 dark:text-slate-200" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 sm:p-6">
          {!showPreview ? (
            <div className="space-y-4 sm:space-y-6">
              <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/40 rounded-xl p-3 sm:p-4 flex items-start gap-2 sm:gap-3">
                <AlertCircle className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-blue-900 dark:text-blue-100">
                  <p className="font-medium mb-1">Intelligente Planung</p>
                  <p className="text-blue-700 dark:text-blue-200/90">
                    Der Assistent berücksichtigt Präferenzen, Verfügbarkeiten und Abwesenheiten automatisch.
                    Konfiguriere die Optionen und klicke auf "Plan berechnen".
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-blue-500" />
                  Zeitraum
                </h3>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">Von</label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-full px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 surface text-slate-900 dark:text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">Bis</label>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="w-full px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 surface text-slate-900 dark:text-slate-100"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Zap className="w-5 h-5 text-amber-500" />
                  Planungsoptionen
                </h3>

                <label className="flex items-start gap-3 p-4 rounded-xl border-2 border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-slate-600 cursor-pointer transition surface">
                  <input
                    type="checkbox"
                    checked={options.respectPreferences}
                    onChange={(e) => setOptions({ ...options, respectPreferences: e.target.checked })}
                    className="mt-1 w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
                  />
                  <div className="flex-1">
                    <div className="font-medium text-slate-900 dark:text-slate-100">Präferenzen berücksichtigen</div>
                    <div className="text-sm text-slate-600 dark:text-slate-300">Wünsche und Verfügbarkeiten werden bei der Planung beachtet</div>
                  </div>
                </label>

                <label className="flex items-start gap-3 p-4 rounded-xl border-2 border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-slate-600 cursor-pointer transition surface">
                  <input
                    type="checkbox"
                    checked={options.prioritizeWishes}
                    onChange={(e) => setOptions({ ...options, prioritizeWishes: e.target.checked })}
                    className="mt-1 w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
                  />
                  <div className="flex-1">
                    <div className="font-medium text-slate-900 dark:text-slate-100">Wünsche priorisieren</div>
                    <div className="text-sm text-slate-600 dark:text-slate-300">Wünsche werden höher gewichtet als normale Verfügbarkeiten</div>
                  </div>
                </label>

                <label className="flex items-start gap-3 p-4 rounded-xl border-2 border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-slate-600 cursor-pointer transition surface">
                  <input
                    type="checkbox"
                    checked={options.balanceWorkload}
                    onChange={(e) => setOptions({ ...options, balanceWorkload: e.target.checked })}
                    className="mt-1 w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
                  />
                  <div className="flex-1">
                    <div className="font-medium text-slate-900 dark:text-slate-100">Arbeitsbelastung ausgleichen</div>
                    <div className="text-sm text-slate-600 dark:text-slate-300">Dienste werden gleichmäßig auf alle Mitarbeiter verteilt</div>
                  </div>
                </label>

                <label className="flex items-start gap-3 p-4 rounded-xl border-2 border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-slate-600 cursor-pointer transition surface">
                  <input
                    type="checkbox"
                    checked={options.avoidConsecutiveDays}
                    onChange={(e) => setOptions({ ...options, avoidConsecutiveDays: e.target.checked })}
                    className="mt-1 w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
                  />
                  <div className="flex-1">
                    <div className="font-medium text-slate-900 dark:text-slate-100">Aufeinanderfolgende Tage vermeiden</div>
                    <div className="text-sm text-slate-600 dark:text-slate-300">Vermeidet, dass Personen an aufeinanderfolgenden Tagen eingeteilt werden</div>
                  </div>
                </label>

                <label className="flex items-start gap-3 p-4 rounded-xl border-2 border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-slate-600 cursor-pointer transition surface">
                  <input
                    type="checkbox"
                    checked={options.considerAbsences}
                    onChange={(e) => setOptions({ ...options, considerAbsences: e.target.checked })}
                    className="mt-1 w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
                  />
                  <div className="flex-1">
                    <div className="font-medium text-slate-900 dark:text-slate-100">Abwesenheiten berücksichtigen</div>
                    <div className="text-sm text-slate-600 dark:text-slate-300">Personen werden während Abwesenheiten nicht eingeplant</div>
                  </div>
                </label>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900/40 rounded-xl p-4 flex items-start gap-3">
                <TrendingUp className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-green-900 dark:text-green-100">
                  <p className="font-medium mb-1">Plan wurde berechnet</p>
                  <p className="text-green-700 dark:text-green-200/90">
                    {preview.length} Tage wurden erfolgreich geplant. Überprüfe den Plan und klicke auf "Anwenden".
                  </p>
                </div>
              </div>

              <h3 className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-blue-600" />
                Vorschau der Planung
              </h3>

              <div className="space-y-2 max-h-96 overflow-y-auto">
                {preview.map((item, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-3 rounded-lg bg-slate-50 dark:bg-slate-950/30 border border-slate-200 dark:border-slate-700"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-950/30 flex items-center justify-center">
                        <Calendar className="w-5 h-5 text-blue-600" />
                      </div>
                      <div>
                        <div className="font-medium text-slate-900 dark:text-slate-100">
                          {new Date(item.date + 'T12:00:00').toLocaleDateString('de-DE', {
                            weekday: 'short',
                            day: 'numeric',
                            month: 'short'
                          })}
                        </div>
                        <div className="text-sm text-slate-600 dark:text-slate-300">{item.profile.full_name}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="text-xs text-slate-500 dark:text-slate-400">Score: {item.score}</div>
                      <div className={`w-2 h-2 rounded-full ${
                        item.score > 80 ? 'bg-green-500' :
                        item.score > 50 ? 'bg-blue-500' :
                        item.score > 20 ? 'bg-amber-500' : 'bg-red-500'
                      }`} />
                    </div>
                  </div>
                ))}
              </div>

              <button
                onClick={() => setShowPreview(false)}
                className="w-full py-2 px-4 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
              >
                Optionen ändern
              </button>
            </div>
          )}
        </div>

        <div className="p-6 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950/30">
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 py-3 px-4 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-100 font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition"
            >
              Abbrechen
            </button>
            {!showPreview ? (
              <button
                onClick={calculatePlan}
                disabled={isProcessing}
                className="flex-1 py-3 px-4 rounded-lg bg-gradient-to-r from-purple-600 to-blue-600 text-white font-medium hover:from-purple-700 hover:to-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isProcessing ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Berechne...
                  </>
                ) : (
                  <>
                    <Brain className="w-5 h-5" />
                    Plan berechnen
                  </>
                )}
              </button>
            ) : (
              <button
                onClick={applyPlan}
                disabled={isProcessing}
                className="flex-1 py-3 px-4 rounded-lg bg-gradient-to-r from-green-600 to-emerald-600 text-white font-medium hover:from-green-700 hover:to-emerald-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isProcessing ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Wende an...
                  </>
                ) : (
                  <>
                    <Calendar className="w-5 h-5" />
                    Plan anwenden
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
