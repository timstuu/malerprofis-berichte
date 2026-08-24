/**
 * Prüft die Prefill-Regel gegen die im Gespräch festgelegten Fälle.
 * Läuft ohne Supabase und ohne Netz.
 */
import { buildPrefill } from './prefill.ts';
import { emptyWeek } from './week.ts';
import type { AssignmentRow } from './data.ts';
import type { Site, LeaveRequest, Holiday, DefaultHours } from './database.types.ts';

const MONDAY = new Date('2026-08-17T00:00:00'); // KW34
const ME = 'emp-1';
const OTHER = 'emp-2';

const sites: Site[] = [
  { id: 's1', number: '100-7', address: 'Villa Sonnenschein', customer: null, is_absence_code: false, active: true },
  { id: 's-url', number: '060-7', address: 'Urlaub', customer: null, is_absence_code: true, active: true },
  { id: 's-fei', number: '040-7', address: 'Feiertag', customer: null, is_absence_code: true, active: true },
  { id: 's-bue', number: '001-7', address: 'Büroarbeit', customer: null, is_absence_code: true, active: true },
];

/** Mo–Do 08:00–17:00 (9,0 Std. − 30 Min = 8,5), Fr 08:00–14:00 (6,0 Std. ohne Pause). */
const officeWeek: DefaultHours[] = [
  { employee_id: ME, weekday: 1, start_time: '08:00:00', end_time: '17:00:00' },
  { employee_id: ME, weekday: 2, start_time: '08:00:00', end_time: '17:00:00' },
  { employee_id: ME, weekday: 3, start_time: '08:00:00', end_time: '17:00:00' },
  { employee_id: ME, weekday: 4, start_time: '08:00:00', end_time: '17:00:00' },
  { employee_id: ME, weekday: 5, start_time: '08:00:00', end_time: '14:00:00' },
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

// 4. Ein Tag, an dem schon etwas steht, bekommt keine Planzeile mehr
{
  const base = emptyWeek();
  base.Montag.entries.push({ id: 'eigen', project: 'Eigene Baustelle', projectNumber: '999-7', description: 'von Hand', hours: 4 });
  const r = buildPrefill(MONDAY, base, [assignment('a2', '2026-08-17')], new Set(), [], [], sites, ME);
  check('eigene Zeile bleibt erhalten', r.entries.Montag.entries[0]?.description, 'von Hand');
  check('Planzeile bleibt weg', r.entries.Montag.entries.length, 1);
  // Nicht als erledigt melden: Räumt der Maler den Tag leer, muss sie wiederkommen.
  check('übersprungene Zeile bleibt offen', r.importedAssignmentIds, []);
  check('nichts hinzugefügt', r.addedCount, 0);
}

// 4b. Zwei Baustellen an einem leeren Tag kommen beide — die erste darf die
//     zweite nicht verdrängen.
{
  const r = buildPrefill(
    MONDAY,
    emptyWeek(),
    [assignment('a3', '2026-08-17'), assignment('a4', '2026-08-17')],
    new Set(), [], [], sites, ME,
  );
  check('beide Einsätze des Tages', r.entries.Montag.entries.length, 2);
  check('beide zum Vermerken gemeldet', r.importedAssignmentIds, ['a3', 'a4']);
}

// 4c. Der volle Tag sperrt nur sich selbst, nicht die übrige Woche.
{
  const base = emptyWeek();
  base.Montag.entries.push({ id: 'eigen', project: 'Eigene Baustelle', projectNumber: '999-7', description: 'von Hand', hours: 4 });
  const r = buildPrefill(
    MONDAY,
    base,
    [assignment('a5', '2026-08-17'), assignment('a6', '2026-08-18')],
    new Set(), [], [], sites, ME,
  );
  check('Montag bleibt bei der eigenen Zeile', r.entries.Montag.entries.length, 1);
  check('Dienstag wird übernommen', r.entries.Dienstag.entries.length, 1);
  check('nur der Dienstag gemeldet', r.importedAssignmentIds, ['a6']);
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

// --- Standard-Arbeitszeiten der Büro-Konten -------------------------------

// 10. Ohne hinterlegte Zeiten passiert nichts — der Normalfall für jeden Maler.
{
  const r = buildPrefill(MONDAY, emptyWeek(), [], new Set(), [], [], sites, ME);
  check('ohne Standardzeiten bleibt die Woche leer', r.addedCount, 0);
}

// 11. Hinterlegte Zeiten füllen ihre Wochentage auf 001-7
{
  const r = buildPrefill(MONDAY, emptyWeek(), [], new Set(), [], [], sites, ME, officeWeek);
  check('fünf Bürotage', r.addedCount, 5);
  check('Bürotag auf 001-7', r.entries.Montag.entries[0]?.projectNumber, '001-7');
  check('Montag 9,0 Std. minus 30 Min', r.entries.Montag.entries[0]?.hours, 8.5);
  check('Montag Pause 30 Min', r.entries.Montag.entries[0]?.pause, 30);
  check('Freitag 6,0 Std. ohne Pause', r.entries.Freitag.entries[0]?.hours, 6);
  check('Freitag Pause 0 Min', r.entries.Freitag.entries[0]?.pause, 0);
  check('Samstag ohne Zeile bleibt leer', r.entries.Samstag.entries.length, 0);
  check('keine Planzeile zu vermerken', r.importedAssignmentIds, []);
}

// 12. Rangfolge: Einsatz, Feiertag und Urlaub schlagen die Bürozeit
{
  const holidays: Holiday[] = [{ date: '2026-08-18', name: 'Testfeiertag' }];
  const leave: LeaveRequest[] = [{
    id: 'l9', employee_id: ME, type: 'vacation',
    start_date: '2026-08-19', end_date: '2026-08-19',
    status: 'approved', days_count: 1, comment: null, decided_by: null, decided_at: null,
  }];
  const r = buildPrefill(
    MONDAY, emptyWeek(), [assignment('a7', '2026-08-17')], new Set(),
    leave, holidays, sites, ME, officeWeek,
  );
  check('Montag: Einsatz schlägt Bürozeit', r.entries.Montag.entries[0]?.projectNumber, '100-7');
  check('Montag nur eine Zeile', r.entries.Montag.entries.length, 1);
  check('Dienstag: Feiertag schlägt Bürozeit', r.entries.Dienstag.entries[0]?.projectNumber, '040-7');
  check('Mittwoch: Urlaub schlägt Bürozeit', r.entries.Mittwoch.entries[0]?.projectNumber, '060-7');
  check('Donnerstag: Bürozeit', r.entries.Donnerstag.entries[0]?.projectNumber, '001-7');
}

// 13. Fehlt 040-7 oder 060-7 als Baustelle, entsteht trotzdem keine Bürostunde
//     an einem Feiertag oder Urlaubstag.
{
  const bare = sites.filter((s) => s.number === '001-7');
  const holidays: Holiday[] = [{ date: '2026-08-17', name: 'Testfeiertag' }];
  const leave: LeaveRequest[] = [{
    id: 'l8', employee_id: ME, type: 'vacation',
    start_date: '2026-08-18', end_date: '2026-08-18',
    status: 'approved', days_count: 1, comment: null, decided_by: null, decided_at: null,
  }];
  const r = buildPrefill(MONDAY, emptyWeek(), [], new Set(), leave, holidays, bare, ME, officeWeek);
  check('Feiertag ohne 040-7 bleibt leer', r.entries.Montag.entries.length, 0);
  check('Urlaubstag ohne 060-7 bleibt leer', r.entries.Dienstag.entries.length, 0);
  check('übrige Bürotage entstehen trotzdem', r.addedCount, 3);
}

// 14. Eigene Eingabe wird nicht überschrieben
{
  const base = emptyWeek();
  base.Montag.entries.push({ id: 'eigen', project: 'Kundentermin', projectNumber: '100-7', description: 'vor Ort', hours: 3 });
  const r = buildPrefill(MONDAY, base, [], new Set(), [], [], sites, ME, officeWeek);
  check('eigene Zeile bleibt allein stehen', r.entries.Montag.entries.length, 1);
  check('nur die vier übrigen Bürotage', r.addedCount, 4);
}

// 15. Fehlt 001-7 in den Stammdaten, passiert nichts — statt einer Zeile ohne
//     Baustellennummer, die in der Auswertung eine Lücke hinterlässt.
{
  const withoutOffice = sites.filter((s) => s.number !== '001-7');
  const r = buildPrefill(MONDAY, emptyWeek(), [], new Set(), [], [], withoutOffice, ME, officeWeek);
  check('ohne 001-7 keine Bürozeilen', r.addedCount, 0);
}

console.log(failed === 0 ? '\nAlle Prüfungen bestanden.' : `\n${failed} Prüfung(en) fehlgeschlagen.`);
process.exit(failed === 0 ? 0 : 1);
