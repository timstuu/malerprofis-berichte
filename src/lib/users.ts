import { supabase } from './supabase.ts';
import type { Role } from './database.types.ts';

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
}

async function callManageUsers<T>(payload: ManageUsersPayload): Promise<T> {
  const { data, error } = await supabase.functions.invoke('manage-users', { body: payload });

  if (error) {
    // Die Funktion antwortet bei Fehlern mit einem lesbaren Text im Rumpf;
    // supabase-js verpackt das in einen technischen Fehler. Hier wird der
    // eigentliche Grund wieder herausgeholt.
    let message = error.message;
    const context = (error as { context?: Response }).context;
    if (context && typeof context.json === 'function') {
      try {
        const body = await context.json();
        if (body?.error) message = body.error;
      } catch {
        // Rumpf nicht lesbar — bei der technischen Meldung bleiben.
      }
    }
    if (message.includes('Failed to send') || message.includes('FunctionsFetchError')) {
      message =
        'Die Benutzerverwaltung ist noch nicht eingerichtet (Edge Function „manage-users" fehlt). Siehe README.';
    }
    throw new Error(message);
  }

  if (data && typeof data === 'object' && 'error' in data) {
    throw new Error(String((data as { error: unknown }).error));
  }
  return data as T;
}

export async function createUser(input: {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: Role;
  remainingLeaveDays?: number;
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
