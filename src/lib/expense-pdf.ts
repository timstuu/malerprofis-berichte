import { format, parseISO } from 'date-fns';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { drawLetterhead } from './report-pdf.ts';
import {
  expenseFileName,
  formatAmount,
  initials,
  isEntertainment,
  numberReceipts,
  payoutLabel,
  restCents,
  sumCents,
  toCents,
} from './expenses.ts';
import type { ExpenseReceipt, ExpenseSettlement } from './database.types.ts';

/**
 * Das PDF einer Auslagen-Abrechnung: vorne die Tabelle wie in der bisherigen
 * Excel-Vorlage, dahinter je Beleg eine Seite mit seinen Fotos.
 *
 * Wie beim Wochenbericht ohne Zugriff auf Datenbank oder Oberfläche — die
 * Fotos kommen schon geladen herein.
 */

export interface ExpensePdfData {
  firstName: string;
  lastName: string;
  settlement: ExpenseSettlement;
  receipts: ExpenseReceipt[];
  /** Foto-Pfad → Bild als DataURL. Fehlt ein Foto, steht ein Hinweis im PDF. */
  photos: Record<string, string>;
}

const PAGE_WIDTH = 210;
const MARGIN = 15;
/** Oberkante des Fotobereichs auf einer Belegseite, unter der Überschrift. */
const PHOTO_TOP = 34;
const PHOTO_BOTTOM = 285;
const PHOTO_GAP = 6;
/** Zwei Fotos teilen sich eine Seite; so bleibt ein Kassenzettel lesbar. */
const PHOTOS_PER_PAGE = 2;

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('Foto konnte nicht gelesen werden'));
    reader.readAsDataURL(blob);
  });
}

function dateText(isoDate: string): string {
  return format(parseISO(isoDate), 'dd.MM.yyyy');
}

/** Foto in den Kasten einpassen, Seitenverhältnis bleibt, waagerecht mittig. */
function drawPhoto(doc: jsPDF, dataUrl: string, x: number, y: number, maxWidth: number, maxHeight: number) {
  const props = doc.getImageProperties(dataUrl);
  const ratio = props.width / props.height;
  let width = maxWidth;
  let height = maxWidth / ratio;
  if (height > maxHeight) {
    height = maxHeight;
    width = maxHeight * ratio;
  }
  const type = dataUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG';
  doc.addImage(dataUrl, type, x + (maxWidth - width) / 2, y, width, height);
}

/**
 * Die Angaben des Bewirtungsbelegs über den Fotos: Personen, Anlass,
 * Unterschrift. Ort, Datum und Betrag stehen schon in der Kopfzeile der Seite.
 * Gibt zurück, wo darunter die Fotos anfangen dürfen.
 */
function drawEntertainment(doc: jsPDF, receipt: ExpenseReceipt, top: number): number {
  const width = PAGE_WIDTH - 2 * MARGIN;
  let y = top;
  doc.setFontSize(11);
  doc.text('Angaben zur Bewirtung', MARGIN, y);
  y += 6;
  doc.setFontSize(10);
  const fields: [string, string | null][] = [
    ['Bewirtete Personen', receipt.entertainment_guests],
    ['Anlass', receipt.entertainment_occasion],
  ];
  for (const [label, value] of fields) {
    const lines = doc.splitTextToSize(`${label}: ${value?.trim() || '-'}`, width) as string[];
    doc.text(lines, MARGIN, y);
    y += lines.length * 4.5 + 1.5;
  }
  doc.text('Unterschrift Mitarbeiter:', MARGIN, y);
  if (receipt.entertainment_signature) {
    try {
      doc.addImage(receipt.entertainment_signature, 'PNG', MARGIN, y + 2, 50, 20);
    } catch (error) {
      console.error('Unterschrift konnte nicht ins PDF:', error);
    }
  }
  return y + 30;
}

