/**
 * Benutzerverwaltung aus der App heraus.
 *
 * Konten anzulegen oder zu löschen erfordert den Service-Role-Schlüssel. Der
 * darf nicht in den Browser — mit ihm ließen sich sämtliche Sicherheitsregeln
 * umgehen. Diese Funktion ist deshalb die Schleuse dazwischen: Sie prüft
 * zuerst, ob der Aufrufer tatsächlich ein Büro-Konto ist, und handelt erst
 * dann mit erhöhten Rechten.
 *
 * Einrichtung im Dashboard (Edge Functions → Deploy a new function → Via Editor):
 *   Name: manage-users
 *   "Verify JWT" eingeschaltet lassen — anders als bei send-push ruft hier die
 *   angemeldete Person selbst auf, nicht die Datenbank.
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';

type Action = 'create' | 'delete' | 'set-role' | 'set-password';
type Role = 'admin' | 'worker' | 'tv';

interface Payload {
  action: Action;
  employeeId?: string;
  email?: string;
  password?: string;
  firstName?: string;
  lastName?: string;
  role?: Role;
  remainingLeaveDays?: number;
  color?: string;
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;

/**
 * Den geheimen Schlüssel ermitteln.
 *
 * Supabase hat die Benennung umgestellt: Neue Projekte bekommen
 * SUPABASE_SECRET_KEYS (ein JSON-Verzeichnis) beziehungsweise
 * SUPABASE_SECRET_DEFAULT_KEY, ältere den bisherigen
 * SUPABASE_SERVICE_ROLE_KEY. Hier werden alle Varianten der Reihe nach
 * geprüft, damit die Funktion in beiden Fällen läuft.
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
      'ein Secret namens SUPABASE_SECRET_KEY mit dem geheimen API-Schlüssel des ' +
      'Projekts anlegen (Project Settings → API Keys).',
  );
}

/**
 * Verzögert erzeugt: Fehlt der Schlüssel, soll das als lesbare Antwort beim
 * Aufrufer ankommen und nicht als nackter Absturz beim Start der Funktion.
 */
let adminClient: ReturnType<typeof createClient> | null = null;
function db() {
  if (!adminClient) adminClient = createClient(SUPABASE_URL, resolveSecretKey());
  return adminClient;
}

/**
 * Vor jedem Aufruf aus dem Browser fragt dieser mit OPTIONS um Erlaubnis
 * (Preflight). Ohne diese Kopfzeilen bricht der Browser ab, bevor die
 * eigentliche Anfrage überhaupt losgeschickt wird — in der App sieht das aus
 * wie „keine Verbindung", obwohl die Funktion einwandfrei läuft.
 */
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });

/** Wer ruft auf — und ist es ein Büro-Konto? */
async function requireAdmin(req: Request): Promise<{ id: string } | Response> {
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return json({ error: 'Nicht angemeldet.' }, 401);
  }

  // Das Token wird direkt geprüft, statt einen zweiten Client mit dem
  // öffentlichen Schlüssel aufzubauen — ein Schlüssel weniger, der in der
  // Umgebung vorhanden sein muss.
  const token = authHeader.slice('Bearer '.length);
  const { data: userData, error } = await db().auth.getUser(token);
  if (error || !userData.user) {
    return json({ error: 'Anmeldung ungültig oder abgelaufen.' }, 401);
  }

  const { data: profile } = await db()
    .from('employees')
    .select('role')
    .eq('id', userData.user.id)
    .maybeSingle();

  if (profile?.role !== 'admin') {
    return json({ error: 'Nur das Büro darf Benutzer verwalten.' }, 403);
  }

  return { id: userData.user.id };
}

/** Verhindert, dass sich das Büro selbst aussperrt. */
async function countAdmins(): Promise<number> {
  const { count } = await db()
    .from('employees')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'admin');
  return count ?? 0;
}

