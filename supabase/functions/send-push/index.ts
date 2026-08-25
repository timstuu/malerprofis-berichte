/**
 * Versendet Push-Benachrichtigungen.
 *
 * Wird per Database Webhook aufgerufen, für zwei Tabellen:
 *
 *   public.leave_requests
 *     INSERT eines Antrags   -> Nachricht an alle Büro-Konten
 *     UPDATE des Status      -> Nachricht an den Antragsteller
 *
 *   public.plan_change_events
 *     INSERT -> eine Sammelmeldung je Woche an die betroffenen Maler
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

/** Eine abgeschlossene Planungsrunde: eine Woche, die betroffenen Maler. */
interface PlanChangeRow {
  id: string;
  week_start: string;
  employee_ids: string[];
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
// Planänderungen
// ---------------------------------------------------------------------------

/**
 * Die Kalenderwoche nach ISO 8601.
 *
 * Von Hand gerechnet, weil in dieser Umgebung keine Datumsbibliothek liegt und
 * eine falsche Wochennummer die Nachricht wertlos macht: Sie ist alles, was
 * darin steht. Die Regel lautet, dass die Woche zu dem Jahr gehört, in dem ihr
 * Donnerstag liegt — deshalb der Umweg über diesen Tag.
 */
function isoWeek(dateIso: string): number {
  const d = new Date(`${dateIso}T00:00:00Z`);
  const weekday = (d.getUTCDay() + 6) % 7; // Montag = 0
  d.setUTCDate(d.getUTCDate() - weekday + 3); // Donnerstag dieser Woche

  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const firstWeekday = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstWeekday + 3);

  const week = 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * 24 * 3600 * 1000));
  return week;
}

/**
 * Eine Meldung für eine abgeschlossene Planungsrunde.
 *
 * Bewusst ohne Baustelle, Uhrzeit und Art der Änderung: Wer einen Tag umplant,
 * erzeugt ein Dutzend Einzelschritte, und die zusammen sind am Handy nicht zu
 * lesen. Was sich genau geändert hat, steht im Raster — die Nachricht sagt nur,
 * dass es sich lohnt, dort nachzusehen.
 */
function planChangeNotifications(payload: WebhookPayload): Plan[] {
  if (payload.type !== 'INSERT') return [];
  const record = payload.record as unknown as PlanChangeRow | null;
  if (!record || !record.employee_ids || record.employee_ids.length === 0) return [];

  const week = isoWeek(record.week_start);
  return [
    {
      kind: 'plan_changed',
      employeeIds: record.employee_ids,
      title: 'Planung geändert',
      body: `Die Planung wurde für die KW ${week} geändert.`,
      // Je Woche ein Kennzeichen: Wird dieselbe Woche mehrfach überarbeitet,
      // ersetzt die neue Meldung die alte, statt sich daneben zu stapeln.
      tag: `plan-week-${record.week_start}`,
    },
  ];
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
  } else if (payload.table === 'plan_change_events') {
    plans = planChangeNotifications(payload);
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
