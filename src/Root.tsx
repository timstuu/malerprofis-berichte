import { Loader2 } from 'lucide-react';
import App from './App.tsx';
import LoginScreen from './components/LoginScreen.tsx';
import Logo from './components/Logo.tsx';
import TvBoard from './features/tv/TvBoard.tsx';
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
  const { session, employee, loading, profileMissing, profileError, signOut } = useAuth();

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

  // Ohne geladenes Profil kennt die App die eigene Identität nicht und würde
  // überall leere Listen zeigen, ohne den Grund zu nennen. Deshalb hier
  // abfangen statt weiterlaufen.
  if (profileError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-brand-bg p-6">
        <div className="w-full max-w-md bg-white p-6 rounded-3xl shadow-sm border border-[#141414]/5 space-y-4">
          <div className="flex justify-center">
            <Logo className="h-16 w-auto" />
          </div>
          <h1 className="text-lg font-bold text-[#141414] text-center">
            Daten konnten nicht geladen werden
          </h1>
          <p className="text-sm text-gray-500">
            Die Anmeldung hat geklappt, aber die Mitarbeiterdaten sind nicht abrufbar. Meist fehlen
            die Zugriffsregeln in der Datenbank — dann muss{' '}
            <code className="bg-gray-100 px-1 rounded text-xs">0001_init.sql</code> vollständig
            ausgeführt werden.
          </p>
          <p className="text-xs text-gray-400 bg-gray-50 border border-gray-100 rounded-xl p-3 font-mono break-words">
            {profileError}
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => window.location.reload()}
              className="flex-1 bg-brand-accent1 hover:bg-brand-accent1/90 text-white font-bold py-3 rounded-xl transition-colors cursor-pointer"
            >
              Erneut versuchen
            </button>
            <button
              onClick={signOut}
              className="flex-1 bg-gray-50 hover:bg-gray-100 border border-gray-100 text-gray-700 font-bold py-3 rounded-xl transition-colors cursor-pointer"
            >
              Abmelden
            </button>
          </div>
        </div>
      </div>
    );
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

  // Das Anzeigekonto des Fernsehers kann ohnehin nichts anderes als lesen und
  // landet deshalb direkt auf der Büroanzeige. Mit #tv lässt sie sich zum
  // Einrichten auch von einem Büro-Konto aus öffnen.
  //
  // Absichtlich über den Adress-Anker statt über einen Pfad: GitHub Pages
  // liefert für /tv einen 404, weil dort keine Anwendung läuft, die den Pfad
  // auflösen könnte.
  if (employee?.role === 'tv' || window.location.hash === '#tv') {
    return <TvBoard />;
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
