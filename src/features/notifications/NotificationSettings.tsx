import { useEffect, useState } from 'react';
import { Bell, BellOff, Loader2 } from 'lucide-react';
import {
  currentPushState,
  disablePush,
  enablePush,
  fetchDisabledKinds,
  pushSupport,
  setKindEnabled,
  PUSH_KINDS,
  type PushKind,
  type PushState,
} from '../../lib/push.ts';
import type { Employee } from '../../lib/database.types.ts';

/**
 * Benachrichtigungen in den Einstellungen.
 *
 * Zwei Ebenen, die bewusst verschieden weit reichen:
 *
 * - Der obere Schalter meldet **dieses Gerät** an. Anders geht es nicht — die
 *   Anmeldung gehört zum Browser, nicht zur Person.
 * - Die Schalter darunter gelten für die **Person** auf allen ihren Geräten.
 *   Wer die Planänderung am Handy nicht will, will sie auch am Tablet nicht.
 *
 * Die Berechtigung wird erst beim Einschalten abgefragt und nicht beim ersten
 * Start der App: Eine Abfrage, die aus dem Nichts kommt, wird erfahrungsgemäß
 * weggeklickt — und danach lässt sie sich nur noch in den Systemeinstellungen
 * zurücknehmen.
 */
export default function NotificationSettings({ employee }: { employee: Employee }) {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Nur die abgeschalteten Arten — alles andere ist an. */
  const [disabled, setDisabled] = useState<Set<PushKind> | null>(null);
  const [busyKind, setBusyKind] = useState<PushKind | null>(null);

  useEffect(() => {
    currentPushState().then(setState).catch(() => setState('unsupported'));
  }, []);

  useEffect(() => {
    fetchDisabledKinds(employee.id)
      .then(setDisabled)
      // Ohne geladene Einstellungen wird nichts angezeigt statt etwas Falsches:
      // ein Schalter, der „an" zeigt, obwohl er aus ist, wäre schlimmer.
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [employee.id]);

  const toggleDevice = async () => {
    setError(null);
    setBusy(true);
    try {
      if (state === 'on') {
        await disablePush();
        setState('off');
      } else {
        await enablePush(employee.id);
        setState('on');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setState(await currentPushState().catch(() => 'off' as PushState));
    }
    setBusy(false);
  };

  const toggleKind = async (kind: PushKind, nextEnabled: boolean) => {
    if (!disabled) return;
    setError(null);
    setBusyKind(kind);
    // Sofort umschalten, damit der Schalter nicht hängt. Schlägt das Speichern
    // fehl, wird zurückgedreht — sonst zeigt die App einen Zustand an, den die
    // Datenbank nicht kennt.
    const optimistic = new Set(disabled);
    if (nextEnabled) optimistic.delete(kind);
    else optimistic.add(kind);
    setDisabled(optimistic);
    try {
      await setKindEnabled(employee.id, kind, nextEnabled);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setDisabled(disabled);
    }
    setBusyKind(null);
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

  const kinds = PUSH_KINDS.filter((k) => k.onlyRole === null || k.onlyRole === employee.role);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-[#141414]/70">Benachrichtigungen</p>
          <p className="text-xs text-[#141414]/50">
            {state === 'on'
              ? 'Dieses Gerät ist angemeldet.'
              : 'Dieses Gerät ist nicht angemeldet.'}
          </p>
        </div>
        <button
          onClick={toggleDevice}
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

      {/* Die Einzelschalter stehen auch bei abgemeldetem Gerät zur Verfügung:
          Sie gelten für alle Geräte, und wer sich hier vorbereitet, bekommt
          nach dem Anmelden gleich das Richtige. Der Hinweis sagt, dass gerade
          trotzdem nichts ankommt. */}
      {state === 'off' && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3">
          Solange dieses Gerät nicht angemeldet ist, kommt hier nichts an — unabhängig von den
          Einstellungen darunter.
        </p>
      )}

      {disabled === null ? (
        <div className="flex items-center gap-2 text-sm text-[#141414]/40">
          <Loader2 size={16} className="animate-spin" /> Lade Einstellungen …
        </div>
      ) : (
        <div className="rounded-2xl border border-[#141414]/5 divide-y divide-[#141414]/5 overflow-hidden">
          {kinds.map(({ kind, title, description }) => {
            const on = !disabled.has(kind);
            return (
              <div key={kind} className="p-4 flex items-center justify-between gap-4 bg-white">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[#141414]/80">{title}</p>
                  <p className="text-xs text-[#141414]/50 mt-0.5">{description}</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={on}
                  aria-label={title}
                  disabled={busyKind === kind}
                  onClick={() => toggleKind(kind, !on)}
                  className={`relative w-12 h-7 rounded-full shrink-0 transition-colors cursor-pointer disabled:opacity-60 ${
                    on ? 'bg-brand-accent1' : 'bg-gray-300'
                  }`}
                >
                  <span
                    className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow transition-all ${
                      on ? 'left-6' : 'left-1'
                    }`}
                  />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {error && (
        <p className="text-xs text-red-600 bg-red-50/60 border border-red-100 rounded-xl p-3">
          {error}
        </p>
      )}
    </div>
  );
}
