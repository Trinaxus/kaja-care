import { useState } from 'react';
import type { Profile } from '../lib/database.types';
import { X, User, Palette, Save, Mail, Lock, Bell, Eye, EyeOff } from 'lucide-react';

interface ProfileSettingsProps {
  profile: Profile;
  onClose: () => void;
  onUpdate: () => void;
}

const COLOR_OPTIONS = [
  { value: 'blue', label: 'Blau', bgClass: 'bg-blue-500', hoverClass: 'hover:bg-blue-600' },
  { value: 'green', label: 'Grün', bgClass: 'bg-green-500', hoverClass: 'hover:bg-green-600' },
  { value: 'purple', label: 'Lila', bgClass: 'bg-purple-500', hoverClass: 'hover:bg-purple-600' },
  { value: 'orange', label: 'Orange', bgClass: 'bg-orange-500', hoverClass: 'hover:bg-orange-600' },
  { value: 'pink', label: 'Pink', bgClass: 'bg-pink-500', hoverClass: 'hover:bg-pink-600' },
  { value: 'yellow', label: 'Gelb', bgClass: 'bg-yellow-500', hoverClass: 'hover:bg-yellow-600' },
  { value: 'red', label: 'Rot', bgClass: 'bg-red-500', hoverClass: 'hover:bg-red-600' },
  { value: 'slate', label: 'Grau', bgClass: 'bg-slate-500', hoverClass: 'hover:bg-slate-600' },
];

type TabType = 'profile' | 'password' | 'preferences';

