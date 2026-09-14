import type { PayoutKind, VatMode } from './database.types.ts';

/**
 * Rechenregeln der Auslagen — ohne Datenbank und ohne Oberfläche.
 *
 * Gerechnet wird durchgehend in Cent. Mit Euro-Kommazahlen ergäbe die Summe
 * von 34,99 + 30,96 + 4,98 nicht verlässlich 70,93, und genau diese Summe muss
 * beim Abschluss auf den Cent mit den Auszahlungen übereinstimmen.
 */

export const VAT_MODES: { mode: VatMode; label: string }[] = [
  { mode: 'none', label: 'ohne MwSt' },
  { mode: '7', label: '7 %' },
  { mode: '19', label: '19 %' },
  { mode: 'mixed', label: '7 % + 19 %' },
];

export const PAYOUT_KINDS: { kind: PayoutKind; label: string }[] = [
  { kind: 'ueberweisung', label: 'Überweisung aufs Konto' },
  { kind: 'bar', label: 'Bar' },
  { kind: 'vorschuss', label: 'Vorschuss' },
];

export function payoutLabel(kind: PayoutKind): string {
  return PAYOUT_KINDS.find((k) => k.kind === kind)?.label ?? kind;
}

/** Die Art, bei der zusätzlich die Angaben eines Bewirtungsbelegs nötig sind. */
export const ENTERTAINMENT_CATEGORY = 'Bewirtung';

/** Vorschläge zum Antippen. Frei tippen bleibt immer möglich. */
export const CATEGORY_SUGGESTIONS = [
  'Werkzeug/Baumaterial',
  'Tanken',
  'Parken',
  'Büro Bedarf',
  ENTERTAINMENT_CATEGORY,
];

/**
 * Ist das eine Bewirtung? Auch von Hand getippt und unabhängig von der
 * Schreibweise — sonst entginge ein „bewirtung“ dem Zusatzformular.
 */
export function isEntertainment(category: string): boolean {
  return category.trim().toLowerCase() === ENTERTAINMENT_CATEGORY.toLowerCase();
}

/** Ab diesem Betrag reicht ein Kassenbon nicht mehr. */
export const COMPANY_INVOICE_FROM_CENTS = 25000;
export const COMPANY_INVOICE_HINT =
  'Ab einem Betrag von 250,00€ muss eine Rechnung mit Firmenanschrift eingereicht werden!';

/** Nur ein Hinweis — gespeichert werden darf der Beleg trotzdem. */
export function needsCompanyInvoice(grossCents: number | null): boolean {
  return grossCents !== null && grossCents >= COMPANY_INVOICE_FROM_CENTS;
}

/** Euro aus der Datenbank (Zahl oder Text) in Cent. */
export function toCents(value: number | string | null | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

/**
 * Liest einen am Handy getippten Betrag: „34,99“, „34.99“, „1.234,56“, „5“.
 * Gibt Cent zurück oder null, wenn die Eingabe kein Betrag ist.
 */
export function parseEuro(text: string): number | null {
  const t = text.replace(/[\s€]/g, '');
  if (!t) return null;
  // Steht ein Komma drin, ist es das Dezimalzeichen und Punkte trennen Tausender.
  const normalized = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t;
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  return Math.round(Number(normalized) * 100);
}

/**
 * 123456 → „1.234,56“ — ohne Eurozeichen, so wie in den Spalten der
 * Excel-Vorlage und im PDF, dessen Standardschrift das Zeichen nicht sicher trägt.
 */
export function formatAmount(cents: number): string {
  const abs = Math.abs(Math.round(cents));
  const euros = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const rest = String(abs % 100).padStart(2, '0');
  return `${cents < 0 ? '-' : ''}${euros},${rest}`;
}

/** 123456 → „1.234,56 €“ */
export function formatEuro(cents: number): string {
  return `${formatAmount(cents)} €`;
}

/** 3499 → „34,99“ — zum Vorbelegen eines Eingabefelds. */
export function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',');
}

/** Im Brutto enthaltene Steuer bei einem Satz, kaufmännisch auf den Cent gerundet. */
export function vatFromGross(grossCents: number, rate: 7 | 19): number {
  return Math.round((grossCents * rate) / (100 + rate));
}

/**
 * Die Steuerbeträge, die zu einem Beleg gespeichert werden. Bei einem
 * einzelnen Satz zählen die von Hand getippten Werte nicht — sie stammen dann
 * nur aus einer vorher gewählten Einstellung.
 */
