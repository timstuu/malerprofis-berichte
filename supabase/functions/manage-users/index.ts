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
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

/** Wer ruft auf — und ist es ein Büro-Konto? */
async function requireAdmin(req: Request): Promise<{ id: string } | Response> {
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return json({ error: 'Nicht angemeldet.' }, 401);
  }

  const asCaller = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userData, error } = await asCaller.auth.getUser();
  if (error || !userData.user) {
    return json({ error: 'Anmeldung ungültig.' }, 401);
  }

  const { data: profile } = await admin
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
  const { count } = await admin
    .from('employees')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'admin');
  return count ?? 0;
}

Deno.serve(async (req) => {
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

      const { data: created, error: createError } = await admin.auth.admin.createUser({
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

      const { error: profileError } = await admin.from('employees').insert({
        id: created.user.id,
        first_name: firstName,
        last_name: lastName,
        role,
        remaining_leave_days: payload.remainingLeaveDays ?? 30,
      });

      if (profileError) {
        // Stammdaten fehlgeschlagen: Das Anmeldekonto wieder entfernen, sonst
        // bleibt eine Anmeldung ohne Profil zurück, mit der niemand etwas
        // anfangen kann.
        await admin.auth.admin.deleteUser(created.user.id);
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

      const { data: target } = await admin
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
      const { error } = await admin.auth.admin.deleteUser(employeeId);
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

      const { data: target } = await admin
        .from('employees')
        .select('role')
        .eq('id', employeeId)
        .maybeSingle();

      if (target?.role === 'admin' && role !== 'admin' && (await countAdmins()) <= 1) {
        return json({ error: 'Es muss mindestens ein Büro-Konto geben.' }, 400);
      }

      const { error } = await admin.from('employees').update({ role }).eq('id', employeeId);
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

      const { error } = await admin.auth.admin.updateUserById(employeeId, { password });
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    default:
      return json({ error: 'Unbekannte Aktion.' }, 400);
  }
});