export function ProfileSettings({ profile, onClose, onUpdate }: ProfileSettingsProps) {
  const [activeTab, setActiveTab] = useState<TabType>('profile');
  const [name, setName] = useState(profile.name);
  const [color, setColor] = useState(profile.color);
  const [email, setEmail] = useState(profile.email || '');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const preferences = typeof profile.preferences === 'object' && profile.preferences !== null
    ? profile.preferences as any
    : { notifications: { email: true, push: true, requests: true, handovers: true, assignments: true }, language: 'de', timezone: 'Europe/Berlin' };

  const [notificationPrefs, setNotificationPrefs] = useState({
    email: preferences.notifications?.email ?? true,
    push: preferences.notifications?.push ?? true,
    requests: preferences.notifications?.requests ?? true,
    handovers: preferences.notifications?.handovers ?? true,
    assignments: preferences.notifications?.assignments ?? true,
  });

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleSaveProfile = async () => {
    if (!name.trim()) {
      setError('Bitte gib einen Namen ein');
      return;
    }

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Bitte gib eine gültige E-Mail-Adresse ein');
      return;
    }

    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      // Profil über PHP Backend aktualisieren
      const baseUrl = import.meta.env.VITE_SERVER_BASE_URL;
      const token = localStorage.getItem('authToken');
      
      // Benachrichtigungseinstellungen vorbereiten
      const updatedPreferences = {
        ...preferences,
        notifications: {
          email: notificationPrefs.email,
          push: notificationPrefs.push,
          requests: notificationPrefs.requests,
          handovers: notificationPrefs.handovers,
          assignments: notificationPrefs.assignments
        },
        language: preferences.language || 'de',
        timezone: preferences.timezone || 'Europe/Berlin'
      };
      
      const res = await fetch(`${baseUrl}/api/update-profile`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim() || null,
          color: color,
          preferences: updatedPreferences
        })
      });

      const json = await res.json();
      if (!res.ok || !json?.success) {
        throw new Error(json?.message || 'Fehler beim Speichern des Profils');
      }
      
      setSuccessMessage('Profil erfolgreich gespeichert!');
      
      setTimeout(() => {
        setSuccessMessage(null);
      }, 3000);
      
      onUpdate();
    } catch (err) {
      console.error('Fehler beim Speichern des Profils:', err);
      setError(err instanceof Error ? err.message : 'Fehler beim Speichern des Profils');
      
      setTimeout(() => {
        setError(null);
      }, 3000);
    }

    setIsSaving(false);
  };

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      setError('Bitte fülle alle Felder aus');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Die neuen Passwörter stimmen nicht überein');
      return;
    }

    if (newPassword.length < 6) {
      setError('Das neue Passwort muss mindestens 6 Zeichen lang sein');
      return;
    }

    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const baseUrl = import.meta.env.VITE_SERVER_BASE_URL as string | undefined;
      const token = localStorage.getItem('authToken') || '';

      if (!baseUrl || !token) {
        throw new Error('Nicht authentifiziert');
      }

      const response = await fetch(`${baseUrl}/api/auth/change-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          currentPassword,
          newPassword
        })
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Fehler beim Ändern des Passworts');
      }

      setSuccessMessage('Passwort erfolgreich geändert!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');

      setTimeout(() => {
        setSuccessMessage(null);
      }, 3000);
    } catch (error: any) {
      setError(error.message || 'Fehler beim Ändern des Passworts');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSavePreferences = async () => {
    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);

    const updatedPreferences = {
      ...preferences,
      notifications: notificationPrefs,
    };

    // Preferences Update wird über PHP Backend gemacht
    // Hier könnte eine API für Preferences-Updates hinzugefügt werden
    setSuccessMessage('Präferenzen werden über das Backend verwaltet.');
    
    setTimeout(() => {
      setSuccessMessage(null);
    }, 3000);

    setIsSaving(false);
    onUpdate();
  };

  const handleSave = () => {
    if (activeTab === 'profile') {
      handleSaveProfile();
    } else if (activeTab === 'password') {
      handleChangePassword();
    } else if (activeTab === 'preferences') {
      handleSavePreferences();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="surface rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-slate-200 dark:border-slate-700">
        <div className="sticky top-0 surface border-b border-slate-200 dark:border-slate-700 px-6 py-4 flex items-center justify-between rounded-t-2xl">
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Einstellungen</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition"
          >
            <X className="w-5 h-5 text-slate-600 dark:text-slate-400" />
          </button>
        </div>

        <div className="flex border-b border-slate-200 dark:border-slate-700">
          <button
            onClick={() => setActiveTab('profile')}
            className={`flex-1 px-6 py-3 font-medium transition ${
              activeTab === 'profile'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
            }`}
          >
            <User className="w-4 h-4 inline-block mr-2" />
            Profil
          </button>
          <button
            onClick={() => setActiveTab('password')}
            className={`flex-1 px-6 py-3 font-medium transition ${
              activeTab === 'password'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
            }`}
          >
            <Lock className="w-4 h-4 inline-block mr-2" />
            Passwort
          </button>
          <button
            onClick={() => setActiveTab('preferences')}
            className={`flex-1 px-6 py-3 font-medium transition ${
              activeTab === 'preferences'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
            }`}
          >
            <Bell className="w-4 h-4 inline-block mr-2" />
            Benachrichtigungen
          </button>
        </div>

        <div className="p-6 space-y-6">
          {error && (
            <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 rounded-lg p-4">
              <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
            </div>
          )}

          {successMessage && (
            <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900/50 rounded-lg p-4">
              <p className="text-sm text-green-800 dark:text-green-200">{successMessage}</p>
            </div>
          )}

          {activeTab === 'profile' && (
            <>
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
                  <User className="w-4 h-4" />
                  Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Dein Name"
                  className="w-full px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition surface text-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
                  <Mail className="w-4 h-4" />
                  E-Mail
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="deine@email.de"
                  className="w-full px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition surface text-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
                  <Palette className="w-4 h-4" />
                  Farbe
                </label>
                <div className="grid grid-cols-4 gap-3">
                  {COLOR_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => setColor(option.value)}
                      className={`relative aspect-square rounded-lg ${option.bgClass} ${
                        color === option.value ? 'ring-4 ring-offset-2 ring-blue-500' : ''
                      } ${option.hoverClass} transition flex items-center justify-center group`}
                      title={option.label}
                    >
                      {color === option.value && (
                        <div className="w-6 h-6 bg-white dark:bg-slate-800 rounded-full flex items-center justify-center">
                          <div className="w-2 h-2 bg-slate-900 rounded-full"></div>
                        </div>
                      )}
                      <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-xs text-slate-600 opacity-0 group-hover:opacity-100 transition whitespace-nowrap">
                        {option.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
                <div className="bg-slate-50 dark:bg-slate-900/40 rounded-lg p-4">
                  <h3 className="text-sm font-medium text-slate-900 dark:text-slate-100 mb-2">Vorschau</h3>
                  <div className="flex items-center gap-3">
                    <div className={`w-12 h-12 ${COLOR_OPTIONS.find(c => c.value === color)?.bgClass || 'bg-slate-500'} rounded-full flex items-center justify-center text-white font-bold text-lg`}>
                      {name.charAt(0).toUpperCase() || '?'}
                    </div>
                    <div>
                      <p className="font-medium text-slate-900 dark:text-slate-100">{name || 'Dein Name'}</p>
                      <p className="text-sm text-slate-600 dark:text-slate-400">{email || 'Keine E-Mail'}</p>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {activeTab === 'password' && (
            <>
              <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/50 rounded-lg p-4">
                <p className="text-sm text-blue-800 dark:text-blue-200">
                  Ändere hier dein Passwort. Das neue Passwort muss mindestens 6 Zeichen lang sein.
                </p>
              </div>

              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
                  <Lock className="w-4 h-4" />
                  Aktuelles Passwort
                </label>
                <div className="relative">
                  <input
                    type={showCurrentPassword ? 'text' : 'password'}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-4 py-3 pr-12 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition surface text-slate-900 dark:text-slate-100"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
                  >
                    {showCurrentPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
                  <Lock className="w-4 h-4" />
                  Neues Passwort
                </label>
                <div className="relative">
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-4 py-3 pr-12 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition surface text-slate-900 dark:text-slate-100"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
                  >
                    {showNewPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
                  <Lock className="w-4 h-4" />
                  Passwort bestätigen
                </label>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-4 py-3 pr-12 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition surface text-slate-900 dark:text-slate-100"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
                  >
                    {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>
            </>
          )}

          {activeTab === 'preferences' && (
            <>
              <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/50 rounded-lg p-4">
                <p className="text-sm text-blue-800 dark:text-blue-200">
                  Wähle, welche Benachrichtigungen du erhalten möchtest.
                </p>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-900/40 rounded-lg">
                  <div>
                    <p className="font-medium text-slate-900 dark:text-slate-100">E-Mail Benachrichtigungen</p>
                    <p className="text-sm text-slate-600 dark:text-slate-400">Erhalte Updates per E-Mail</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={notificationPrefs.email}
                      onChange={(e) => setNotificationPrefs({ ...notificationPrefs, email: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-200 dark:bg-slate-700 peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white dark:peer-checked:after:border-slate-800 after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white dark:after:bg-slate-800 after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>

                <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-900/40 rounded-lg">
                  <div>
                    <p className="font-medium text-slate-900">Neue Anfragen</p>
                    <p className="text-sm text-slate-600">Bei neuen Tausch-Anfragen</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={notificationPrefs.requests}
                      onChange={(e) => setNotificationPrefs({ ...notificationPrefs, requests: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-200 dark:bg-slate-700 peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white dark:peer-checked:after:border-slate-800 after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white dark:after:bg-slate-800 after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>

                <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-900/40 rounded-lg">
                  <div>
                    <p className="font-medium text-slate-900">Übergaben</p>
                    <p className="text-sm text-slate-600">Bei Änderungen an Übergaben</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={notificationPrefs.handovers}
                      onChange={(e) => setNotificationPrefs({ ...notificationPrefs, handovers: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-200 dark:bg-slate-700 peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white dark:peer-checked:after:border-slate-800 after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white dark:after:bg-slate-800 after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>

                <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-900/40 rounded-lg">
                  <div>
                    <p className="font-medium text-slate-900">Neue Zuteilungen</p>
                    <p className="text-sm text-slate-600">Bei neuen Betreuungstagen</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={notificationPrefs.assignments}
                      onChange={(e) => setNotificationPrefs({ ...notificationPrefs, assignments: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-200 dark:bg-slate-700 peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white dark:peer-checked:after:border-slate-800 after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white dark:after:bg-slate-800 after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="sticky bottom-0 surface border-t border-slate-200 dark:border-slate-700 px-6 py-4 flex gap-3 rounded-b-2xl">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 font-medium transition"
          >
            Abbrechen
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <Save className="w-5 h-5" />
            {isSaving ? 'Speichert...' : 'Speichern'}
          </button>
        </div>
      </div>
    </div>
  );
}
