/**
 * Prüft die Prefill-Regel gegen die im Gespräch festgelegten Fälle.
 * Läuft ohne Supabase und ohne Netz.
 */
import { buildPrefill } from './prefill.ts';
import { emptyWeek } from './week.ts';
import type { AssignmentRow } from './data.ts';
import type { Site, LeaveRequest, Holiday } from './database.types.ts';

const MONDAY = new Date('2026-08-17T00:00:00'); // KW34
const ME = 'emp-1';
const OTHER = 'emp-2';

const sites: Site[] = [
  { id: 's1', number: '100-7', address: 'Villa Sonnenschein', customer: null, is_absence_code: false, active: true },
  { id: 's-url', number: '060-7', address: 'Urlaub', customer: null, is_absence_code: true, active: true },
  { id: 's-fei', number: '040-7', address: 'Feiertag', customer: null, is_absence_code: true, active: true },
];

function assignment(id: string, date: string, employee = ME): AssignmentRow {
  return {
    id, employee_id: employee, site_id: 's1', date,
    start_time: '07:00:00', end_time: '16:00:00', break_minutes: 30,
    note: null, created_by: null,
    sites: { number: '100-7', address: 'Villa Sonnenschein' },
    employees: { first_name: 'Hans', last_name: 'Maler' },
  };
}

let failed = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failed++;
  console.log(`${ok ? 'OK  ' : 'FEHL'}  ${name}${ok ? '' : `\n        erwartet ${JSON.stringify(expected)}, war ${JSON.stringify(actual)}`}`);
}

// 1. Geplanter Einsatz wird übernommen, Stunden korrekt berechnet (9h - 30min)
{
  const r = buildPrefill(MONDAY, emptyWeek(), [assignment('a1', '2026-08-17')], new Set(), [], [], sites, ME);
  check('Einsatz wird übernommen', r.entries.Montag.entries.length, 1);
  check('Stunden 07:00-16:00 minus 30 Min', r.entries.Montag.entries[0]?.hours, 8.5);
  check('Herkunft vermerkt', r.entries.Montag.entries[0]?.sourceAssignmentId, 'a1');
  check('zum Vermerken gemeldet', r.importedAssignmentIds, ['a1']);
}

// 2. Bereits übernommene oder verworfene Planzeile kommt NICHT wieder
{
  const r = buildPrefill(MONDAY, emptyWeek(), [assignment('a1', '2026-08-17')], new Set(['a1']), [], [], sites, ME);
  check('verworfene Planzeile bleibt weg', r.entries.Montag.entries.length, 0);
  check('nichts hinzugefügt', r.addedCount, 0);
}

// 2b. Die Planungsnotiz bleibt in der Planung
{
  const withNote = assignment('a3', '2026-08-17');
  withNote.note = 'Kunde ab 10 Uhr da';
  const r = buildPrefill(MONDAY, emptyWeek(), [withNote], new Set(), [], [], sites, ME);
  check('Notiz landet nicht im Bericht', r.entries.Montag.entries[0]?.description, '');
}

// 3. Fremde Einsätze landen nicht im eigenen Bericht
{
  const r = buildPrefill(MONDAY, emptyWeek(), [assignment('a9', '2026-08-17', OTHER)], new Set(), [], [], sites, ME);
  check('fremder Einsatz wird ignoriert', r.entries.Montag.entries.length, 0);
}

// 4. Ausgefüllter Tag wird nicht überschrieben, zusätzliche Planzeile kommt dazu
{
  const base = emptyWeek();
  base.Montag.entries.push({ id: 'eigen', project: 'Eigene Baustelle', projectNumber: '999-7', description: 'von Hand', hours: 4 });
  const r = buildPrefill(MONDAY, base, [assignment('a2', '2026-08-17')], new Set(), [], [], sites, ME);
  check('eigene Zeile bleibt erhalten', r.entries.Montag.entries[0]?.description, 'von Hand');
  check('zweiter Einsatz kommt dazu', r.entries.Montag.entries.length, 2);
}

