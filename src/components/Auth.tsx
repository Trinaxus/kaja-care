import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { PawPrint } from 'lucide-react';

export function Auth() {
  const [selectedProfile, setSelectedProfile] = useState<'Lisa' | 'Martin'>('Lisa');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { switchProfile } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await switchProfile(selectedProfile, password);
    } catch (err: any) {
      setError(err.message || 'Ein Fehler ist aufgetreten');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-3 sm:p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl sm:rounded-3xl shadow-xl p-6 sm:p-8">
          <div className="text-center mb-6 sm:mb-8">
            <div className="inline-flex items-center justify-center w-14 h-14 sm:w-16 sm:h-16 bg-gradient-to-br from-blue-500 to-green-500 rounded-full mb-3 sm:mb-4">
              <PawPrint className="w-7 h-7 sm:w-8 sm:h-8 text-white" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-2">KajaCare</h1>
            <p className="text-sm sm:text-base text-slate-600">Gemeinsame Hundebetreuung für Martin & Lisa</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-3">
                Profil auswählen
              </label>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setSelectedProfile('Lisa')}
                  className={`flex-1 py-4 rounded-xl border-2 transition ${
                    selectedProfile === 'Lisa'
                      ? 'border-green-500 bg-green-50'
                      : 'border-slate-300 hover:border-green-300'
                  }`}
                >
                  <div className="w-8 h-8 bg-green-500 rounded-full mx-auto mb-2"></div>
                  <span className="text-sm font-medium text-slate-700">Lisa</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedProfile('Martin')}
                  className={`flex-1 py-4 rounded-xl border-2 transition ${
                    selectedProfile === 'Martin'
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-slate-300 hover:border-blue-300'
                  }`}
                >
                  <div className="w-8 h-8 bg-blue-500 rounded-full mx-auto mb-2"></div>
                  <span className="text-sm font-medium text-slate-700">Martin</span>
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Passwort
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                placeholder="••••••••"
                required
              />
            </div>

            {error && (
              <div className="bg-red-50 text-red-600 px-4 py-3 rounded-xl text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-blue-500 to-green-500 text-white font-medium py-2.5 sm:py-3 rounded-xl hover:from-blue-600 hover:to-green-600 transition disabled:opacity-50 text-sm sm:text-base"
            >
              {loading ? 'Bitte warten...' : 'Anmelden'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
