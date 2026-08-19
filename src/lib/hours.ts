/**
 * Arbeitszeit-Berechnung und Soll-Stunden.
 *
 * Die Netto-Berechnung ist aus dem Wochenbericht extrahiert, damit Planung,
 * Bericht und Auswertung garantiert dieselbe Rechnung verwenden.
 */

/** Wochentage in der Reihenfolge, in der der Wochenbericht sie anzeigt. */
export const WEEKDAYS = [
  'Montag',
  'Dienstag',
  'Mittwoch',
  'Donnerstag',
  'Freitag',
  'Samstag',
  'Sonntag',
] as const;

export type Weekday = (typeof WEEKDAYS)[number];

/**
 * Betriebliche Soll-Stunden je Wochentag. Gilt einheitlich für alle Maler;
 * es gibt bewusst keine mitarbeiterindividuellen Abweichungen.
 * Verwendet für automatisch eingetragene Urlaubs- und Feiertagszeilen.
 */
export const TARGET_HOURS: Record<Weekday, number> = {
  Montag: 8.5,
  Dienstag: 8.5,
  Mittwoch: 8.5,
  Donnerstag: 8.5,
  Freitag: 6,
  Samstag: 0,
  Sonntag: 0,
};

/** Soll-Stunden für ein konkretes Datum. */
export function targetHoursForDate(date: Date): number {
  // getDay(): 0 = Sonntag ... 6 = Samstag
  const map: Weekday[] = [
    'Sonntag',
    'Montag',
    'Dienstag',
    'Mittwoch',
    'Donnerstag',
    'Freitag',
    'Samstag',
  ];
  return TARGET_HOURS[map[date.getDay()]];
}

/**
 * Netto-Arbeitszeit in Stunden aus Start, Ende und Pause.
 * Übernimmt die bisherige Logik des Wochenberichts einschließlich der
 * Behandlung von Einsätzen über Mitternacht.
 *
 * @param startTime "HH:MM"
 * @param endTime   "HH:MM"
 * @param breakMinutes Pause in Minuten
 */
export function calculateHours(
  startTime: string,
  endTime: string,
  breakMinutes: number,
): number {
  const [startHours, startMins] = startTime.split(':').map(Number);
  const [endHours, endMins] = endTime.split(':').map(Number);

  let diffMins = endHours * 60 + endMins - (startHours * 60 + startMins);
  if (diffMins < 0) {
    diffMins += 24 * 60; // über Mitternacht gearbeitet
  }

  let netMins = diffMins - (breakMinutes || 0);
  if (netMins < 0) netMins = 0;

  return Math.round((netMins / 60) * 100) / 100;
}
