/**
 * Baut aus `docs/anleitung-maler.md` das PDF `docs/Anleitung-Maler.pdf`.
 *
 *   npm run anleitung
 *
 * Die Anleitung wird **nur** als Markdown gepflegt: Dort steht sie so, dass
 * eine KI sie ohne Umweg lesen kann, und hier bekommt sie die Gestalt der App.
 * Das PDF ist ein Erzeugnis und wird nie von Hand bearbeitet.
 *
 * Gestaltung: Aus `src/lib/pdf/design.json` kommen Schrift, Ränder, Briefkopf
 * und Fußzeile — das ist die Hauspost der Firma und gilt auch hier. Farben,
 * Karten und Abstände folgen dagegen der **Oberfläche** der App
 * (`src/index.css`), denn die Anleitung erklärt genau diese Oberfläche: Wer im
 * PDF eine blaue Schaltfläche sieht, soll sie am Handy wiedererkennen.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import autoTable from 'jspdf-autotable';
import type { jsPDF } from 'jspdf';
import {
  PAGE_HEIGHT,
  contentLeft,
  contentRight,
  contentWidth,
  createPdf,
  fontName,
  pdfDesign,
  registerPdfFont,
  rgb,
} from '../src/lib/pdf/design.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf-8');

const SOURCE = 'docs/anleitung-maler.md';
const TARGET = 'docs/Anleitung-Maler.pdf';

// ---------------------------------------------------------------------------
// Farben und Maße der Oberfläche
// ---------------------------------------------------------------------------

/** Die Marken- und Graustufen aus `src/index.css` bzw. den Tailwind-Klassen. */
const UI = {
  text: '#141414',
  muted: '#6b6b6b',
  faint: '#9a9a9a',
  accent1: '#3981b7',
  accent2: '#40a56d',
  cardBorder: '#e4e4e4',
  zebra: '#f7f8f9',
  /** Hinweiskasten in Gelb — wie die Warnhinweise in der App. */
  warnFill: '#fffbeb',
  warnBorder: '#f5dfa8',
  warnText: '#8a5a11',
  /** Hinweiskasten in Blau — wie der Übernahme-Hinweis in der App. */
  infoFill: '#eef4f9',
  infoBorder: '#c9ddec',
  infoText: '#2b6690',
};

/** Punkt in Millimeter. */
const mm = (pt: number) => pt * 0.3528;

/** Zeilenabstand eines Fließtexts. */
const lineHeight = (size: number) => mm(size) * 1.45;

/** Wie weit die Grundlinie unter der Oberkante einer Zeile liegt. */
const baseline = (size: number) => mm(size) * 1.06;

const CONTENT_TOP = 30;
const CONTENT_BOTTOM = PAGE_HEIGHT - 20;
const CARD_PADDING = 5;
const CARD_RADIUS = 3;

// ---------------------------------------------------------------------------
// Markdown lesen
// ---------------------------------------------------------------------------

type Block =
  | { type: 'chapter'; number: string; text: string }
  | { type: 'section'; text: string }
  | { type: 'p'; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: string[] }
  | { type: 'callout'; text: string }
  | { type: 'table'; head: string[]; rows: string[][] };

interface Manual {
  title: string;
  blocks: Block[];
  chapters: { number: string; text: string }[];
}

function stripFrontmatter(markdown: string): string {
  if (!markdown.startsWith('---')) return markdown;
  const end = markdown.indexOf('\n---', 3);
  return end < 0 ? markdown : markdown.slice(markdown.indexOf('\n', end + 1) + 1);
}

/**
 * Eine Tabellenzeile in ihre Zellen.
 *
 * In einer Zelle wird nicht fett gesetzt: autoTable kennt nur einen Stil je
 * Zelle, und ein halb fetter Satz ließe sich nicht darstellen. Eine
 * Hervorhebung wird deshalb zur Anführung — „Erneut versuchen“ liest sich in
 * einer Tabelle ohnehin besser als fetter Text zwischen normalem.
 */
function splitRow(line: string): string[] {
  return line
    .replace(/^\s*\|/, '')
    .replace(/\|\s*$/, '')
    .split('|')
    .map((cell) => cell.trim().replace(/\*\*(.+?)\*\*|`(.+?)`/g, (_, a, b) => `„${a ?? b}“`));
}

