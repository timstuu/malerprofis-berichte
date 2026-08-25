/**
 * Versendet Push-Benachrichtigungen.
 *
 * Wird per Database Webhook aufgerufen, für zwei Tabellen:
 *
 *   public.leave_requests
 *     INSERT eines Antrags   -> Nachricht an alle Büro-Konten
 *     UPDATE des Status      -> Nachricht an den Antragsteller
 *
 *   public.assignments
 *     INSERT / UPDATE / DELETE -> Nachricht an den betroffenen Maler
 *
 * Der Versand muss serverseitig laufen, weil die Nachricht mit dem privaten
 * VAPID-Schlüssel signiert wird. Im Browser wäre dieser Schlüssel für jeden
 * einsehbar.
 *
 * Was jemand bekommen möchte, steht in public.push_preferences. Dort wird nur
 * die Abweichung gespeichert: keine Zeile heißt "eingeschaltet".
 *
 * Einrichtung ohne CLI: siehe README, Abschnitt „Benachrichtigungen einrichten".
 * Die Funktion wird im Supabase-Dashboard angelegt und läuft ohne
 * JWT-Prüfung, damit der Datenbank-Webhook sie erreicht. Als Zugangsschutz
 * dient stattdessen das Secret WEBHOOK_SECRET, das der Webhook als Kopfzeile
 * mitschickt — ohne das könnte jeder, der die Adresse kennt, Nachrichten an
 * die Belegschaft auslösen.
 */

import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'jsr:@supabase/supabase-js@2';

/** Dieselben Bezeichner wie in src/lib/push.ts und in push_preferences. */
type PushKind = 'leave_submitted' | 'leave_decided' | 'plan_changed';

interface LeaveRequestRow {
  id: string;
  employee_id: string;
  type: 'vacation' | 'sick';
  start_date: string;
  end_date: string;
  status: 'pending' | 'approved' | 'rejected';
  days_count: number;
}

interface AssignmentRow {
  id: string;
  employee_id: string;
  site_id: string;
  date: string;
  start_time: string;
  end_time: string;
  note: string | null;
}

interface WebhookPayload {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  record: Record<string, unknown> | null;
  old_record: Record<string, unknown> | null;
}

/** Eine fertig geplante Nachricht mitsamt ihren Empfängern. */
interface Plan {
  kind: PushKind;
  employeeIds: string[];
  title: string;
  body: string;
  tag: string;
}

const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY') ?? '';
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:buero@malerprofis-uderstadt.de';
const WEBHOOK_SECRET = Deno.env.get('WEBHOOK_SECRET') ?? '';
const APP_URL = Deno.env.get('APP_URL') ?? 'https://timstuu.github.io/malerprofis-berichte/';

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

/**
 * Den geheimen Schlüssel ermitteln. Supabase hat die Benennung umgestellt:
 * Neue Projekte bekommen SUPABASE_SECRET_KEYS beziehungsweise
 * SUPABASE_SECRET_DEFAULT_KEY, ältere den bisherigen
 * SUPABASE_SERVICE_ROLE_KEY. (Bewusst in beiden Funktionen dupliziert — sie
 * werden einzeln über den Dashboard-Editor eingefügt und müssen für sich
 * allein lauffähig sein.)
 */
function resolveSecretKey(): string {
  const direct =
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ??
    Deno.env.get('SUPABASE_SECRET_KEY') ??
    Deno.env.get('SUPABASE_SECRET_DEFAULT_KEY');
  if (direct) return direct;

  const bundle = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (bundle) {
    try {
      const parsed = JSON.parse(bundle) as Record<string, string>;
      const value = parsed.default ?? Object.values(parsed)[0];
      if (value) return value;
    } catch {
      // Kein gültiges JSON — unten mit klarer Meldung abbrechen.
    }
  }

  throw new Error(
    'Kein geheimer Schlüssel in der Umgebung gefunden. In den Edge-Function-Secrets ' +
      'ein Secret namens SUPABASE_SECRET_KEY anlegen (Project Settings → API Keys).',
  );
}

