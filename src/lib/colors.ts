import type { Employee } from './database.types.ts';

/**
 * Mitarbeiterfarben.
 *
 * Eine feste Palette statt eines freien Farbwählers, weil dieselbe Farbe auf
 * zwei gegensätzlichen Hintergründen lesbar bleiben muss: Die Wochenplanung ist
 * weiß, der Fernseher im Büro ist fast schwarz. Ein freier Wähler garantiert,
 * dass irgendwann jemand Gelb nimmt (auf Weiß unsichtbar) oder Dunkelblau (auf
 * Schwarz unsichtbar) — und es fällt erst an der Wand auf.
 *
 * Jede Farbe ist deshalb als Paar hinterlegt: ein kräftiger Ton für die helle
 * Ansicht und ein aufgehellter für die dunkle, dazu die passende Schriftfarbe.
 */

export interface EmployeeColor {
  id: string;
  label: string;
  /** Kachel in der Wochenplanung (weißer Hintergrund). */
  light: { background: string; border: string; text: string };
  /** Kachel auf dem Fernseher (fast schwarzer Hintergrund). */
  dark: { background: string; text: string };
  /** Voller Ton für Farbpunkte und die Auswahl. */
  swatch: string;
}

export const EMPLOYEE_COLORS: EmployeeColor[] = [
  mk('blau', 'Blau', '#3981b7', '#eaf2f8', '#bcd6e8', '#1d4b6e', '#7fb4dc'),
  mk('gruen', 'Grün', '#2f8f5b', '#e8f5ee', '#bde0cc', '#1a5435', '#74cf9c'),
  mk('orange', 'Orange', '#d2762a', '#fdf1e7', '#f4d5b8', '#7d4415', '#f0a866'),
  mk('violett', 'Violett', '#7c5cbf', '#f1ecfa', '#d5c9ee', '#432f70', '#b39ee0'),
  mk('rot', 'Rot', '#c4453f', '#fceceb', '#f2c8c6', '#722320', '#e88f8a'),
  mk('tuerkis', 'Türkis', '#2b8f96', '#e7f5f6', '#bbe0e2', '#17545a', '#6fcbd2'),
  mk('olive', 'Olive', '#7f8f2c', '#f3f6e6', '#dbe3bb', '#4a5416', '#c0d16a'),
  mk('pink', 'Pink', '#bd4a86', '#fbecf4', '#eec6dc', '#6e2549', '#e491bb'),
  mk('braun', 'Braun', '#8a6242', '#f5efe9', '#ddcabb', '#503524', '#c39b78'),
  mk('marine', 'Marine', '#3b4f8a', '#ecefF7', '#c6cfe5', '#212c52', '#8b9bd0'),
  mk('limette', 'Limette', '#5a9e2f', '#eff7e8', '#cbe4bb', '#33601a', '#98d072'),
  mk('grau', 'Grau', '#5f6b76', '#eff1f3', '#ccd2d8', '#353d45', '#a3aeb8'),
];

function mk(
  id: string,
  label: string,
  swatch: string,
  lightBg: string,
  lightBorder: string,
  lightText: string,
  darkTone: string,
): EmployeeColor {
  return {
    id,
    label,
    swatch,
    light: { background: lightBg, border: lightBorder, text: lightText },
    // Auf dem dunklen Schirm trägt die Farbe als getönte Fläche, die Schrift
    // bleibt weiß — heller Text auf dunklem Grund ist aus drei Metern
    // Entfernung deutlich besser zu lesen als der umgekehrte Fall.
    dark: { background: `${darkTone}40`, text: '#ffffff' },
  };
}

const FALLBACK = EMPLOYEE_COLORS[0];

export function colorOf(employee: Pick<Employee, 'color'> | null | undefined): EmployeeColor {
  if (!employee?.color) return FALLBACK;
  return EMPLOYEE_COLORS.find((c) => c.id === employee.color) ?? FALLBACK;
}

/**
 * Nächste noch unbenutzte Farbe — damit ein neu angelegtes Konto nicht
 * zufällig dieselbe Farbe bekommt wie der Kollege in der Zeile darüber.
 */
export function nextFreeColor(employees: Pick<Employee, 'color'>[]): string {
  const used = new Set(employees.map((e) => e.color).filter(Boolean));
  return (EMPLOYEE_COLORS.find((c) => !used.has(c.id)) ?? FALLBACK).id;
}