function parseManual(markdown: string): Manual {
  const lines = stripFrontmatter(markdown).split(/\r?\n/);
  const blocks: Block[] = [];
  let title = '';

  // Was gerade gesammelt wird: ein Absatz, eine Liste oder ein Hinweis.
  let paragraph: string[] = [];
  let list: { type: 'ul' | 'ol'; items: string[] } | null = null;
  let callout: string[] = [];

  const flush = () => {
    if (paragraph.length > 0) {
      blocks.push({ type: 'p', text: paragraph.join(' ') });
      paragraph = [];
    }
    if (list) {
      blocks.push({ type: list.type, items: list.items });
      list = null;
    }
    if (callout.length > 0) {
      blocks.push({ type: 'callout', text: callout.join(' ') });
      callout = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed === '') {
      flush();
      continue;
    }

    if (trimmed.startsWith('# ')) {
      flush();
      title = trimmed.slice(2).trim();
      continue;
    }

    if (trimmed.startsWith('## ')) {
      flush();
      const text = trimmed.slice(3).trim();
      const m = /^(\d+)\.\s*(.*)$/.exec(text);
      blocks.push({ type: 'chapter', number: m ? m[1] : '', text: m ? m[2] : text });
      continue;
    }

    if (trimmed.startsWith('### ')) {
      flush();
      blocks.push({ type: 'section', text: trimmed.slice(4).trim() });
      continue;
    }

    if (trimmed.startsWith('|')) {
      flush();
      const head = splitRow(trimmed);
      // Die Trennzeile darunter überspringen, dann alle Datenzeilen einsammeln.
      let j = i + 2;
      const rows: string[][] = [];
      while (j < lines.length && lines[j].trim().startsWith('|')) {
        rows.push(splitRow(lines[j].trim()));
        j++;
      }
      blocks.push({ type: 'table', head, rows });
      i = j - 1;
      continue;
    }

    if (trimmed.startsWith('>')) {
      if (list || paragraph.length > 0) flush();
      callout.push(trimmed.replace(/^>\s?/, ''));
      continue;
    }

    const bullet = /^[-*]\s+(.*)$/.exec(trimmed);
    const numbered = /^\d+\.\s+(.*)$/.exec(trimmed);

    if (bullet || numbered) {
      if (paragraph.length > 0 || callout.length > 0) flush();
      const type = bullet ? 'ul' : 'ol';
      const text = (bullet ?? numbered)![1];
      if (!list || list.type !== type) {
        if (list) flush();
        list = { type, items: [] };
      }
      list.items.push(text);
      continue;
    }

    // Eingerückte Folgezeile gehört zum zuletzt begonnenen Listenpunkt.
    if (list && /^\s{2,}/.test(line)) {
      list.items[list.items.length - 1] += ` ${trimmed}`;
      continue;
    }

    if (callout.length > 0) flush();
    paragraph.push(trimmed);
  }

  flush();

  const chapters = blocks
    .filter((b): b is Extract<Block, { type: 'chapter' }> => b.type === 'chapter')
    .map(({ number, text }) => ({ number, text }));

  return { title, blocks, chapters };
}

// ---------------------------------------------------------------------------
// Fließtext mit Auszeichnungen
// ---------------------------------------------------------------------------

interface Run {
  text: string;
  bold: boolean;
  color?: string;
}

/** Zerlegt `**fett**` und `` `Begriff` `` in einzeln gesetzte Stücke. */
function toRuns(text: string, color?: string): Run[] {
  const runs: Run[] = [];
  const pattern = /\*\*(.+?)\*\*|`(.+?)`/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(text))) {
    if (m.index > last) runs.push({ text: text.slice(last, m.index), bold: false, color });
    // Ein Begriff in Schrägstrichen meint eine Beschriftung in der App und
    // wird wie eine Hervorhebung gesetzt — eine Schreibmaschinenschrift hätte
    // im Fließtext dieses Dokuments nichts zu suchen.
    runs.push({ text: m[1] ?? m[2], bold: true, color });
    last = m.index + m[0].length;
  }
  if (last < text.length) runs.push({ text: text.slice(last), bold: false, color });
  return runs.filter((r) => r.text.length > 0);
}