// Erhöhte Rechte, weil die Funktion Empfänger über alle Mitarbeiter hinweg
// ermitteln muss. Sie wird ausschließlich vom Datenbank-Webhook aufgerufen.
const supabase = createClient(Deno.env.get('SUPABASE_URL')!, resolveSecretKey());

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

/** „08:00 – 16:30" aus zwei Zeitfeldern der Datenbank. */
function formatSpan(start: string, end: string): string {
  return `${start.slice(0, 5)} – ${end.slice(0, 5)}`;
}

/** Baustelle als „040-7 · Luisenweg 7". Fehlt sie, bleibt es leer. */
async function siteLabel(siteId: string | undefined): Promise<string> {
  if (!siteId) return '';
  const { data } = await supabase
    .from('sites')
    .select('number, address')
    .eq('id', siteId)
    .maybeSingle();
  if (!data) return '';
  return `${data.number} · ${data.address}`;
}

// ---------------------------------------------------------------------------
// Urlaubsanträge
// ---------------------------------------------------------------------------

async function planLeaveNotifications(payload: WebhookPayload): Promise<Plan[]> {
  const record = payload.record as unknown as LeaveRequestRow | null;
  if (!record) return [];

  const { data: employee } = await supabase
    .from('employees')
    .select('first_name, last_name')
    .eq('id', record.employee_id)
    .maybeSingle();

  const name = employee ? `${employee.first_name} ${employee.last_name}` : 'Ein Mitarbeiter';
  const range = `${formatDate(record.start_date)} – ${formatDate(record.end_date)}`;

  // Neuer Antrag: das Büro informieren.
  if (payload.type === 'INSERT' && record.status === 'pending') {
    const { data: admins } = await supabase.from('employees').select('id').eq('role', 'admin');
    return [
      {
        kind: 'leave_submitted',
        employeeIds: (admins ?? []).map((a) => a.id as string),
        title: 'Neuer Urlaubsantrag',
        body: `${name}: ${range}`,
        tag: `leave-${record.id}`,
      },
    ];
  }

  // Entscheidung: den Antragsteller informieren.
  const oldRecord = payload.old_record as unknown as LeaveRequestRow | null;
  if (payload.type === 'UPDATE' && oldRecord?.status === 'pending' && record.status !== 'pending') {
    const approved = record.status === 'approved';
    return [
      {
        kind: 'leave_decided',
        employeeIds: [record.employee_id],
        title: approved ? 'Urlaub genehmigt' : 'Urlaubsantrag abgelehnt',
        body: approved
          ? `${range} · ${record.days_count} Tage wurden genehmigt.`
          : `${range} wurde leider abgelehnt.`,
        tag: `leave-${record.id}`,
      },
    ];
  }

  return [];
}

// ---------------------------------------------------------------------------
// Einsatzplanung
// ---------------------------------------------------------------------------

/**
 * Ein Kennzeichen je Mitarbeiter und Tag.
 *
 * Das Gerät ersetzt eine Nachricht, deren Kennzeichen bereits angezeigt wird.
 * Plant das Büro einen Tag mehrfach um, bleibt so eine Nachricht stehen statt
 * fünf — der Maler soll wissen, dass sich der Tag geändert hat, und nicht jeden
 * Zwischenschritt mitlesen.
 */
function planTag(employeeId: string, date: string): string {
  return `plan-${employeeId}-${date}`;
}

/** Liegt an diesem Tag genehmigter Urlaub oder Krankheit vor? */
async function coveredByApprovedLeave(employeeId: string, date: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('leave_requests')
    .select('id')
    .eq('employee_id', employeeId)
    .eq('status', 'approved')
    .lte('start_date', date)
    .gte('end_date', date)
    .limit(1);
  if (error) {
    // Im Zweifel zustellen — lieber eine Nachricht zu viel als eine
    // verschwiegene Streichung.
    console.error('Urlaub konnte nicht geprüft werden:', error.message);
    return false;
  }
  return (data ?? []).length > 0;
}

/**
 * Nachrichten zu einer geänderten Planzeile.
 *
 * Der Mitarbeiterwechsel ist der Grund, warum hier mehrere Nachrichten
 * herauskommen können: Wird ein Einsatz umgehängt, verliert ihn der eine und
 * bekommt ihn der andere — beide müssen es erfahren.
 */
