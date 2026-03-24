import { useState, useEffect } from 'react';
import type { Profile, Handover, CareAssignment } from '../lib/database.types';
import {
  ArrowRightLeft,
  Clock,
  MapPin,
  Check,
  AlertCircle,
  Plus,
  X,
  Calendar,
  Trash2
} from 'lucide-react';

interface HandoverPanelProps {
  profiles: Profile[];
  currentProfile: Profile;
  onUpdate: () => void;
}

export function HandoverPanel({ profiles, currentProfile, onUpdate }: HandoverPanelProps) {
  const [handovers, setHandovers] = useState<Handover[]>([]);
  const [showNewHandover, setShowNewHandover] = useState(false);
  const [editingHandover, setEditingHandover] = useState<Handover | null>(null);
  const [formData, setFormData] = useState({
    date: '',
    time: '',
    location: '',
    transportType: '' as 'brings' | 'picks_up' | '',
    transportUserId: '',
    fromUserId: '',
    toUserId: '',
  });

  useEffect(() => {
    loadHandovers();
  }, []);

  const loadHandovers = async () => {
    try {
      const baseUrl = import.meta.env.VITE_SERVER_BASE_URL as string | undefined;
      const token = localStorage.getItem('authToken') || '';

      if (!baseUrl || !token) {
        console.error('Nicht authentifiziert');
        return;
      }

      const today = new Date().toISOString().split('T')[0];

      const response = await fetch(`${baseUrl}/api/handovers?from=${today}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const result = await response.json();

      if (response.ok && result.success) {
        setHandovers(result.handovers || []);
      }
    } catch (error) {
      console.error('Error loading handovers:', error);
    }
  };

  const detectHandovers = async () => {
    try {
      const baseUrl = import.meta.env.VITE_SERVER_BASE_URL as string | undefined;
      const token = localStorage.getItem('authToken') || '';

      if (!baseUrl || !token) {
        console.error('Nicht authentifiziert');
        return;
      }

      const today = new Date().toISOString().split('T')[0];
      const next60Days = Array.from({ length: 60 }, (_, i) => {
        const date = new Date();
        date.setDate(date.getDate() + i);
        return date.toISOString().split('T')[0];
      });

      const response = await fetch(`${baseUrl}/api/assignments?dates=${next60Days.join(',')}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const result = await response.json();

      if (!response.ok || !result.success || !result.assignments) {
        return;
      }

      const assignments = result.assignments;
      if (assignments.length < 2) return;

      const handoverDates: Set<string> = new Set();
      for (let i = 1; i < assignments.length; i++) {
        if (assignments[i].caretaker_id !== assignments[i - 1].caretaker_id) {
          if (assignments[i].date >= today) {
            handoverDates.add(assignments[i].date);
          }
        }
      }

      for (const date of handoverDates) {
        const assignment = assignments.find((a: any) => a.date === date);
        const prevAssignment = assignments.find(
          (a: any) => new Date(a.date) < new Date(date) && a.caretaker_id !== assignment?.caretaker_id
        );

        if (!assignment || !prevAssignment) continue;

        const existingHandover = handovers.find(h => h.date === date);
        if (existingHandover) continue;

        const newHandover = {
          date,
          from_user_id: prevAssignment.caretaker_id,
          to_user_id: assignment.caretaker_id,
          brings_user_id: null,
          picks_up_user_id: null,
          time: null,
          location: null,
          notes: 'Automatisch erkannt',
        };

        await handleCreateHandoverWithData(newHandover);
      }
    } catch (error) {
      console.error('Error detecting handovers:', error);
    }
  };

  const handleCreateHandover = async () => {
    if (!formData.date || !formData.fromUserId || !formData.toUserId) return;

    const insertData: any = {
      date: formData.date,
      from_user_id: formData.fromUserId,
      to_user_id: formData.toUserId,
      time: formData.time || null,
      location: formData.location || null,
    };

    if (formData.transportType === 'brings') {
      insertData.brings_user_id = formData.transportUserId || null;
    } else if (formData.transportType === 'picks_up') {
      insertData.picks_up_user_id = formData.transportUserId || null;
    }

    await supabase.from('handovers').insert(insertData);

    resetForm();
    await loadHandovers();
    onUpdate();
  };

  const handleUpdateHandover = async (handover: Handover) => {
    const updateData: any = {
      date: formData.date,
      time: formData.time || null,
      location: formData.location || null,
      confirmed_by_from: false,
      confirmed_by_to: false,
    };

    if (formData.transportType === 'brings') {
      updateData.brings_user_id = formData.transportUserId || null;
      updateData.picks_up_user_id = null;
    } else if (formData.transportType === 'picks_up') {
      updateData.picks_up_user_id = formData.transportUserId || null;
      updateData.brings_user_id = null;
    } else {
      updateData.brings_user_id = null;
      updateData.picks_up_user_id = null;
    }

    await supabase
      .from('handovers')
      .update(updateData)
      .eq('id', handover.id);

    resetForm();
    await loadHandovers();
    onUpdate();
  };

  const handleConfirm = async (handover: Handover) => {
    const updates: Partial<Handover> = {};

    if (currentProfile.id === handover.from_user_id) {
      updates.confirmed_by_from = true;
    } else if (currentProfile.id === handover.to_user_id) {
      updates.confirmed_by_to = true;
    }

    await supabase.from('handovers').update(updates).eq('id', handover.id);

    await loadHandovers();
    onUpdate();
  };

  const handleDeleteHandover = async (handoverId: string) => {
    await supabase.from('handovers').delete().eq('id', handoverId);

    await loadHandovers();
    onUpdate();
  };

  const resetForm = () => {
    setFormData({
      date: '',
      time: '',
      location: '',
      transportType: '',
      transportUserId: '',
      fromUserId: '',
      toUserId: '',
    });
    setShowNewHandover(false);
    setEditingHandover(null);
  };

  const startEdit = (handover: Handover) => {
    setEditingHandover(handover);

    let transportType: 'brings' | 'picks_up' | '' = '';
    let transportUserId = '';

    if (handover.brings_user_id) {
      transportType = 'brings';
      transportUserId = handover.brings_user_id;
    } else if (handover.picks_up_user_id) {
      transportType = 'picks_up';
      transportUserId = handover.picks_up_user_id;
    }

    setFormData({
      date: handover.date,
      time: handover.time || '',
      location: handover.location || '',
      transportType,
      transportUserId,
      fromUserId: handover.from_user_id,
      toUserId: handover.to_user_id,
    });
  };

  const getProfileById = (id: string) => profiles.find(p => p.id === id);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-bold text-slate-900">Übergaben</h3>
        <div className="flex gap-2">
          <button
            onClick={detectHandovers}
            className="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg font-medium hover:bg-slate-300 transition"
          >
            <ArrowRightLeft className="w-4 h-4 inline mr-2" />
            Übergaben erkennen
          </button>
          {!showNewHandover && !editingHandover && (
            <button
              onClick={() => setShowNewHandover(true)}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 transition"
            >
              <Plus className="w-4 h-4 inline mr-2" />
              Neue Übergabe
            </button>
          )}
        </div>
      </div>

      {(showNewHandover || editingHandover) && (
        <div className="bg-slate-50 rounded-xl p-6 mb-6">
          <h4 className="font-bold text-slate-900 mb-4">
            {editingHandover ? 'Übergabe bearbeiten' : 'Neue Übergabe'}
          </h4>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Datum
              </label>
              <input
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Uhrzeit (Optional)
              </label>
              <input
                type="time"
                value={formData.time}
                onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Ort (Optional)
            </label>
            <input
              type="text"
              value={formData.location}
              onChange={(e) => setFormData({ ...formData, location: e.target.value })}
              placeholder="z.B. Martin Haus"
              className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {!editingHandover && (
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Von (übergibt)
                </label>
                <select
                  value={formData.fromUserId}
                  onChange={(e) => setFormData({ ...formData, fromUserId: e.target.value })}
                  className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Wählen...</option>
                  {profiles.map(profile => (
                    <option key={profile.id} value={profile.id}>
                      {profile.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  An (übernimmt)
                </label>
                <select
                  value={formData.toUserId}
                  onChange={(e) => setFormData({ ...formData, toUserId: e.target.value })}
                  className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Wählen...</option>
                  {profiles.map(profile => (
                    <option key={profile.id} value={profile.id}>
                      {profile.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Transport
            </label>
            <div className="flex gap-4 mb-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="transportType"
                  value="brings"
                  checked={formData.transportType === 'brings'}
                  onChange={(e) => setFormData({ ...formData, transportType: 'brings', transportUserId: '' })}
                  className="w-4 h-4 text-blue-500"
                />
                <span className="text-slate-700">Jemand bringt Kaja</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="transportType"
                  value="picks_up"
                  checked={formData.transportType === 'picks_up'}
                  onChange={(e) => setFormData({ ...formData, transportType: 'picks_up', transportUserId: '' })}
                  className="w-4 h-4 text-blue-500"
                />
                <span className="text-slate-700">Jemand holt Kaja ab</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="transportType"
                  value=""
                  checked={formData.transportType === ''}
                  onChange={(e) => setFormData({ ...formData, transportType: '', transportUserId: '' })}
                  className="w-4 h-4 text-blue-500"
                />
                <span className="text-slate-700">Nicht festgelegt</span>
              </label>
            </div>

            {formData.transportType && (
              <select
                value={formData.transportUserId}
                onChange={(e) => setFormData({ ...formData, transportUserId: e.target.value })}
                className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">
                  {formData.transportType === 'brings' ? 'Wer bringt Kaja?' : 'Wer holt Kaja ab?'}
                </option>
                {profiles.map(profile => (
                  <option key={profile.id} value={profile.id}>
                    {profile.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => editingHandover ? handleUpdateHandover(editingHandover) : handleCreateHandover()}
              disabled={!formData.date || (!editingHandover && (!formData.fromUserId || !formData.toUserId))}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {editingHandover ? 'Aktualisieren' : 'Erstellen'}
            </button>
            <button
              onClick={resetForm}
              className="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg font-medium hover:bg-slate-300 transition"
            >
              Abbrechen
            </button>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {handovers.map(handover => {
          const fromProfile = getProfileById(handover.from_user_id);
          const toProfile = getProfileById(handover.to_user_id);
          const bringsProfile = handover.brings_user_id ? getProfileById(handover.brings_user_id) : null;
          const picksUpProfile = handover.picks_up_user_id ? getProfileById(handover.picks_up_user_id) : null;

          const needsConfirmation =
            (currentProfile.id === handover.from_user_id && !handover.confirmed_by_from) ||
            (currentProfile.id === handover.to_user_id && !handover.confirmed_by_to);

          const fullyConfirmed = handover.confirmed_by_from && handover.confirmed_by_to;

          return (
            <div
              key={handover.id}
              className={`p-5 rounded-xl border-2 transition group ${
                fullyConfirmed
                  ? 'bg-green-50 border-green-300'
                  : needsConfirmation
                  ? 'bg-yellow-50 border-yellow-300'
                  : 'bg-slate-50 border-slate-300'
              }`}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-3">
                    <Calendar className="w-5 h-5 text-slate-600" />
                    <span className="font-bold text-lg text-slate-900">
                      {new Date(handover.date).toLocaleDateString('en-US', {
                        weekday: 'long',
                        month: 'long',
                        day: 'numeric',
                      })}
                    </span>
                  </div>

                  <div className="flex items-center gap-4 mb-3">
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-8 h-8 rounded-full ${
                          fromProfile?.color === 'blue' ? 'bg-blue-500' : 'bg-green-500'
                        }`}
                      ></div>
                      <span className="font-medium text-slate-900">{fromProfile?.name}</span>
                    </div>
                    <ArrowRightLeft className="w-5 h-5 text-slate-400" />
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-8 h-8 rounded-full ${
                          toProfile?.color === 'blue' ? 'bg-blue-500' : 'bg-green-500'
                        }`}
                      ></div>
                      <span className="font-medium text-slate-900">{toProfile?.name}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-sm">
                    {handover.time && (
                      <div className="flex items-center gap-2 text-slate-600">
                        <Clock className="w-4 h-4" />
                        <span>{handover.time}</span>
                      </div>
                    )}
                    {handover.location && (
                      <div className="flex items-center gap-2 text-slate-600">
                        <MapPin className="w-4 h-4" />
                        <span>{handover.location}</span>
                      </div>
                    )}
                  </div>

                  {(bringsProfile || picksUpProfile) && (
                    <div className="mt-3 pt-3 border-t border-slate-200 text-sm">
                      {bringsProfile && (
                        <div className="text-slate-700">
                          <span className="font-medium">{bringsProfile.name}</span> bringt Kaja
                        </div>
                      )}
                      {picksUpProfile && (
                        <div className="text-slate-700">
                          <span className="font-medium">{picksUpProfile.name}</span> holt Kaja ab
                        </div>
                      )}
                    </div>
                  )}

                  <div className="mt-3 flex items-center gap-3 text-sm">
                    <div className="flex items-center gap-2">
                      {handover.confirmed_by_from ? (
                        <Check className="w-4 h-4 text-green-600" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-yellow-600" />
                      )}
                      <span className="text-slate-600">{fromProfile?.name} bestätigt</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {handover.confirmed_by_to ? (
                        <Check className="w-4 h-4 text-green-600" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-yellow-600" />
                      )}
                      <span className="text-slate-600">{toProfile?.name} bestätigt</span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-2 ml-4">
                  {needsConfirmation && (
                    <button
                      onClick={() => handleConfirm(handover)}
                      className="px-4 py-2 bg-green-500 text-white rounded-lg font-medium hover:bg-green-600 transition whitespace-nowrap"
                    >
                      <Check className="w-4 h-4 inline mr-2" />
                      Bestätigen
                    </button>
                  )}
                  {!editingHandover && (
                    <button
                      onClick={() => startEdit(handover)}
                      className="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg font-medium hover:bg-slate-300 transition whitespace-nowrap"
                    >
                      Details bearbeiten
                    </button>
                  )}
                  <button
                    onClick={() => handleDeleteHandover(handover.id)}
                    className="px-4 py-2 bg-red-500 text-white rounded-lg font-medium hover:bg-red-600 transition whitespace-nowrap opacity-0 group-hover:opacity-100"
                  >
                    <Trash2 className="w-4 h-4 inline mr-2" />
                    Löschen
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {handovers.length === 0 && (
          <div className="text-center py-12 text-slate-500">
            <ArrowRightLeft className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="mb-2">Keine anstehenden Übergaben</p>
            <p className="text-sm">Klicke auf "Übergaben erkennen" um automatisch Planänderungen zu finden</p>
          </div>
        )}
      </div>
    </div>
  );
}
