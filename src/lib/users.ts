import { supabase } from './supabase.ts';
import type { Employee, Role } from './database.types.ts';

/**
 * Benutzerverwaltung.
 *
 * Läuft über die Edge Function `manage-users`: Konten anzulegen oder zu löschen
 * erfordert erhöhte Rechte, die im Browser nichts zu suchen haben. Die Funktion
 * prüft bei jedem Aufruf selbst, ob der Angemeldete ein Büro-Konto ist — das
 * Ausblenden der Oberfläche für Maler ist reine Bequemlichkeit, keine
 * Sicherheitsmaßnahme.
 */

interface ManageUsersPayload {
  action: 'create' | 'delete' | 'set-role' | 'set-password';
  employeeId?: string;
  email?: string;
  password?: string;
  firstName?: string;
  lastName?: string;
  role?: Role;
  remainingLeaveDays?: number;
  color?: string;
}

/**
 * Ruft die Funktion direkt auf statt über supabase.functions.invoke.
 *
 * Grund: invoke meldet jeden Fehlerstatus pauschal als „Edge Function returned
 * a non-2xx status code" und verschluckt dabei den erklärenden Text aus der
 * Antwort — also genau die Information, die man zur Behebung braucht.
 */
async function callManageUsers<T>(payload: ManageUsersPayload): Promise<T> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) throw new Error('Nicht angemeldet.');

  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-users`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
      },
      body: JSON.stringify(payload),
    });
  } catch {
    // Ein Fehler bereits beim Verbindungsaufbau. Häufigste Ursache ist nicht
    // die Internetverbindung, sondern eine veraltete Fassung der Edge Function
    // ohne CORS-Behandlung: Der Browser bricht dann schon beim Preflight ab.
    throw new Error(
      'Die Benutzerverwaltung konnte nicht aufgerufen werden. Meist ist die Edge Function ' +
        '„manage-users" im Supabase-Dashboard veraltet — bitte den aktuellen Stand aus ' +
        'supabase/functions/manage-users/index.ts erneut einfügen und veröffentlichen. ' +
        'Andernfalls fehlt die Internetverbindung.',
    );
  }

  const text = await response.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // Keine JSON-Antwort — der Rohtext ist dann die beste verfügbare Auskunft.
  }

  if (!response.ok) {
    const detail =
      body && typeof body === 'object' && 'error' in body
        ? String((body as { error: unknown }).error)
        : text || `HTTP ${response.status}`;

    if (response.status === 404) {
      throw new Error(
        'Die Edge Function „manage-users" existiert nicht. Sie muss einmalig im ' +
          'Supabase-Dashboard angelegt werden (siehe README, Schritt 3).',
      );
    }
    throw new Error(detail);
  }

  return body as T;
}

export async function createUser(input: {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: Role;
  remainingLeaveDays?: number;
  color?: string;
}): Promise<void> {
  await callManageUsers({ action: 'create', ...input });
}

export async function deleteUser(employeeId: string): Promise<void> {
  await callManageUsers({ action: 'delete', employeeId });
}

export async function setUserRole(employeeId: string, role: Role): Promise<void> {
  await callManageUsers({ action: 'set-role', employeeId, role });
}

export async function setUserPassword(employeeId: string, password: string): Promise<void> {
  await callManageUsers({ action: 'set-password', employeeId, password });
}

/**
 * Reihenfolge der Rollen in jeder Personenliste — nach Rang, nicht alphabetisch.
 */
const ROLE_ORDER: Record<Role, number> = {
  admin: 0,
  worker: 1,
  tv: 2,
};

/**
 * Einheitliche Reihenfolge für alle Personenlisten: erst die Art des Kontos
 * (Büro, Maler, Anzeige), darin nach Nachname aufsteigend.
 *
 * Bewusst an einer Stelle: Benutzerverwaltung, Wochenplanung und der Fernseher
 * zeigen dieselben Leute. Liefe jede Ansicht nach eigener Regel, stünde dieselbe
 * Woche auf dem Büroschirm anders sortiert als an der Wand.
 *
 * `localeCompare` mit 'de', damit Umlaute dort einsortiert werden, wo man sie
 * sucht — sonst landet Ötken hinter Zimmermann.
 */
export function sortEmployees<T extends Pick<Employee, 'role' | 'first_name' | 'last_name'>>(
  employees: T[],
): T[] {
  return [...employees].sort(
    (a, b) =>
      ROLE_ORDER[a.role] - ROLE_ORDER[b.role] ||
      a.last_name.localeCompare(b.last_name, 'de') ||
      a.first_name.localeCompare(b.first_name, 'de'),
  );
}

/**
 * Erzeugt ein aussprechbares, aber nicht zu erratendes Passwort.
 * Gedacht zum Vorlesen oder Aufschreiben bei der Übergabe im Büro.
 */
export function suggestPassword(): string {
  const words = [
    'Pinsel', 'Farbe', 'Leiter', 'Rolle', 'Lack', 'Gerüst', 'Spachtel', 'Tapete',
    'Kelle', 'Eimer', 'Putz', 'Kreide', 'Fassade', 'Anstrich',
  ];
  const word = words[Math.floor(Math.random() * words.length)];
  const second = words[Math.floor(Math.random() * words.length)];
  const number = Math.floor(Math.random() * 90) + 10;
  return `${word}-${second}-${number}`;
}