export function receiptVat(
  mode: VatMode,
  grossCents: number,
  vat7Cents: number,
  vat19Cents: number,
): { vat7: number; vat19: number } {
  switch (mode) {
    case '7':
      return { vat7: vatFromGross(grossCents, 7), vat19: 0 };
    case '19':
      return { vat7: 0, vat19: vatFromGross(grossCents, 19) };
    case 'mixed':
      return { vat7: vat7Cents, vat19: vat19Cents };
    default:
      return { vat7: 0, vat19: 0 };
  }
}

/** Die Eingaben eines Belegs, so wie das Formular sie hat. */
export interface ReceiptDraft {
  receiptDate: string;
  vendor: string;
  category: string;
  vatMode: VatMode;
  /** null = leer oder nicht lesbar. */
  grossCents: number | null;
  vat7Cents: number | null;
  vat19Cents: number | null;
  photoCount: number;
  /** Nur bei Bewirtung geprüft. */
  entertainmentGuests: string;
  entertainmentOccasion: string;
  hasSignature: boolean;
}

/** Was an einem Beleg noch fehlt. Leere Liste = speicherbar. */
export function validateReceipt(draft: ReceiptDraft, today: string): string[] {
  const problems: string[] = [];
  if (!draft.receiptDate) {
    problems.push('Bitte das Datum des Belegs angeben.');
  } else if (draft.receiptDate > today) {
    problems.push('Das Belegdatum liegt in der Zukunft.');
  }
  if (!draft.vendor.trim()) problems.push('Bitte Name/Ort eintragen, z. B. „REWE Hamburg“.');
  if (!draft.category.trim()) problems.push('Bitte die Art der Auslage angeben.');
  if (draft.grossCents === null || draft.grossCents <= 0) {
    problems.push('Bitte den Bruttobetrag eingeben, z. B. 34,99.');
  }
  if (draft.vatMode === 'mixed') {
    if (!draft.vat7Cents || !draft.vat19Cents) {
      problems.push('Bei 7 % + 19 % bitte beide Steuerbeträge vom Beleg eintragen.');
    } else if (draft.grossCents && draft.vat7Cents + draft.vat19Cents >= draft.grossCents) {
      problems.push('Die Steuerbeträge sind zusammen größer als der Bruttobetrag.');
    }
  }
  if (isEntertainment(draft.category)) {
    if (!draft.entertainmentGuests.trim()) problems.push('Bitte die bewirteten Personen eintragen.');
    if (!draft.entertainmentOccasion.trim()) problems.push('Bitte den Anlass der Bewirtung angeben.');
    if (!draft.hasSignature) problems.push('Bitte die Bewirtung unterschreiben.');
  }
  if (draft.photoCount < 1) problems.push('Bitte mindestens ein Foto vom Beleg aufnehmen.');
  return problems;
}

/** Summe der Bruttobeträge in Cent. */
export function sumCents(receipts: { gross: number | string }[]): number {
  return receipts.reduce((sum, r) => sum + toCents(r.gross), 0);
}

/** Was nach den Auszahlungszeilen noch offen ist. Muss beim Abschluss 0 sein. */
export function restCents(totalCents: number, payouts: { amount: number | string }[]): number {
  return totalCents - payouts.reduce((sum, p) => sum + toCents(p.amount), 0);
}

/**
 * Belegnummern 1…n für Tabelle und PDF: nach Belegdatum, bei gleichem Datum
 * in der Reihenfolge der Erfassung. Die Nummer wird nicht gespeichert — ein
 * abgerechneter Beleg ist gesperrt, die Reihenfolge ändert sich also nicht mehr.
 */
export function numberReceipts<T extends { receipt_date: string; created_at: string }>(
  receipts: T[],
): (T & { number: number })[] {
  return [...receipts]
    .sort((a, b) =>
      a.receipt_date === b.receipt_date
        ? a.created_at.localeCompare(b.created_at)
        : a.receipt_date.localeCompare(b.receipt_date),
    )
    .map((r, i) => ({ ...r, number: i + 1 }));
}

/** `Auslagen_Stumpenhagen_09-2026.pdf` — wie die Blattnamen der Excel-Vorlage. */
export function expenseFileName(lastName: string, month: string): string {
  const [year, mon] = month.split('-');
  const name = (lastName || 'Unbekannt').replace(/[\/:*?"<>|]/g, '-').trim();
  return `Auslagen_${name}_${mon}-${year}.pdf`;
}

/** Kürzel wie in der Vorlage: „Tim Stumpenhagen“ → „TS“. */
export function initials(firstName: string, lastName: string): string {
  return `${firstName.trim().charAt(0)}${lastName.trim().charAt(0)}`.toUpperCase();
}
