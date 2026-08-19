import { addDays, format } from 'date-fns';
import { WEEKDAYS } from './hours.ts';

/**
 * Die Wochenstruktur des Berichts und die Umrechnung zwischen Wochentag und
 * Datum. Bewusst frei von Datenbankzugriffen, damit die Regeln, die darauf
 * aufbauen, ohne Netz und ohne Supabase geprüft werden können.
 */

/** Eine Zeile im Wochenbericht. */
export interface WeeklyEntry {
  id: string;
  project: string; // Adresse der Baustelle
  projectNumber: string;
  description: string;
  hours: number;
  startTime?: string;
  endTime?: string;
  pause?: number;
  /** Gesetzt, wenn die Zeile aus einer Planzeile entstanden ist. */
  sourceAssignmentId?: string | null;
}

export type WeeklyEntries = Record<string, { entries: WeeklyEntry[] }>;

export function emptyWeek(): WeeklyEntries {
  return Object.fromEntries(WEEKDAYS.map((d) => [d, { entries: [] }])) as WeeklyEntries;
}

/** Der ISO-Montag als yyyy-MM-dd — Schlüssel eines Wochenberichts. */
export function weekKey(weekStart: Date): string {
  return format(weekStart, 'yyyy-MM-dd');
}

/** Datum des n-ten Wochentags (0 = Montag) innerhalb der Woche. */
export function dateOfWeekday(weekStart: Date, weekdayIndex: number): string {
  return format(addDays(weekStart, weekdayIndex), 'yyyy-MM-dd');
}
