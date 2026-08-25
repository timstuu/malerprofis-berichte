/**
 * Prüft die Entscheidungslogik von send-push/index.ts.
 *
 * Die Funktion läuft unter Deno und ist deshalb von `tsc` ausgenommen — ohne
 * diesen Test fällt ein Fehler darin erst auf, wenn jemand keine Nachricht
 * bekommt. Da die Datei als Ganzes ins Supabase-Dashboard kopierbar bleiben
 * muss, darf sie nicht in Module zerlegt werden: Statt einer Kopie wird hier
 * der Originaltext geladen, die Deno-/npm-Umgebung ersetzt und der Handler
 * unmittelbar aufgerufen.
 *
 * Läuft mit `npm test`. Geprüft wird die Entscheidung — wer bekommt was —,
 * nicht der Versand selbst; webpush ist ersetzt.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = path.dirname(fileURLToPath(import.meta.url));
const require_ = createRequire(import.meta.url);
const { transform } = require_('esbuild');

const SRC = path.join(here, 'index.ts');

// --- Datenbestand, gegen den die Funktion arbeitet -------------------------
const DB = {
  employees: [
    { id: 'admin-1', role: 'admin', first_name: 'Bea', last_name: 'Büro' },
    { id: 'admin-2', role: 'admin', first_name: 'Otto', last_name: 'Office' },
    { id: 'maler-1', role: 'worker', first_name: 'Max', last_name: 'Maler' },
    { id: 'maler-2', role: 'worker', first_name: 'Mia', last_name: 'Maler' },
  ],
  sites: [
    { id: 'site-1', number: '040-7', address: 'Luisenweg 7' },
    { id: 'site-2', number: '050-7', address: 'Krank' },
  ],
  push_subscriptions: [
    { endpoint: 'ep-admin-1', employee_id: 'admin-1', p256dh: 'x', auth: 'y' },
    { endpoint: 'ep-admin-2', employee_id: 'admin-2', p256dh: 'x', auth: 'y' },
    { endpoint: 'ep-maler-1', employee_id: 'maler-1', p256dh: 'x', auth: 'y' },
    { endpoint: 'ep-maler-1b', employee_id: 'maler-1', p256dh: 'x', auth: 'y' }, // zweites Gerät
    { endpoint: 'ep-maler-2', employee_id: 'maler-2', p256dh: 'x', auth: 'y' },
  ],
  push_preferences: [],
  leave_requests: [],
};

let sentMessages = [];

function makeQuery(table) {
  let rows = JSON.parse(JSON.stringify(DB[table] ?? []));
  const api = {
    select() { return api; },
    eq(col, val) { rows = rows.filter((r) => r[col] === val); return api; },
    in(col, vals) { rows = rows.filter((r) => vals.includes(r[col])); return api; },
    lte(col, val) { rows = rows.filter((r) => r[col] <= val); return api; },
    gte(col, val) { rows = rows.filter((r) => r[col] >= val); return api; },
    limit(n) { rows = rows.slice(0, n); return api; },
    maybeSingle() { return Promise.resolve({ data: rows[0] ?? null, error: null }); },
    delete() { return api; },
    then(resolve) { return Promise.resolve({ data: rows, error: null }).then(resolve); },
  };
  return api;
}

const supabaseStub = { from: (table) => makeQuery(table) };

async function loadHandler() {
  let src = fs.readFileSync(SRC, 'utf8');
  src = src.replace(/^import .*$/gm, '');
  const { code } = await transform(src, { loader: 'ts', format: 'esm' });

  let handler = null;
  const Deno = {
    env: {
      get: (k) =>
        ({
          VAPID_PUBLIC_KEY: 'pub',
          VAPID_PRIVATE_KEY: 'priv',
          WEBHOOK_SECRET: 'geheim',
          SUPABASE_URL: 'https://example.test',
          SUPABASE_SERVICE_ROLE_KEY: 'service',
          APP_URL: 'https://app.test/',
        })[k],
    },
    serve: (fn) => { handler = fn; },
  };
  const webpush = {
    setVapidDetails() {},
    sendNotification(sub, msg) { sentMessages.push({ endpoint: sub.endpoint, ...JSON.parse(msg) }); },
  };
  const createClient = () => supabaseStub;

  const factory = new Function('Deno', 'webpush', 'createClient', `${code}\nreturn null;`);
  factory(Deno, webpush, createClient);
  return handler;
}

async function fire(handler, payload) {
  sentMessages = [];
  const res = await handler(
    new Request('https://x.test', {
      method: 'POST',
      headers: { 'x-webhook-secret': 'geheim', 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  );
  return { body: await res.json(), messages: sentMessages };
}

const A = (over = {}) => ({
  id: 'a-1', employee_id: 'maler-1', site_id: 'site-1',
  date: '2026-09-01', start_time: '08:00:00', end_time: '16:30:00', note: null, ...over,
});

let failed = 0;
function check(name, cond, detail) {
  if (cond) { console.log(`OK    ${name}`); }
  else { failed++; console.log(`FEHLER ${name}${detail ? ` — ${detail}` : ''}`); }
}

const handler = await loadHandler();

// 1. Abgeschlossene Planungsrunde -> eine Sammelmeldung an die Betroffenen
{
  const { messages } = await fire(handler, {
    type: 'INSERT', table: 'plan_change_events',
    record: { id: 'e-1', week_start: '2026-08-24', employee_ids: ['maler-1'] },
    old_record: null,
  });
  check('Planungsrunde erreicht beide Geräte des Malers',
    messages.length === 2 && messages.every((m) => m.endpoint.startsWith('ep-maler-1')),
    JSON.stringify(messages.map((m) => m.endpoint)));
  check('Der Text nennt genau die Kalenderwoche',
    messages[0]?.body === 'Die Planung wurde für die KW 35 geändert.', messages[0]?.body);
  check('Titel bleibt schlicht', messages[0]?.title === 'Planung geändert', messages[0]?.title);
  check('Kennzeichen je Woche', messages[0]?.tag === 'plan-week-2026-08-24', messages[0]?.tag);
}

// 2. Nur wer in employee_ids steht, bekommt etwas
{
  const { messages } = await fire(handler, {
    type: 'INSERT', table: 'plan_change_events',
    record: { id: 'e-2', week_start: '2026-08-24', employee_ids: ['maler-2'] },
    old_record: null,
  });
  check('Unbeteiligter Maler bekommt nichts',
    messages.length === 1 && messages[0].endpoint === 'ep-maler-2',
    JSON.stringify(messages.map((m) => m.endpoint)));
}

// 3. Mehrere Betroffene in einer Runde
{
  const { messages } = await fire(handler, {
    type: 'INSERT', table: 'plan_change_events',
    record: { id: 'e-3', week_start: '2026-08-24', employee_ids: ['maler-1', 'maler-2'] },
    old_record: null,
  });
  check('Beide Betroffenen werden erreicht (drei Geräte)',
    messages.length === 3, JSON.stringify(messages.map((m) => m.endpoint)));
  check('Alle bekommen denselben Wortlaut',
    new Set(messages.map((m) => m.body)).size === 1,
    JSON.stringify([...new Set(messages.map((m) => m.body))]));
}

// 4. Leere Liste -> nichts
{
  const { messages } = await fire(handler, {
    type: 'INSERT', table: 'plan_change_events',
    record: { id: 'e-4', week_start: '2026-08-24', employee_ids: [] },
    old_record: null,
  });
  check('Runde ohne Betroffene bleibt stumm', messages.length === 0,
    JSON.stringify(messages.map((m) => m.body)));
}

// 5. Kalenderwoche: Jahreswechsel und Randfälle nach ISO 8601
{
  const faelle = [
    ['2026-08-24', 35],
    ['2026-01-05', 2],
    ['2025-12-29', 1],   // gehört bereits zur KW 1 von 2026
    ['2026-12-28', 53],  // 2026 hat 53 Wochen
    ['2027-01-04', 1],
    ['2024-12-30', 1],   // KW 1 von 2025
  ];
  for (const [montag, erwartet] of faelle) {
    const { messages } = await fire(handler, {
      type: 'INSERT', table: 'plan_change_events',
      record: { id: `w-${montag}`, week_start: montag, employee_ids: ['maler-2'] },
      old_record: null,
    });
    check(`KW für Montag ${montag} ist ${erwartet}`,
      messages[0]?.body === `Die Planung wurde für die KW ${erwartet} geändert.`,
      messages[0]?.body);
  }
}

// 5b. employee_ids als Postgres-Array-Text statt als JSON-Liste
{
  const { messages } = await fire(handler, {
    type: 'INSERT', table: 'plan_change_events',
    record: { id: 'e-5b', week_start: '2026-08-24', employee_ids: '{maler-1,maler-2}' },
    old_record: null,
  });
  check('Array-Literal wird genauso verstanden wie eine Liste',
    messages.length === 3, JSON.stringify(messages.map((m) => m.endpoint)));
  check('Array-Literal liefert denselben Wortlaut',
    messages[0]?.body === 'Die Planung wurde für die KW 35 geändert.', messages[0]?.body);

  const zitiert = await fire(handler, {
    type: 'INSERT', table: 'plan_change_events',
    record: { id: 'e-5c', week_start: '2026-08-24', employee_ids: '{"maler-2"}' },
    old_record: null,
  });
  check('Auch mit Anführungszeichen im Array-Literal',
    zitiert.messages.length === 1 && zitiert.messages[0].endpoint === 'ep-maler-2',
    JSON.stringify(zitiert.messages.map((m) => m.endpoint)));

  for (const leer of [null, undefined, '{}', []]) {
    const r = await fire(handler, {
      type: 'INSERT', table: 'plan_change_events',
      record: { id: 'e-leer', week_start: '2026-08-24', employee_ids: leer },
      old_record: null,
    });
    check(`Leere Empfängerangabe (${JSON.stringify(leer)}) bleibt stumm`,
      r.messages.length === 0, JSON.stringify(r.messages.map((m) => m.body)));
  }
}

// 6. Einzelne Einsatzänderung löst nichts mehr aus
{
  const { messages, body } = await fire(handler, {
    type: 'INSERT', table: 'assignments',
    record: { id: 'a-1', employee_id: 'maler-1', site_id: 'site-1', date: '2026-09-01' },
    old_record: null,
  });
  check('Einzelne Einsatzzeile benachrichtigt niemanden mehr',
    messages.length === 0 && body.sent === 0, JSON.stringify(body));
}

// 7. Einstellung "plan_changed" aus -> nichts an diesen Maler
{
  DB.push_preferences = [{ employee_id: 'maler-1', kind: 'plan_changed', enabled: false }];
  const { messages } = await fire(handler, {
    type: 'INSERT', table: 'plan_change_events',
    record: { id: 'e-7', week_start: '2026-08-24', employee_ids: ['maler-1', 'maler-2'] },
    old_record: null,
  });
  check('Abgeschaltete Planänderung wird übersprungen, andere bekommen sie',
    messages.length === 1 && messages[0].endpoint === 'ep-maler-2',
    JSON.stringify(messages.map((m) => m.endpoint)));

  // andere Art bleibt unberührt
  const leave = await fire(handler, {
    type: 'UPDATE', table: 'leave_requests',
    record: { id: 'l-9', employee_id: 'maler-1', type: 'vacation', start_date: '2026-09-01', end_date: '2026-09-05', status: 'approved', days_count: 5 },
    old_record: { id: 'l-9', employee_id: 'maler-1', type: 'vacation', start_date: '2026-09-01', end_date: '2026-09-05', status: 'pending', days_count: 5 },
  });
  check('Andere Art bleibt trotz Abschaltung aktiv',
    leave.messages.length === 2 && leave.messages[0].title === 'Urlaub genehmigt',
    JSON.stringify(leave.messages.map((m) => m.title)));
  DB.push_preferences = [];
}

// 8. Urlaubsantrag -> an alle Bueros
{
  const { messages } = await fire(handler, {
    type: 'INSERT', table: 'leave_requests',
    record: { id: 'l-2', employee_id: 'maler-1', type: 'vacation', start_date: '2026-09-01', end_date: '2026-09-05', status: 'pending', days_count: 5 },
    old_record: null,
  });
  check('Neuer Antrag geht an beide Büro-Konten',
    messages.length === 2 && messages.every((m) => m.endpoint.startsWith('ep-admin')),
    JSON.stringify(messages.map((m) => m.endpoint)));
  check('Antrag nennt Namen und Zeitraum',
    messages[0]?.body === 'Max Maler: 01.09.2026 – 05.09.2026', messages[0]?.body);
}

// 9. Fremde Tabelle -> ignoriert
{
  const { body, messages } = await fire(handler, { type: 'INSERT', table: 'week_notes', record: { id: 'x' }, old_record: null });
  check('Unbekannte Tabelle wird ignoriert', messages.length === 0 && body.sent === 0, JSON.stringify(body));
}

// 10. Falsches Secret -> abgewiesen
{
  sentMessages = [];
  const res = await handler(new Request('https://x.test', {
    method: 'POST', headers: { 'x-webhook-secret': 'falsch' }, body: '{}',
  }));
  check('Falsches Secret wird abgewiesen', res.status === 403, `status ${res.status}`);
}

console.log(failed === 0 ? '\nAlle Prüfungen bestanden.' : `\n${failed} Prüfung(en) fehlgeschlagen.`);
process.exit(failed === 0 ? 0 : 1);