/** Bricht ausgezeichneten Text auf eine Breite um. */
function wrapRuns(doc: jsPDF, runs: Run[], width: number, size: number): Run[][] {
  const font = fontName(pdfDesign);
  const lines: Run[][] = [];
  let current: Run[] = [];
  let used = 0;

  doc.setFontSize(size);

  for (const run of runs) {
    doc.setFont(font, run.bold ? 'bold' : 'normal');
    // Die Leerzeichen bleiben an den Wörtern, damit die Breite stimmt.
    const words = run.text.split(/(\s+)/).filter((w) => w.length > 0);
    for (const word of words) {
      const w = doc.getTextWidth(word);
      if (used + w > width && current.length > 0 && word.trim().length > 0) {
        lines.push(current);
        current = [];
        used = 0;
      }
      if (used === 0 && word.trim().length === 0) continue; // kein Zeilenanfang aus Leerraum
      current.push({ ...run, text: word });
      used += w;
    }
  }

  if (current.length > 0) lines.push(current);
  return lines.length > 0 ? lines : [[]];
}

// ---------------------------------------------------------------------------
// Zeichnen
// ---------------------------------------------------------------------------

/** Ein Kartenrahmen, der erst am Schluss gezogen wird. */
interface CardRect {
  page: number;
  top: number;
  bottom: number;
}

class Renderer {
  private doc: jsPDF;
  private page = 1;
  private y = CONTENT_TOP;
  private cards: CardRect[] = [];
  private openCard: { page: number; top: number } | null = null;
  private readonly font = fontName(pdfDesign);
  private readonly left = contentLeft(pdfDesign);
  private readonly right = contentRight(pdfDesign);
  private readonly width = contentWidth(pdfDesign);

  constructor(doc: jsPDF) {
    this.doc = doc;
  }

  // -- Seiten --------------------------------------------------------------

  private newPage(): void {
    // Eine Karte, die über den Seitenrand läuft, wird unten geschlossen und
    // oben auf der nächsten Seite neu begonnen.
    if (this.openCard) {
      this.cards.push({ ...this.openCard, bottom: CONTENT_BOTTOM });
    }
    this.doc.addPage();
    this.page = this.doc.getNumberOfPages();
    this.y = CONTENT_TOP;
    if (this.openCard) this.openCard = { page: this.page, top: this.y - CARD_PADDING };
  }

  private need(height: number): void {
    if (this.y + height > CONTENT_BOTTOM) this.newPage();
  }

  // -- Karten --------------------------------------------------------------

  private cardStart(): void {
    if (this.openCard) return;
    this.y += CARD_PADDING;
    this.openCard = { page: this.page, top: this.y - CARD_PADDING };
  }

  private cardEnd(): void {
    if (!this.openCard) return;
    this.cards.push({ ...this.openCard, bottom: this.y + CARD_PADDING });
    this.y += CARD_PADDING + 5;
    this.openCard = null;
  }

  /** Die Rahmen aller Karten. Ohne Füllung, damit sie über nichts laufen. */
  drawCardBorders(): void {
    this.doc.setDrawColor(...rgb(UI.cardBorder));
    this.doc.setLineWidth(0.3);
    for (const card of this.cards) {
      if (card.bottom - card.top < 2) continue;
      this.doc.setPage(card.page);
      this.doc.roundedRect(
        this.left,
        card.top,
        this.width,
        card.bottom - card.top,
        CARD_RADIUS,
        CARD_RADIUS,
        'S',
      );
    }
    this.doc.setPage(this.doc.getNumberOfPages());
  }

  private get textLeft(): number {
    return this.openCard ? this.left + CARD_PADDING : this.left;
  }

  private get textWidth(): number {
    return this.openCard ? this.width - 2 * CARD_PADDING : this.width;
  }

  // -- Bausteine -----------------------------------------------------------

  private style(size: number, bold: boolean, color: string): void {
    this.doc.setFont(this.font, bold ? 'bold' : 'normal');
    this.doc.setFontSize(size);
    this.doc.setTextColor(...rgb(color));
  }

  /** Setzt umgebrochene Zeilen ab der aktuellen Höhe. */
  private writeLines(lines: Run[][], size: number, left: number, color: string): void {
    const step = lineHeight(size);
    for (const line of lines) {
      this.need(step);
      let x = left;
      for (const run of line) {
        this.style(size, run.bold, run.color ?? color);
        this.doc.text(run.text, x, this.y + baseline(size));
        x += this.doc.getTextWidth(run.text);
      }
      this.y += step;
    }
  }

  private paragraph(text: string, size = 10, color = UI.text, indent = 0): void {
    const left = this.textLeft + indent;
    const lines = wrapRuns(this.doc, toRuns(text), this.textWidth - indent, size);
    this.writeLines(lines, size, left, color);
  }

