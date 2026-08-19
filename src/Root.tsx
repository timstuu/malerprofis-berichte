import { Loader2 } from 'lucide-react';
import App from './App.tsx';
import LoginScreen from './components/LoginScreen.tsx';
import Logo from './components/Logo.tsx';
import { AuthProvider, useAuth } from './lib/auth.tsx';
import { isSupabaseConfigured } from './lib/supabase.ts';

/**
 * Wird angezeigt, wenn der Build ohne Supabase-Zugangsdaten erzeugt wurde —
 * etwa weil die Repository-Secrets fehlen. Besser eine erklärende Seite als
 * eine weiße.
 */
function NotConfigured() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-brand-bg p-6">
      <div className="w-full max-w-md bg-white p-6 rounded-3xl shadow-sm border border-[#141414]/5 space-y-3">
        <h1 className="text-lg font-bold text-[#141414]">App ist noch nicht eingerichtet</h1>
        <p className="text-sm text-gray-500">
          Die Verbindung zur Datenbank fehlt. Im Repository müssen die beiden Secrets{' '}
          <code className="bg-gray-100 px-1 rounded">VITE_SUPABASE_URL</code> und{' '}
          <code className="bg-gray-100 px-1 rounded">VITE_SUPABASE_ANON_KEY</code> hinterlegt und
          die Seite anschließend neu veröffentlicht werden.
        </p>
        <p className="text-xs text-gray-400">
          Die Einrichtungsschritte stehen in der README des Projekts.
        </p>
      </div>
    </div>
  );
}

/**
 * Einstiegspunkt hinter der Anmeldung. Ohne gültige Sitzung kommt niemand an
 * Daten — das ist die Grundlage dafür, dass die Sicherheitsregeln in der
 * Datenbank überhaupt greifen können.
 */
function Gate() {
  const { session, loading, profileMissing, signOut } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-brand-bg">
        <Loader2 size={28} className="animate-spin text-brand-accent1" />
      </div>
    );
  }

  if (!session) {
    return <LoginScreen />;
  }

  if (profileMissing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-brand-bg p-6">
        <div className="w-full max-w-sm bg-white p-6 rounded-3xl shadow-sm border border-[#141414]/5 space-y-4 text-center">
          <div className="flex justify-center">
            <Logo className="h-16 w-auto" />
          </div>
          <h1 className="text-lg font-bold text-[#141414]">Konto noch nicht freigeschaltet</h1>
          <p className="text-sm text-gray-500">
            Zu dieser Anmeldung sind im Büro noch keine Mitarbeiterdaten hinterlegt. Bitte im Büro
            melden.
          </p>
          <button
            onClick={signOut}
            className="w-full bg-gray-50 hover:bg-gray-100 border border-gray-100 text-gray-700 font-bold py-3 rounded-xl transition-colors"
          >
            Abmelden
          </button>
        </div>
      </div>
    );
  }

  return <App />;
}

export default function Root() {
  if (!isSupabaseConfigured) return <NotConfigured />;

  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}