// 5. Genehmigter Urlaub füllt leere Tage mit Soll-Stunden (Mo-Do 8,5 / Fr 6,0)
{
  const leave: LeaveRequest[] = [{
    id: 'l1', employee_id: ME, type: 'vacation',
    start_date: '2026-08-17', end_date: '2026-08-21',
    status: 'approved', days_count: 5, comment: null, decided_by: null, decided_at: null,
  }];
  const r = buildPrefill(MONDAY, emptyWeek(), [], new Set(), leave, [], sites, ME);
  check('Montag Urlaub 8,5 Std', r.entries.Montag.entries[0]?.hours, 8.5);
  check('Freitag Urlaub 6,0 Std', r.entries.Freitag.entries[0]?.hours, 6);
  check('Samstag bleibt leer', r.entries.Samstag.entries.length, 0);
  check('Sonntag bleibt leer', r.entries.Sonntag.entries.length, 0);
  check('Urlaub als 060-7', r.entries.Montag.entries[0]?.projectNumber, '060-7');
}

// 6. Nicht genehmigter Urlaub wird nicht eingetragen
{
  const leave: LeaveRequest[] = [{
    id: 'l2', employee_id: ME, type: 'vacation',
    start_date: '2026-08-17', end_date: '2026-08-17',
    status: 'pending', days_count: 1, comment: null, decided_by: null, decided_at: null,
  }];
  const r = buildPrefill(MONDAY, emptyWeek(), [], new Set(), leave, [], sites, ME);
  check('offener Antrag füllt nichts', r.entries.Montag.entries.length, 0);
}

// 7. Feiertag schlägt Urlaub und füllt mit Soll-Stunden
{
  const holidays: Holiday[] = [{ date: '2026-08-18', name: 'Testfeiertag' }];
  const leave: LeaveRequest[] = [{
    id: 'l3', employee_id: ME, type: 'vacation',
    start_date: '2026-08-18', end_date: '2026-08-18',
    status: 'approved', days_count: 1, comment: null, decided_by: null, decided_at: null,
  }];
  const r = buildPrefill(MONDAY, emptyWeek(), [], new Set(), leave, holidays, sites, ME);
  check('Feiertag statt Urlaub', r.entries.Dienstag.entries[0]?.projectNumber, '040-7');
  check('Feiertag mit Namen', r.entries.Dienstag.entries[0]?.description, 'Testfeiertag');
  check('nur eine Zeile', r.entries.Dienstag.entries.length, 1);
}

// 8. An einem Tag mit Einsatz kommt kein Urlaub dazu
{
  const leave: LeaveRequest[] = [{
    id: 'l4', employee_id: ME, type: 'vacation',
    start_date: '2026-08-17', end_date: '2026-08-17',
    status: 'approved', days_count: 1, comment: null, decided_by: null, decided_at: null,
  }];
  const r = buildPrefill(MONDAY, emptyWeek(), [assignment('a3', '2026-08-17')], new Set(), leave, [], sites, ME);
  check('Einsatz gewinnt gegen Urlaub', r.entries.Montag.entries.length, 1);
  check('und zwar der Einsatz', r.entries.Montag.entries[0]?.projectNumber, '100-7');
}

// 9. Einsätze aus einer anderen Woche werden ignoriert
{
  const r = buildPrefill(MONDAY, emptyWeek(), [assignment('a4', '2026-09-07')], new Set(), [], [], sites, ME);
  check('Einsatz ausserhalb der Woche wird ignoriert', r.addedCount, 0);
}

// 10. Der übergebene Ausgangszustand wird nicht verändert
{
  const base = emptyWeek();
  buildPrefill(MONDAY, base, [assignment('a5', '2026-08-17')], new Set(), [], [], sites, ME);
  check('Ausgangszustand bleibt unberührt', base.Montag.entries.length, 0);
}

console.log(failed === 0 ? '\nAlle Prüfungen bestanden.' : `\n${failed} Prüfung(en) fehlgeschlagen.`);
process.exit(failed === 0 ? 0 : 1);
