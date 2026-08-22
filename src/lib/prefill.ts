import { WEEKDAYS, calculateHours, statutoryBreakMinutes, targetHoursForDate } from './hours.ts';
import { dateOfWeekday, type WeeklyEntries, type WeeklyEntry } from './week.ts';
import type { DefaultHours, Holiday, LeaveRequest, Site } from './database.types.ts';
import type { AssignmentRow } from './data.ts';

/**
 * Die Regel, nach der geplante Einsätze, Urlaub und Feiertage in den
 * Wochenbericht übernommen werden.
 *
 * Bewusst frei von Datenbankzugriffen: Diese Regel entscheidet, was ein Maler
 * morgens in seiner Woche vorfindet, und muss deshalb ohne laufende Umgebung
 * nachvollziehbar und prüfbar sein.
 */

export interface PrefillResult {
  entries: WeeklyEntries;
  /** Planzeilen, die neu übernommen wurden — anschließend als 'imported' vermerken. */
  importedAssignmentIds: string[];
  /** Anzahl aller neu eingefügten Zeilen, inklusive Urlaub und Feiertagen. */
  addedCount: number;
}

/**
 * Ergänzt den Wochenbericht um geplante Einsätze, genehmigten Urlaub und
 * Feiertage. Läuft automatisch beim Öffnen und ist additiv — vorhandene
 * Eingaben werden nie überschrieben.
 *
 * Zwei unterschiedliche Regeln, bewusst:
 *
 * - **Einsätze** merken sich pro Zeile, ob sie übernommen oder gelöscht wurden
 *   (`assignment_imports`). Eine einmal verworfene Planzeile kommt nie wieder,
 *   auch wenn der Maler die App zehnmal am Tag öffnet.
 * - **Urlaub, Feiertage und Büro-Standardzeiten** haben keine Planzeile, an der
 *   ein solcher Vermerk hängen könnte. Sie werden deshalb nur an Tagen ergänzt,
 *   die noch gar keine Zeile haben. Wer an einem Urlaubstag doch gearbeitet hat
 *   und das einträgt, bekommt keine Urlaubszeile mehr dazu — und eine gelöschte
 *   Bürozeile kommt beim nächsten Öffnen der Woche wieder.
 *
 * Die Rangfolge ergibt sich aus der Reihenfolge der Abschnitte: Ein geplanter
 * Einsatz schlägt Feiertag und Urlaub, und beide schlagen die Bürozeit.
 */
