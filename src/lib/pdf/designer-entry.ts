import { renderAbnahmePdf } from '../abnahme-pdf.ts';
import { renderExpensePdf } from '../expense-pdf.ts';
import { renderWeeklyReportPdf } from '../report-pdf.ts';
import type { ExpenseReceipt } from '../database.types.ts';
import { pdfDesign, registerPdfFont, type PdfDesign, type PdfLogo } from './design.ts';
import { arimo } from './fonts/arimo.ts';

// Im Designer liegen alle Schriften von Anfang an bereit.
registerPdfFont('arimo', arimo);

/**
 * Einstieg für den PDF-Designer (`npm run pdf-designer`). Wird mit esbuild zu
 * einem Skript gebündelt, das die echten Zeichenfunktionen der App mit
 * Beispieldaten aufruft — die Vorschau ist also das PDF, das die App baut.
 */

export interface SampleImages {
  /** Kassenzettel-Fotos als DataURL. */
  receipts: string[];
  /** Mängelfoto als DataURL. */
  defect: string;
  /** Unterschrift als PNG-DataURL. */
  signature: string;
}

export type DocumentKind = 'weeklyReport' | 'expenses' | 'abnahme';

function receipt(
  n: number,
  date: string,
  vendor: string,
  category: string,
  gross: number,
  vat7: number,
  vat19: number,
  photos: string[],
  extra: Partial<ExpenseReceipt> = {},
): ExpenseReceipt {
  return {
    id: `beispiel-${n}`,
    employee_id: 'beispiel',
    receipt_date: date,
    vendor,
    category,
    vat_mode: vat7 && vat19 ? 'mixed' : vat7 ? '7' : vat19 ? '19' : 'none',
    gross,
    vat7,
    vat19,
    photo_paths: photos,
    entertainment_guests: null,
    entertainment_occasion: null,
    entertainment_signature: null,
    settlement_id: 'beispiel',
    created_at: `${date}T12:00:00Z`,
    updated_at: `${date}T12:00:00Z`,
    updated_by: null,
    ...extra,
  };
}

export function render(kind: DocumentKind, design: PdfDesign, logo: PdfLogo, img: SampleImages): ArrayBuffer {
  if (kind === 'weeklyReport') {
    const day = (d: number) => `2026-09-${String(d).padStart(2, '0')}`;
    return renderWeeklyReportPdf(
      {
        firstName: 'Max',
        lastName: 'Beispiel',
        weekStart: new Date(2026, 8, 7),
        signature: img.signature,
        entries: [
          { date: day(7), siteNumber: '2614', siteAddress: 'Hofweg 12, Hamburg', description: 'Treppenhaus spachteln und schleifen', startTime: '07:00', endTime: '15:30', breakMinutes: 30, hours: 8 },
          { date: day(8), siteNumber: '2614', siteAddress: 'Hofweg 12, Hamburg', description: 'Treppenhaus grundieren, 1. Anstrich', startTime: '07:00', endTime: '15:30', breakMinutes: 30, hours: 8 },
          { date: day(9), siteNumber: '2621', siteAddress: 'Wandsbeker Chaussee 80', description: 'Fassade abkleben, Gerüst prüfen', startTime: '07:00', endTime: '12:00', breakMinutes: 0, hours: 5 },
          { date: day(9), siteNumber: '2614', siteAddress: 'Hofweg 12, Hamburg', description: 'Schlussanstrich Geländer', startTime: '12:30', endTime: '15:30', breakMinutes: 0, hours: 3 },
          { date: day(10), siteNumber: '2621', siteAddress: 'Wandsbeker Chaussee 80', description: 'Fassade 1. Anstrich Silikonharz', startTime: '07:00', endTime: '15:30', breakMinutes: 30, hours: 8 },
          { date: day(11), siteNumber: '2621', siteAddress: 'Wandsbeker Chaussee 80', description: 'Fassade 2. Anstrich, Abdeckung entfernen', startTime: '07:00', endTime: '13:00', breakMinutes: 15, hours: 5.75 },
        ],
      },
      logo,
      design,
    ).output('arraybuffer');
  }

  if (kind === 'expenses') {
    const photos: Record<string, string> = {};
    img.receipts.forEach((url, i) => (photos[`foto-${i}`] = url));
    return renderExpensePdf(
      {
        firstName: 'Max',
        lastName: 'Beispiel',
        settlement: {
          id: 'beispiel',
          employee_id: 'beispiel',
          month: '2026-08-01',
          settled_on: '2026-09-03',
          total: 312.46,
          payouts: [
            { date: '2026-08-15', kind: 'vorschuss', amount: 100 },
            { date: '2026-09-03', kind: 'ueberweisung', amount: 212.46 },
          ],
          created_by: null,
          created_at: '2026-09-03T10:00:00Z',
        },
        receipts: [
          receipt(1, '2026-08-04', 'Bauhaus Hamburg-Wandsbek', 'Werkzeug/Baumaterial', 64.9, 0, 10.36, ['foto-0']),
          receipt(2, '2026-08-12', 'Aral Hofweg', 'Tanken', 78.5, 0, 12.53, ['foto-1']),
          receipt(3, '2026-08-21', 'Parkhaus Mundsburg', 'Parken', 9, 0, 1.44, ['foto-0', 'foto-1', 'foto-0']),
          receipt(4, '2026-08-28', 'Restaurant Hofweg-Eck', 'Bewirtung', 160.06, 4.9, 18.2, ['foto-1'], {
            entertainment_guests: 'Frau Schulte (Hausverwaltung), Herr Beispiel',
            entertainment_occasion: 'Abstimmung Farbkonzept Fassade Wandsbeker Chaussee',
            entertainment_signature: img.signature,
          }),
        ],
        photos,
      },
      logo,
      design,
    ).output('arraybuffer');
  }

  return renderAbnahmePdf(
    {
      firstName: 'Max',
      lastName: 'Beispiel',
      address: 'Hofweg 12, 22085 Hamburg',
      number: '2614',
      participants: ['Max Beispiel', 'Frau Schulte (Hausverwaltung)'],
      type: 'gesamt',
      status: 'mit',
      reworkDue: '2026-09-25',
      date: new Date(2026, 8, 17),
      tasks: [
        { text: 'Geländer 2. OG: Farbläufer an der Unterseite nacharbeiten', photo: img.defect },
        { text: 'Sockelleiste EG links vom Eingang fehlt der Schlussanstrich' },
      ],
      employeeSignature: img.signature,
      customerSignature: img.signature,
    },
    logo,
    design,
  ).output('arraybuffer');
}

export const codeDesign: PdfDesign = pdfDesign;
