import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Profile, CareAssignment, Handover, Request } from '../lib/database.types';
import {
  PawPrint,
  Calendar,
  ArrowRightLeft,
  Bell,
  LogOut,
  BookOpen,
  TrendingUp,
  MessageSquare,
  Settings,
  Sparkles,
  ChevronRight,
  Heart,
  DollarSign,
  AlertCircle,
  CalendarPlus,
  Send,
  Users,
  Clock,
  Target
} from 'lucide-react';
import { CalendarView } from './CalendarView';
import { WeekView } from './WeekView';
import { RequestsPanel } from './RequestsPanel';
import { LogBook } from './LogBook';
import { NotificationsPanel } from './NotificationsPanel';
import { ProfileSettings } from './ProfileSettings';
import { ExpenseTracker } from './ExpenseTracker';
import { StatCard } from './ui/StatCard';
import { LoadingState } from './ui/LoadingSpinner';
import { useToast } from '../hooks/useToast';
import { Toast } from './ui/Toast';

interface DashboardProps {
  currentProfile: Profile;
  onSwitchProfile: () => void;
}

export function EnhancedDashboard({ currentProfile, onSwitchProfile }: DashboardProps) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [todayAssignment, setTodayAssignment] = useState<CareAssignment | null>(null);
  const [nextHandover, setNextHandover] = useState<Handover | null>(null);
  const [pendingRequests, setPendingRequests] = useState<Request[]>([]);
  const [unplannedDays, setUnplannedDays] = useState<number>(0);
  const [activeView, setActiveView] = useState<'calendar' | 'requests' | 'expenses' | 'logbook' | 'notifications'>('calendar');
  const [calendarMode, setCalendarMode] = useState<'month' | 'week'>('month');
  const [careStats, setCareStats] = useState({ martin: 0, lisa: 0, fairness: 100, preferenceScore: 0 });
  const [showProfileSettings, setShowProfileSettings] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedHandoverDate, setSelectedHandoverDate] = useState<string | null>(null);
  const [unreadMessagesCount, setUnreadMessagesCount] = useState(0);
  const [newLogbookCount, setNewLogbookCount] = useState(0);
  const toast = useToast();

  useEffect(() => {
    loadDashboardData();
  }, []);

  useEffect(() => {
    if (profiles.length > 0) {
      calculateCareStats();
    }
  }, [profiles]);

  const loadDashboardData = async () => {
    setIsLoading(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const now = new Date();
      const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

      const [profilesRes, todayRes, requestsRes, todayHandoverRes] = await Promise.all([
        supabase.from('profiles').select('*'),
        supabase.from('care_assignments').select('*').eq('date', today).maybeSingle(),
        supabase.from('requests').select('*').eq('status', 'pending'),
        supabase.from('handovers').select('*').eq('date', today).maybeSingle(),
      ]);

      if (profilesRes.data) setProfiles(profilesRes.data);

      if (todayHandoverRes.data && todayHandoverRes.data.time && currentTime >= todayHandoverRes.data.time) {
        if (todayRes.data) {
          const handover = todayHandoverRes.data;
          const otherProfile = profilesRes.data?.find(p => p.id !== todayRes.data.caretaker_id);

          if (otherProfile) {
            const updatedAssignment = { ...todayRes.data, caretaker_id: otherProfile.id };
            setTodayAssignment(updatedAssignment);
          } else {
            setTodayAssignment(todayRes.data);
          }
        } else {
          setTodayAssignment(null);
        }
      } else {
        if (todayRes.data) setTodayAssignment(todayRes.data);
      }

      if (requestsRes.data) setPendingRequests(requestsRes.data);

      const { data: allHandovers } = await supabase
        .from('handovers')
        .select('*')
        .gte('date', today)
        .order('date', { ascending: true })
        .order('time', { ascending: true });

      let nextHandoverData = null;
      if (allHandovers && allHandovers.length > 0) {
        for (const handover of allHandovers) {
          if (handover.date > today) {
            nextHandoverData = handover;
            break;
          }
          if (handover.date === today && handover.time && handover.time > currentTime) {
            nextHandoverData = handover;
            break;
          }
        }
        if (!nextHandoverData) {
          nextHandoverData = allHandovers.find(h => h.date > today) || null;
        }
      }

      setNextHandover(nextHandoverData);

      const next14Days = Array.from({ length: 14 }, (_, i) => {
        const date = new Date();
        date.setDate(date.getDate() + i);
        return date.toISOString().split('T')[0];
      });

      const { data: assignments } = await supabase
        .from('care_assignments')
        .select('date')
        .in('date', next14Days);

      const assignedDates = new Set(assignments?.map(a => a.date) || []);
      setUnplannedDays(next14Days.filter(d => !assignedDates.has(d)).length);

      const { data: unreadMessages } = await supabase
        .from('messages')
        .select('id')
        .eq('read', false);
      setUnreadMessagesCount(unreadMessages?.length || 0);

      const oneDayAgo = new Date();
      oneDayAgo.setDate(oneDayAgo.getDate() - 1);
      const { data: recentLogbook } = await supabase
        .from('logbook_entries')
        .select('id')
        .gte('created_at', oneDayAgo.toISOString());
      setNewLogbookCount(recentLogbook?.length || 0);
    } catch (error) {
      toast.error('Fehler beim Laden der Daten');
    } finally {
      setIsLoading(false);
    }
  };

  const calculateCareStats = async (monthDate?: Date) => {
    const targetDate = monthDate || new Date();
    const startOfMonth = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1);
    const endOfMonth = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0);

    const { data: assignments } = await supabase
      .from('care_assignments')
      .select('caretaker_id, date')
      .gte('date', startOfMonth.toISOString().split('T')[0])
      .lte('date', endOfMonth.toISOString().split('T')[0]);

    if (!assignments || assignments.length === 0) {
      setCareStats({ martin: 0, lisa: 0, fairness: 100, preferenceScore: 0 });
      return;
    }

    const martinProfile = profiles.find(p => p.name === 'Martin');
    const lisaProfile = profiles.find(p => p.name === 'Lisa');

    const martinDays = assignments.filter(a => a.caretaker_id === martinProfile?.id).length;
    const lisaDays = assignments.filter(a => a.caretaker_id === lisaProfile?.id).length;

    const total = martinDays + lisaDays;
    const fairness = total > 0
      ? Math.round(100 - (Math.abs(martinDays - lisaDays) / total) * 100)
      : 100;

    const { data: preferences } = await supabase
      .from('care_day_preferences')
      .select('date, preference_level')
      .in('date', assignments.map(a => a.date));

    let preferenceMatches = 0;
    if (preferences && preferences.length > 0) {
      assignments.forEach(assignment => {
        const pref = preferences.find(p => p.date === assignment.date);
        if (pref && (pref.preference_level === 'very_happy' || pref.preference_level === 'nice')) {
          preferenceMatches++;
        }
      });
      const preferenceScore = Math.round((preferenceMatches / total) * 100);
      setCareStats({ martin: martinDays, lisa: lisaDays, fairness, preferenceScore });
    } else {
      setCareStats({ martin: martinDays, lisa: lisaDays, fairness, preferenceScore: 0 });
    }
  };

  const getProfileById = (id: string) => profiles.find(p => p.id === id);
  const todayCaretaker = todayAssignment ? getProfileById(todayAssignment.caretaker_id) : null;
  const otherProfile = profiles.find(p => p.id !== currentProfile?.id);

  const navItems = [
    { id: 'calendar', label: 'Kalender', icon: Calendar },
    { id: 'requests', label: 'Anfragen', icon: Bell, badge: pendingRequests.length },
    { id: 'expenses', label: 'Ausgaben', icon: DollarSign },
    { id: 'logbook', label: 'Logbuch', icon: BookOpen, badge: newLogbookCount },
    { id: 'notifications', label: 'Nachrichten', icon: MessageSquare, badge: unreadMessagesCount },
  ] as const;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-cyan-50/30 flex items-center justify-center">
        <LoadingState message="Lade Dashboard..." />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-cyan-50/30">
      <header className="glass-effect sticky top-0 z-40 border-b border-slate-200/50">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-3 sm:py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="w-10 h-10 sm:w-14 sm:h-14 gradient-primary rounded-xl sm:rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/30">
                <PawPrint className="w-5 h-5 sm:w-7 sm:h-7 text-white" />
              </div>
              <div>
                <h1 className="text-lg sm:text-2xl font-bold bg-gradient-to-r from-slate-900 to-slate-700 dark:from-slate-100 dark:to-slate-300 bg-clip-text text-transparent">
                  KajaCare
                </h1>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 font-medium">
                  Willkommen, {currentProfile?.name}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              <button
                onClick={() => setShowProfileSettings(true)}
                className="p-2 sm:p-3 hover:bg-slate-100 rounded-lg sm:rounded-xl transition-all duration-200 group"
                title="Einstellungen"
              >
                <Settings className="w-5 h-5 text-slate-600 group-hover:text-slate-900 group-hover:rotate-90 transition-all duration-300" />
              </button>
              <button
                onClick={onSwitchProfile}
                className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 bg-slate-100 hover:bg-slate-200 rounded-lg sm:rounded-xl transition-all duration-200 font-medium text-slate-700 text-sm sm:text-base"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Wechseln</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-4 sm:mb-6">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-5 hover:shadow-md transition-shadow">
            <div className="flex items-center gap-2.5 sm:gap-3 mb-2">
              <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center ${
                todayCaretaker?.color === 'blue' ? 'bg-blue-100' :
                todayCaretaker?.color === 'green' ? 'bg-green-100' : 'bg-slate-100'
              }`}>
                <Users className={`w-5 h-5 ${
                  todayCaretaker?.color === 'blue' ? 'text-blue-600' :
                  todayCaretaker?.color === 'green' ? 'text-green-600' : 'text-slate-600'
                }`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-slate-500 uppercase font-medium tracking-wide">Kaja ist heute bei</p>
                <p className="text-lg sm:text-xl font-bold text-slate-900 truncate">
                  {todayCaretaker?.name || 'Ungeplant'}
                </p>
              </div>
            </div>
          </div>

          <button
            onClick={() => {
              if (nextHandover) {
                setActiveView('calendar');
                setCalendarMode('month');
                setSelectedHandoverDate(nextHandover.date);
              }
            }}
            disabled={!nextHandover}
            className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-5 hover:shadow-md transition-all text-left disabled:cursor-default disabled:hover:shadow-sm"
          >
            <div className="flex items-center gap-2.5 sm:gap-3 mb-2">
              <div className="w-9 h-9 sm:w-10 sm:h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                <ArrowRightLeft className="w-4.5 h-4.5 sm:w-5 sm:h-5 text-orange-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-slate-500 uppercase font-medium tracking-wide">Nächste Übergabe</p>
                <p className="text-lg sm:text-xl font-bold text-slate-900">
                  {nextHandover ? new Date(nextHandover.date).toLocaleDateString('de-DE', {
                    day: 'numeric',
                    month: 'short'
                  }) : 'Keine'}
                </p>
              </div>
            </div>
            {nextHandover && nextHandover.time && (
              <div className="flex items-center gap-1.5 text-xs text-slate-600 mt-1">
                <Clock className="w-3.5 h-3.5" />
                <span>{nextHandover.time} Uhr</span>
              </div>
            )}
          </button>

          <button
            onClick={() => setActiveView('requests')}
            className={`bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-5 text-left hover:shadow-md transition-all ${
              pendingRequests.length > 0 ? 'ring-2 ring-yellow-400' : ''
            }`}
          >
            <div className="flex items-center gap-2.5 sm:gap-3 mb-2">
              <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center ${
                pendingRequests.length > 0 ? 'bg-yellow-100' : 'bg-green-100'
              }`}>
                <Bell className={`w-4.5 h-4.5 sm:w-5 sm:h-5 ${
                  pendingRequests.length > 0 ? 'text-yellow-600' : 'text-green-600'
                }`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-slate-500 uppercase font-medium tracking-wide">Offene Anfragen</p>
                <p className="text-lg sm:text-xl font-bold text-slate-900">
                  {pendingRequests.length}
                </p>
              </div>
            </div>
            {pendingRequests.length > 0 && (
              <p className="text-xs text-yellow-700 font-medium">Benötigt Antwort</p>
            )}
          </button>

          <button
            onClick={() => setActiveView('calendar')}
            className={`bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-5 text-left hover:shadow-md transition-all ${
              unplannedDays > 5 ? 'ring-2 ring-red-400' : ''
            }`}
          >
            <div className="flex items-center gap-2.5 sm:gap-3 mb-2">
              <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center ${
                unplannedDays > 5 ? 'bg-red-100' :
                unplannedDays > 0 ? 'bg-orange-100' : 'bg-green-100'
              }`}>
                <AlertCircle className={`w-4.5 h-4.5 sm:w-5 sm:h-5 ${
                  unplannedDays > 5 ? 'text-red-600' :
                  unplannedDays > 0 ? 'text-orange-600' : 'text-green-600'
                }`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-slate-500 uppercase font-medium tracking-wide">Ungeplante Tage</p>
                <p className="text-lg sm:text-xl font-bold text-slate-900">
                  {unplannedDays}
                </p>
              </div>
            </div>
            <p className="text-xs text-slate-600">Nächste 2 Wochen</p>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mb-4 sm:mb-6">
          <button
            onClick={() => setActiveView('calendar')}
            className="bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-xl p-3.5 sm:p-4 hover:shadow-lg transition-all text-left group"
          >
            <div className="flex items-center gap-2.5 sm:gap-3">
              <div className="w-9 h-9 sm:w-10 sm:h-10 bg-white/20 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform">
                <CalendarPlus className="w-4.5 h-4.5 sm:w-5 sm:h-5" />
              </div>
              <div>
                <p className="font-semibold text-sm sm:text-base">Tage planen</p>
                <p className="text-xs text-blue-100">Kalender öffnen</p>
              </div>
            </div>
          </button>

          <button
            onClick={() => setActiveView('notifications')}
            className="bg-gradient-to-br from-emerald-500 to-emerald-600 text-white rounded-xl p-3.5 sm:p-4 hover:shadow-lg transition-all text-left group relative"
          >
            <div className="flex items-center gap-2.5 sm:gap-3">
              <div className="w-9 h-9 sm:w-10 sm:h-10 bg-white/20 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform">
                <Send className="w-4.5 h-4.5 sm:w-5 sm:h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm sm:text-base">Nachricht senden</p>
                <p className="text-xs text-emerald-100 truncate">An {otherProfile?.name}</p>
              </div>
            </div>
            {unreadMessagesCount > 0 && (
              <div className="absolute top-2 right-2 w-5 h-5 sm:w-6 sm:h-6 bg-orange-500 text-white text-xs rounded-full flex items-center justify-center font-bold shadow-lg">
                {unreadMessagesCount}
              </div>
            )}
          </button>

          <button
            onClick={() => setActiveView('logbook')}
            className="bg-gradient-to-br from-slate-600 to-slate-700 text-white rounded-xl p-3.5 sm:p-4 hover:shadow-lg transition-all text-left group relative"
          >
            <div className="flex items-center gap-2.5 sm:gap-3">
              <div className="w-9 h-9 sm:w-10 sm:h-10 bg-white/20 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform">
                <BookOpen className="w-4.5 h-4.5 sm:w-5 sm:h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm sm:text-base">Eintrag hinzufügen</p>
                <p className="text-xs text-slate-200">Ins Logbuch</p>
              </div>
            </div>
            {newLogbookCount > 0 && (
              <div className="absolute top-2 right-2 w-5 h-5 sm:w-6 sm:h-6 bg-orange-500 text-white text-xs rounded-full flex items-center justify-center font-bold shadow-lg">
                {newLogbookCount}
              </div>
            )}
          </button>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-5 mb-4 sm:mb-6 fade-in">
          <div className="flex items-center justify-between flex-wrap gap-3 sm:gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-500 font-medium">Dieser Monat:</span>
              <div className="flex items-center gap-4 ml-2">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                  <span className="text-sm font-medium text-slate-700">Martin</span>
                  <span className="text-lg font-bold text-slate-900">{careStats.martin}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-green-500"></div>
                  <span className="text-sm font-medium text-slate-700">Lisa</span>
                  <span className="text-lg font-bold text-slate-900">{careStats.lisa}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-5">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-slate-500" />
                <span className="text-sm text-slate-600">Fairness</span>
                <span className="text-base font-bold text-slate-900">{careStats.fairness}%</span>
              </div>
              <div className="flex items-center gap-2">
                <Target className="w-4 h-4 text-slate-500" />
                <span className="text-sm text-slate-600">Wünsche</span>
                <span className="text-base font-bold text-slate-900">{careStats.preferenceScore}%</span>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl sm:rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
          <div className="border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white">
            <div className="flex overflow-x-auto scrollbar-hide">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setActiveView(item.id as any)}
                  className={`relative flex-1 min-w-[80px] sm:min-w-[120px] px-3 sm:px-6 py-3 sm:py-4 font-semibold text-sm sm:text-base transition-all duration-200 ${
                    activeView === item.id
                      ? 'text-blue-600 bg-white'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-center gap-1.5 sm:gap-2">
                    <item.icon className="w-4.5 h-4.5 sm:w-5 sm:h-5 flex-shrink-0" />
                    <span className="hidden sm:inline truncate">{item.label}</span>
                    {item.badge !== undefined && item.badge > 0 && (
                      <span className="absolute top-1.5 sm:top-2 right-1.5 sm:right-2 w-4.5 h-4.5 sm:w-5 sm:h-5 bg-orange-500 text-white text-[10px] sm:text-xs rounded-full flex items-center justify-center font-bold shadow-lg">
                        {item.badge}
                      </span>
                    )}
                  </div>
                  {activeView === item.id && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 sm:h-1 gradient-primary"></div>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="p-3 sm:p-6">
            {activeView === 'calendar' && (
              <div className="fade-in">
                <div className="flex items-center justify-between mb-4 sm:mb-6 gap-2">
                  <h2 className="text-lg sm:text-xl font-bold text-slate-900">Kalenderansicht</h2>
                  <div className="inline-flex rounded-lg sm:rounded-xl border-2 border-slate-200 p-0.5 sm:p-1 bg-slate-50">
                    <button
                      onClick={() => setCalendarMode('month')}
                      className={`px-3 sm:px-6 py-1.5 sm:py-2 rounded-md sm:rounded-lg font-semibold text-sm sm:text-base transition-all duration-200 ${
                        calendarMode === 'month'
                          ? 'bg-white text-slate-900 shadow-md'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Monat
                    </button>
                    <button
                      onClick={() => setCalendarMode('week')}
                      className={`px-3 sm:px-6 py-1.5 sm:py-2 rounded-md sm:rounded-lg font-semibold text-sm sm:text-base transition-all duration-200 ${
                        calendarMode === 'week'
                          ? 'bg-white text-slate-900 shadow-md'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Woche
                    </button>
                  </div>
                </div>
                {calendarMode === 'month' ? (
                  <CalendarView
                    profiles={profiles}
                    currentProfile={currentProfile}
                    onUpdate={() => {
                      loadDashboardData();
                      calculateCareStats();
                      setSelectedHandoverDate(null);
                    }}
                    onMonthChange={(date) => calculateCareStats(date)}
                    initialDate={selectedHandoverDate || undefined}
                  />
                ) : (
                  <WeekView
                    profiles={profiles}
                    currentProfile={currentProfile}
                    onUpdate={() => {
                      loadDashboardData();
                      calculateCareStats();
                    }}
                  />
                )}
              </div>
            )}
            {activeView === 'requests' && (
              <RequestsPanel
                profiles={profiles}
                currentProfile={currentProfile}
                requests={pendingRequests}
                onUpdate={loadDashboardData}
              />
            )}
            {activeView === 'expenses' && (
              <ExpenseTracker
                profiles={profiles}
                currentProfile={currentProfile}
              />
            )}
            {activeView === 'logbook' && (
              <LogBook profiles={profiles} currentProfile={currentProfile} />
            )}
            {activeView === 'notifications' && (
              <NotificationsPanel
                profiles={profiles}
                currentProfile={currentProfile}
                onUpdate={loadDashboardData}
              />
            )}
          </div>
        </div>
      </main>

      {showProfileSettings && (
        <ProfileSettings
          profile={currentProfile}
          onClose={() => setShowProfileSettings(false)}
          onUpdate={() => {
            loadDashboardData();
            setShowProfileSettings(false);
          }}
        />
      )}

      <div className="fixed top-4 right-4 z-50 flex flex-col gap-3">
        {toast.toasts.map((t) => (
          <Toast key={t.id} type={t.type} message={t.message} onClose={() => toast.remove(t.id)} />
        ))}
      </div>
    </div>
  );
}
