import { useEffect, useState } from 'react';
import { Bell, BellOff, Loader2 } from 'lucide-react';
import { currentPushState, disablePush, enablePush, pushSupport, type PushState } from '../../lib/push.ts';

/**
 * Ein-/Ausschalter für Benachrichtigungen.
 *
 * Die Berechtigung wird bewusst erst hier abgefragt und nicht beim ersten Start
 * der App: Eine Abfrage, die aus dem Nichts kommt, wird erfahrungsgemäß
 * weggeklickt — und danach lässt sie sich nur noch in den Systemeinstellungen
 * zurücknehmen.
 */
export default function PushToggle({ employeeId }: { employeeId: string }) {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    currentPushState().then(setState).catch(() => setState('unsupported'));
  }, []);

  const toggle = async () => {
    setError(null);
    setBusy(true);
    try {
      if (state === 'on') {
        await disablePush();
        setState('off');
      } else {
        await enablePush(employeeId);
        setState('on');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setState(await currentPushState().catch(() => 'off' as PushState));
    }
    setBusy(false);
  };

  if (state === null) {
    return (
      <div className="flex items-center gap-2 text-sm text-[#141414]/40">
        <Loader2 size={16} className="animate-spin" /> Prüfe Benachrichtigungen …
      </div>
    );
  }

  // Fälle, in denen ein Schalter nichts bewirken würde — mit Begründung statt
  // einer wirkungslosen Schaltfläche.
  if (state === 'unsupported' || state === 'needs-install' || state === 'not-configured') {
    return (
      <div className="space-y-1">
        <p className="text-sm font-semibold text-[#141414]/70">Benachrichtigungen</p>
        <p className="text-xs text-[#141414]/50">{pushSupport().reason}</p>
      </div>
    );
  }

  if (state === 'denied') {
    return (
      <div className="space-y-1">
        <p className="text-sm font-semibold text-[#141414]/70">Benachrichtigungen</p>
        <p className="text-xs text-[#141414]/50">
          Für diese App abgelehnt. Das lässt sich nur in den Einstellungen des Geräts wieder
          erlauben.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-[#141414]/70">Benachrichtigungen</p>
          <p className="text-xs text-[#141414]/50">
            {state === 'on'
              ? 'Dieses Gerät wird über Urlaubsentscheidungen informiert.'
              : 'Erhalte eine Nachricht, sobald dein Urlaub entschieden wurde.'}
          </p>
        </div>
        <button
          onClick={toggle}
          disabled={busy}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold cursor-pointer disabled:opacity-60 shrink-0 ${
            state === 'on'
              ? 'bg-gray-100 hover:bg-gray-200 text-gray-700'
              : 'bg-brand-accent1 hover:bg-brand-accent1/90 text-white'
          }`}
        >
          {busy ? (
            <Loader2 size={16} className="animate-spin" />
          ) : state === 'on' ? (
            <BellOff size={16} />
          ) : (
            <Bell size={16} />
          )}
          {state === 'on' ? 'Ausschalten' : 'Einschalten'}
        </button>
      </div>

      {error && (
        <p className="text-xs text-red-600 bg-red-50/60 border border-red-100 rounded-xl p-3">
          {error}
        </p>
      )}
    </div>
  );
}
