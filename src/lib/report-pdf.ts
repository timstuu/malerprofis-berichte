import { addDays, format, getISOWeek, getISOWeekYear, parseISO } from 'date-fns';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

/**
 * Das PDF eines Wochenberichts.
 *
 * Bewusst ohne Zugriff auf Datenbank oder Oberfläche: Der Bericht wird aus
 * übergebenen Daten gebaut. Erzeugt wird er inzwischen im Büro, aus dem, was
 * der Maler abgegeben hat — nicht mehr auf dem Handy aus einem Entwurf.
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

/** Lädt das Firmenlogo. Fehlt es, kommt der Bericht ohne aus. */
async function loadLogo(): Promise<HTMLImageElement | null> {
  try {
    const img = new Image();
    const base = import.meta.env.BASE_URL.endsWith('/')
      ? import.meta.env.BASE_URL
      : `${import.meta.env.BASE_URL}/`;
    img.src = `${window.location.origin}${base}logo.png?v=1.0.4`;
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
    });
    return img;
  } catch (e) {
    console.error('Logo konnte für das PDF nicht geladen werden:', e);
    return null;
  }
}

/** Baut das PDF und gibt es als Blob zurück. */
export async function buildWeeklyReportPdf(data: ReportPdfData): Promise<Blob> {
  const doc = new jsPDF();

  doc.setFontSize(10);
  doc.text('Malermeister Uderstadt GmbH', 20, 15);
  doc.text('Luisenweg 7, 20537 Hamburg', 20, 20);

  const logo = await loadLogo();
  if (logo) {
    const maxWidth = 40;
    const maxHeight = 20;
    let width = maxWidth;
    let height = maxHeight;
    if (logo.width && logo.height) {
      const ratio = logo.width / logo.height;
      if (ratio > maxWidth / maxHeight) {
        width = maxWidth;
        height = maxWidth / ratio;
      } else {
        height = maxHeight;
        width = maxHeight * ratio;
      }
    }
    doc.addImage(logo, 'PNG', 190 - width, 10, width, height);
  } else {
    doc.setFontSize(14);
    doc.text('Malerprofis', 150, 20);
    doc.setFontSize(10);
  }

  doc.setFontSize(16);
  doc.text('Wochenbericht', 20, 40);
  doc.setFontSize(12);
  doc.text(`Mitarbeiter: ${data.firstName} ${data.lastName}`, 20, 50);

  // Die Woche gehört ausdrücklich aufs Blatt. Im Büro liegen die Berichte
  // vieler Mitarbeiter nebeneinander; aus den Datumsspalten allein wäre die
  // Kalenderwoche jedes Mal nachzuzählen.
  const week = String(getISOWeek(data.weekStart)).padStart(2, '0');
  doc.text(
    `KW ${week} · ${format(data.weekStart, 'dd.MM.yyyy')} - ${format(addDays(data.weekStart, 6), 'dd.MM.yyyy')}`,
    20,
    57,
  );

  const sorted = [...data.entries].sort((a, b) =>
    a.date === b.date ? a.startTime.localeCompare(b.startTime) : a.date.localeCompare(b.date),
  );

  autoTable(doc, {
    startY: 65,
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

  let y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 20;

  // Die Unterschrift darf nicht am Seitenrand abgeschnitten werden.
  if (y > 240) {
    doc.addPage();
    y = 20;
  }

  doc.text('Unterschrift Mitarbeiter:', 20, y);
  if (data.signature) {
    doc.addImage(data.signature, 'PNG', 20, y + 5, 50, 20);
  }

  return doc.output('blob');
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
