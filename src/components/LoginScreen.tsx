import { useState } from 'react';
import { LogIn, Loader2 } from 'lucide-react';
import { useAuth } from '../lib/auth.tsx';
import Logo from './Logo.tsx';

/**
 * Anmeldung mit E-Mail und Passwort.
 * Konten werden ausschließlich im Büro angelegt — es gibt bewusst keine
 * Selbstregistrierung.
 */
export default function LoginScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setBusy(true);
    const { error: signInError } = await signIn(email, password);
    if (signInError) setError(signInError);
    setBusy(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-brand-bg p-6">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-8">
          <Logo className="h-20 w-auto" />
        </div>

        <form
          onSubmit={submit}
          className="bg-white p-6 rounded-3xl shadow-sm border border-[#141414]/5 space-y-4"
        >
          <div>
            <h1 className="text-xl font-bold text-[#141414]">Anmelden</h1>
            <p className="text-sm text-gray-500 mt-1">
              Mit den Zugangsdaten, die du vom Büro bekommen hast.
            </p>
          </div>

          <div className="space-y-1">
            <label htmlFor="email" className="text-xs font-bold uppercase tracking-wider text-gray-500">
              E-Mail
            </label>
            <input
              id="email"
              type="email"
              inputMode="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-accent1/40"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="password" className="text-xs font-bold uppercase tracking-wider text-gray-500">
              Passwort
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-accent1/40"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50/60 border border-red-100 rounded-xl p-3">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full flex items-center justify-center gap-2 bg-brand-accent1 hover:bg-brand-accent1/90 disabled:opacity-60 text-white font-bold py-3 rounded-xl transition-colors"
          >
            {busy ? <Loader2 size={18} className="animate-spin" /> : <LogIn size={18} />}
            {busy ? 'Anmelden …' : 'Anmelden'}
          </button>
        </form>

        <p className="text-center text-xs text-gray-400 mt-6">
          Passwort vergessen? Bitte im Büro melden.
        </p>
      </div>
    </div>
  );
}
