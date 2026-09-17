import { jsPDF } from 'jspdf';
import type { UserOptions } from 'jspdf-autotable';
import designJson from './design.json';

/**
 * Die Gestaltung aller PDFs an einer Stelle.
 *
 * Die Werte stehen in `design.json` und werden im PDF-Designer (Artifact)
 * bearbeitet — von Hand nur, wenn es nicht anders geht. Maße sind Millimeter
 * auf A4, Schriftgrößen Punkt, Farben `#rrggbb`.
 *
 * Bewusst ohne Zugriff auf Oberfläche oder `import.meta.env`: Derselbe Code
 * zeichnet auch die Vorschau im Designer.
 */

/** Die ersten drei bringt jsPDF mit, `arimo` wird eingebettet (Arial-Ersatz). */
export type PdfFont = 'helvetica' | 'times' | 'courier' | 'arimo';

export interface PdfDesign {
  font: PdfFont;
  textColor: string;
  page: { marginLeft: number; marginRight: number };
  letterhead: {
    company: string;
    address: string;
    fontSize: number;
    bold: boolean;
    color: string;
    top: number;
    lineGap: number;
    logoPosition: 'left' | 'right';
    logoWidth: number;
    logoHeight: number;
    logoTop: number;
    rule: boolean;
    ruleColor: string;
    ruleWidth: number;
    ruleTop: number;
  };
  title: {
    top: number;
    fontSize: number;
    bold: boolean;
    color: string;
    weeklyReport: string;
    expenses: string;
    abnahme: string;
  };
  meta: {
    gapAfterTitle: number;
    fontSize: number;
    lineHeight: number;
    labelBold: boolean;
    gapBeforeTable: number;
  };
  table: {
    fontSize: number;
    cellPadding: number;
    headFill: string;
    headText: string;
    headBold: boolean;
    footFill: string;
    footText: string;
    zebra: boolean;
    zebraFill: string;
    lines: 'none' | 'horizontal' | 'all';
    lineColor: string;
    lineWidth: number;
  };
  signature: { gapAfterContent: number; width: number; height: number };
  receiptPage: { titleSize: number; infoSize: number; photosPerPage: number };
  abnahme: { photoWidth: number };
  footer: { pageNumbers: boolean; text: string; fontSize: number; color: string };
}

/** Der Stand aus dem Code. */
export const pdfDesign = designJson as PdfDesign;

/** Das Firmenlogo, schon geladen. `null`: Das PDF kommt ohne aus. */
export type PdfLogo = HTMLImageElement | null;

/** Eingebettete Schriften: Name → TrueType-Datei als base64 je Schnitt. */
const embeddedFonts = new Map<string, { normal: string; bold: string }>();

export function registerPdfFont(name: string, data: { normal: string; bold: string }): void {
  embeddedFonts.set(name, data);
}

/** Lädt die Schrift nach, die das Design verlangt — vor dem Zeichnen aufrufen. */
export async function loadPdfFonts(d: PdfDesign): Promise<void> {
  if (d.font === 'arimo' && !embeddedFonts.has('arimo')) {
    registerPdfFont('arimo', (await import('./fonts/arimo.ts')).arimo);
  }
}

const BUILTIN_FONTS = ['helvetica', 'times', 'courier'];

/** Die tatsächlich benutzte Schrift. Fehlt eine eingebettete, bleibt es Helvetica. */
export function fontName(d: PdfDesign): string {
  return BUILTIN_FONTS.includes(d.font) || embeddedFonts.has(d.font) ? d.font : 'helvetica';
}

/** Neues A4-Dokument, in dem die Schrift des Designs schon bereitliegt. */
export function createPdf(d: PdfDesign): jsPDF {
  const doc = new jsPDF();
  const data = embeddedFonts.get(d.font);
  if (data) {
    for (const style of ['normal', 'bold'] as const) {
      const file = `${d.font}-${style}.ttf`;
      doc.addFileToVFS(file, data[style]);
      doc.addFont(file, d.font, style);
    }
  }
  return doc;
}

export const PAGE_WIDTH = 210;
export const PAGE_HEIGHT = 297;

export function contentLeft(d: PdfDesign): number {
  return d.page.marginLeft;
}

export function contentRight(d: PdfDesign): number {
  return PAGE_WIDTH - d.page.marginRight;
}

export function contentWidth(d: PdfDesign): number {
  return contentRight(d) - contentLeft(d);
}

export function rgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [0, 0, 0];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Schrift, Größe und Farbe in einem Zug setzen. */
export function useText(
  doc: jsPDF,
  d: PdfDesign,
  style: { size: number; bold?: boolean; color?: string },
): void {
  doc.setFont(fontName(d), style.bold ? 'bold' : 'normal');
  doc.setFontSize(style.size);
  doc.setTextColor(...rgb(style.color ?? d.textColor));
}

