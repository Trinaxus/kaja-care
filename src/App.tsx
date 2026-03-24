import { useAuth } from './contexts/AuthContext';
import { ProfileSelector } from './components/ProfileSelector';
import { LoadingState } from './components/ui/LoadingSpinner';
import { EnhancedDashboardServer } from './components/EnhancedDashboardServer';

function App() {
  const { profile, loading, switchProfile, signOut } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-cyan-50/30 flex items-center justify-center">
        <LoadingState message="KajaCare wird geladen..." />
      </div>
    );
  }

  if (!profile) {
    return <ProfileSelector onProfileSwitch={switchProfile} />;
  }

  return (
    <EnhancedDashboardServer currentProfile={profile} onSignOut={signOut} />
  );
}

export default App;
