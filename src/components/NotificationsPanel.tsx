import { useEffect, useState } from 'react';
import type { Profile } from '../lib/database.types';
import { deleteItems, listItems, upsertItems } from '../api/collections';
import {
  Bell,
  History,
  Mail,
  Send,
  MessageSquare,
  X,
  Reply,
  Calendar,
  ArrowRightLeft,
  User,
  Trash2,
  Inbox,
  MailOpen,
  Search,
  Archive,
  ArrowUpDown
} from 'lucide-react';

interface ActivityLog {
  id: string;
  activity_type: string;
  description: string;
  related_date: string | null;
  actor_id: string | null;
  created_at: string;
  metadata: Record<string, unknown>;
}

interface Message {
  id: string;
  from_profile_id: string;
  to_profile_id: string;
  subject: string;
  content: string;
  is_read: boolean;
  parent_message_id: string | null;
  created_at: string;
  read_at: string | null;
}

interface NotificationsPanelProps {
  profiles: Profile[];
  currentProfile: Profile;
  onUpdate?: () => void;
  composeToProfileId?: string | null;
  composeNonce?: number;
}

export function NotificationsPanel({ profiles, currentProfile, onUpdate, composeToProfileId, composeNonce }: NotificationsPanelProps) {
  const [activeTab, setActiveTab] = useState<'messages' | 'history'>('messages');
  const [messages, setMessages] = useState<Message[]>([]);
  const [activityLog, setActivityLog] = useState<ActivityLog[]>([]);
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [showCompose, setShowCompose] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [loadError, setLoadError] = useState<string>('');

  const [messageView, setMessageView] = useState<'inbox' | 'sent' | 'archived'>('inbox');
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
  const [searchQuery, setSearchQuery] = useState('');
  const [archivedIds, setArchivedIds] = useState<Set<string>>(new Set());

  const [composeForm, setComposeForm] = useState({
    to_profile_id: '',
    subject: '',
    content: ''
  });

  useEffect(() => {
    loadMessages();
    loadActivityLog();
  }, [currentProfile]);

  useEffect(() => {
    const key = `archivedMessages:${String(currentProfile.id || '')}`;
    try {
      const raw = localStorage.getItem(key) || '[]';
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        setArchivedIds(new Set(parsed.map((v) => String(v))));
      } else {
        setArchivedIds(new Set());
      }
    } catch {
      setArchivedIds(new Set());
    }
  }, [currentProfile]);

  useEffect(() => {
    if (!composeNonce) return;
    if (!composeToProfileId) return;
    setActiveTab('messages');
    setShowCompose(true);
    setReplyTo(null);
    setComposeForm({ to_profile_id: composeToProfileId, subject: '', content: '' });
  }, [composeNonce, composeToProfileId]);

  const loadMessages = async () => {
    try {
      setLoadError('');
      const all = await listItems<Message>('messages');
      console.debug('[NotificationsPanel] currentProfile.id', currentProfile.id);
      console.debug('[NotificationsPanel] messages total', all.length, 'sample', all[0]);
      const mine = all.filter(
        (m) => m.from_profile_id === currentProfile.id || m.to_profile_id === currentProfile.id
      );
      mine.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));

      if (mine.length === 0 && all.length > 0) {
        const msg =
          'Nachrichten sind vorhanden, aber keine passt zur aktuellen Profil-ID. (ID-Mismatch zwischen Login-User und importierten Messages)';
        console.warn('[NotificationsPanel] ID mismatch: showing all messages', {
          currentProfileId: currentProfile.id,
          sampleMessage: all[0]
        });
        setLoadError(msg);
        all.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
        setMessages(all);
        return;
      }

      setMessages(mine);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[NotificationsPanel] loadMessages failed', e);
      setLoadError(msg);
      setMessages([]);
    }
  };

  const persistArchivedIds = (next: Set<string>) => {
    const key = `archivedMessages:${String(currentProfile.id || '')}`;
    setArchivedIds(next);
    try {
      localStorage.setItem(key, JSON.stringify(Array.from(next)));
    } catch {
      return;
    }
  };

  const archiveMessage = (messageId: string) => {
    const next = new Set(archivedIds);
    next.add(messageId);
    persistArchivedIds(next);
    if (selectedMessage?.id === messageId) {
      setSelectedMessage(null);
    }
  };

  const unarchiveMessage = (messageId: string) => {
    const next = new Set(archivedIds);
    next.delete(messageId);
    persistArchivedIds(next);
  };

  const loadActivityLog = async () => {
    try {
      setLoadError('');
      const all = await listItems<ActivityLog>('activity_log');
      all.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
      setActivityLog(all.slice(0, 50));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[NotificationsPanel] loadActivityLog failed', e);
      setLoadError(msg);
      setActivityLog([]);
    }
  };

  const markAsRead = async (message: Message) => {
    if (message.to_profile_id === currentProfile.id && !message.is_read) {
      await upsertItems('messages', { id: message.id, is_read: true, read_at: new Date().toISOString() }, ['id']);
      loadMessages();
    }
  };

  const toggleRead = async (message: Message) => {
    await upsertItems(
      'messages',
      {
        id: message.id,
        is_read: !message.is_read,
        read_at: message.is_read ? null : new Date().toISOString()
      },
      ['id']
    );
    loadMessages();
  };

  const deleteMessage = async (messageId: string) => {
    await deleteItems('messages', { id: messageId });
    setSelectedMessage(null);
    loadMessages();
  };

  const sendMessage = async () => {
    if (!composeForm.to_profile_id || !composeForm.subject || !composeForm.content) return;

    const nowIso = new Date().toISOString();
    await upsertItems('messages', {
      id: crypto.randomUUID(),
      from_profile_id: currentProfile.id,
      to_profile_id: composeForm.to_profile_id,
      subject: composeForm.subject,
      content: composeForm.content,
      is_read: false,
      parent_message_id: replyTo?.id || null,
      created_at: nowIso,
      read_at: null
    }, ['id']);

    await upsertItems('activity_log', {
      id: crypto.randomUUID(),
      activity_type: 'message_sent',
      description: `${currentProfile.name} hat eine Nachricht gesendet: ${composeForm.subject}`,
      related_date: null,
      actor_id: currentProfile.id,
      created_at: nowIso,
      metadata: { subject: composeForm.subject }
    }, ['id']);

    setComposeForm({ to_profile_id: '', subject: '', content: '' });
    setShowCompose(false);
    setReplyTo(null);
    loadMessages();
    onUpdate?.();
  };

  const handleReply = (message: Message) => {
    setReplyTo(message);
    setComposeForm({
      to_profile_id: message.from_profile_id,
      subject: message.subject.startsWith('Re: ') ? message.subject : `Re: ${message.subject}`,
      content: ''
    });
    setShowCompose(true);
  };

  const getProfileById = (id: string) => profiles.find(p => p.id === id);
  const otherProfile = profiles.find(p => p.id !== currentProfile.id);

  const unreadCount = messages.filter(
    (m) => m.to_profile_id === currentProfile.id && !m.is_read && !archivedIds.has(m.id)
  ).length;

  const inbox = messages.filter((m) => m.to_profile_id === currentProfile.id);
  const sent = messages.filter((m) => m.from_profile_id === currentProfile.id);

  const applyMessageFilters = (list: Message[]) => {
    const q = searchQuery.trim().toLowerCase();
    let next = [...list];

    if (messageView === 'archived') {
      next = next.filter((m) => archivedIds.has(m.id));
    } else {
      next = next.filter((m) => !archivedIds.has(m.id));
    }

    if (showUnreadOnly) {
      next = next.filter((m) => m.to_profile_id === currentProfile.id && !m.is_read);
    }

    if (q) {
      next = next.filter((m) => {
        const from = (getProfileById(m.from_profile_id)?.name || '').toLowerCase();
        const to = (getProfileById(m.to_profile_id)?.name || '').toLowerCase();
        const subject = String(m.subject || '').toLowerCase();
        const content = String(m.content || '').toLowerCase();
        return from.includes(q) || to.includes(q) || subject.includes(q) || content.includes(q);
      });
    }

    next.sort((a, b) => {
      const aa = String(a.created_at || '');
      const bb = String(b.created_at || '');
      return sortOrder === 'newest' ? bb.localeCompare(aa) : aa.localeCompare(bb);
    });

    return next;
  };

  const filteredInbox = applyMessageFilters(inbox);
  const filteredSent = applyMessageFilters(sent);

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'assignment_created':
      case 'assignment_changed':
        return <Calendar className="w-4 h-4" />;
      case 'handover_created':
      case 'handover_changed':
        return <ArrowRightLeft className="w-4 h-4" />;
      case 'message_sent':
        return <Mail className="w-4 h-4" />;
      default:
        return <Bell className="w-4 h-4" />;
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {loadError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">
          {loadError}
        </div>
      )}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex gap-2 sm:gap-3 overflow-x-auto">
          <button
            onClick={() => setActiveTab('messages')}
            className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg font-medium transition-all text-sm sm:text-base whitespace-nowrap ${
              activeTab === 'messages'
                ? 'bg-blue-500 text-white shadow-md'
                : 'surface text-slate-600 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-900/60 border border-slate-200 dark:border-slate-800/60'
            }`}
          >
            <MessageSquare className="w-4 h-4 flex-shrink-0" />
            <span>Nachrichten</span>
            {unreadCount > 0 && (
              <span className={`ml-1 text-xs font-bold rounded-full px-2 py-0.5 ${
                activeTab === 'messages'
                  ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400'
                  : 'bg-red-500 text-white'
              }`}>
                {unreadCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg font-medium transition-all text-sm sm:text-base whitespace-nowrap ${
              activeTab === 'history'
                ? 'bg-slate-700 text-white shadow-md'
                : 'surface text-slate-600 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-900/60 border border-slate-200 dark:border-slate-800/60'
            }`}
          >
            <History className="w-4 h-4 flex-shrink-0" />
            <span>Aktivitäten</span>
          </button>
        </div>
        {activeTab === 'messages' && (
          <button
            onClick={() => {
              setShowCompose(true);
              setReplyTo(null);
              setComposeForm({ to_profile_id: otherProfile?.id || '', subject: '', content: '' });
            }}
            className="flex items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-all font-medium shadow-sm hover:shadow-md text-sm sm:text-base w-full sm:w-auto"
          >
            <Send className="w-4 h-4 flex-shrink-0" />
            <span>Neue Nachricht</span>
          </button>
        )}
      </div>

      {activeTab === 'messages' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          <div className="space-y-4">
            <div className="surface rounded-xl p-3 border border-slate-200 dark:border-slate-800/60">
              <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                <div className="flex items-center gap-2 surface-muted rounded-lg px-3 py-2 border border-slate-200/60 dark:border-slate-800/60 flex-1">
                  <Search className="w-4 h-4 text-slate-500 dark:text-slate-300 flex-shrink-0" />
                  <input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-transparent outline-none text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400"
                    placeholder="Suchen (Name, Betreff, Inhalt)"
                  />
                </div>

                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={() => setMessageView('inbox')}
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition border ${
                      messageView === 'inbox'
                        ? 'bg-blue-500 text-white border-blue-500'
                        : 'surface border-slate-200 dark:border-slate-800/60 text-slate-700 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-900/60'
                    }`}
                  >
                    Posteingang
                  </button>
                  <button
                    onClick={() => setMessageView('sent')}
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition border ${
                      messageView === 'sent'
                        ? 'bg-slate-700 text-white border-slate-700'
                        : 'surface border-slate-200 dark:border-slate-800/60 text-slate-700 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-900/60'
                    }`}
                  >
                    Gesendet
                  </button>
                  <button
                    onClick={() => setMessageView('archived')}
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition border ${
                      messageView === 'archived'
                        ? 'bg-amber-500 text-white border-amber-500'
                        : 'surface border-slate-200 dark:border-slate-800/60 text-slate-700 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-900/60'
                    }`}
                  >
                    Archiv
                  </button>
                </div>
              </div>

              <div className="mt-2 flex items-center justify-between gap-2 flex-wrap">
                <button
                  onClick={() => setShowUnreadOnly((v) => !v)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition border ${
                    showUnreadOnly
                      ? 'bg-blue-50 dark:bg-blue-950/30 border-blue-300 dark:border-blue-900/60 text-blue-700 dark:text-blue-200'
                      : 'surface border-slate-200 dark:border-slate-800/60 text-slate-600 dark:text-slate-200'
                  }`}
                  title="Nur ungelesene Nachrichten anzeigen"
                >
                  {showUnreadOnly ? 'Nur ungelesen: AN' : 'Nur ungelesen: AUS'}
                </button>

                <button
                  onClick={() => setSortOrder((v) => (v === 'newest' ? 'oldest' : 'newest'))}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold transition border surface border-slate-200 dark:border-slate-800/60 text-slate-600 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-900/60 flex items-center gap-1.5"
                  title="Sortierung umschalten"
                >
                  <ArrowUpDown className="w-3.5 h-3.5" />
                  {sortOrder === 'newest' ? 'Neueste zuerst' : 'Älteste zuerst'}
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <Inbox className="w-5 h-5 text-slate-700 dark:text-slate-200" />
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">Posteingang</h3>
              {unreadCount > 0 && (
                <span className="text-xs bg-red-500 text-white px-2.5 py-1 rounded-full font-bold">
                  {unreadCount}
                </span>
              )}
            </div>
            {messageView !== 'inbox' ? null : filteredInbox.length === 0 ? (
              <div className="surface-muted rounded-xl p-12 text-center border-2 border-dashed">
                <Inbox className="w-16 h-16 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
                <p className="text-slate-500 dark:text-slate-300 font-medium">Keine Nachrichten</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredInbox.map(message => {
                  const sender = getProfileById(message.from_profile_id);
                  return (
                    <div
                      key={message.id}
                      onClick={() => {
                        setSelectedMessage(message);
                        markAsRead(message);
                      }}
                      className={`p-4 rounded-xl cursor-pointer transition-all ${
                        message.is_read
                          ? 'surface border border-slate-200 dark:border-slate-800/60 hover:border-slate-300 dark:hover:border-slate-700 hover:shadow-sm'
                          : 'bg-blue-50 dark:bg-blue-950/20 border-2 border-blue-300 dark:border-blue-900/50 hover:border-blue-400 dark:hover:border-blue-800 shadow-sm'
                      }`}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div
                            className={`w-3 h-3 rounded-full shadow-sm ${
                              sender?.color === 'blue' ? 'bg-blue-500' : 'bg-green-500'
                            }`}
                          ></div>
                          <span className="font-bold text-slate-900 dark:text-slate-100">{sender?.name}</span>
                          {!message.is_read && (
                            <span className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded-md font-bold shadow-sm">
                              NEU
                            </span>
                          )}
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleRead(message);
                          }}
                          className={`p-1.5 rounded-lg transition-colors ${
                            message.is_read
                              ? 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-slate-200'
                              : 'text-blue-600 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-950/30'
                          }`}
                          title={message.is_read ? 'Als ungelesen markieren' : 'Als gelesen markieren'}
                        >
                          {message.is_read ? (
                            <MailOpen className="w-4 h-4" />
                          ) : (
                            <Mail className="w-4 h-4" />
                          )}
                        </button>
                      </div>

                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className={`text-sm mb-1.5 ${
                            message.is_read ? 'font-medium text-slate-800 dark:text-slate-100' : 'font-bold text-slate-900 dark:text-slate-100'
                          }`}>{message.subject}</p>
                          <p className="text-slate-600 dark:text-slate-300 text-sm line-clamp-2 leading-relaxed">{message.content}</p>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            archiveMessage(message.id);
                          }}
                          className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition"
                          title="Archivieren"
                        >
                          <Archive className="w-4 h-4" />
                        </button>
                      </div>
                      <p className="text-slate-400 dark:text-slate-400 text-xs mt-2.5 flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {new Date(message.created_at).toLocaleDateString('de-DE', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex items-center gap-2.5 mt-8">
              <Send className="w-5 h-5 text-slate-700 dark:text-slate-200" />
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">Gesendet</h3>
            </div>
            {messageView !== 'sent' ? null : filteredSent.length === 0 ? (
              <div className="surface-muted rounded-xl p-12 text-center border-2 border-dashed">
                <Send className="w-16 h-16 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
                <p className="text-slate-500 dark:text-slate-300 font-medium">Keine gesendeten Nachrichten</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredSent.map(message => {
                  const recipient = getProfileById(message.to_profile_id);
                  return (
                    <div
                      key={message.id}
                      onClick={() => setSelectedMessage(message)}
                      className="p-4 surface rounded-xl border border-slate-200 dark:border-slate-800/60 hover:border-slate-300 dark:hover:border-slate-700 cursor-pointer transition-all hover:shadow-sm"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div
                            className={`w-3 h-3 rounded-full shadow-sm ${
                              recipient?.color === 'blue' ? 'bg-blue-500' : 'bg-green-500'
                            }`}
                          ></div>
                          <span className="font-bold text-slate-900 dark:text-slate-100">An: {recipient?.name}</span>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            archiveMessage(message.id);
                          }}
                          className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition"
                          title="Archivieren"
                        >
                          <Archive className="w-4 h-4" />
                        </button>
                      </div>
                      <p className="font-medium text-slate-800 dark:text-slate-100 text-sm mb-1.5">{message.subject}</p>
                      <p className="text-slate-600 dark:text-slate-300 text-sm line-clamp-2 leading-relaxed">{message.content}</p>
                      <p className="text-slate-400 dark:text-slate-400 text-xs mt-2.5 flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {new Date(message.created_at).toLocaleDateString('de-DE', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}

            {messageView === 'archived' && (
              <div className="mt-8">
                <div className="flex items-center gap-2.5">
                  <Archive className="w-5 h-5 text-slate-700 dark:text-slate-200" />
                  <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">Archiv</h3>
                </div>
                {applyMessageFilters(messages).length === 0 ? (
                  <div className="surface-muted rounded-xl p-12 text-center border-2 border-dashed mt-3">
                    <Archive className="w-16 h-16 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
                    <p className="text-slate-500 dark:text-slate-300 font-medium">Archiv ist leer</p>
                  </div>
                ) : (
                  <div className="space-y-3 mt-3">
                    {applyMessageFilters(messages).map((message) => {
                      const sender = getProfileById(message.from_profile_id);
                      const recipient = getProfileById(message.to_profile_id);
                      const counterpart = message.from_profile_id === currentProfile.id ? recipient : sender;
                      return (
                        <div
                          key={message.id}
                          onClick={() => {
                            setSelectedMessage(message);
                            markAsRead(message);
                          }}
                          className="p-4 surface rounded-xl border border-slate-200 dark:border-slate-800/60 hover:border-slate-300 dark:hover:border-slate-700 cursor-pointer transition-all hover:shadow-sm"
                        >
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <div className={`w-3 h-3 rounded-full shadow-sm ${
                                counterpart?.color === 'blue' ? 'bg-blue-500' : 'bg-green-500'
                              }`}></div>
                              <span className="font-bold text-slate-900 dark:text-slate-100">{counterpart?.name}</span>
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                unarchiveMessage(message.id);
                              }}
                              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-200 border border-amber-200 dark:border-amber-900/50 hover:bg-amber-100 dark:hover:bg-amber-950/45 transition"
                              title="Aus Archiv entfernen"
                            >
                              Wiederherstellen
                            </button>
                          </div>
                          <p className="font-medium text-slate-800 dark:text-slate-100 text-sm mb-1.5">{message.subject}</p>
                          <p className="text-slate-600 dark:text-slate-300 text-sm line-clamp-2 leading-relaxed">{message.content}</p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          <div>
            {showCompose ? (
              <div className="surface rounded-xl p-6 shadow-sm">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center">
                      <Send className="w-5 h-5 text-white" />
                    </div>
                    <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                      {replyTo ? 'Antworten' : 'Neue Nachricht'}
                    </h3>
                  </div>
                  <button
                    onClick={() => {
                      setShowCompose(false);
                      setReplyTo(null);
                    }}
                    className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="space-y-5">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">An:</label>
                    <select
                      value={composeForm.to_profile_id}
                      onChange={(e) => setComposeForm({ ...composeForm, to_profile_id: e.target.value })}
                      className="w-full px-3 py-2.5 surface border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition text-slate-900 dark:text-slate-100"
                      disabled={!!replyTo}
                    >
                      <option value="">Empfänger wählen</option>
                      {profiles
                        .filter(p => p.id !== currentProfile.id)
                        .map(profile => (
                          <option key={profile.id} value={profile.id}>
                            {profile.name}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">Betreff:</label>
                    <input
                      type="text"
                      value={composeForm.subject}
                      onChange={(e) => setComposeForm({ ...composeForm, subject: e.target.value })}
                      className="w-full px-3 py-2.5 surface border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
                      placeholder="Betreff eingeben"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">Nachricht:</label>
                    <textarea
                      value={composeForm.content}
                      onChange={(e) => setComposeForm({ ...composeForm, content: e.target.value })}
                      className="w-full px-3 py-2.5 surface border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition resize-none text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
                      rows={8}
                      placeholder="Nachricht eingeben"
                    />
                  </div>
                  <button
                    onClick={sendMessage}
                    className="w-full py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all flex items-center justify-center gap-2 font-semibold shadow-sm hover:shadow-md"
                  >
                    <Send className="w-4 h-4" />
                    Nachricht senden
                  </button>
                </div>
              </div>
            ) : selectedMessage ? (
              <div className="surface rounded-xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-slate-100 dark:bg-slate-800 rounded-lg flex items-center justify-center">
                      <MessageSquare className="w-5 h-5 text-slate-600 dark:text-slate-300" />
                    </div>
                    <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100">Nachricht</h3>
                  </div>
                  <button
                    onClick={() => setSelectedMessage(null)}
                    className="p-2 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="space-y-5">
                  <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-700">
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-10 h-10 rounded-full flex items-center justify-center ${
                          selectedMessage.from_profile_id === currentProfile.id
                            ? getProfileById(selectedMessage.to_profile_id)?.color === 'blue'
                              ? 'bg-blue-100 dark:bg-blue-950/30'
                              : 'bg-green-100 dark:bg-green-950/30'
                            : getProfileById(selectedMessage.from_profile_id)?.color === 'blue'
                              ? 'bg-blue-100 dark:bg-blue-950/30'
                              : 'bg-green-100 dark:bg-green-950/30'
                        }`}
                      >
                        <User className={`w-5 h-5 ${
                          selectedMessage.from_profile_id === currentProfile.id
                            ? getProfileById(selectedMessage.to_profile_id)?.color === 'blue'
                              ? 'text-blue-600 dark:text-blue-200'
                              : 'text-green-600 dark:text-green-200'
                            : getProfileById(selectedMessage.from_profile_id)?.color === 'blue'
                              ? 'text-blue-600 dark:text-blue-200'
                              : 'text-green-600 dark:text-green-200'
                        }`} />
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mb-0.5">
                          {selectedMessage.from_profile_id === currentProfile.id ? 'An' : 'Von'}
                        </p>
                        <span className="font-bold text-slate-900 dark:text-slate-100">
                          {selectedMessage.from_profile_id === currentProfile.id
                            ? getProfileById(selectedMessage.to_profile_id)?.name
                            : getProfileById(selectedMessage.from_profile_id)?.name}
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {selectedMessage.to_profile_id === currentProfile.id && (
                        <button
                          onClick={() => handleReply(selectedMessage)}
                          className="px-4 py-2 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30 hover:bg-blue-100 dark:hover:bg-blue-950/50 rounded-lg transition-all flex items-center gap-2 font-medium"
                        >
                          <Reply className="w-4 h-4" />
                          Antworten
                        </button>
                      )}
                      <button
                        onClick={() => deleteMessage(selectedMessage.id)}
                        className="p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 mb-3">
                      <Calendar className="w-4 h-4" />
                      {new Date(selectedMessage.created_at).toLocaleDateString('de-DE', {
                        weekday: 'long',
                        day: '2-digit',
                        month: 'long',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </div>
                    <h4 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-4">{selectedMessage.subject}</h4>
                    <div className="bg-slate-50 dark:bg-slate-900/40 rounded-lg p-4 border-l-4 border-blue-500">
                      <p className="text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">{selectedMessage.content}</p>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-slate-50 dark:bg-slate-900/40 rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-700 p-16 flex flex-col items-center justify-center text-center h-full min-h-[400px]">
                <div className="w-20 h-20 surface rounded-2xl flex items-center justify-center mb-4 shadow-sm border border-slate-200 dark:border-slate-700">
                  <MessageSquare className="w-10 h-10 text-slate-400 dark:text-slate-500" />
                </div>
                <p className="text-base font-semibold text-slate-700 dark:text-slate-200 mb-1">Keine Nachricht ausgewählt</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">Wähle eine Nachricht aus oder schreibe eine neue</p>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'history' && (
        <div className="space-y-3">
          {activityLog.length === 0 ? (
            <div className="bg-slate-50 dark:bg-slate-900/40 rounded-xl p-16 text-center border-2 border-dashed border-slate-200 dark:border-slate-700">
              <History className="w-16 h-16 text-slate-300 dark:text-slate-500 mx-auto mb-3" />
              <p className="text-base font-medium text-slate-700 dark:text-slate-200 mb-1">Keine Aktivitäten</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">Der Verlauf ist leer</p>
            </div>
          ) : (
            activityLog.map(activity => {
              const actor = activity.actor_id ? getProfileById(activity.actor_id) : null;
              return (
                <div
                  key={activity.id}
                  className="p-4 surface rounded-lg border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 hover:shadow-sm transition-all"
                >
                  <div className="flex items-start gap-3">
                    <div className={`p-2.5 rounded-lg ${
                      activity.activity_type.includes('assignment') ? 'bg-blue-100 dark:bg-blue-950/30 text-blue-600 dark:text-blue-200' :
                      activity.activity_type.includes('handover') ? 'bg-orange-100 dark:bg-orange-950/30 text-orange-600 dark:text-orange-200' :
                      activity.activity_type.includes('message') ? 'bg-emerald-100 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-200' :
                      'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                    }`}>
                      {getActivityIcon(activity.activity_type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-slate-900 dark:text-slate-100 font-medium mb-2 leading-relaxed">{activity.description}</p>
                      <div className="flex flex-wrap items-center gap-2.5 text-xs text-slate-500 dark:text-slate-400">
                        {actor && (
                          <span className="flex items-center gap-1.5">
                            <div
                              className={`w-2 h-2 rounded-full ${
                                actor.color === 'blue' ? 'bg-blue-500' : 'bg-green-500'
                              }`}
                            ></div>
                            <span className="font-medium text-slate-700 dark:text-slate-300">{actor.name}</span>
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {new Date(activity.created_at).toLocaleDateString('de-DE', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </span>
                        {activity.related_date && (
                          <span className="flex items-center gap-1 text-blue-700">
                            <Calendar className="w-3 h-3" />
                            {new Date(activity.related_date).toLocaleDateString('de-DE')}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