export function buildPrefill(
  weekStart: Date,
  current: WeeklyEntries,
  assignments: AssignmentRow[],
  handledAssignmentIds: Set<string>,
  leaves: LeaveRequest[],
  holidays: Holiday[],
  sites: Site[],
  employeeId: string,
  /**
   * Standard-Arbeitszeiten dieses Mitarbeiters, sofern hinterlegt. Leer für
   * jeden Maler — dessen Stunden kommen aus der Planung. Vorbelegt, damit die
   * Regel für alle bestehenden Aufrufe unverändert gilt.
   */
  defaultHours: DefaultHours[] = [],
): PrefillResult {
  // Flache Kopie je Tag, damit der aufrufende State unverändert bleibt.
  const entries: WeeklyEntries = Object.fromEntries(
    WEEKDAYS.map((day) => [day, { entries: [...(current[day]?.entries ?? [])] }]),
  ) as WeeklyEntries;

  const importedAssignmentIds: string[] = [];
  let addedCount = 0;

  const siteById = new Map(sites.map((s) => [s.id, s]));
  const siteByNumber = new Map(sites.map((s) => [s.number, s]));
  const holidayByDate = new Map(holidays.map((h) => [h.date, h]));

  // --- 1. Geplante Einsätze -------------------------------------------------
  for (const assignment of assignments) {
    if (assignment.employee_id !== employeeId) continue;
    if (handledAssignmentIds.has(assignment.id)) continue;

    const dayIndex = WEEKDAYS.findIndex((_, i) => dateOfWeekday(weekStart, i) === assignment.date);
    if (dayIndex < 0) continue;

    const site = siteById.get(assignment.site_id);
    const start = assignment.start_time.slice(0, 5);
    const end = assignment.end_time.slice(0, 5);

    entries[WEEKDAYS[dayIndex]].entries.push({
      id: `plan-${assignment.id}`,
      project: site?.address ?? assignment.sites?.address ?? '',
      projectNumber: site?.number ?? assignment.sites?.number ?? '',
      // Die Notiz am Einsatz bleibt bewusst in der Planung: Sie ist ein Hinweis
      // für den Tag („Kunde ab 10 Uhr da“), keine Tätigkeitsbeschreibung. Was
      // gemacht wurde, trägt der Maler selbst ein.
      description: '',
      hours: calculateHours(start, end, assignment.break_minutes),
      startTime: start,
      endTime: end,
      pause: assignment.break_minutes,
      sourceAssignmentId: assignment.id,
    });

    importedAssignmentIds.push(assignment.id);
    addedCount++;
  }

  // --- 2. Genehmigter Urlaub und Feiertage ---------------------------------
  const vacationSite = siteByNumber.get('060-7');
  const holidaySite = siteByNumber.get('040-7');

  for (let i = 0; i < WEEKDAYS.length; i++) {
    const day = WEEKDAYS[i];
    if (entries[day].entries.length > 0) continue; // Tag ist nicht mehr leer

    const dateStr = dateOfWeekday(weekStart, i);
    const date = new Date(`${dateStr}T00:00:00`);
    const targetHours = targetHoursForDate(date);
    if (targetHours <= 0) continue; // Wochenende

    const holiday = holidayByDate.get(dateStr);
    if (holiday && holidaySite) {
      entries[day].entries.push(
        absenceEntry(`feiertag-${dateStr}`, holidaySite, holiday.name, targetHours),
      );
      addedCount++;
      continue;
    }

    if (onApprovedVacation(leaves, employeeId, dateStr) && vacationSite) {
      entries[day].entries.push(absenceEntry(`urlaub-${dateStr}`, vacationSite, 'Urlaub', targetHours));
      addedCount++;
    }
  }

  // --- 3. Standard-Arbeitszeiten der Büro-Konten ---------------------------
  //
  // Büro-Konten stehen nicht in der Wochenplanung; ihre Stunden entstehen aus
  // dieser Vorgabe statt aus Einsätzen. Ein Wochentag ohne hinterlegte Zeile
  // bleibt leer — die Zeile ist die Aussage „an dem Tag wird gearbeitet".
  //
  // Die Pause folgt hier § 4 ArbZG und nicht den festen Pausenfenstern der
  // Maler: Im Büro gibt es keine Baustelle, an der um zehn die Kaffeekanne
  // steht.
  const officeSite = siteByNumber.get(OFFICE_SITE_NUMBER);

  if (defaultHours.length > 0 && officeSite) {
    const byWeekday = new Map(defaultHours.map((h) => [h.weekday, h]));

    for (let i = 0; i < WEEKDAYS.length; i++) {
      const day = WEEKDAYS[i];
      if (entries[day].entries.length > 0) continue; // Einsatz, Urlaub, Feiertag

      const dateStr = dateOfWeekday(weekStart, i);
      // Beide Prüfungen noch einmal ausdrücklich: Abschnitt 2 legt seine Zeilen
      // nur an, wenn 040-7 und 060-7 als Baustelle existieren. Fehlt eine davon,
      // ist der Tag weiterhin leer — und ohne diese Prüfung stünden dann
      // Bürostunden an einem Feiertag.
      if (holidayByDate.has(dateStr)) continue;
      if (onApprovedVacation(leaves, employeeId, dateStr)) continue;

      // WEEKDAYS beginnt bei Montag, der ISO-Wochentag zählt ab 1.
      const spec = byWeekday.get(i + 1);
      if (!spec) continue;

      const start = spec.start_time.slice(0, 5);
      const end = spec.end_time.slice(0, 5);
      const breakMinutes = statutoryBreakMinutes(start, end);

      entries[day].entries.push({
        id: `buero-${dateStr}`,
        project: officeSite.address,
        projectNumber: officeSite.number,
        description: '',
        hours: calculateHours(start, end, breakMinutes),
        startTime: start,
        endTime: end,
        pause: breakMinutes,
        sourceAssignmentId: null,
      });
      addedCount++;
    }
  }

  return { entries, importedAssignmentIds, addedCount };
}

/** Baustellennummer, auf die Bürostunden gebucht werden. */
const OFFICE_SITE_NUMBER = '001-7';

function onApprovedVacation(leaves: LeaveRequest[], employeeId: string, date: string): boolean {
  return leaves.some(
    (leave) =>
      leave.employee_id === employeeId &&
      leave.status === 'approved' &&
      leave.type === 'vacation' &&
      date >= leave.start_date &&
      date <= leave.end_date,
  );
}

function absenceEntry(id: string, site: Site, description: string, hours: number): WeeklyEntry {
  return {
    id,
    project: site.address,
    projectNumber: site.number,
    description,
    hours,
    pause: 0,
    sourceAssignmentId: null,
  };
}
