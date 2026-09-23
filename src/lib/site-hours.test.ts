/**
 * Prüft das Stundenkontingent der Baustellen.
 *
 * Zwei Dinge müssen zusammenpassen: Der Rest, den die Leiste anzeigt, und die
 * Summe, die die Sicht site_planned_hours in 0017_site_total_hours.sql rechnet.
 * Laufen beide auseinander, zeigt die Leiste eine andere Zahl, als der Plan
 * hergibt — und das fällt erst auf, wenn eine Baustelle längst überzogen ist.
 */
import { calculateHours } from './hours.ts';
import {
  BLOCK_HOURS,
  blockCount,
  blockShiftFor,
  formatHours,
  remainingHours,
  supplyColumns,
  supplyLabel,
} from './site-hours.ts';
import type { Site } from './database.types.ts';

let failed = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failed++;
  console.log(
    `${ok ? 'OK  ' : 'FEHL'}  ${name}${ok ? '' : `\n        erwartet ${JSON.stringify(expected)}, war ${JSON.stringify(actual)}`}`,
  );
}

// --- Ein Block ist ein Standardarbeitstag, keine feste 8,5 ------------------

const mo = blockShiftFor('2026-09-21'); // Montag
const don = blockShiftFor('2026-09-24'); // Donnerstag
const fr = blockShiftFor('2026-09-25'); // Freitag
const sa = blockShiftFor('2026-09-26'); // Samstag

check('Mo-Block: die vorbelegten Zeiten', [mo.start, mo.end], ['07:00', '16:30']);
check('Mo-Block: beide Pausenfenster', mo.breakMinutes, 60);
check('Mo-Block ergibt die Soll-Stunden', mo.hours, 8.5);
check('Do-Block ergibt die Soll-Stunden', don.hours, 8.5);

check('Fr-Block: kürzere Zeiten', [fr.start, fr.end], ['07:00', '13:30']);
check('Fr-Block: nur das erste Pausenfenster', fr.breakMinutes, 30);
check('Fr-Block ist kürzer als ein Blockmaß', fr.hours, 6);

// Samstag hat beide Pausenfenster und dieselbe Regelschicht wie Mo–Do. Dass
// dort niemand Soll-Stunden hat, ist eine Frage der Planung, nicht der Rechnung.
check('Sa-Block rechnet wie Mo–Do', sa.hours, 8.5);

// --- Der Stapel ist der Rest ----------------------------------------------

check('ein voller Tag', blockCount(BLOCK_HOURS), 1);
check('zehn volle Tage', blockCount(85), 10);
check('Rest wird aufgerundet', blockCount(84.5), 10);
check('angebrochene Stunde zählt als ganzer Block', blockCount(0.5), 1);
check('nichts mehr übrig', blockCount(0), 0);
check('überplant', blockCount(-3), 0);
check('nicht hinterlegt', blockCount(null), 0);

// --- Rest rechnen ----------------------------------------------------------

check('drei verplante Tage', remainingHours(100, 3 * BLOCK_HOURS), 74.5);
check('ohne Einsätze zählt das ganze Soll', remainingHours(100, undefined), 100);
check('ohne Soll gibt es keinen Rest', remainingHours(null, 17), null);
check('überplant wird negativ', remainingHours(20, 25.5), -5.5);

// Ohne Runden in remainingHours ergäbe Math.ceil(1e-9 / 8.5) einen Geisterblock
// über einer längst aufgebrauchten Baustelle.
check('Rundungsrest ist kein Block', blockCount(remainingHours(100, 99.999999)), 0);

// --- Welche Baustellen in die Leiste kommen --------------------------------

function site(over: Partial<Site> & { id: string; number: string }): Site {
  return {
    address: 'Musterweg 4',
    customer: null,
    is_absence_code: false,
    active: true,
    total_hours: 85,
    ...over,
  } as Site;
}

const numbersOf = (sites: Site[], planned: Map<string, number>) =>
  supplyColumns(sites, planned).map((c) => c.site.number);

check(
  'ohne Gesamtstunden nicht in der Leiste',
  numbersOf([site({ id: 'a', number: '123-7', total_hours: null })], new Map()),
  [],
);
check(
  'Abwesenheitscode nie in der Leiste',
  numbersOf([site({ id: 'b', number: '050-7', is_absence_code: true })], new Map()),
  [],
);
check(
  'ausgeblendete Baustelle nicht',
  numbersOf([site({ id: 'c', number: '124-7', active: false })], new Map()),
  [],
);
check(
  'aufgebrauchte Baustelle fällt heraus',
  numbersOf([site({ id: 'd', number: '125-7' })], new Map([['d', 85]])),
  [],
);
check(
  'überplante Baustelle fällt heraus',
  numbersOf([site({ id: 'e', number: '126-7' })], new Map([['e', 99]])),
  [],
);
check(
  'Reihenfolge bleibt die der Baustellennummern',
  numbersOf(
    [site({ id: 'f', number: '080-7' }), site({ id: 'g', number: '123-7' })],
    new Map([['f', 8.5]]),
  ),
  ['080-7', '123-7'],
);
check(
  'Rest und Blöcke einer angefangenen Baustelle',
  supplyColumns([site({ id: 'h', number: '123-7' })], new Map([['h', 8.5]])).map((c) => [
    c.remaining,
    c.blocks,
  ]),
  [[76.5, 9]],
);

// --- Beschriftung ----------------------------------------------------------

check('glatte Zahl ohne Nachkomma', formatHours(8), '8');
check('halbe Stunde mit Komma', formatHours(84.5), '84,5');
check(
  'Beschriftung eines Blocks',
  supplyLabel(site({ id: 'i', number: '123-7' }), 84.5),
  '123-7 · Musterweg 4 · noch 84,5 Std',
);

// --- Gegenprobe zum SQL in 0017 --------------------------------------------
//
// Die Sicht rechnet brutto minus gespeicherte Pause. Genau dieselbe Rechnung
// muss calculateHours liefern, sonst zeigt die Leiste einen anderen Rest.

for (const [name, shift, grossMinutes] of [
  ['Mo', mo, 9.5 * 60],
  ['Fr', fr, 6.5 * 60],
] as const) {
  check(
    `Sicht und calculateHours stimmen überein (${name})`,
    Math.round(((grossMinutes - shift.breakMinutes) / 60) * 100) / 100,
    calculateHours(shift.start, shift.end, shift.breakMinutes),
  );
}

console.log(failed === 0 ? '\nAlle Prüfungen bestanden.' : `\n${failed} Prüfung(en) fehlgeschlagen.`);
if (failed > 0) process.exit(1);
