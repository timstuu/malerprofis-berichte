import { format } from 'date-fns';
import { jsPDF } from 'jspdf';
import {
  PAGE_HEIGHT,
  contentLeft,
  contentWidth,
  drawLetterhead,
  drawMeta,
  drawSignature,
  drawTitle,
  finishPages,
  pdfDesign,
  signatureHeight,
  useText,
  type PdfDesign,
  type PdfLogo,
} from './pdf/design.ts';

/**
 * Das PDF eines Abnahmeprotokolls. Es entsteht als einziges PDF noch auf dem
 * Gerät des Malers, direkt nach dem Unterschreiben.
 *
 * Ohne Zugriff auf Oberfläche oder Datenbank, damit der PDF-Designer dasselbe
 * zeichnet. Die Gestaltung kommt aus `pdf/design.json`.
 */

export interface AbnahmePdfData {
  firstName: string;
  lastName: string;
  address: string;
  number: string;
  participants: string[];
  type: 'teil' | 'gesamt';
  status: 'ohne' | 'mit';
  /** Mängel mit optionalem Foto als DataURL. */
  tasks: { text: string; photo?: string }[];
  /** yyyy-MM-dd oder leer. */
  reworkDue: string;
  /** Tag der Unterschrift. */
  date: Date;
  employeeSignature?: string;
  customerSignature?: string;
}

const BOTTOM = PAGE_HEIGHT - 20;

export function renderAbnahmePdf(data: AbnahmePdfData, logo: PdfLogo, d: PdfDesign = pdfDesign): jsPDF {
  const doc = new jsPDF();
  const left = contentLeft(d);
  const lineHeight = d.meta.lineHeight;

  drawLetterhead(doc, logo, d);
  const metaTop = drawTitle(doc, d.title.abnahme, d);

  const rows: [string, string][] = [
    ['Mitarbeiter', `${data.firstName} ${data.lastName}`],
    ['Baustelle / Adresse', data.address],
    ['Baustellennummer', data.number],
    ['Teilnehmer', data.participants.join(', ')],
    ['Art der Abnahme', data.type === 'teil' ? 'Teilabnahme' : 'Gesamtabnahme'],
    ['Status', data.status === 'ohne' ? 'Ohne sichtbare Mängel' : 'Mit Mängeln/Restarbeiten'],
  ];
  // Die Frist gehört zum Mängelfall und steht deshalb auch dann im Bericht,
  // wenn (noch) kein einzelner Mangel aufgeführt ist. Ohne Datum wird der
  // offene Termin ausdrücklich benannt, statt ihn wegzulassen.
  if (data.status === 'mit') {
    rows.push([
      'Nacharbeiten bis',
      data.reworkDue
        ? format(new Date(`${data.reworkDue}T00:00:00`), 'dd.MM.yyyy')
        : 'Termin wird noch festgelegt',
    ]);
  }
  let y = drawMeta(doc, rows, metaTop, d) + 3;

  if (data.status === 'mit' && data.tasks.length > 0) {
    useText(doc, d, { size: d.meta.fontSize, bold: d.meta.labelBold });
    doc.text('Mängel/Kommentar:', left, y);
    y += lineHeight + 3;

    const photoWidth = d.abnahme.photoWidth;
    const photoHeight = photoWidth * 0.75;
    for (const task of data.tasks) {
      useText(doc, d, { size: d.meta.fontSize });
      const lines = doc.splitTextToSize(`- ${task.text}`, contentWidth(d) - 5) as string[];
      if (y + lines.length * lineHeight > BOTTOM) {
        doc.addPage();
        y = 20;
      }
      doc.text(lines, left + 5, y);
      y += lines.length * lineHeight;

      if (task.photo) {
        if (y + photoHeight > BOTTOM) {
          doc.addPage();
          y = 20;
        }
        try {
          const type = task.photo.includes('image/png') ? 'PNG' : 'JPEG';
          doc.addImage(task.photo, type, left + 5, y - 3, photoWidth, photoHeight);
          y += photoHeight + 5;
        } catch (e) {
          console.error('Foto konnte nicht ins PDF:', e);
          doc.text('[Fehler beim Laden des Fotos]', left + 5, y);
          y += lineHeight;
        }
      }
    }
  }

  y += d.signature.gapAfterContent - lineHeight;
  if (y + lineHeight + signatureHeight(d) > BOTTOM) {
    doc.addPage();
    y = 20;
  }

  // Zwei Felder nebeneinander, das zweite ab der Seitenmitte.
  const right = left + contentWidth(d) / 2 + 5;
  const date = `Datum: ${format(data.date, 'dd.MM.yyyy')}`;
  useText(doc, d, { size: d.meta.fontSize });
  doc.text(date, left, y);
  doc.text(date, right, y);
  drawSignature(doc, 'Unterschrift Mitarbeiter:', data.employeeSignature, left, y + lineHeight, d);
  drawSignature(doc, 'Unterschrift Kunde:', data.customerSignature, right, y + lineHeight, d);

  finishPages(doc, d);
  return doc;
}
