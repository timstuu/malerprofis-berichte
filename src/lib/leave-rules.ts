import type { Holiday, LeaveRequest } from './database.types.ts';

/**
 * Rechenregeln rund um Abwesenheiten.
 *
 * Bewusst frei von Datenbankzugriffen: Diese Zahlen bekommt der Maler zu sehen,
 * bevor er einen Antrag abschickt, und sie müssen mit dem übereinstimmen, was
 * die Datenbank später vom Urlaubskonto abbucht.
 */

/**
 * Werktage eines Zeitraums (Mo–Fr ohne Feiertage) — für die Vorschau, bevor
 * ein Antrag abgeschickt wird. Rechnet mit denselben Feiertagen wie die
 * Datenbank, damit die angezeigte Zahl der später abgebuchten entspricht.
 */
export function countWorkingDays(start: string, end: string, holidays: Holiday[]): number {
  if (!start || !end || end < start) return 0;

  const holidaySet = new Set(holidays.map((h) => h.date));
  let count = 0;

  for (let d = new Date(`${start}T00:00:00`); d <= new Date(`${end}T00:00:00`); d.setDate(d.getDate() + 1)) {
    const weekday = d.getDay();
    if (weekday === 0 || weekday === 6) continue;
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (holidaySet.has(iso)) continue;
    count++;
  }
  return count;
}

/** Überschneidet sich der Zeitraum mit einem bestehenden Antrag? */
export function overlapsExisting(
  start: string,
  end: string,
  employeeId: string,
  requests: LeaveRequest[],
): boolean {
  return requests.some(
    (r) =>
      r.employee_id === employeeId &&
      r.status !== 'rejected' &&
      start <= r.end_date &&
      end >= r.start_date,
  );
}
