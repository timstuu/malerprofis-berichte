import bold from './Arimo-Bold.ttf?inline';
import regular from './Arimo-Regular.ttf?inline';

/**
 * Arimo — frei lizenziert (SIL Open Font License, siehe OFL.txt), gleich breit
 * wie Arial und im Druck kaum davon zu unterscheiden. Die echte Arial darf die
 * App nicht mit ausliefern.
 *
 * Eigene Datei, damit die knapp 1 MB nur geladen werden, wenn ein PDF die
 * Schrift auch benutzt.
 */
export const arimo = {
  normal: regular.slice(regular.indexOf(',') + 1),
  bold: bold.slice(bold.indexOf(',') + 1),
};