async function planAssignmentNotifications(payload: WebhookPayload): Promise<Plan[]> {
  const record = payload.record as unknown as AssignmentRow | null;
  const oldRecord = payload.old_record as unknown as AssignmentRow | null;

  if (payload.type === 'INSERT' && record) {
    const site = await siteLabel(record.site_id);
    return [
      {
        kind: 'plan_changed',
        employeeIds: [record.employee_id],
        title: `Neuer Einsatz am ${formatDate(record.date)}`,
        body: [site, formatSpan(record.start_time, record.end_time)].filter(Boolean).join(' · '),
        tag: planTag(record.employee_id, record.date),
      },
    ];
  }

  if (payload.type === 'DELETE' && oldRecord) {
    // Eine Urlaubsgenehmigung räumt alle Einsätze des Zeitraums weg
    // (approve_leave_request in 0002_leave.sql). Ohne diese Prüfung bekäme
    // jemand nach zwei Wochen Urlaub zehn Streichungen hinterhergeschickt,
    // obwohl die Genehmigung längst alles gesagt hat.
    if (await coveredByApprovedLeave(oldRecord.employee_id, oldRecord.date)) return [];

    const site = await siteLabel(oldRecord.site_id);
    return [
      {
        kind: 'plan_changed',
        employeeIds: [oldRecord.employee_id],
        title: `Einsatz am ${formatDate(oldRecord.date)} gestrichen`,
        body: site || 'Der Einsatz wurde aus der Planung entfernt.',
        tag: planTag(oldRecord.employee_id, oldRecord.date),
      },
    ];
  }

  if (payload.type === 'UPDATE' && record && oldRecord) {
    // Umgehängt: zwei Betroffene, zwei verschiedene Nachrichten.
    if (record.employee_id !== oldRecord.employee_id) {
      const [neu, alt] = await Promise.all([
        siteLabel(record.site_id),
        siteLabel(oldRecord.site_id),
      ]);
      return [
        {
          kind: 'plan_changed',
          employeeIds: [record.employee_id],
          title: `Neuer Einsatz am ${formatDate(record.date)}`,
          body: [neu, formatSpan(record.start_time, record.end_time)].filter(Boolean).join(' · '),
          tag: planTag(record.employee_id, record.date),
        },
        {
          kind: 'plan_changed',
          employeeIds: [oldRecord.employee_id],
          title: `Einsatz am ${formatDate(oldRecord.date)} gestrichen`,
          body: alt || 'Der Einsatz wurde jemand anderem zugeteilt.',
          tag: planTag(oldRecord.employee_id, oldRecord.date),
        },
      ];
    }

    // Sonst nur melden, wenn sich für den Maler wirklich etwas geändert hat.
    // Ohne diese Prüfung löst jedes Speichern eine Nachricht aus, auch wenn
    // nur ein technisches Feld angefasst wurde.
    const relevant: (keyof AssignmentRow)[] = [
      'date',
      'site_id',
      'start_time',
      'end_time',
      'note',
    ];
    if (relevant.every((field) => record[field] === oldRecord[field])) return [];

    const site = await siteLabel(record.site_id);
    const verschoben = record.date !== oldRecord.date;
    const title = verschoben
      ? `Einsatz verschoben auf ${formatDate(record.date)}`
      : `Einsatz am ${formatDate(record.date)} geändert`;

    const plans: Plan[] = [
      {
        kind: 'plan_changed',
        employeeIds: [record.employee_id],
        title,
        body: [site, formatSpan(record.start_time, record.end_time), record.note ?? '']
          .filter(Boolean)
          .join(' · '),
        tag: planTag(record.employee_id, record.date),
      },
    ];

    // Beim Verschieben trägt die Nachricht das Kennzeichen des neuen Tages.
    // Eine ältere Nachricht zum alten Tag bliebe daneben stehen und behauptete
    // weiter, dort sei etwas — deshalb wird sie mit einer leeren Nachricht
    // gleichen Kennzeichens überschrieben.
    if (verschoben) {
      plans.push({
        kind: 'plan_changed',
        employeeIds: [record.employee_id],
        title: `Einsatz am ${formatDate(oldRecord.date)} entfällt`,
        body: site || 'Der Einsatz wurde auf einen anderen Tag verschoben.',
        tag: planTag(record.employee_id, oldRecord.date),
      });
    }

    return plans;
  }

  return [];
}

