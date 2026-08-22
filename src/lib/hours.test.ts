/**
 * Prüft die Pausenberechnung.
 *
 * Die Zahl muss mit dem SQL in 0005_employee_colors_and_breaks.sql
 * übereinstimmen: Dort werden die bereits geplanten Einsätze einmalig nach
 * derselben Regel neu gerechnet. Laufen beide auseinander, hat dieselbe Schicht
 * je nach Entstehungsweg unterschiedlich viele Stunden — und das fällt
 * frühestens bei der Abrechnung auf.
 */
import { breakMinutesFor, calculateHours, defaultShiftFor, TARGET_HOURS, statutoryBreakMinutes} from './hours.ts';

let failed = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failed++;
  console.log(
    `${ok ? 'OK  ' : 'FEHL'}  ${name}${ok ? '' : `\n        erwartet ${JSON.stringify(expected)}, war ${JSON.stringify(actual)}`}`,
  );
}

// --- Regelarbeitszeit: muss exakt die Soll-Stunden ergeben -----------------

const monday = defaultShiftFor('Montag');
check('Regelschicht Mo–Do: Pause', breakMinutesFor(monday.start, monday.end, 'Montag'), 60);
check(
  'Regelschicht Mo–Do trifft Soll',
  calculateHours(monday.start, monday.end, 60),
  TARGET_HOURS.Montag,
);

const friday = defaultShiftFor('Freitag');
check('Regelschicht Fr: Pause', breakMinutesFor(friday.start, friday.end, 'Freitag'), 30);
check(
  'Regelschicht Fr trifft Soll',
  calculateHours(friday.start, friday.end, 30),
  TARGET_HOURS.Freitag,
);

// --- Freitags entfällt die zweite Pause ------------------------------------

check('Fr über beide Fenster: nur die erste zählt', breakMinutesFor('07:00', '16:30', 'Freitag'), 30);
check('Do über beide Fenster: beide zählen', breakMinutesFor('07:00', '16:30', 'Donnerstag'), 60);

// --- Nur abziehen, was der Einsatz überdeckt -------------------------------

check('halber Tag bis 12 Uhr', breakMinutesFor('07:00', '12:00', 'Montag'), 30);
check('Nachmittag ab 14 Uhr', breakMinutesFor('14:00', '18:00', 'Montag'), 0);
check('endet exakt bei Pausenbeginn', breakMinutesFor('07:00', '10:00', 'Montag'), 0);
check('beginnt exakt bei Pausenende', breakMinutesFor('10:30', '12:00', 'Montag'), 0);
check('nur halb im Fenster', breakMinutesFor('07:00', '10:15', 'Montag'), 15);
check('liegt ganz im Fenster', breakMinutesFor('10:05', '10:20', 'Montag'), 15);
check('zwischen den Fenstern', breakMinutesFor('11:00', '12:30', 'Montag'), 0);
check('nur zweites Fenster', breakMinutesFor('12:00', '16:30', 'Montag'), 30);

// --- Zwei Einsätze am selben Tag ziehen zusammen höchstens einmal ab -------
// Der eigentliche Grund für feste Fenster: Ohne Tagesbuchführung darf keine
// Pause doppelt abgezogen werden.

const vormittags = breakMinutesFor('07:00', '12:00', 'Dienstag');
const nachmittags = breakMinutesFor('12:00', '16:30', 'Dienstag');
check('zwei Einsätze, Summe wie ein durchgehender Tag', vormittags + nachmittags, 60);
check(
  'Stunden zweier Einsätze wie ein durchgehender Tag',
  Math.round((calculateHours('07:00', '12:00', vormittags) +
    calculateHours('12:00', '16:30', nachmittags)) * 100) / 100,
  calculateHours('07:00', '16:30', 60),
);

// --- Randfälle -------------------------------------------------------------

check('über Mitternacht: Fenster liegen am Vortag', breakMinutesFor('22:00', '06:00', 'Montag'), 0);
check('leere Zeiten', breakMinutesFor('', '', 'Montag'), 0);
check('Samstag wie Mo–Do', breakMinutesFor('07:00', '16:30', 'Samstag'), 60);
check('kurzer Samstag', breakMinutesFor('07:00', '12:00', 'Samstag'), 30);

// --- Gesetzliche Pause der Büro-Standardzeiten (§ 4 ArbZG) -----------------
// Eigene Regel, bemessen an der Anwesenheit. Gilt nur für Büro-Konten und darf
// die festen Fenster der Maler nicht berühren.

check('unter 6 Std. ohne Pause', statutoryBreakMinutes('08:00', '13:00'), 0);
check('genau 6,0 Std. noch ohne Pause', statutoryBreakMinutes('08:00', '14:00'), 0);
check('knapp über 6 Std. mit 30 Min', statutoryBreakMinutes('08:00', '14:01'), 30);
check('8 Std. mit 30 Min', statutoryBreakMinutes('08:00', '16:00'), 30);
check('genau 9,0 Std. noch mit 30 Min', statutoryBreakMinutes('08:00', '17:00'), 30);
check('knapp über 9 Std. mit 45 Min', statutoryBreakMinutes('08:00', '17:01'), 45);
check('10 Std. mit 45 Min', statutoryBreakMinutes('07:00', '17:00'), 45);
check('leere Zeiten', statutoryBreakMinutes('', ''), 0);
check('über Mitternacht zählt die Dauer (8 Std.)', statutoryBreakMinutes('22:00', '06:00'), 30);

// Die beiden Regeln müssen auseinanderliegen — sonst ist eine von beiden
// überflüssig und irgendwann verwechselt sie jemand.
check(
  'Regelschicht: Fenster 60, gesetzlich 45',
  [breakMinutesFor('07:00', '16:30', 'Montag'), statutoryBreakMinutes('07:00', '16:30')],
  [60, 45],
);

// Bürotag 08:00–17:00 = 9,0 Std. Anwesenheit − 30 Min = 8,5 Std. netto.
check('Bürotag netto', calculateHours('08:00', '17:00', statutoryBreakMinutes('08:00', '17:00')), 8.5);

console.log(failed === 0 ? '\nAlle Prüfungen bestanden.' : `\n${failed} Prüfung(en) fehlgeschlagen.`);
if (failed > 0) process.exit(1);
