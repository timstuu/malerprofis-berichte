import { supabase } from './supabase.ts';
import { WEEKDAYS } from './hours.ts';
import { dateOfWeekday, emptyWeek, weekKey, type WeeklyEntries } from './week.ts';
import type {
  Assignment,
  DefaultHours,
  Employee,
  Holiday,
  LeaveRequest,
  LeaveStatus,
  Site,
  TradeEntryRow,
  TradeRow,
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
  site_number: string | null;
  site_address: string | null;
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

/**
 * Genehmigter Urlaub, der in einen Zeitraum hineinragt.
 *
 * Für die Anzeige im Planungsraster: Dort zählt nur, wer in der gezeigten Woche
 * weg ist. Die vollständige Liste aller Anträge dafür zu laden, würde bei jedem
 * Wochenwechsel die ganze Tabelle holen.
 */
export async function fetchApprovedVacations(from: string, to: string): Promise<LeaveRequest[]> {
  return unwrap<LeaveRequest[]>(
    await supabase
      .from('leave_requests')
      .select('*')
      .eq('type', 'vacation')
      .eq('status', 'approved')
      .lte('start_date', to)
      .gte('end_date', from),
    'Genehmigter Urlaub',
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
function isMissingTable(error: { code?: string; message: string }, table: string): boolean {
  return (
    error.code === '42P01' || // Postgres: relation does not exist
    error.code === 'PGRST205' || // PostgREST: nicht im Schema-Cache
    error.message.includes(table)
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
    if (isMissingTable(error, 'week_notes')) return [];
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
    if (isMissingTable(error, 'week_notes')) {
      throw new Error(
        'Die Hinweiszeile ist in der Datenbank noch nicht angelegt. Bitte einmalig ' +
          'supabase/migrations/0004_week_notes.sql im Supabase-SQL-Editor ausführen.',
      );
    }
    throw new Error(`Hinweis konnte nicht gespeichert werden: ${error.message}`);
  }
}

// ---------------------------------------------------------------------------
// Fremdgewerke
// ---------------------------------------------------------------------------

/**
 * Wie bei den Hinweisen gilt: Fehlt die Tabelle noch, gibt es eben keine
 * Gewerke. Die App liegt auf GitHub Pages und ist mit dem Push sofort aktuell,
 * das SQL wird von Hand nachgezogen — dazwischen darf niemand eine
 * Fehlermeldung auf dem Planungsschirm sehen.
 */
const MISSING_TRADES =
  'Die Gewerk-Zeilen sind in der Datenbank noch nicht angelegt. Bitte einmalig ' +
  'supabase/migrations/0006_trade_rows.sql im Supabase-SQL-Editor ausführen.';

export async function fetchTradeRows(weekStart: string): Promise<TradeRow[]> {
  const { data, error } = await supabase
    .from('trade_rows')
    .select('*')
    .eq('week_start', weekStart)
    .order('created_at');

  if (error) {
    if (isMissingTable(error, 'trade_rows')) return [];
    throw new Error(`Gewerke konnten nicht geladen werden: ${error.message}`);
  }
  return (data ?? []) as TradeRow[];
}

export async function fetchTradeEntries(from: string, to: string): Promise<TradeEntryRow[]> {
  const { data, error } = await supabase
    .from('trade_entries')
    .select('*, sites(number, address)')
    .gte('date', from)
    .lte('date', to)
    .order('date');

  if (error) {
    if (isMissingTable(error, 'trade_entries')) return [];
    throw new Error(`Gewerk-Einträge konnten nicht geladen werden: ${error.message}`);
  }
  return (data ?? []) as TradeEntryRow[];
}

export async function createTradeRow(weekStart: string, name: string): Promise<void> {
  const { error } = await supabase.from('trade_rows').insert({ week_start: weekStart, name });
  if (error) {
    throw new Error(
      isMissingTable(error, 'trade_rows')
        ? MISSING_TRADES
        : `Gewerk konnte nicht angelegt werden: ${error.message}`,
    );
  }
}

export async function renameTradeRow(id: string, name: string): Promise<void> {
  const { error } = await supabase.from('trade_rows').update({ name }).eq('id', id);
  if (error) throw new Error(`Gewerk konnte nicht umbenannt werden: ${error.message}`);
}

/** Löscht die Zeile samt ihrer Einträge (per ON DELETE CASCADE). */
export async function deleteTradeRow(id: string): Promise<void> {
  const { error } = await supabase.from('trade_rows').delete().eq('id', id);
  if (error) throw new Error(`Gewerk konnte nicht entfernt werden: ${error.message}`);
}

export async function createTradeEntry(input: {
  trade_row_id: string;
  date: string;
  site_id: string;
  note: string | null;
}): Promise<void> {
  const { error } = await supabase.from('trade_entries').insert(input);
  if (error) throw new Error(`Eintrag konnte nicht gespeichert werden: ${error.message}`);
}

export async function deleteTradeEntry(id: string): Promise<void> {
  const { error } = await supabase.from('trade_entries').delete().eq('id', id);
  if (error) throw new Error(`Eintrag konnte nicht gelöscht werden: ${error.message}`);
}

/** Ändert Baustelle und Notiz eines Gewerk-Eintrags. Zeile und Tag bleiben. */
export async function updateTradeEntry(
  id: string,
  fields: { site_id: string; note: string | null },
): Promise<void> {
  const { error } = await supabase
    .from('trade_entries')
    .update({ site_id: fields.site_id, note: fields.note })
    .eq('id', id);
  if (error) throw new Error(`Eintrag konnte nicht geändert werden: ${error.message}`);
}

/** Verschiebt einen Eintrag auf einen anderen Tag und/oder in eine andere Zeile. */
export async function moveTradeEntry(
  id: string,
  target: { tradeRowId: string; date: string },
): Promise<void> {
  const { error } = await supabase
    .from('trade_entries')
    .update({ trade_row_id: target.tradeRowId, date: target.date })
    .eq('id', id);
  if (error) throw new Error(`Eintrag konnte nicht verschoben werden: ${error.message}`);
}

/**
 * Übernimmt die Gewerk-Zeilen einer Woche in eine andere.
 *
 * Ohne das wäre „nur für diese Woche“ eine Schikane: Der Gerüstbauer, der jeden
 * Montag kommt, müsste jede Woche neu getippt werden.
 */
export async function copyTradeRowsToWeek(
  sourceWeekStart: string,
  targetWeekStart: string,
): Promise<number> {
  const rows = await fetchTradeRows(sourceWeekStart);
  if (rows.length === 0) return 0;

  const dayOffset = Math.round(
    (new Date(`${targetWeekStart}T00:00:00`).getTime() -
      new Date(`${sourceWeekStart}T00:00:00`).getTime()) /
      86_400_000,
  );

  const sourceEnd = new Date(`${sourceWeekStart}T00:00:00`);
  sourceEnd.setDate(sourceEnd.getDate() + 6);
  const entries = await fetchTradeEntries(sourceWeekStart, isoDate(sourceEnd));

  const { data: created, error } = await supabase
    .from('trade_rows')
    .insert(rows.map((r) => ({ week_start: targetWeekStart, name: r.name })))
    .select('id');

  if (error) throw new Error(`Gewerke konnten nicht übernommen werden: ${error.message}`);

  // Die Kopien haben neue Schlüssel. Postgres liefert sie in der Reihenfolge
  // zurück, in der sie eingefügt wurden — darüber laufen die Einträge mit.
  const newIdByOldId = new Map<string, string>();
  rows.forEach((row, i) => {
    const match = (created ?? [])[i];
    if (match) newIdByOldId.set(row.id, match.id as string);
  });

  const copies = entries
    .filter((e) => newIdByOldId.has(e.trade_row_id))
    .map((e) => ({
      trade_row_id: newIdByOldId.get(e.trade_row_id) as string,
      date: shiftDate(e.date, dayOffset),
      site_id: e.site_id,
      note: e.note,
    }));

  if (copies.length > 0) {
    const { error: entryError } = await supabase.from('trade_entries').insert(copies);
    if (entryError) {
      throw new Error(`Gewerk-Einträge konnten nicht übernommen werden: ${entryError.message}`);
    }
  }
  return rows.length;
}

function isoDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + days);
  return isoDate(d);
}

// ---------------------------------------------------------------------------
// Standard-Arbeitszeiten der Büro-Konten
// ---------------------------------------------------------------------------

/**
 * Wie bei Hinweisen und Gewerken: Fehlt die Tabelle noch, gibt es eben keine
 * Standardzeiten. Diese Abfrage läuft bei jedem Öffnen eines Wochenberichts —
 * eine rote Fehlermeldung in den Minuten zwischen Deployment und Migration
 * wäre das Letzte, was jemand dort sehen will.
 */
const MISSING_DEFAULT_HOURS =
  'Die Standard-Arbeitszeiten sind in der Datenbank noch nicht angelegt. Bitte einmalig ' +
  'supabase/migrations/0007_admin_default_hours.sql im Supabase-SQL-Editor ausführen.';

/** Die hinterlegten Wochentage eines Büro-Kontos, aufsteigend ab Montag. */
export async function fetchDefaultHours(employeeId: string): Promise<DefaultHours[]> {
  const { data, error } = await supabase
    .from('employee_default_hours')
    .select('*')
    .eq('employee_id', employeeId)
    .order('weekday');

  if (error) {
    if (isMissingTable(error, 'employee_default_hours')) return [];
    throw new Error(`Standard-Arbeitszeiten konnten nicht geladen werden: ${error.message}`);
  }
  return (data ?? []) as DefaultHours[];
}

/**
 * Schreibt die Wochentage eines Büro-Kontos.
 *
 * Zwei Schritte statt eines Austauschs in einem Rutsch: Erst werden die
 * angegebenen Tage geschrieben, dann die weggelassenen entfernt. Löschte man
 * zuerst alles und das Einfügen schlüge fehl, stünde der Mitarbeiter ohne
 * Zeiten da — und beide Schritte für sich sind wiederholbar.
 */
export async function saveDefaultHours(
  employeeId: string,
  rows: { weekday: number; start_time: string; end_time: string }[],
): Promise<void> {
  if (rows.length > 0) {
    const { error } = await supabase.from('employee_default_hours').upsert(
      rows.map((r) => ({ employee_id: employeeId, ...r })),
      { onConflict: 'employee_id,weekday' },
    );
    if (error) {
      throw new Error(
        isMissingTable(error, 'employee_default_hours')
          ? MISSING_DEFAULT_HOURS
          : `Standard-Arbeitszeiten konnten nicht gespeichert werden: ${error.message}`,
      );
    }
  }

  const kept = rows.map((r) => r.weekday);
  let query = supabase.from('employee_default_hours').delete().eq('employee_id', employeeId);
  if (kept.length > 0) query = query.not('weekday', 'in', `(${kept.join(',')})`);

  const { error } = await query;
  if (error) {
    throw new Error(`Standard-Arbeitszeiten konnten nicht bereinigt werden: ${error.message}`);
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
      project: row.site_address ?? row.sites?.address ?? '',
      projectNumber: row.site_number ?? row.sites?.number ?? '',
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
      // Der Verweis auf den Stamm kann leer bleiben, der Klartext nie: Nur so
      // steht die Baustelle auch dann im Büro-PDF, wenn sie frei getippt wurde.
      site_number: entry.projectNumber || null,
      site_address: entry.project || null,
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

// ---------------------------------------------------------------------------
// Wochenberichte im Büro
// ---------------------------------------------------------------------------

/** Ein abgegebener Wochenbericht, wie ihn die Verwaltung auflistet. */
export interface SubmittedReport {
  id: string;
  employee_id: string;
  week_start: string;
  signature: string | null;
  submitted_at: string | null;
  employees: { first_name: string; last_name: string } | null;
  report_entries: ReportEntryRow[];
}

/**
 * Alle abgegebenen Wochenberichte einer Woche — die Liste, die das Büro sieht.
 *
 * Entwürfe bleiben bewusst außen vor: Das Büro soll nur bewerten, was der
 * Maler auch unterschrieben hat. Lesen darf das nur ein Admin, dafür sorgt die
 * RLS-Regel auf weekly_reports.
 */
export async function fetchSubmittedReports(weekStart: Date): Promise<SubmittedReport[]> {
  const result = await supabase
    .from('weekly_reports')
    .select(
      'id, employee_id, week_start, signature, submitted_at, employees(first_name, last_name), report_entries(*, sites(number, address))',
    )
    .eq('week_start', weekKey(weekStart))
    .eq('status', 'signed');

  // supabase-js hält jede eingebettete Tabelle für eine Liste. employee_id ist
  // aber ein einfacher Verweis, PostgREST liefert dort ein Objekt.
  return unwrap<SubmittedReport[]>(
    result as unknown as { data: SubmittedReport[] | null; error: { message: string } | null },
    'Abgegebene Wochenberichte',
  );
}

/**
 * Gibt einen abgegebenen Bericht zur Korrektur frei.
 *
 * Die Unterschrift wird dabei verworfen — sie gehört zu dem Stand, der gerade
 * aufgehoben wird, und dürfte nicht unter einem nachträglich geänderten
 * Bericht weiterstehen. Der Maler muss also neu unterschreiben und neu abgeben.
 */
export async function reopenWeeklyReport(reportId: string): Promise<void> {
  const { data, error } = await supabase
    .from('weekly_reports')
    .update({ status: 'draft', signature: null, submitted_at: null, updated_at: new Date().toISOString() })
    .eq('id', reportId)
    .select('id');
  if (error) throw new Error(`Bericht konnte nicht entsperrt werden: ${error.message}`);
  // Ohne Leserecht auf die Zeile meldet Supabase keinen Fehler, sondern trifft
  // einfach nichts. Das darf nicht als Erfolg durchgehen.
  if (!data || data.length === 0) {
    throw new Error('Bericht konnte nicht entsperrt werden: keine Berechtigung oder Bericht nicht gefunden.');
  }
}