  chapter(number: string, text: string): void {
    this.cardEnd();
    // Jedes Kapitel fängt oben auf einer neuen Seite an.
    this.newPage();

    const badge = 11;
    if (number) {
      this.doc.setFillColor(...rgb(UI.accent1));
      this.doc.roundedRect(this.left, this.y, badge, badge, 2.5, 2.5, 'F');
      this.style(12, true, '#ffffff');
      this.doc.text(number, this.left + badge / 2, this.y + badge / 2 + 1.5, { align: 'center' });
    }

    const titleLeft = number ? this.left + badge + 4 : this.left;
    this.style(17, true, UI.text);
    const lines = this.doc.splitTextToSize(text, this.right - titleLeft) as string[];
    let ty = this.y + 8.2;
    for (const line of lines) {
      this.doc.text(line, titleLeft, ty);
      ty += lineHeight(17);
    }

    this.y = Math.max(this.y + badge, ty - lineHeight(17) + 4) + 3;

    // Feine Linie in Markenfarbe unter der Kapitelzeile.
    this.doc.setDrawColor(...rgb(UI.accent1));
    this.doc.setLineWidth(0.6);
    this.doc.line(this.left, this.y, this.right, this.y);
    this.y += 7;
  }

  section(text: string): void {
    this.cardEnd();
    // Eine Überschrift, unter der nichts mehr passt, gehört auf die nächste Seite.
    this.need(26);
    this.cardStart();
    const size = 12;
    this.need(lineHeight(size));
    this.style(size, true, UI.text);
    this.doc.text(text, this.textLeft, this.y + baseline(size));
    this.y += lineHeight(size) + 2;
  }

  body(text: string): void {
    this.paragraph(text, 10, UI.text);
    this.y += 2;
  }

  /** Der Einleitungssatz eines Kapitels — außerhalb jeder Karte, etwas größer. */
  lead(text: string): void {
    this.paragraph(text, 10.5, UI.muted);
    this.y += 3;
  }

  bullets(items: string[]): void {
    const size = 10;
    for (const item of items) {
      const lines = wrapRuns(this.doc, toRuns(item), this.textWidth - 5, size);
      this.need(lineHeight(size));
      this.doc.setFillColor(...rgb(UI.accent1));
      this.doc.circle(this.textLeft + 1.4, this.y + baseline(size) - 1.1, 0.9, 'F');
      this.writeLines(lines, size, this.textLeft + 5, UI.text);
      this.y += 1;
    }
    this.y += 2;
  }

  steps(items: string[]): void {
    const size = 10;
    const badge = 5.2;
    items.forEach((item, i) => {
      const lines = wrapRuns(this.doc, toRuns(item), this.textWidth - 8.5, size);
      this.need(Math.max(badge, lineHeight(size)));
      this.doc.setFillColor(...rgb(UI.accent1));
      this.doc.circle(this.textLeft + badge / 2, this.y + baseline(size) - 1.1, badge / 2, 'F');
      this.style(8, true, '#ffffff');
      this.doc.text(String(i + 1), this.textLeft + badge / 2, this.y + baseline(size) + 0.3, {
        align: 'center',
      });
      this.writeLines(lines, size, this.textLeft + 8.5, UI.text);
      this.y += 1.5;
    });
    this.y += 1.5;
  }

  /**
   * Hinweiskasten. „Wichtig“ und Warnungen erscheinen gelb wie in der App,
   * alles Übrige in der ruhigen Markenfarbe.
   */
  callout(text: string): void {
    const warn = /^\*\*(Wichtig|Achtung|Passwort vergessen)/i.test(text);
    const fill = warn ? UI.warnFill : UI.infoFill;
    const border = warn ? UI.warnBorder : UI.infoBorder;
    const color = warn ? UI.warnText : UI.infoText;

    const size = 9.5;
    const inner = this.textWidth - 2 * 4;
    const lines = wrapRuns(this.doc, toRuns(text, color), inner, size);
    const height = lines.length * lineHeight(size) + 2 * 3.5;

    // Ein Kasten wird nicht zerrissen — er passt aufs Blatt oder wandert weiter.
    if (this.y + height > CONTENT_BOTTOM && height < CONTENT_BOTTOM - CONTENT_TOP) {
      this.newPage();
    }

    this.doc.setFillColor(...rgb(fill));
    this.doc.setDrawColor(...rgb(border));
    this.doc.setLineWidth(0.3);
    this.doc.roundedRect(this.textLeft, this.y, this.textWidth, height, 2.5, 2.5, 'FD');

    this.y += 3.5;
    this.writeLines(lines, size, this.textLeft + 4, color);
    this.y += 3.5 + 3;
  }

