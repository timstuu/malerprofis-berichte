/**
 * Prüft die Rechenregeln der Auslagen.
 *
 * Die Beispielbeträge stammen aus der Excel-Vorlage, mit der das Büro bisher
 * abgerechnet hat. Was dort herauskam, muss hier ebenso herauskommen.
 */
import {
  expenseFileName,
  formatAmount,
  formatEuro,
  initials,
  numberReceipts,
  parseEuro,
  receiptVat,
  restCents,
  sumCents,
  validateReceipt,
  vatFromGross,
  type ReceiptDraft,
} from './expenses.ts';

let failed = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failed++;
  console.log(
    `${ok ? 'OK  ' : 'FEHL'}  ${name}${ok ? '' : `\n        erwartet ${JSON.stringify(expected)}, war ${JSON.stringify(actual)}`}`,
  );
}

// --- Steuer aus dem Brutto: Werte der Vorlage ------------------------------

check('19 % aus 34,99 €', vatFromGross(3499, 19), 559);
check('19 % aus 4,98 €', vatFromGross(498, 19), 80);
check('7 % aus 10,70 €', vatFromGross(1070, 7), 70);

// --- Beträge lesen und schreiben -------------------------------------------

check('Komma', parseEuro('34,99'), 3499);
check('Punkt', parseEuro('34.99'), 3499);
check('Tausenderpunkt', parseEuro('1.234,56'), 123456);
check('ganze Euro', parseEuro('5'), 500);
check('mit Eurozeichen', parseEuro('4,98 €'), 498);
check('kein Betrag', parseEuro('abc'), null);
check('drei Nachkommastellen', parseEuro('1,234'), null);
check('leer', parseEuro(''), null);
check('Anzeige mit Tausenderpunkt', formatEuro(123456), '1.234,56 €');
check('Anzeige unter einem Euro', formatEuro(5), '0,05 €');
check('Betrag fürs PDF ohne Eurozeichen', formatAmount(3499), '34,99');
check('negativer Rest', formatAmount(-93), '-0,93');

// --- Welche Steuer gespeichert wird ----------------------------------------

check('ohne MwSt ignoriert Handwerte', receiptVat('none', 1000, 50, 50), { vat7: 0, vat19: 0 });
check('19 % wird errechnet', receiptVat('19', 3499, 1, 1), { vat7: 0, vat19: 559 });
check('gemischt übernimmt Handwerte', receiptVat('mixed', 3096, 170, 80), { vat7: 170, vat19: 80 });

// --- Prüfung beim Speichern -------------------------------------------------

const today = '2026-09-14';
const rewe: ReceiptDraft = {
  receiptDate: '2026-07-14',
  vendor: 'REWE Hamburg',
  category: 'Bewirtung/Kaffee Büro',
  vatMode: 'mixed',
  grossCents: 3096,
  vat7Cents: 170,
  vat19Cents: 80,
  photoCount: 1,
};
check('gültiger gemischter Beleg', validateReceipt(rewe, today), []);
check('gemischt ohne 19 %', validateReceipt({ ...rewe, vat19Cents: null }, today).length, 1);
check('Steuer größer als Brutto', validateReceipt({ ...rewe, vat7Cents: 3100 }, today).length, 1);
check('Steuer knapp unter Brutto', validateReceipt({ ...rewe, vat7Cents: 3000 }, today), []);
check('einzelner Satz braucht keine Handwerte', validateReceipt({ ...rewe, vatMode: '19', vat7Cents: null, vat19Cents: null }, today), []);
check('ohne Foto', validateReceipt({ ...rewe, photoCount: 0 }, today).length, 1);
check('Datum in der Zukunft', validateReceipt({ ...rewe, receiptDate: '2026-09-15' }, today).length, 1);
check('Datum heute', validateReceipt({ ...rewe, receiptDate: today }, today), []);
check('ohne Betrag', validateReceipt({ ...rewe, grossCents: null, vatMode: 'none' }, today).length, 1);

// --- Nummerierung, Summe, Rest ----------------------------------------------

const numbered = numberReceipts([
  { id: 'rewe-27', receipt_date: '2026-07-27', created_at: '2026-07-27T10:00:00Z' },
  { id: 'andronaco-spaeter', receipt_date: '2026-07-13', created_at: '2026-07-20T10:00:00Z' },
  { id: 'andronaco', receipt_date: '2026-07-13', created_at: '2026-07-13T10:00:00Z' },
]);
check(
  'Nummer nach Datum, dann Erfassung',
  numbered.map((r) => [r.id, r.number]),
  [['andronaco', 1], ['andronaco-spaeter', 2], ['rewe-27', 3]],
);

check('Summe der Vorlage', sumCents([{ gross: 34.99 }, { gross: '30.96' }, { gross: 4.98 }]), 7093);
check('Rest nach Vorschuss und Überweisung', restCents(7093, [{ amount: 50 }, { amount: 20.93 }]), 0);
check('Rest bleibt offen', restCents(7093, [{ amount: 70 }]), 93);

// --- Dateiname und Kürzel ---------------------------------------------------

check('Dateiname', expenseFileName('Stumpenhagen', '2026-09-01'), 'Auslagen_Stumpenhagen_09-2026.pdf');
check('Dateiname ohne Sonderzeichen', expenseFileName('Müller/Meier', '2026-10-01'), 'Auslagen_Müller-Meier_10-2026.pdf');
check('Kürzel', initials('Tim', 'Stumpenhagen'), 'TS');

if (failed > 0) {
  console.log(`\n${failed} Prüfung(en) fehlgeschlagen.`);
  process.exit(1);
}
console.log('\nAlle Prüfungen der Auslagen bestanden.');
