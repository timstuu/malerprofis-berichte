import { parseISO } from 'date-fns';
import { breakMinutesForDate, calculateHours, defaultShiftFor, weekdayOf } from './hours.ts';
import type { Site } from './database.types.ts';

/**
 * Was eine Baustelle noch hergibt, und wie viele Tagesblöcke daraus werden.
 *
 * Die Leiste unter der Wochenplanung beantwortet „was kann hier noch eingeplant
 * werden" — gegengerechnet wird deshalb der Plan (assignments), nicht der
 * Bericht. Die Summe der verplanten Stunden kommt aus der Datenbank (Sicht
 * site_planned_hours, siehe 0017); hier steht nur, was daraus folgt.
 *
 * Bewusst ohne React, damit die Rechnung prüfbar bleibt: src/lib/site-hours.test.ts.
 */

/**
 * Das Maß des Stapels — nicht die Zeit, die ein Block bucht.
 *
 * Gebucht wird immer der Standardarbeitstag des Ziel-Wochentags, freitags also
 * nur 6,0 Stunden (siehe blockShiftFor). Der Stapel bleibt trotzdem in
 * 8,5er-Schritten bemessen, weil er die sichtbare Menge ist und nicht die
 * Abrechnung. Ein Freitag zehrt ihn dadurch langsamer ab — das ist richtig so,
 * ein Freitag ist ein kürzerer Tag.
 */
export const BLOCK_HOURS = 8.5;

export interface BlockShift {
  start: string;
  end: string;
  breakMinutes: number;
  hours: number;
}

/**
 * Was aus einem Block wird, wenn er auf diesem Tag landet.
 *
 * Uhrzeiten und Pause kommen aus dem Wochentag des Ziels, nicht aus dem Block:
 * Derselbe Block wird montags zu 8,5 und freitags zu 6,0 Stunden. Es gibt hier
 * deshalb keine fest verdrahtete Stundenzahl — nur die vorhandene Regelschicht.
 */
export function blockShiftFor(dateIso: string): BlockShift {
  const date = parseISO(dateIso);
  const { start, end } = defaultShiftFor(weekdayOf(date));
  const breakMinutes = breakMinutesForDate(start, end, date);
  return { start, end, breakMinutes, hours: calculateHours(start, end, breakMinutes) };
}

/**
 * Soll minus verplant. `null`, wenn für die Baustelle keine Gesamtstunden
 * hinterlegt sind — das ist etwas anderes als „nichts mehr übrig".
 *
 * Gerundet wird auf zwei Stellen, und das ist kein Schönheitsfehler-Fix:
 * Math.ceil(1e-9 / 8.5) ist 1, und dann stünde ein Geisterblock über einer
 * längst aufgebrauchten Baustelle.
 */
export function remainingHours(
  total: number | null | undefined,
  planned: number | null | undefined,
): number | null {
  if (total === null || total === undefined) return null;
  return Math.round((total - (planned ?? 0)) * 100) / 100;
}

/** Wie viele Blöcke der Rest hergibt. Aufgerundet — ein angebrochener Tag zählt. */
export function blockCount(remaining: number | null): number {
  if (remaining === null || remaining <= 0) return 0;
  return Math.ceil(remaining / BLOCK_HOURS);
}

export interface SupplyColumn {
  site: Site;
  remaining: number;
  blocks: number;
}

/**
 * Die Spalten der Leiste, in der Reihenfolge der Baustellennummern.
 *
 * Aussortiert wird hier und nur hier — die Sicht in der Datenbank kennt
 * bewusst nur assignments und bleibt dadurch trivial.
 *
 * Abwesenheitscodes (Krank, Urlaub, Lagerarbeiten) haben kein Kontingent und
 * gehören nicht in eine Leiste, die von Restmengen handelt; sie bleiben im
 * Auswahlmenü des Einsatzformulars. Ist der Rest aufgebraucht, verschwindet die
 * Baustelle ebenfalls — weiterplanen lässt sie sich dann über „+ Einsatz".
 */
export function supplyColumns(sites: Site[], planned: Map<string, number>): SupplyColumn[] {
  const columns: SupplyColumn[] = [];
  for (const site of sites) {
    if (!site.active || site.is_absence_code) continue;
    const remaining = remainingHours(site.total_hours, planned.get(site.id));
    if (remaining === null) continue;
    const blocks = blockCount(remaining);
    if (blocks === 0) continue;
    columns.push({ site, remaining, blocks });
  }
  return columns;
}

/** Halbe Stunden mit Komma, glatte Zahlen ohne Nachkomma: 8,5 — 8 — 84,5. */
export function formatHours(hours: number): string {
  return hours.toLocaleString('de-DE', { maximumFractionDigits: 2 });
}

/** „123-7 · Musterweg 4 · noch 84,5 Std" */
export function supplyLabel(site: Site, remaining: number): string {
  return `${site.number} · ${site.address} · noch ${formatHours(remaining)} Std`;
}
