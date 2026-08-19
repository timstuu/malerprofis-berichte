import { WEEKDAYS, calculateHours, targetHoursForDate } from './hours.ts';
import { dateOfWeekday, type WeeklyEntries, type WeeklyEntry } from './week.ts';
import type { Holiday, LeaveRequest, Site } from './database.types.ts';
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
 * - **Urlaub und Feiertage** haben keine Planzeile, an der ein solcher Vermerk
 *   hängen könnte. Sie werden deshalb nur an Tagen ergänzt, die noch gar keine
 *   Zeile haben. Wer an einem Urlaubstag doch gearbeitet hat und das einträgt,
 *   bekommt keine Urlaubszeile mehr dazu.
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
      description: assignment.note ?? '',
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

    const onLeave = leaves.some(
      (leave) =>
        leave.employee_id === employeeId &&
        leave.status === 'approved' &&
        leave.type === 'vacation' &&
        dateStr >= leave.start_date &&
        dateStr <= leave.end_date,
    );
    if (onLeave && vacationSite) {
      entries[day].entries.push(absenceEntry(`urlaub-${dateStr}`, vacationSite, 'Urlaub', targetHours));
      addedCount++;
    }
  }

  return { entries, importedAssignmentIds, addedCount };
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