Deno.serve(async (req) => {
  try {
    return await handle(req);
  } catch (e) {
    // Jeder unerwartete Fehler kommt als lesbarer Text beim Aufrufer an.
    // Ohne das sieht man in der App nur „non-2xx status code".
    console.error('manage-users:', e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

async function handle(req: Request): Promise<Response> {
  // Preflight beantworten, bevor irgendetwas anderes geprüft wird.
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') return json({ error: 'Nur POST.' }, 405);

  const caller = await requireAdmin(req);
  if (caller instanceof Response) return caller;

  let payload: Payload;
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'Ungültige Anfrage.' }, 400);
  }

  switch (payload.action) {
    // -----------------------------------------------------------------
    case 'create': {
      const { email, password, firstName, lastName, role = 'worker' } = payload;
      if (!email || !password || !firstName || !lastName) {
        return json({ error: 'E-Mail, Passwort, Vor- und Nachname sind nötig.' }, 400);
      }
      if (password.length < 8) {
        return json({ error: 'Das Passwort muss mindestens 8 Zeichen haben.' }, 400);
      }

      const { data: created, error: createError } = await db().auth.admin.createUser({
        email,
        password,
        // Kein Bestätigungsklick: Die Konten werden im Büro ausgegeben, und
        // Maler haben oft keinen Zugriff auf ihr Postfach am Arbeitsplatz.
        email_confirm: true,
      });

      if (createError || !created.user) {
        const message = createError?.message ?? 'Konto konnte nicht angelegt werden.';
        const friendly = message.includes('already been registered')
          ? 'Diese E-Mail-Adresse wird bereits verwendet.'
          : message;
        return json({ error: friendly }, 400);
      }

      const { error: profileError } = await db().from('employees').insert({
        id: created.user.id,
        first_name: firstName,
        last_name: lastName,
        role,
        remaining_leave_days: payload.remainingLeaveDays ?? 30,
        color: payload.color ?? null,
      });

      if (profileError) {
        // Stammdaten fehlgeschlagen: Das Anmeldekonto wieder entfernen, sonst
        // bleibt eine Anmeldung ohne Profil zurück, mit der niemand etwas
        // anfangen kann.
        await db().auth.admin.deleteUser(created.user.id);
        return json({ error: `Stammdaten fehlgeschlagen: ${profileError.message}` }, 400);
      }

      return json({ id: created.user.id });
    }

    // -----------------------------------------------------------------
    case 'delete': {
      const { employeeId } = payload;
      if (!employeeId) return json({ error: 'Kein Benutzer angegeben.' }, 400);
      if (employeeId === caller.id) {
        return json({ error: 'Das eigene Konto lässt sich nicht löschen.' }, 400);
      }

      const { data: target } = await db()
        .from('employees')
        .select('role')
        .eq('id', employeeId)
        .maybeSingle();

      if (target?.role === 'admin' && (await countAdmins()) <= 1) {
        return json({ error: 'Das letzte Büro-Konto kann nicht gelöscht werden.' }, 400);
      }

      // Die employees-Zeile hängt per ON DELETE CASCADE am Anmeldekonto und
      // verschwindet mit. Wochenberichte ebenso — deshalb steht in der App eine
      // Rückfrage davor.
      const { error } = await db().auth.admin.deleteUser(employeeId);
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    // -----------------------------------------------------------------
    case 'set-role': {
      const { employeeId, role } = payload;
      if (!employeeId || !role) return json({ error: 'Benutzer und Rolle sind nötig.' }, 400);

      if (employeeId === caller.id && role !== 'admin') {
        return json({ error: 'Die eigenen Büro-Rechte lassen sich nicht entziehen.' }, 400);
      }

      const { data: target } = await db()
        .from('employees')
        .select('role')
        .eq('id', employeeId)
        .maybeSingle();

      if (target?.role === 'admin' && role !== 'admin' && (await countAdmins()) <= 1) {
        return json({ error: 'Es muss mindestens ein Büro-Konto geben.' }, 400);
      }

      const { error } = await db().from('employees').update({ role }).eq('id', employeeId);
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    // -----------------------------------------------------------------
    case 'set-password': {
      const { employeeId, password } = payload;
      if (!employeeId || !password) return json({ error: 'Benutzer und Passwort sind nötig.' }, 400);
      if (password.length < 8) {
        return json({ error: 'Das Passwort muss mindestens 8 Zeichen haben.' }, 400);
      }

      const { error } = await db().auth.admin.updateUserById(employeeId, { password });
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    default:
      return json({ error: 'Unbekannte Aktion.' }, 400);
  }
}