/**
 * Entfernt alle Empfänger, die diese Art abgeschaltet haben.
 *
 * Gefragt wird nach `enabled = false`: Eine fehlende Zeile bedeutet
 * eingeschaltet, sonst bekäme niemand etwas, der die Einstellungen nie
 * geöffnet hat.
 */
async function applyPreferences(plan: Plan): Promise<string[]> {
  if (plan.employeeIds.length === 0) return [];
  const { data, error } = await supabase
    .from('push_preferences')
    .select('employee_id')
    .eq('kind', plan.kind)
    .eq('enabled', false)
    .in('employee_id', plan.employeeIds);

  if (error) {
    // Im Zweifel zustellen: Eine Nachricht zu viel ist besser als eine
    // verpasste Planänderung.
    console.error('Einstellungen konnten nicht gelesen werden:', error.message);
    return plan.employeeIds;
  }

  const off = new Set((data ?? []).map((row) => row.employee_id as string));
  return plan.employeeIds.filter((id) => !off.has(id));
}

/** Verschickt eine Nachricht an alle Geräte ihrer Empfänger. */
async function deliver(plan: Plan, employeeIds: string[]): Promise<{ sent: number; removed: number }> {
  const { data: subscriptions } = await supabase
    .from('push_subscriptions')
    .select('*')
    .in('employee_id', employeeIds);

  const message = JSON.stringify({
    title: plan.title,
    body: plan.body,
    tag: plan.tag,
    url: APP_URL,
  });

  let sent = 0;
  let removed = 0;

  for (const sub of subscriptions ?? []) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint as string,
          keys: { p256dh: sub.p256dh as string, auth: sub.auth as string },
        },
        message,
      );
      sent++;
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      // 404/410: Das Gerät hat die Anmeldung verworfen — Eintrag entfernen,
      // damit die Tabelle nicht mit toten Empfängern volläuft.
      if (status === 404 || status === 410) {
        await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
        removed++;
      } else {
        console.error('Push fehlgeschlagen:', status, (error as Error).message);
      }
    }
  }

  return { sent, removed };
}

Deno.serve(async (req) => {
  if (!VAPID_PRIVATE_KEY) {
    console.error('VAPID_PRIVATE_KEY fehlt — es wird nichts versendet.');
    return new Response('not configured', { status: 500 });
  }

  // Zugangsschutz: Die Funktion ist ohne JWT-Prüfung öffentlich erreichbar,
  // damit der Datenbank-Webhook sie aufrufen kann.
  if (WEBHOOK_SECRET) {
    if (req.headers.get('x-webhook-secret') !== WEBHOOK_SECRET) {
      return new Response('forbidden', { status: 403 });
    }
  } else {
    console.warn(
      'WEBHOOK_SECRET ist nicht gesetzt — die Funktion nimmt Aufrufe von überall an. ' +
        'Bitte Secret setzen und im Webhook als Kopfzeile x-webhook-secret mitschicken.',
    );
  }

  let payload: WebhookPayload;
  try {
    payload = await req.json();
  } catch {
    return new Response('bad request', { status: 400 });
  }

  let plans: Plan[];
  if (payload.table === 'leave_requests') {
    plans = await planLeaveNotifications(payload);
  } else if (payload.table === 'assignments') {
    plans = await planAssignmentNotifications(payload);
  } else {
    return new Response(JSON.stringify({ sent: 0, reason: `Tabelle ${payload.table} ignoriert` }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let sent = 0;
  let removed = 0;

  for (const plan of plans) {
    const recipients = await applyPreferences(plan);
    if (recipients.length === 0) continue;
    const result = await deliver(plan, recipients);
    sent += result.sent;
    removed += result.removed;
  }

  return new Response(JSON.stringify({ sent, removed }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
