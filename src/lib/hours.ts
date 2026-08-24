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

/** Wochentag eines Datums als Name — getDay(): 0 = Sonntag ... 6 = Samstag. */
const WEEKDAY_BY_INDEX: Weekday[] = [
  'Sonntag',
  'Montag',
  'Dienstag',
  'Mittwoch',
  'Donnerstag',
  'Freitag',
  'Samstag',
];

export function weekdayOf(date: Date): Weekday {
  return WEEKDAY_BY_INDEX[date.getDay()];
}

/** Soll-Stunden für ein konkretes Datum. */
export function targetHoursForDate(date: Date): number {
  return TARGET_HOURS[weekdayOf(date)];
}

// ---------------------------------------------------------------------------
// Pausen
// ---------------------------------------------------------------------------

/**
 * Die betrieblichen Pausen liegen zu festen Uhrzeiten, nicht als Kontingent.
 * Freitags entfällt die zweite — der Arbeitstag endet vor der Mittagspause.
 *
 * Dass sich daraus „einmal pro Tag" von selbst ergibt, ist der eigentliche
 * Grund für feste Fenster: Zwei Einsätze desselben Tages liegen zeitlich
 * hintereinander, also kann jedes Fenster nur von einem der beiden überdeckt
 * werden. Es braucht keine Tagesbuchführung, um doppelten Abzug zu verhindern.
 */
const PAUSE_WINDOWS: Record<Weekday, [number, number][]> = {
  Montag: [[600, 630], [780, 810]], // 10:00–10:30, 13:00–13:30
  Dienstag: [[600, 630], [780, 810]],
  Mittwoch: [[600, 630], [780, 810]],
  Donnerstag: [[600, 630], [780, 810]],
  Freitag: [[600, 630]],
  Samstag: [[600, 630], [780, 810]],
  Sonntag: [[600, 630], [780, 810]],
};

function minutesOf(time: string): number {
  const [hours, mins] = time.split(':').map(Number);
  return hours * 60 + mins;
}

/**
 * Abzuziehende Pause eines Einsatzes: die Überschneidung mit den Pausenfenstern
 * seines Wochentags, nicht ein pauschaler Wert.
 *
 * Damit verliert niemand eine Pause, die zeitlich nicht stattgefunden hat — wer
 * um 14 Uhr anfängt, arbeitet an keinem Fenster vorbei und bekommt nichts
 * abgezogen.
 *
 * @param startTime "HH:MM"
 * @param endTime   "HH:MM"
 */
export function breakMinutesFor(startTime: string, endTime: string, weekday: Weekday): number {
  if (!startTime || !endTime) return 0;

  const start = minutesOf(startTime);
  // Über Mitternacht: Das Ende liegt am Folgetag, die Fenster nicht.
  const end = minutesOf(endTime) <= start ? minutesOf(endTime) + 24 * 60 : minutesOf(endTime);

  return PAUSE_WINDOWS[weekday].reduce((total, [from, to]) => {
    const overlap = Math.min(end, to) - Math.max(start, from);
    return total + Math.max(0, overlap);
  }, 0);
}

/** Dasselbe für ein Datum statt eines Wochentagsnamens. */
export function breakMinutesForDate(startTime: string, endTime: string, date: Date): number {
  return breakMinutesFor(startTime, endTime, weekdayOf(date));
}

/**
 * Gesetzliche Mindestpause nach § 4 ArbZG, bemessen an der Anwesenheit.
 *
 * Gilt ausschließlich für die Standard-Arbeitszeiten der Büro-Konten. Die Maler
 * rechnen weiter nach den festen Pausenfenstern oben — die beiden Regeln sind
 * bewusst getrennt und dürfen nicht vermischt werden: Für einen geplanten
 * Einsatz zählt, ob er ein Fenster überdeckt, für eine Bürozeit nur, wie lange
 * sie dauert.
 *
 * Bemessen wird an der Anwesenheit (Ende minus Beginn), nicht an der
 * Arbeitszeit nach Abzug. Das Gesetz meint zwar die Arbeitszeit, aber diese
 * Rechnung beißt sich in den Schwanz: 9,5 Std. minus 45 sind 8,75, und 8,75
 * verlangt keine 45 mehr. Die Anwesenheit ist eindeutig und nachvollziehbar.
 *
 * An den Rändern gilt der Gesetzestext, nicht die Faustformel: Pause erst
 * *über* sechs bzw. *über* neun Stunden. Bei genau 6,0 oder genau 9,0 Std. wird
 * also weniger abgezogen — zugunsten des Mitarbeiters.
 *
 * @param startTime "HH:MM"
 * @param endTime   "HH:MM"
 */
export function statutoryBreakMinutes(startTime: string, endTime: string): number {
  if (!startTime || !endTime) return 0;

  let gross = minutesOf(endTime) - minutesOf(startTime);
  if (gross < 0) gross += 24 * 60; // über Mitternacht gearbeitet

  if (gross <= 6 * 60) return 0;
  if (gross <= 9 * 60) return 30;
  return 45;
}

/**
 * Wählt die Pausenregel, die für einen Mitarbeiter gilt.
 *
 * Hier wird nur entschieden, welche der beiden Regeln greift — gemischt wird
 * nie. Der Wochenbericht hat zuvor für jeden nach den festen Pausenfenstern
 * gerechnet, auch für die Büro-Konten. Ein Bürotag von 07:00 bis 16:30 überdeckt
 * zwar beide Fenster, aber im Büro finden diese Pausen nicht statt: Fällig sind
 * die gesetzlichen 45 Minuten, nicht 60.
 *
 * @param office true für Büro-Konten (§ 4 ArbZG), false für Maler (feste Fenster)
 */
export function breakMinutesForRole(
  startTime: string,
  endTime: string,
  weekday: Weekday,
  office: boolean,
): number {
  return office
    ? statutoryBreakMinutes(startTime, endTime)
    : breakMinutesFor(startTime, endTime, weekday);
}

/**
 * Regelarbeitszeit als Vorbelegung im Einsatzformular. Die Zeiten sind so
 * gewählt, dass nach Abzug der Pausen genau die Soll-Stunden herauskommen.
 */
export function defaultShiftFor(weekday: Weekday): { start: string; end: string } {
  return weekday === 'Freitag'
    ? { start: '07:00', end: '13:30' } // 6,5 Std. − 30 Min = 6,0
    : { start: '07:00', end: '16:30' }; // 9,5 Std. − 60 Min = 8,5
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
