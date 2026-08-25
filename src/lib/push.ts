import { supabase } from './supabase.ts';
import type { Role } from './database.types.ts';

/**
 * Push-Benachrichtigungen.
 *
 * Auf dem iPhone funktionieren sie ausschließlich, wenn die App über
 * „Zum Home-Bildschirm" installiert wurde (ab iOS 16.4) — im Safari-Tab gibt es
 * gar keine Push-API. Deshalb prüft `pushSupport()` das ausdrücklich und
 * liefert einen Grund, statt die Schaltfläche wirkungslos anzuzeigen.
 */

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

export type PushState = 'unsupported' | 'needs-install' | 'not-configured' | 'denied' | 'off' | 'on';

/** Läuft die App als installierte PWA? */
function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS meldet das über eine eigene, nicht standardisierte Eigenschaft.
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function isIOS(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

export function pushSupport(): { ok: boolean; reason?: string } {
  if (!('serviceWorker' in navigator)) {
    return { ok: false, reason: 'Dieser Browser unterstützt keine Benachrichtigungen.' };
  }
  if (!('PushManager' in window)) {
    if (isIOS() && !isStandalone()) {
      return {
        ok: false,
        reason:
          'Auf dem iPhone gibt es Benachrichtigungen nur, wenn die App über „Teilen → Zum Home-Bildschirm" installiert ist. Bitte von dort öffnen.',
      };
    }
    return { ok: false, reason: 'Dieser Browser unterstützt keine Benachrichtigungen.' };
  }
  if (!VAPID_PUBLIC_KEY) {
    return { ok: false, reason: 'Benachrichtigungen sind noch nicht eingerichtet (Schlüssel fehlt).' };
  }
  return { ok: true };
}

export async function currentPushState(): Promise<PushState> {
  const support = pushSupport();
  if (!support.ok) {
    if (!VAPID_PUBLIC_KEY) return 'not-configured';
    return isIOS() && !isStandalone() ? 'needs-install' : 'unsupported';
  }
  if (Notification.permission === 'denied') return 'denied';

  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  return existing ? 'on' : 'off';
}

/**
 * Fragt die Berechtigung ab und hinterlegt das Gerät in der Datenbank.
 * Ein Mitarbeiter kann mehrere Geräte anmelden.
 */
export async function enablePush(employeeId: string): Promise<void> {
  const support = pushSupport();
  if (!support.ok) throw new Error(support.reason);

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Ohne die Erlaubnis des Geräts können keine Benachrichtigungen ankommen.');
  }

  const registration = await navigator.serviceWorker.ready;
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY!),
    }));

  const json = subscription.toJSON();
  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      employee_id: employeeId,
      endpoint: subscription.endpoint,
      p256dh: json.keys?.p256dh ?? '',
      auth: json.keys?.auth ?? '',
    },
    { onConflict: 'endpoint' },
  );
  if (error) throw new Error(`Gerät konnte nicht angemeldet werden: ${error.message}`);
}

export async function disablePush(): Promise<void> {
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;

  await supabase.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint);
  await subscription.unsubscribe();
}

/**
 * Der VAPID-Schlüssel liegt als base64url vor, die Push-API erwartet Bytes.
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

// ---------------------------------------------------------------------------
// Welche Benachrichtigungen jemand bekommen möchte
// ---------------------------------------------------------------------------

/**
 * Die Arten von Nachrichten, die es gibt.
 *
 * Dieselben Bezeichner stehen in der Edge Function und in der Prüfregel der
 * Tabelle push_preferences — kommt eine Art dazu, müssen alle drei Stellen
 * angefasst werden.
 */
export type PushKind = 'leave_submitted' | 'leave_decided' | 'plan_changed';

/** Beschreibung je Art, dazu die Rolle, für die sie überhaupt vorkommt. */
export const PUSH_KINDS: {
  kind: PushKind;
  title: string;
  description: string;
  /** `null` = für alle. Sonst nur für diese Rolle sichtbar. */
  onlyRole: Role | null;
}[] = [
  {
    kind: 'plan_changed',
    title: 'Planänderung',
    description: 'Wenn das Büro einen deiner Einsätze anlegt, verschiebt oder streicht.',
    // Im Planungsraster stehen nur Maler; ein Büro-Konto bekäme das nie.
    onlyRole: 'worker',
  },
  {
    kind: 'leave_decided',
    title: 'Urlaub entschieden',
    description: 'Wenn dein Urlaubsantrag genehmigt oder abgelehnt wurde.',
    onlyRole: null,
  },
  {
    kind: 'leave_submitted',
    title: 'Neuer Urlaubsantrag',
    description: 'Wenn ein Mitarbeiter Urlaub beantragt.',
    // Entschieden wird im Büro — nur dort ist die Nachricht sinnvoll.
    onlyRole: 'admin',
  },
];

/**
 * Die abgeschalteten Arten einer Person.
 *
 * Gespeichert wird nur die Abweichung: Was nicht in der Antwort steht, ist an.
 */
export async function fetchDisabledKinds(employeeId: string): Promise<Set<PushKind>> {
  const { data, error } = await supabase
    .from('push_preferences')
    .select('kind, enabled')
    .eq('employee_id', employeeId);
  if (error) {
    throw new Error(`Einstellungen konnten nicht geladen werden: ${error.message}`);
  }
  return new Set(
    (data ?? []).filter((row) => row.enabled === false).map((row) => row.kind as PushKind),
  );
}

/** Schaltet eine Art für diese Person ein oder aus. */
export async function setKindEnabled(
  employeeId: string,
  kind: PushKind,
  enabled: boolean,
): Promise<void> {
  const { error } = await supabase.from('push_preferences').upsert(
    { employee_id: employeeId, kind, enabled, updated_at: new Date().toISOString() },
    { onConflict: 'employee_id,kind' },
  );
  if (error) {
    throw new Error(`Einstellung konnte nicht gespeichert werden: ${error.message}`);
  }
}