  table(head: string[], rows: string[][]): void {
    // Die Tabelle bleibt in ihrer Karte — wie die Listen-Container der App,
    // in denen die Zeilen ebenfalls innerhalb der Kachel stehen. Ohne eine
    // offene Karte bekommt sie eine eigene.
    if (this.openCard) this.y += 1.5; // Luft zur Überschrift darüber
    this.cardStart();
    const t = pdfDesign.table;
    const startPage = this.page;

    autoTable(this.doc, {
      startY: this.y,
      head: [head],
      body: rows,
      margin: {
        left: this.left + CARD_PADDING,
        right: pdfDesign.page.marginRight + CARD_PADDING,
        top: CONTENT_TOP,
      },
      theme: 'plain',
      styles: {
        font: this.font,
        fontSize: 9,
        cellPadding: 2.6,
        textColor: rgb(UI.text),
        lineColor: rgb(UI.cardBorder),
        lineWidth: { bottom: t.lineWidth },
        valign: 'middle',
      },
      headStyles: {
        fillColor: rgb(UI.accent1),
        textColor: rgb('#ffffff'),
        fontStyle: 'bold',
        lineWidth: 0,
      },
      alternateRowStyles: { fillColor: rgb(UI.zebra) },
    });

    const endPage = this.doc.getNumberOfPages();

    // Ist die Tabelle über den Seitenrand gelaufen, hat autoTable die Seiten
    // selbst angelegt — die Karte muss den Umbrüchen hinterhergeführt werden.
    if (endPage !== startPage && this.openCard) {
      this.cards.push({ ...this.openCard, bottom: CONTENT_BOTTOM });
      for (let p = startPage + 1; p < endPage; p++) {
        this.cards.push({ page: p, top: CONTENT_TOP - CARD_PADDING, bottom: CONTENT_BOTTOM });
      }
      this.openCard = { page: endPage, top: CONTENT_TOP - CARD_PADDING };
    }

    this.page = endPage;
    this.doc.setPage(this.page);
    this.y = (this.doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 3;
  }

  finish(): void {
    this.cardEnd();
  }
}

// ---------------------------------------------------------------------------
// Titelseite und Fußzeile
// ---------------------------------------------------------------------------

/** Breite und Höhe eines PNG aus dem IHDR-Block — ohne Bildbibliothek. */
function pngSize(buffer: Buffer): { width: number; height: number } {
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function drawCover(
  doc: jsPDF,
  manual: Manual,
  logo: { dataUrl: string; width: number; height: number } | null,
  version: string,
): void {
  const d = pdfDesign;
  const font = fontName(d);
  const left = contentLeft(d);
  const right = contentRight(d);
  const width = contentWidth(d);

  if (logo) {
    const height = (d.letterhead.logoWidth / logo.width) * logo.height;
    doc.addImage(logo.dataUrl, 'PNG', right - d.letterhead.logoWidth, d.letterhead.logoTop, d.letterhead.logoWidth, height);
  }

  doc.setFont(font, 'normal');
  doc.setFontSize(d.letterhead.fontSize);
  doc.setTextColor(...rgb(d.letterhead.color));
  doc.text(d.letterhead.company, left, d.letterhead.top);
  doc.text(d.letterhead.address, left, d.letterhead.top + d.letterhead.lineGap);

  // Titelblock
  let y = 78;
  doc.setFont(font, 'bold');
  doc.setFontSize(30);
  doc.setTextColor(...rgb(UI.text));
  doc.text('Anleitung', left, y);
  y += 13;
  doc.setTextColor(...rgb(UI.accent1));
  doc.text('für Maler', left, y);

  y += 8;
  doc.setDrawColor(...rgb(UI.accent1));
  doc.setLineWidth(0.8);
  doc.line(left, y, left + 30, y);

  y += 10;
  doc.setFont(font, 'normal');
  doc.setFontSize(11);
  doc.setTextColor(...rgb(UI.muted));
  const intro = doc.splitTextToSize(
    'Wochenplanung, Wochenberichte, Abnahmeprotokolle, Urlaub und Auslagen — alles, was du in der App der Malerprofis Uderstadt brauchst.',
    width - 40,
  ) as string[];
  for (const line of intro) {
    doc.text(line, left, y);
    y += lineHeight(11);
  }

  // Inhalt als Karte, wie die Listen in der App
  const rowHeight = 7.4;
  const cardTop = y + 12;
  const cardHeight = manual.chapters.length * rowHeight + 2 * 6 + 7;

  doc.setDrawColor(...rgb(UI.cardBorder));
  doc.setLineWidth(0.3);
  doc.roundedRect(left, cardTop, width, cardHeight, CARD_RADIUS, CARD_RADIUS, 'S');

  let ry = cardTop + 6;
  doc.setFont(font, 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...rgb(UI.faint));
  doc.text('INHALT', left + CARD_PADDING, ry + 3);
  ry += 8;

  for (const chapter of manual.chapters) {
    doc.setFont(font, 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...rgb(UI.accent1));
    doc.text(`${chapter.number}`, left + CARD_PADDING, ry + 3.5);
    doc.setFont(font, 'normal');
    doc.setTextColor(...rgb(UI.text));
    doc.text(chapter.text, left + CARD_PADDING + 8, ry + 3.5);
    ry += rowHeight;
  }

  doc.setFont(font, 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...rgb(UI.faint));
  const stand = new Date().toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  doc.text(`Version ${version} · Stand ${stand}`, left, PAGE_HEIGHT - 20);
}

/** Fußzeile auf allen Seiten außer der Titelseite. */
function drawFooters(doc: jsPDF, version: string): void {
  const d = pdfDesign;
  const font = fontName(d);
  const pages = doc.getNumberOfPages();
  for (let i = 2; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont(font, 'normal');
    doc.setFontSize(d.footer.fontSize);
    doc.setTextColor(...rgb(d.footer.color));
    const y = PAGE_HEIGHT - 10;
    doc.text(`Anleitung für Maler · Version ${version}`, contentLeft(d), y);
    doc.text(`Seite ${i - 1} von ${pages - 1}`, contentRight(d), y, { align: 'right' });
  }
}

// ---------------------------------------------------------------------------
// Bauen
// ---------------------------------------------------------------------------

const pkg = JSON.parse(read('package.json')) as { version: string };
const manual = parseManual(read(SOURCE));

// Arimo von der Platte statt über den `?inline`-Import der App — den kennt
// nur der Bündler.
registerPdfFont('arimo', {
  normal: fs.readFileSync(path.join(root, 'src/lib/pdf/fonts/Arimo-Regular.ttf')).toString('base64'),
  bold: fs.readFileSync(path.join(root, 'src/lib/pdf/fonts/Arimo-Bold.ttf')).toString('base64'),
});

const logoFile = path.join(root, 'public/icons/logo.png');
const logo = fs.existsSync(logoFile)
  ? (() => {
      const buffer = fs.readFileSync(logoFile);
      const { width, height } = pngSize(buffer);
      return { dataUrl: `data:image/png;base64,${buffer.toString('base64')}`, width, height };
    })()
  : null;

const doc = createPdf(pdfDesign);
drawCover(doc, manual, logo, pkg.version);

const renderer = new Renderer(doc);
/** Der Einleitungssatz eines Kapitels steht frei, alles Weitere in Karten. */
let afterChapter = false;

for (const block of manual.blocks) {
  switch (block.type) {
    case 'chapter':
      renderer.chapter(block.number, block.text);
      afterChapter = true;
      break;
    case 'section':
      renderer.section(block.text);
      afterChapter = false;
      break;
    case 'p':
      if (afterChapter) renderer.lead(block.text);
      else renderer.body(block.text);
      break;
    case 'ul':
      renderer.bullets(block.items);
      break;
    case 'ol':
      renderer.steps(block.items);
      break;
    case 'callout':
      renderer.callout(block.text);
      break;
    case 'table':
      renderer.table(block.head, block.rows);
      afterChapter = false;
      break;
  }
}

renderer.finish();
renderer.drawCardBorders();
drawFooters(doc, pkg.version);

const target = path.join(root, TARGET);
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, Buffer.from(doc.output('arraybuffer')));

console.log(
  `${TARGET} geschrieben — ${doc.getNumberOfPages()} Seiten, ${manual.chapters.length} Kapitel.`,
);
