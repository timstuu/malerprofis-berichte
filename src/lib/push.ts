import { supabase } from './supabase.ts';

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
