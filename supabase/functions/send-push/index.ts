/**
 * Versendet Push-Benachrichtigungen zu Urlaubsanträgen.
 *
 * Wird per Database Webhook auf public.leave_requests aufgerufen:
 *   INSERT eines Antrags   -> Nachricht an alle Büro-Konten
 *   UPDATE des Status      -> Nachricht an den Antragsteller
 *
 * Der Versand muss serverseitig laufen, weil die Nachricht mit dem privaten
 * VAPID-Schlüssel signiert wird. Im Browser wäre dieser Schlüssel für jeden
 * einsehbar.
 *
 * Deployment:
 *   supabase functions deploy send-push --no-verify-jwt
 *   supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:...
 */

import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'jsr:@supabase/supabase-js@2';

interface LeaveRequestRow {
  id: string;
  employee_id: string;
  type: 'vacation' | 'sick';
  start_date: string;
  end_date: string;
  status: 'pending' | 'approved' | 'rejected';
  days_count: number;
}

interface WebhookPayload {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  record: LeaveRequestRow | null;
  old_record: LeaveRequestRow | null;
}

const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY') ?? '';
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:buero@malerprofis-uderstadt.de';
const APP_URL = Deno.env.get('APP_URL') ?? 'https://timstuu.github.io/malerprofis-berichte/';

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

// Service-Role, weil die Funktion Empfänger über alle Mitarbeiter hinweg
// ermitteln muss. Sie wird ausschließlich vom Datenbank-Webhook aufgerufen.
const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

/** Wer soll die Nachricht bekommen, und wie lautet sie? */
async function planNotification(payload: WebhookPayload) {
  const record = payload.record;
  if (!record) return null;

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
    return {
      employeeIds: (admins ?? []).map((a) => a.id as string),
      title: 'Neuer Urlaubsantrag',
      body: `${name}: ${range}`,
      tag: `leave-${record.id}`,
    };
  }

  // Entscheidung: den Antragsteller informieren.
  if (
    payload.type === 'UPDATE' &&
    payload.old_record?.status === 'pending' &&
    record.status !== 'pending'
  ) {
    const approved = record.status === 'approved';
    return {
      employeeIds: [record.employee_id],
      title: approved ? 'Urlaub genehmigt' : 'Urlaubsantrag abgelehnt',
      body: approved
        ? `${range} · ${record.days_count} Tage wurden genehmigt.`
        : `${range} wurde leider abgelehnt.`,
      tag: `leave-${record.id}`,
    };
  }

  return null;
}

Deno.serve(async (req) => {
  if (!VAPID_PRIVATE_KEY) {
    console.error('VAPID_PRIVATE_KEY fehlt — es wird nichts versendet.');
    return new Response('not configured', { status: 500 });
  }

  let payload: WebhookPayload;
  try {
    payload = await req.json();
  } catch {
    return new Response('bad request', { status: 400 });
  }

  const plan = await planNotification(payload);
  if (!plan || plan.employeeIds.length === 0) {
    return new Response(JSON.stringify({ sent: 0, reason: 'kein Empfänger' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { data: subscriptions } = await supabase
    .from('push_subscriptions')
    .select('*')
    .in('employee_id', plan.employeeIds);

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

  return new Response(JSON.stringify({ sent, removed }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