/** Firmenkopf oben auf der ersten Seite. Gemeinsam für alle PDFs. */
export function drawLetterhead(doc: jsPDF, logo: PdfLogo, d: PdfDesign): void {
  const lh = d.letterhead;
  const logoLeft = lh.logoPosition === 'left';

  if (logo) {
    let width = lh.logoWidth;
    let height = lh.logoHeight;
    if (logo.width && logo.height) {
      const ratio = logo.width / logo.height;
      if (ratio > lh.logoWidth / lh.logoHeight) {
        height = lh.logoWidth / ratio;
      } else {
        width = lh.logoHeight * ratio;
      }
    }
    const x = logoLeft ? contentLeft(d) : contentRight(d) - width;
    doc.addImage(logo, 'PNG', x, lh.logoTop, width, height);
  }

  useText(doc, d, { size: lh.fontSize, bold: lh.bold, color: lh.color });
  if (logoLeft && logo) {
    // Logo links, dann steht die Anschrift rechtsbündig gegenüber.
    doc.text(lh.company, contentRight(d), lh.top, { align: 'right' });
    doc.text(lh.address, contentRight(d), lh.top + lh.lineGap, { align: 'right' });
  } else {
    doc.text(lh.company, contentLeft(d), lh.top);
    doc.text(lh.address, contentLeft(d), lh.top + lh.lineGap);
  }

  if (!logo) {
    useText(doc, d, { size: 14, color: lh.color });
    doc.text('Malerprofis', contentRight(d), lh.top + lh.lineGap, { align: 'right' });
  }

  if (lh.rule) {
    doc.setDrawColor(...rgb(lh.ruleColor));
    doc.setLineWidth(lh.ruleWidth);
    doc.line(contentLeft(d), lh.ruleTop, contentRight(d), lh.ruleTop);
  }
}

/** Überschrift des Dokuments. Gibt zurück, wo die Kopfangaben beginnen. */
export function drawTitle(doc: jsPDF, text: string, d: PdfDesign): number {
  useText(doc, d, { size: d.title.fontSize, bold: d.title.bold, color: d.title.color });
  doc.text(text, contentLeft(d), d.title.top);
  return d.title.top + d.meta.gapAfterTitle;
}

/**
 * Kopfangaben als „Bezeichnung: Wert“, eine je Zeile. Zu lange Werte brechen
 * um. Gibt die Grundlinie der nächsten freien Zeile zurück.
 */
export function drawMeta(doc: jsPDF, rows: [string, string][], top: number, d: PdfDesign): number {
  const m = d.meta;
  let y = top;
  for (const [label, value] of rows) {
    const prefix = `${label}: `;
    useText(doc, d, { size: m.fontSize, bold: m.labelBold });
    // Etwas Luft dazu: Der Leerschritt allein wirkt im PDF oft zu knapp.
    const labelWidth = doc.getTextWidth(prefix) + 0.8;
    doc.text(prefix, contentLeft(d), y);
    useText(doc, d, { size: m.fontSize });
    const lines = doc.splitTextToSize(value, contentWidth(d) - labelWidth) as string[];
    doc.text(lines, contentLeft(d) + labelWidth, y);
    y += Math.max(1, lines.length) * m.lineHeight;
  }
  return y;
}

/** Wo eine Tabelle unter den Kopfangaben beginnt. */
export function tableTop(metaEnd: number, d: PdfDesign): number {
  return metaEnd - d.meta.lineHeight + d.meta.gapBeforeTable;
}

/** Gemeinsame Tabellenoptionen für jspdf-autotable. */
export function tableOptions(d: PdfDesign): Partial<UserOptions> {
  const t = d.table;
  const lineWidth =
    t.lines === 'all' ? t.lineWidth : t.lines === 'horizontal' ? { bottom: t.lineWidth } : 0;
  return {
    theme: 'plain',
    margin: { left: d.page.marginLeft, right: d.page.marginRight },
    styles: {
      font: fontName(d),
      fontSize: t.fontSize,
      cellPadding: t.cellPadding,
      textColor: rgb(d.textColor),
      lineColor: rgb(t.lineColor),
      lineWidth,
    },
    headStyles: {
      fillColor: rgb(t.headFill),
      textColor: rgb(t.headText),
      fontStyle: t.headBold ? 'bold' : 'normal',
    },
    footStyles: {
      fillColor: rgb(t.footFill),
      textColor: rgb(t.footText),
      fontStyle: t.headBold ? 'bold' : 'normal',
    },
    alternateRowStyles: t.zebra ? { fillColor: rgb(t.zebraFill) } : {},
  };
}

export function lastTableEnd(doc: jsPDF): number {
  return (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
}

/** Unterschriftsfeld: Bezeichnung, darunter das Bild. */
export function drawSignature(
  doc: jsPDF,
  label: string,
  image: string | null | undefined,
  x: number,
  y: number,
  d: PdfDesign,
): void {
  useText(doc, d, { size: d.meta.fontSize });
  doc.text(label, x, y);
  if (!image) return;
  try {
    doc.addImage(image, 'PNG', x, y + 5, d.signature.width, d.signature.height);
  } catch (error) {
    // Eine kaputte Unterschrift darf das PDF nicht verhindern.
    console.error('Unterschrift konnte nicht ins PDF:', error);
  }
}

/** Höhe, die ein Unterschriftsfeld samt Abstand unten braucht. */
export function signatureHeight(d: PdfDesign): number {
  return d.signature.height + 15;
}

/** Fußzeile auf allen Seiten — ganz am Ende aufrufen. */
export function finishPages(doc: jsPDF, d: PdfDesign): void {
  const f = d.footer;
  if (!f.pageNumbers && !f.text.trim()) return;
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    useText(doc, d, { size: f.fontSize, color: f.color });
    const y = PAGE_HEIGHT - 10;
    if (f.text.trim()) doc.text(f.text, contentLeft(d), y);
    if (f.pageNumbers) doc.text(`Seite ${i} von ${pages}`, contentRight(d), y, { align: 'right' });
  }
}
