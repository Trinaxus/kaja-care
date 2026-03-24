import { useState, useEffect } from 'react';
import type { Profile, Request } from '../lib/database.types';
import { Calendar, Check, X, Plus, MessageSquare, Trash2, CreditCard as Edit2 } from 'lucide-react';
import { deleteItems, listItems, upsertItems } from '../api/collections';

interface RequestsPanelProps {
  profiles: Profile[];
  currentProfile: Profile;
  requests: Request[];
  onUpdate: () => void;
}

export function RequestsPanel({ profiles, currentProfile, onUpdate }: RequestsPanelProps) {
  const [showNewRequest, setShowNewRequest] = useState(false);
  const [editingRequest, setEditingRequest] = useState<Request | null>(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [message, setMessage] = useState('');
  const [allRequests, setAllRequests] = useState<Request[]>([]);

  useEffect(() => {
    loadAllRequests();
  }, []);

  const loadAllRequests = async () => {
    try {
      const data = await listItems<Request>('requests');
      data.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
      setAllRequests(data);
    } catch {
      setAllRequests([]);
    }
  };

  const handleCreateRequest = async () => {
    const otherProfile = profiles.find(p => p.id !== currentProfile.id);
    if (!otherProfile || !startDate || !endDate) return;

    const nowIso = new Date().toISOString();
    await upsertItems('requests', {
      id: crypto.randomUUID(),
      from_user_id: currentProfile.id,
      to_user_id: otherProfile.id,
      start_date: startDate,
      end_date: endDate,
      message: message || null,
      status: 'pending',
      created_at: nowIso,
      updated_at: nowIso
    }, ['id']);

    resetForm();
    await loadAllRequests();
    onUpdate();
  };

  const handleUpdateRequest = async (requestId: string) => {
    if (!startDate || !endDate) return;

    await upsertItems(
      'requests',
      {
        id: requestId,
        start_date: startDate,
        end_date: endDate,
        message: message || null,
        updated_at: new Date().toISOString()
      },
      ['id']
    );

    resetForm();
    await loadAllRequests();
    onUpdate();
  };

  const handleDeleteRequest = async (requestId: string) => {
    await deleteItems('requests', { id: requestId });

    await loadAllRequests();
    onUpdate();
  };

  const resetForm = () => {
    setShowNewRequest(false);
    setEditingRequest(null);
    setStartDate('');
    setEndDate('');
    setMessage('');
  };

  const startEditRequest = (request: Request) => {
    setEditingRequest(request);
    setStartDate(request.start_date);
    setEndDate(request.end_date);
    setMessage(request.message || '');
  };

  const handleAcceptRequest = async (request: Request) => {
    await upsertItems('requests', { id: request.id, status: 'accepted', updated_at: new Date().toISOString() }, ['id']);

    const dates: string[] = [];
    const start = new Date(request.start_date);
    const end = new Date(request.end_date);
    const current = new Date(start);

    while (current <= end) {
      dates.push(current.toISOString().split('T')[0]);
      current.setDate(current.getDate() + 1);
    }

    const assignments = dates.map(date => ({
      id: crypto.randomUUID(),
      date,
      caretaker_id: request.from_user_id,
      created_by: currentProfile.id,
      status: 'planned' as const,
      preference_score: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      start_time: null,
      end_time: null,
      is_full_day: true,
      notes: null
    }));

    for (const assignment of assignments) {
      await upsertItems('care_assignments', assignment, ['date']);
    }

    await loadAllRequests();
    onUpdate();
  };

  const handleDeclineRequest = async (request: Request) => {
    await upsertItems('requests', { id: request.id, status: 'declined', updated_at: new Date().toISOString() }, ['id']);

    await loadAllRequests();
    onUpdate();
  };

  const getProfileById = (id: string) => profiles.find(p => p.id === id);
  const otherProfile = profiles.find(p => p.id !== currentProfile.id);

  const receivedRequests = allRequests.filter(r => r.to_user_id === currentProfile.id);
  const sentRequests = allRequests.filter(r => r.from_user_id === currentProfile.id);

  const hasNoRequests = receivedRequests.length === 0 && sentRequests.length === 0;

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-0 mb-4 sm:mb-6">
        <h3 className="text-lg sm:text-xl font-bold text-slate-900">Betreuungsanfragen</h3>
        {!showNewRequest && !editingRequest && (
          <button
            onClick={() => setShowNewRequest(true)}
            className="px-3 sm:px-4 py-2 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 transition text-sm sm:text-base w-full sm:w-auto"
          >
            <Plus className="w-4 h-4 inline mr-2" />
            Neue Anfrage
          </button>
        )}
      </div>

      {(showNewRequest || editingRequest) && (
        <div className="bg-slate-50 rounded-xl p-4 sm:p-6 mb-4 sm:mb-6">
          <h4 className="font-bold text-slate-900 mb-3 sm:mb-4 text-base sm:text-lg">
            {editingRequest ? 'Anfrage bearbeiten' : `Anfrage an ${otherProfile?.name}`}
          </h4>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mb-3 sm:mb-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Startdatum
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Enddatum
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="mb-3 sm:mb-4">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Nachricht (Optional)
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              placeholder="Notiz zur Anfrage hinzufügen..."
              className="w-full px-3 sm:px-4 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm sm:text-base"
            />
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <button
              onClick={() => editingRequest ? handleUpdateRequest(editingRequest.id) : handleCreateRequest()}
              disabled={!startDate || !endDate}
              className="flex-1 px-3 sm:px-4 py-2 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 transition disabled:opacity-50 text-sm sm:text-base"
            >
              {editingRequest ? 'Aktualisieren' : 'Anfrage senden'}
            </button>
            <button
              onClick={resetForm}
              className="flex-1 px-3 sm:px-4 py-2 bg-slate-200 text-slate-700 rounded-lg font-medium hover:bg-slate-300 transition text-sm sm:text-base"
            >
              Abbrechen
            </button>
          </div>
        </div>
      )}

      {!showNewRequest && !editingRequest && hasNoRequests && (
        <div className="text-center py-16">
          <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Calendar className="w-10 h-10 text-slate-400" />
          </div>
          <h3 className="text-lg font-semibold text-slate-900 mb-2">Keine Anfragen</h3>
          <p className="text-slate-600 mb-6">
            Du hast aktuell keine offenen oder vergangenen Anfragen
          </p>
          <button
            onClick={() => setShowNewRequest(true)}
            className="px-6 py-3 bg-blue-500 text-white rounded-xl font-medium hover:bg-blue-600 transition shadow-sm"
          >
            <Plus className="w-4 h-4 inline mr-2" />
            Erste Anfrage erstellen
          </button>
        </div>
      )}

      <div className="space-y-6">
        {receivedRequests.length > 0 && (
          <div>
            <h4 className="font-bold text-slate-900 mb-3">Erhaltene Anfragen</h4>
            <div className="space-y-3">
              {receivedRequests.map(request => {
                const fromProfile = getProfileById(request.from_user_id);
                return (
                  <div
                    key={request.id}
                    className={`p-4 rounded-xl border-2 group ${
                      request.status === 'pending'
                        ? 'bg-yellow-50 border-yellow-300'
                        : request.status === 'accepted'
                        ? 'bg-green-50 border-green-300'
                        : 'bg-red-50 border-red-300'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <div
                            className={`w-6 h-6 rounded-full ${
                              fromProfile?.color === 'blue' ? 'bg-blue-500' : 'bg-green-500'
                            }`}
                          ></div>
                          <span className="font-bold text-slate-900 dark:text-slate-100">
                            {fromProfile?.name} möchte, dass du Kaja nimmst
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 mb-2">
                          <Calendar className="w-4 h-4" />
                          <span>
                            {new Date(request.start_date).toLocaleDateString()} -{' '}
                            {new Date(request.end_date).toLocaleDateString()}
                          </span>
                        </div>
                        {request.message && (
                          <div className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300 surface rounded-lg p-3">
                            <MessageSquare className="w-4 h-4 mt-0.5" />
                            <p>{request.message}</p>
                          </div>
                        )}
                      </div>
                      {request.status === 'pending' && (
                        <div className="flex gap-2 ml-4">
                          <button
                            onClick={() => handleAcceptRequest(request)}
                            className="p-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition"
                            title="Annehmen"
                          >
                            <Check className="w-5 h-5" />
                          </button>
                          <button
                            onClick={() => handleDeclineRequest(request)}
                            className="p-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition"
                            title="Ablehnen"
                          >
                            <X className="w-5 h-5" />
                          </button>
                        </div>
                      )}
                      {request.status !== 'pending' && (
                        <div className="ml-4 flex items-center gap-2">
                          <span
                            className={`px-3 py-1 rounded-full text-sm font-medium ${
                              request.status === 'accepted'
                                ? 'bg-green-200 text-green-800'
                                : 'bg-red-200 text-red-800'
                            }`}
                          >
                            {request.status === 'accepted' ? 'Angenommen' : 'Abgelehnt'}
                          </span>
                          <button
                            onClick={() => handleDeleteRequest(request.id)}
                            className="p-1.5 bg-red-500 text-white rounded-lg hover:bg-red-600 transition opacity-0 group-hover:opacity-100"
                            title="Löschen"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {sentRequests.length > 0 && (
          <div>
            <h4 className="font-bold text-slate-900 dark:text-slate-100 mb-3">Gesendete Anfragen</h4>
            <div className="space-y-3">
              {sentRequests.map(request => {
                const toProfile = getProfileById(request.to_user_id);
                const canEdit = request.status === 'pending';
                return (
                  <div
                    key={request.id}
                    className={`p-4 rounded-xl border-2 group ${
                      request.status === 'pending'
                        ? 'bg-slate-50 dark:bg-slate-900/40 border-slate-300 dark:border-slate-700'
                        : request.status === 'accepted'
                        ? 'bg-green-50 dark:bg-green-950/30 border-green-300 dark:border-green-900/50'
                        : 'bg-red-50 dark:bg-red-950/30 border-red-300 dark:border-red-900/50'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <div
                            className={`w-6 h-6 rounded-full ${
                              toProfile?.color === 'blue' ? 'bg-blue-500' : 'bg-green-500'
                            }`}
                          ></div>
                          <span className="font-bold text-slate-900 dark:text-slate-100">
                            Anfrage an {toProfile?.name}, Kaja zu nehmen
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 mb-2">
                          <Calendar className="w-4 h-4" />
                          <span>
                            {new Date(request.start_date).toLocaleDateString()} -{' '}
                            {new Date(request.end_date).toLocaleDateString()}
                          </span>
                        </div>
                        {request.message && (
                          <div className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300 surface rounded-lg p-3">
                            <MessageSquare className="w-4 h-4 mt-0.5" />
                            <p>{request.message}</p>
                          </div>
                        )}
                      </div>
                      <div className="ml-4 flex items-center gap-2">
                        <span
                          className={`px-3 py-1 rounded-full text-sm font-medium ${
                            request.status === 'pending'
                              ? 'bg-yellow-200 text-yellow-800'
                              : request.status === 'accepted'
                              ? 'bg-green-200 text-green-800'
                              : 'bg-red-200 text-red-800'
                          }`}
                        >
                          {request.status === 'pending'
                            ? 'Ausstehend'
                            : request.status === 'accepted'
                            ? 'Angenommen'
                            : 'Abgelehnt'}
                        </span>
                        {canEdit && !editingRequest && (
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => startEditRequest(request)}
                              className="p-1.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition"
                              title="Bearbeiten"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteRequest(request.id)}
                              className="p-1.5 bg-red-500 text-white rounded-lg hover:bg-red-600 transition"
                              title="Löschen"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                        {request.status === 'accepted' && (
                          <button
                            onClick={() => handleDeleteRequest(request.id)}
                            className="p-1.5 bg-red-500 text-white rounded-lg hover:bg-red-600 transition opacity-0 group-hover:opacity-100"
                            title="Löschen"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                        {request.status === 'declined' && (
                          <button
                            onClick={() => handleDeleteRequest(request.id)}
                            className="p-1.5 bg-red-500 text-white rounded-lg hover:bg-red-600 transition opacity-0 group-hover:opacity-100"
                            title="Löschen"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {receivedRequests.length === 0 && sentRequests.length === 0 && (
          <div className="text-center py-12 text-slate-500">
            <Calendar className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>Noch keine Anfragen</p>
          </div>
        )}
      </div>
    </div>
  );
}
