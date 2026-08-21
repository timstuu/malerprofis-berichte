import { supabase } from './supabase.ts';
import { WEEKDAYS } from './hours.ts';
import { dateOfWeekday, emptyWeek, weekKey, type WeeklyEntries } from './week.ts';
import type {
  Assignment,
  Employee,
  Holiday,
  LeaveRequest,
  LeaveStatus,
  Site,
  WeekNote,
} from './database.types.ts';

/**
 * Datenzugriff auf Supabase.
 *
 * Alle Funktionen werfen bei Fehlern eine Exception. Das ist Absicht: Die
 * Vorgängerversion hat Verbindungsfehler stillschweigend verschluckt und lief
 * dadurch dauerhaft mit leeren Listen, ohne dass es jemandem auffiel.
 */

// Weitergereicht, damit bestehende Importe aus data.ts unverändert gelten.
export { dateOfWeekday, emptyWeek, weekKey };
export type { WeeklyEntry, WeeklyEntries } from './week.ts';

function unwrap<T>(result: { data: T | null; error: { message: string } | null }, was: string): T {
  if (result.error) {
    throw new Error(`${was} konnte nicht geladen werden: ${result.error.message}`);
  }
  return (result.data ?? []) as T;
}

/** Berichtszeile mit den Stammdaten ihrer Baustelle. */
export interface ReportEntryRow {
  id: string;
  report_id: string;
  date: string;
  site_id: string | null;
  description: string | null;
  start_time: string | null;
  end_time: string | null;
  break_minutes: number;
  hours: number;
  source_assignment_id: string | null;
  sites: { number: string; address: string } | null;
}

/** Geplanter Einsatz mit Baustellen- und Mitarbeiterdaten. */
export interface AssignmentRow extends Assignment {
  sites: { number: string; address: string } | null;
  employees: { first_name: string; last_name: string } | null;
}

// ---------------------------------------------------------------------------
// Stammdaten
// ---------------------------------------------------------------------------

/**
 * Alle Konten, einschließlich des Anzeigekontos für den Fernseher — die
 * Benutzerverwaltung muss auch dieses bearbeiten können. Wo es um Personen
 * geht (Planung, Krankmeldung, Fernseher), wird die Rolle `tv` an Ort und
 * Stelle herausgefiltert.
 */
export async function fetchEmployees(): Promise<Employee[]> {
  return unwrap<Employee[]>(
    await supabase.from('employees').select('*').order('first_name'),
    'Mitarbeiter',
  );
}

export async function fetchSites(): Promise<Site[]> {
  return unwrap<Site[]>(
    await supabase.from('sites').select('*').eq('active', true).order('number'),
    'Baustellen',
  );
}

export async function fetchHolidays(from: string, to: string): Promise<Holiday[]> {
  return unwrap<Holiday[]>(
    await supabase.from('holidays').select('*').gte('date', from).lte('date', to).order('date'),
    'Feiertage',
  );
}

// ---------------------------------------------------------------------------
// Abwesenheiten
// ---------------------------------------------------------------------------

/**
 * Liefert alle Abwesenheiten, die der angemeldete Benutzer sehen darf: die
 * eigenen in jedem Status und fremde nur, wenn sie genehmigt sind. Die
 * Einschränkung erzwingt die Datenbank, nicht diese Abfrage.
 *
 * Hinweis für Erweiterungen: leave_requests verweist zweimal auf employees
 * (employee_id und decided_by). Wer hier Mitarbeiterdaten mitladen will, muss
 * die Beziehung benennen — etwa
 * `employees!leave_requests_employee_id_fkey(first_name)` —, sonst lehnt die
 * Datenbank die Abfrage als mehrdeutig ab.
 */
export async function fetchLeaveRequests(): Promise<LeaveRequest[]> {
  return unwrap<LeaveRequest[]>(
    await supabase.from('leave_requests').select('*').order('start_date', { ascending: false }),
    'Abwesenheiten',
  );
}

export async function createLeaveRequest(
  employeeId: string,
  startDate: string,
  endDate: string,
): Promise<void> {
  const { error } = await supabase.from('leave_requests').insert({
    employee_id: employeeId,
    type: 'vacation',
    start_date: startDate,
    end_date: endDate,
    status: 'pending',
  });
  if (error) throw new Error(`Urlaubsantrag konnte nicht gespeichert werden: ${error.message}`);
}