function finalY(doc: jsPDF): number {
  return (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
}

/** Baut das PDF und gibt es als Blob zurück. */
export async function buildExpensePdf(data: ExpensePdfData): Promise<Blob> {
  const doc = new jsPDF();
  const { settlement } = data;
  const fullName = `${data.firstName} ${data.lastName}`.trim();
  const receipts = numberReceipts(data.receipts);

  await drawLetterhead(doc);

  doc.setFontSize(16);
  doc.text('Abrechnung von Auslagen', 20, 40);
  doc.setFontSize(11);
  doc.text(`Monat: ${format(parseISO(settlement.month), 'MM/yyyy')}`, 20, 50);
  doc.text(`Name: ${fullName} (${initials(data.firstName, data.lastName)})`, 20, 57);
  doc.text(`Datum: ${dateText(settlement.settled_on)}`, 20, 64);
  const kinds = [...new Set(settlement.payouts.map((p) => payoutLabel(p.kind)))];
  doc.text(`Art der Auszahlung: ${kinds.join(', ')}`, 20, 71);

  const vat7Total = receipts.reduce((sum, r) => sum + toCents(r.vat7), 0);
  const vat19Total = receipts.reduce((sum, r) => sum + toCents(r.vat19), 0);
  const grossTotal = sumCents(receipts);
  const amountColumns = {
    4: { halign: 'right' as const },
    5: { halign: 'right' as const },
    6: { halign: 'right' as const },
  };

  autoTable(doc, {
    startY: 80,
    head: [['Beleg-Nr.', 'Datum', 'Name/Ort', 'Art', 'MwSt 7 %', 'MwSt 19 %', 'Brutto gesamt']],
    body: receipts.map((r) => [
      String(r.number),
      dateText(r.receipt_date),
      r.vendor,
      r.category,
      // Leere Zellen statt 0,00 — wie in der Vorlage.
      toCents(r.vat7) > 0 ? formatAmount(toCents(r.vat7)) : '',
      toCents(r.vat19) > 0 ? formatAmount(toCents(r.vat19)) : '',
      formatAmount(toCents(r.gross)),
    ]),
    foot: [
      [
        { content: 'Summe (EUR)', colSpan: 4, styles: { halign: 'right' as const } },
        { content: formatAmount(vat7Total), styles: { halign: 'right' as const } },
        { content: formatAmount(vat19Total), styles: { halign: 'right' as const } },
        { content: formatAmount(grossTotal), styles: { halign: 'right' as const } },
      ],
    ],
    columnStyles: amountColumns,
  });

  autoTable(doc, {
    startY: finalY(doc) + 10,
    head: [['Datum', 'Auszahlung', 'Name', 'Betrag (EUR)']],
    body: settlement.payouts.map((p) => [
      dateText(p.date),
      payoutLabel(p.kind),
      fullName,
      formatAmount(toCents(p.amount)),
    ]),
    foot: [
      [
        { content: 'Rest', colSpan: 3, styles: { halign: 'right' as const } },
        {
          content: formatAmount(restCents(grossTotal, settlement.payouts)),
          styles: { halign: 'right' as const },
        },
      ],
    ],
    columnStyles: { 3: { halign: 'right' as const } },
  });

  // Je Beleg eine eigene Seite, damit das Büro jeden Zettel zuordnen kann.
  for (const receipt of receipts) {
    const paths = receipt.photo_paths;
    const pages = Math.max(1, Math.ceil(paths.length / PHOTOS_PER_PAGE));
    for (let page = 0; page < pages; page++) {
      doc.addPage();
      doc.setFontSize(14);
      doc.text(`Beleg Nr. ${receipt.number}${page > 0 ? ' (Fortsetzung)' : ''}`, MARGIN, 18);
      doc.setFontSize(10);
      doc.text(
        `${dateText(receipt.receipt_date)} · ${receipt.vendor} · ${receipt.category} · ${formatAmount(toCents(receipt.gross))} EUR`,
        MARGIN,
        25,
        { maxWidth: PAGE_WIDTH - 2 * MARGIN },
      );

      // Die Bewirtungsangaben gehören auf die erste Seite des Belegs.
      const photoTop =
        page === 0 && isEntertainment(receipt.category) ? drawEntertainment(doc, receipt, PHOTO_TOP) : PHOTO_TOP;
      const onPage = paths.slice(page * PHOTOS_PER_PAGE, (page + 1) * PHOTOS_PER_PAGE);
      const slotHeight =
        (PHOTO_BOTTOM - photoTop - PHOTO_GAP * Math.max(0, onPage.length - 1)) / Math.max(1, onPage.length);
      onPage.forEach((path, i) => {
        const y = photoTop + i * (slotHeight + PHOTO_GAP);
        const dataUrl = data.photos[path];
        try {
          if (!dataUrl) throw new Error(`Foto ${path} fehlt`);
          drawPhoto(doc, dataUrl, MARGIN, y, PAGE_WIDTH - 2 * MARGIN, slotHeight);
        } catch (error) {
          // Ein kaputtes Foto darf nicht die ganze Abrechnung verhindern.
          console.error('Belegfoto konnte nicht ins PDF:', error);
          doc.text('[Foto konnte nicht geladen werden]', MARGIN, y + 10);
        }
      });
    }
  }

  return doc.output('blob');
}

/** Baut das PDF und stößt den Download an. */
export async function downloadExpensePdf(data: ExpensePdfData): Promise<void> {
  const blob = await buildExpensePdf(data);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = expenseFileName(data.lastName, data.settlement.month);
  a.click();
  URL.revokeObjectURL(url);
}
