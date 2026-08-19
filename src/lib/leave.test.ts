/**
 * Prüft die Urlaubsberechnung im Browser.
 *
 * Die Zahl muss mit public.count_working_days aus 0002_leave.sql
 * übereinstimmen: Was der Maler vor dem Absenden sieht, wird später vom
 * Urlaubskonto abgebucht. Weichen beide voneinander ab, verliert oder gewinnt
 * jemand stillschweigend Urlaubstage.
 */
import { countWorkingDays, overlapsExisting } from './leave-rules.ts';
import type { Holiday, LeaveRequest } from './database.types.ts';

let failed = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failed++;
  console.log(
    `${ok ? 'OK  ' : 'FEHL'}  ${name}${ok ? '' : `\n        erwartet ${JSON.stringify(expected)}, war ${JSON.stringify(actual)}`}`,
  );
}

// Hamburger Feiertage 2026 (aus der Migration)
const holidays: Holiday[] = [
  { date: '2026-01-01', name: 'Neujahr' },
  { date: '2026-04-03', name: 'Karfreitag' },
  { date: '2026-04-06', name: 'Ostermontag' },
  { date: '2026-05-01', name: 'Tag der Arbeit' },
  { date: '2026-05-14', name: 'Christi Himmelfahrt' },
  { date: '2026-12-25', name: '1. Weihnachtstag' },
];

// --- Werktage zählen -------------------------------------------------------
check('einzelner Werktag', countWorkingDays('2026-08-17', '2026-08-17', []), 1);
check('ganze Woche Mo-Fr', countWorkingDays('2026-08-17', '2026-08-21', []), 5);
check('Woche inkl. Wochenende', countWorkingDays('2026-08-17', '2026-08-23', []), 5);
check('nur Samstag/Sonntag', countWorkingDays('2026-08-22', '2026-08-23', []), 0);
check('zwei volle Wochen', countWorkingDays('2026-08-17', '2026-08-28', []), 10);

// --- Feiertage zählen nicht als Urlaub ------------------------------------
check('Osterwoche mit Karfreitag + Ostermontag', countWorkingDays('2026-03-30', '2026-04-10', holidays), 8);
check('Feiertag allein', countWorkingDays('2026-05-01', '2026-05-01', holidays), 0);
check('Woche mit Himmelfahrt', countWorkingDays('2026-05-11', '2026-05-15', holidays), 4);
check('Neujahr an einem Donnerstag', countWorkingDays('2026-01-01', '2026-01-02', holidays), 1);

// --- Unsinnige Eingaben ---------------------------------------------------
check('Ende vor Beginn', countWorkingDays('2026-08-21', '2026-08-17', []), 0);
check('leere Eingabe', countWorkingDays('', '', []), 0);

// --- Überschneidungen ------------------------------------------------------
const existing: LeaveRequest[] = [
  {
    id: 'r1', employee_id: 'me', type: 'vacation',
    start_date: '2026-08-17', end_date: '2026-08-21',
    status: 'approved', days_count: 5, comment: null, decided_by: null, decided_at: null,
  },
  {
    id: 'r2', employee_id: 'me', type: 'vacation',
    start_date: '2026-09-01', end_date: '2026-09-04',
    status: 'rejected', days_count: 0, comment: null, decided_by: null, decided_at: null,
  },
];

check('exakt derselbe Zeitraum', overlapsExisting('2026-08-17', '2026-08-21', 'me', existing), true);
check('ragt hinein', overlapsExisting('2026-08-20', '2026-08-25', 'me', existing), true);
check('umschließt', overlapsExisting('2026-08-10', '2026-08-30', 'me', existing), true);
check('direkt davor', overlapsExisting('2026-08-10', '2026-08-14', 'me', existing), false);
check('direkt danach', overlapsExisting('2026-08-24', '2026-08-28', 'me', existing), false);
check('abgelehnter Antrag blockiert nicht', overlapsExisting('2026-09-01', '2026-09-04', 'me', existing), false);
check('fremder Antrag blockiert nicht', overlapsExisting('2026-08-17', '2026-08-21', 'other', existing), false);

console.log(failed === 0 ? '\nAlle Prüfungen bestanden.' : `\n${failed} Prüfung(en) fehlgeschlagen.`);
process.exit(failed === 0 ? 0 : 1);
