import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Profile } from '../lib/database.types';
import {
  Bell,
  History,
  Mail,
  Send,
  MessageSquare,
  X,
  Check,
  Reply,
  Calendar,
  ArrowRightLeft,
  User,
  Trash2,
  Inbox,
  MailOpen
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
}

export function NotificationsPanel({ profiles, currentProfile, onUpdate }: NotificationsPanelProps) {
  const [activeTab, setActiveTab] = useState<'messages' | 'history'>('messages');
  const [messages, setMessages] = useState<Message[]>([]);
  const [activityLog, setActivityLog] = useState<ActivityLog[]>([]);
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [showCompose, setShowCompose] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);

  const [composeForm, setComposeForm] = useState({
    to_profile_id: '',
    subject: '',
    content: ''
  });

  useEffect(() => {
    loadMessages();
    loadActivityLog();

    const messagesSubscription = supabase
      .channel('messages_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => {
        loadMessages();
      })
      .subscribe();

    const activitySubscription = supabase
      .channel('activity_log_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'activity_log' }, () => {
        loadActivityLog();
      })
      .subscribe();

    return () => {
      messagesSubscription.unsubscribe();
      activitySubscription.unsubscribe();
    };
  }, [currentProfile]);

  const loadMessages = async () => {
    const { data } = await supabase
      .from('messages')
      .select('*')
      .or(`from_profile_id.eq.${currentProfile.id},to_profile_id.eq.${currentProfile.id}`)
      .order('created_at', { ascending: false });

    if (data) setMessages(data);
  };

  const loadActivityLog = async () => {
    const { data } = await supabase
      .from('activity_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

    if (data) setActivityLog(data);
  };

  const markAsRead = async (message: Message) => {
    if (message.to_profile_id === currentProfile.id && !message.is_read) {
      await supabase
        .from('messages')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('id', message.id);
      loadMessages();
    }
  };

  const toggleRead = async (message: Message) => {
    await supabase
      .from('messages')
      .update({
        is_read: !message.is_read,
        read_at: message.is_read ? null : new Date().toISOString()
      })
      .eq('id', message.id);
    loadMessages();
  };

  const deleteMessage = async (messageId: string) => {
    await supabase
      .from('messages')
      .delete()
      .eq('id', messageId);
    setSelectedMessage(null);
    loadMessages();
  };

  const sendMessage = async () => {
    if (!composeForm.to_profile_id || !composeForm.subject || !composeForm.content) return;

    await supabase.from('messages').insert({
      from_profile_id: currentProfile.id,
      to_profile_id: composeForm.to_profile_id,
      subject: composeForm.subject,
      content: composeForm.content,
      parent_message_id: replyTo?.id || null
    });

    await supabase.from('activity_log').insert({
      activity_type: 'message_sent',
      description: `${currentProfile.name} hat eine Nachricht gesendet: ${composeForm.subject}`,
      actor_id: currentProfile.id,
      metadata: { subject: composeForm.subject }
    });

    setComposeForm({ to_profile_id: '', subject: '', content: '' });
    setShowCompose(false);
    setReplyTo(null);
    loadMessages();
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
    m => m.to_profile_id === currentProfile.id && !m.is_read
  ).length;

  const inbox = messages.filter(m => m.to_profile_id === currentProfile.id);
  const sent = messages.filter(m => m.from_profile_id === currentProfile.id);

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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex gap-2 sm:gap-3 overflow-x-auto">
          <button
            onClick={() => setActiveTab('messages')}
            className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg font-medium transition-all text-sm sm:text-base whitespace-nowrap ${
              activeTab === 'messages'
                ? 'bg-blue-500 text-white shadow-md'
                : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'
            }`}
          >
            <MessageSquare className="w-4 h-4 flex-shrink-0" />
            <span>Nachrichten</span>
            {unreadCount > 0 && (
              <span className={`ml-1 text-xs font-bold rounded-full px-2 py-0.5 ${
                activeTab === 'messages'
                  ? 'bg-white text-blue-600'
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
                : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'
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
            <div className="flex items-center gap-2.5">
              <Inbox className="w-5 h-5 text-slate-700" />
              <h3 className="text-lg font-bold text-slate-900">Posteingang</h3>
              {unreadCount > 0 && (
                <span className="text-xs bg-red-500 text-white px-2.5 py-1 rounded-full font-bold">
                  {unreadCount}
                </span>
              )}
            </div>
            {inbox.length === 0 ? (
              <div className="bg-slate-50 rounded-xl p-12 text-center border-2 border-dashed border-slate-200">
                <Inbox className="w-16 h-16 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500 font-medium">Keine Nachrichten</p>
              </div>
            ) : (
              <div className="space-y-3">
                {inbox.map(message => {
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
                          ? 'bg-white border border-slate-200 hover:border-slate-300 hover:shadow-sm'
                          : 'bg-blue-50 border-2 border-blue-300 hover:border-blue-400 shadow-sm'
                      }`}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div
                            className={`w-3 h-3 rounded-full shadow-sm ${
                              sender?.color === 'blue' ? 'bg-blue-500' : 'bg-green-500'
                            }`}
                          ></div>
                          <span className="font-bold text-slate-900">{sender?.name}</span>
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
                              ? 'text-slate-400 hover:bg-slate-100 hover:text-slate-600'
                              : 'text-blue-600 hover:bg-blue-100'
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
                      <p className={`text-sm mb-1.5 ${
                        message.is_read ? 'font-medium text-slate-800' : 'font-bold text-slate-900'
                      }`}>{message.subject}</p>
                      <p className="text-slate-600 text-sm line-clamp-2 leading-relaxed">{message.content}</p>
                      <p className="text-slate-400 text-xs mt-2.5 flex items-center gap-1">
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
              <Send className="w-5 h-5 text-slate-700" />
              <h3 className="text-lg font-bold text-slate-900">Gesendet</h3>
            </div>
            {sent.length === 0 ? (
              <div className="bg-slate-50 rounded-xl p-12 text-center border-2 border-dashed border-slate-200">
                <Send className="w-16 h-16 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500 font-medium">Keine gesendeten Nachrichten</p>
              </div>
            ) : (
              <div className="space-y-3">
                {sent.map(message => {
                  const recipient = getProfileById(message.to_profile_id);
                  return (
                    <div
                      key={message.id}
                      onClick={() => setSelectedMessage(message)}
                      className="p-4 bg-white rounded-xl border border-slate-200 hover:border-slate-300 cursor-pointer transition-all hover:shadow-sm"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div
                            className={`w-3 h-3 rounded-full shadow-sm ${
                              recipient?.color === 'blue' ? 'bg-blue-500' : 'bg-green-500'
                            }`}
                          ></div>
                          <span className="font-bold text-slate-900">An: {recipient?.name}</span>
                        </div>
                      </div>
                      <p className="font-medium text-slate-800 text-sm mb-1.5">{message.subject}</p>
                      <p className="text-slate-600 text-sm line-clamp-2 leading-relaxed">{message.content}</p>
                      <p className="text-slate-400 text-xs mt-2.5 flex items-center gap-1">
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
          </div>

          <div>
            {showCompose ? (
              <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center">
                      <Send className="w-5 h-5 text-white" />
                    </div>
                    <h3 className="text-xl font-bold text-slate-900">
                      {replyTo ? 'Antworten' : 'Neue Nachricht'}
                    </h3>
                  </div>
                  <button
                    onClick={() => {
                      setShowCompose(false);
                      setReplyTo(null);
                    }}
                    className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="space-y-5">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">An:</label>
                    <select
                      value={composeForm.to_profile_id}
                      onChange={(e) => setComposeForm({ ...composeForm, to_profile_id: e.target.value })}
                      className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
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
                    <label className="block text-sm font-medium text-slate-700 mb-2">Betreff:</label>
                    <input
                      type="text"
                      value={composeForm.subject}
                      onChange={(e) => setComposeForm({ ...composeForm, subject: e.target.value })}
                      className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
                      placeholder="Betreff eingeben"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Nachricht:</label>
                    <textarea
                      value={composeForm.content}
                      onChange={(e) => setComposeForm({ ...composeForm, content: e.target.value })}
                      className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition resize-none"
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
              <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center">
                      <MessageSquare className="w-5 h-5 text-slate-600" />
                    </div>
                    <h3 className="text-xl font-bold text-slate-900">Nachricht</h3>
                  </div>
                  <button
                    onClick={() => setSelectedMessage(null)}
                    className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="space-y-5">
                  <div className="flex items-center justify-between pb-4 border-b border-slate-200">
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-10 h-10 rounded-full flex items-center justify-center ${
                          selectedMessage.from_profile_id === currentProfile.id
                            ? getProfileById(selectedMessage.to_profile_id)?.color === 'blue'
                              ? 'bg-blue-100'
                              : 'bg-green-100'
                            : getProfileById(selectedMessage.from_profile_id)?.color === 'blue'
                              ? 'bg-blue-100'
                              : 'bg-green-100'
                        }`}
                      >
                        <User className={`w-5 h-5 ${
                          selectedMessage.from_profile_id === currentProfile.id
                            ? getProfileById(selectedMessage.to_profile_id)?.color === 'blue'
                              ? 'text-blue-600'
                              : 'text-green-600'
                            : getProfileById(selectedMessage.from_profile_id)?.color === 'blue'
                              ? 'text-blue-600'
                              : 'text-green-600'
                        }`} />
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 mb-0.5">
                          {selectedMessage.from_profile_id === currentProfile.id ? 'An' : 'Von'}
                        </p>
                        <span className="font-bold text-slate-900">
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
                          className="px-4 py-2 text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-all flex items-center gap-2 font-medium"
                        >
                          <Reply className="w-4 h-4" />
                          Antworten
                        </button>
                      )}
                      <button
                        onClick={() => deleteMessage(selectedMessage.id)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 text-sm text-slate-500 mb-3">
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
                    <h4 className="text-xl font-bold text-slate-900 mb-4">{selectedMessage.subject}</h4>
                    <div className="bg-slate-50 rounded-lg p-4 border-l-4 border-blue-500">
                      <p className="text-slate-700 whitespace-pre-wrap leading-relaxed">{selectedMessage.content}</p>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-slate-50 rounded-xl border-2 border-dashed border-slate-200 p-16 flex flex-col items-center justify-center text-center h-full min-h-[400px]">
                <div className="w-20 h-20 bg-white rounded-2xl flex items-center justify-center mb-4 shadow-sm border border-slate-200">
                  <MessageSquare className="w-10 h-10 text-slate-400" />
                </div>
                <p className="text-base font-semibold text-slate-700 mb-1">Keine Nachricht ausgewählt</p>
                <p className="text-sm text-slate-500">Wähle eine Nachricht aus oder schreibe eine neue</p>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'history' && (
        <div className="space-y-3">
          {activityLog.length === 0 ? (
            <div className="bg-slate-50 rounded-xl p-16 text-center border-2 border-dashed border-slate-200">
              <History className="w-16 h-16 text-slate-300 mx-auto mb-3" />
              <p className="text-base font-medium text-slate-700 mb-1">Keine Aktivitäten</p>
              <p className="text-sm text-slate-500">Der Verlauf ist leer</p>
            </div>
          ) : (
            activityLog.map(activity => {
              const actor = activity.actor_id ? getProfileById(activity.actor_id) : null;
              return (
                <div
                  key={activity.id}
                  className="p-4 bg-white rounded-lg border border-slate-200 hover:border-slate-300 hover:shadow-sm transition-all"
                >
                  <div className="flex items-start gap-3">
                    <div className={`p-2.5 rounded-lg ${
                      activity.activity_type.includes('assignment') ? 'bg-blue-100 text-blue-600' :
                      activity.activity_type.includes('handover') ? 'bg-orange-100 text-orange-600' :
                      activity.activity_type.includes('message') ? 'bg-emerald-100 text-emerald-600' :
                      'bg-slate-100 text-slate-600'
                    }`}>
                      {getActivityIcon(activity.activity_type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-slate-900 font-medium mb-2 leading-relaxed">{activity.description}</p>
                      <div className="flex flex-wrap items-center gap-2.5 text-xs text-slate-500">
                        {actor && (
                          <span className="flex items-center gap-1.5">
                            <div
                              className={`w-2 h-2 rounded-full ${
                                actor.color === 'blue' ? 'bg-blue-500' : 'bg-green-500'
                              }`}
                            ></div>
                            <span className="font-medium">{actor.name}</span>
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