/** Nur für das Büro — die Datenbank weist den Aufruf sonst zurück. */
export async function decideLeaveRequest(id: string, status: LeaveStatus): Promise<void> {
  const { error } = await supabase
    .from('leave_requests')
    .update({ status, decided_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(`Entscheidung konnte nicht gespeichert werden: ${error.message}`);
}

/** Zurückziehen eines eigenen, noch offenen Antrags. */
export async function withdrawLeaveRequest(id: string): Promise<void> {
  const { error } = await supabase.from('leave_requests').delete().eq('id', id);
  if (error) throw new Error(`Antrag konnte nicht zurückgezogen werden: ${error.message}`);
}

// ---------------------------------------------------------------------------
// Einsatzplanung
// ---------------------------------------------------------------------------

export async function fetchAssignments(from: string, to: string): Promise<AssignmentRow[]> {
  return unwrap<AssignmentRow[]>(
    await supabase
      .from('assignments')
      // Die Beziehung muss benannt werden: assignments verweist zweimal auf
      // employees — einmal auf die Person, die arbeitet (employee_id), und
      // einmal auf die Person, die geplant hat (created_by). Ohne den Zusatz
      // weiß die Datenbank nicht, welche der beiden gemeint ist.
      .select('*, sites(number, address), employees!assignments_employee_id_fkey(first_name, last_name)')
      .gte('date', from)
      .lte('date', to)
      .order('date')
      .order('start_time'),
    'Einsatzplanung',
  );
}

// ---------------------------------------------------------------------------
// Hinweise zur Woche
// ---------------------------------------------------------------------------

/**
 * Fehlt die Tabelle `week_notes` noch, ist das kein Fehler, sondern der
 * Normalzustand direkt nach einem Deployment: Die App liegt auf GitHub Pages
 * und ist sofort aktuell, das dazugehörige SQL wird von Hand im Supabase-Editor
 * ausgeführt. Zwischen beidem liegen im Zweifel Minuten, in denen sonst jeder
 * im Büro eine rote Fehlermeldung auf dem Planungsschirm hätte.
 *
 * Nach der Migration greift der Normalfall von selbst — nichts weiter zu tun.
 */
function isMissingTable(error: { code?: string; message: string }): boolean {
  return (
    error.code === '42P01' || // Postgres: relation does not exist
    error.code === 'PGRST205' || // PostgREST: nicht im Schema-Cache
    /week_notes/.test(error.message)
  );
}

export async function fetchWeekNotes(from: string, to: string): Promise<WeekNote[]> {
  const { data, error } = await supabase
    .from('week_notes')
    .select('*')
    .gte('date', from)
    .lte('date', to)
    .order('date');

  if (error) {
    if (isMissingTable(error)) return [];
    throw new Error(`Hinweise konnten nicht geladen werden: ${error.message}`);
  }
  return (data ?? []) as WeekNote[];
}

/**
 * Setzt den Hinweis eines Tages. Ein leerer Text löscht ihn, statt eine leere
 * Zeile zu hinterlassen — sonst stünde auf dem Fernseher eine Hinweiszeile, in
 * der nichts steht.
 */
export async function saveWeekNote(date: string, text: string, employeeId: string): Promise<void> {
  const trimmed = text.trim();

  const { error } = trimmed
    ? await supabase
        .from('week_notes')
        .upsert(
          { date, text: trimmed, updated_by: employeeId, updated_at: new Date().toISOString() },
          { onConflict: 'date' },
        )
    : await supabase.from('week_notes').delete().eq('date', date);

  if (error) {
    if (isMissingTable(error)) {
      throw new Error(
        'Die Hinweiszeile ist in der Datenbank noch nicht angelegt. Bitte einmalig ' +
          'supabase/migrations/0004_week_notes.sql im Supabase-SQL-Editor ausführen.',
      );
    }
    throw new Error(`Hinweis konnte nicht gespeichert werden: ${error.message}`);
  }
}

// ---------------------------------------------------------------------------
// Wochenberichte
// ---------------------------------------------------------------------------

/** Alle gespeicherten Berichtszeilen des angemeldeten Mitarbeiters. */
export async function fetchMyReportEntries(employeeId: string): Promise<ReportEntryRow[]> {
  const reports = unwrap<{ id: string }[]>(
    await supabase.from('weekly_reports').select('id').eq('employee_id', employeeId),
    'Wochenberichte',
  );
  if (reports.length === 0) return [];

  return unwrap<ReportEntryRow[]>(
    await supabase
      .from('report_entries')
      .select('*, sites(number, address)')
      .in(
        'report_id',
        reports.map((r) => r.id),
      )
      .order('date'),
    'Berichtszeilen',
  );
}

/**
 * Lädt den Wochenbericht einer Woche in die UI-Struktur.
 * Gibt `null` zurück, wenn für die Woche noch nichts gespeichert wurde.
 */
export async function loadWeeklyReport(
  employeeId: string,
  weekStart: Date,
): Promise<{ reportId: string; entries: WeeklyEntries; status: string } | null> {
  const { data: report, error } = await supabase
    .from('weekly_reports')
    .select('id, status')
    .eq('employee_id', employeeId)
    .eq('week_start', weekKey(weekStart))
    .maybeSingle();

  if (error) throw new Error(`Wochenbericht konnte nicht geladen werden: ${error.message}`);
  if (!report) return null;

  const rows = unwrap<ReportEntryRow[]>(
    await supabase
      .from('report_entries')
      .select('*, sites(number, address)')
      .eq('report_id', report.id)
      .order('date'),
    'Berichtszeilen',
  );

  const entries = emptyWeek();
  for (const row of rows) {
    const index = WEEKDAYS.findIndex((_, i) => dateOfWeekday(weekStart, i) === row.date);
    if (index < 0) continue;
    entries[WEEKDAYS[index]].entries.push({
      id: row.id,
      project: row.sites?.address ?? '',
      projectNumber: row.sites?.number ?? '',
      description: row.description ?? '',
      hours: Number(row.hours),
      startTime: row.start_time?.slice(0, 5),
      endTime: row.end_time?.slice(0, 5),
      pause: row.break_minutes,
      sourceAssignmentId: row.source_assignment_id,
    });
  }

  return { reportId: report.id, entries, status: report.status };
}

/**
 * Speichert die Woche. Der Bericht wird angelegt, falls er noch nicht
 * existiert; die Zeilen werden vollständig ersetzt, weil der angezeigte Stand
 * immer der maßgebliche ist.
 */
export async function saveWeeklyReport(
  employeeId: string,
  weekStart: Date,
  entries: WeeklyEntries,
  sites: Site[],
  options: { signature?: string | null; sign?: boolean } = {},
): Promise<string> {
  const { data: report, error: upsertError } = await supabase
    .from('weekly_reports')
    .upsert(
      {
        employee_id: employeeId,
        week_start: weekKey(weekStart),
        status: options.sign ? 'signed' : 'draft',
        signature: options.signature ?? null,
        submitted_at: options.sign ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'employee_id,week_start' },
    )
    .select('id')
    .single();

  if (upsertError || !report) {
    throw new Error(`Wochenbericht konnte nicht gespeichert werden: ${upsertError?.message}`);
  }

  const { error: deleteError } = await supabase
    .from('report_entries')
    .delete()
    .eq('report_id', report.id);
  if (deleteError) {
    throw new Error(`Alte Berichtszeilen konnten nicht ersetzt werden: ${deleteError.message}`);
  }

  const byNumber = new Map(sites.map((s) => [s.number, s.id]));
  const byAddress = new Map(sites.map((s) => [s.address.toLowerCase(), s.id]));

  const rows = WEEKDAYS.flatMap((day, index) =>
    (entries[day]?.entries ?? []).map((entry) => ({
      report_id: report.id,
      date: dateOfWeekday(weekStart, index),
      site_id: byNumber.get(entry.projectNumber) ?? byAddress.get(entry.project.toLowerCase()) ?? null,
      description: entry.description || null,
      start_time: entry.startTime || null,
      end_time: entry.endTime || null,
      break_minutes: entry.pause ?? 0,
      hours: entry.hours,
      source_assignment_id: entry.sourceAssignmentId ?? null,
    })),
  );

  if (rows.length > 0) {
    const { error: insertError } = await supabase.from('report_entries').insert(rows);
    if (insertError) {
      throw new Error(`Berichtszeilen konnten nicht gespeichert werden: ${insertError.message}`);
    }
  }

  return report.id;
}
