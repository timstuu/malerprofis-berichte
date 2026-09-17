import { addDays, format, getISOWeek, getISOWeekYear, parseISO } from 'date-fns';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  PAGE_HEIGHT,
  contentLeft,
  drawLetterhead,
  drawMeta,
  drawSignature,
  drawTitle,
  finishPages,
  lastTableEnd,
  pdfDesign,
  signatureHeight,
  tableOptions,
  tableTop,
  type PdfDesign,
  type PdfLogo,
} from './pdf/design.ts';
import { loadPdfLogo } from './pdf/logo.ts';

/**
 * Das PDF eines Wochenberichts.
 *
 * Bewusst ohne Zugriff auf Datenbank oder Oberfläche: Der Bericht wird aus
 * übergebenen Daten gebaut. Erzeugt wird er inzwischen im Büro, aus dem, was
 * der Maler abgegeben hat — nicht mehr auf dem Handy aus einem Entwurf.
 * Die Gestaltung kommt aus `pdf/design.json`.
 */

/** Eine Zeile des Berichts, so wie sie im PDF steht. */
export interface ReportPdfEntry {
  /** yyyy-MM-dd */
  date: string;
  siteNumber: string;
  siteAddress: string;
  description: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  hours: number;
}

export interface ReportPdfData {
  firstName: string;
  lastName: string;
  /** ISO-Montag der Woche. */
  weekStart: Date;
  entries: ReportPdfEntry[];
  /** Unterschrift des Mitarbeiters als base64-PNG. */
  signature: string | null;
}

/**
 * Dateiname nach festem Schema, z. B. `KW 34_Müller_Wochenbericht_2026.pdf`.
 *
 * Die Kalenderwoche ist zweistellig, damit ein Ordner voller Berichte sich von
 * selbst richtig sortiert. Das Jahr ist das der ISO-Kalenderwoche und nicht das
 * des Datums: Zum Jahreswechsel gehört die KW 1 sonst zum falschen Jahr.
 */
export function weeklyReportFileName(lastName: string, weekStart: Date): string {
  const week = String(getISOWeek(weekStart)).padStart(2, '0');
  const year = getISOWeekYear(weekStart);
  // Zeichen, die ein Dateisystem nicht in einem Namen duldet.
  const name = (lastName || 'Unbekannt').replace(/[\/:*?"<>|]/g, '-').trim();
  return `KW ${week}_${name}_Wochenbericht_${year}.pdf`;
}

/** Zeichnet den Bericht. Ohne Laden, damit der Designer dasselbe zeigt. */
export function renderWeeklyReportPdf(data: ReportPdfData, logo: PdfLogo, d: PdfDesign = pdfDesign): jsPDF {
  const doc = new jsPDF();

  drawLetterhead(doc, logo, d);
  const metaTop = drawTitle(doc, d.title.weeklyReport, d);

  // Die Woche gehört ausdrücklich aufs Blatt. Im Büro liegen die Berichte
  // vieler Mitarbeiter nebeneinander; aus den Datumsspalten allein wäre die
  // Kalenderwoche jedes Mal nachzuzählen.
  const week = String(getISOWeek(data.weekStart)).padStart(2, '0');
  const metaEnd = drawMeta(
    doc,
    [
      ['Mitarbeiter', `${data.firstName} ${data.lastName}`],
      [
        'Woche',
        `KW ${week} · ${format(data.weekStart, 'dd.MM.yyyy')} - ${format(addDays(data.weekStart, 6), 'dd.MM.yyyy')}`,
      ],
    ],
    metaTop,
    d,
  );

  const sorted = [...data.entries].sort((a, b) =>
    a.date === b.date ? a.startTime.localeCompare(b.startTime) : a.date.localeCompare(b.date),
  );

  autoTable(doc, {
    ...tableOptions(d),
    startY: tableTop(metaEnd, d),
    head: [['Datum', 'Nr.', 'Baustelle', 'Beschreibung', 'Startzeit', 'Endzeit', 'Pause', 'Std.']],
    body: sorted.map((e) => [
      format(parseISO(e.date), 'dd.MM.yyyy'),
      e.siteNumber || '-',
      e.siteAddress || '-',
      e.description || '-',
      e.startTime || '-',
      e.endTime || '-',
      `${e.breakMinutes} Min.`,
      `${e.hours} h`,
    ]),
    foot: [
      [
        { content: 'Gesamt', colSpan: 7, styles: { halign: 'right' as const } },
        `${round2(data.entries.reduce((sum, e) => sum + e.hours, 0))} h`,
      ],
    ],
  });

  let y = lastTableEnd(doc) + d.signature.gapAfterContent;

  // Die Unterschrift darf nicht am Seitenrand abgeschnitten werden.
  if (y + signatureHeight(d) > PAGE_HEIGHT - 20) {
    doc.addPage();
    y = 20;
  }

  drawSignature(doc, 'Unterschrift Mitarbeiter:', data.signature, contentLeft(d), y, d);

  finishPages(doc, d);
  return doc;
}

/** Baut das PDF und gibt es als Blob zurück. */
export async function buildWeeklyReportPdf(data: ReportPdfData): Promise<Blob> {
  return renderWeeklyReportPdf(data, await loadPdfLogo()).output('blob');
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Baut das PDF und stößt den Download an. */
export async function downloadWeeklyReportPdf(data: ReportPdfData): Promise<void> {
  const blob = await buildWeeklyReportPdf(data);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = weeklyReportFileName(data.lastName, data.weekStart);
  a.click();
  URL.revokeObjectURL(url);
}
