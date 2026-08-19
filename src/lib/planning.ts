import { addDays, format } from 'date-fns';
import { supabase } from './supabase.ts';
import type { AssignmentRow } from './data.ts';

/**
 * Einsatzplanung: Schreibzugriffe des Büros und das Gedächtnis darüber, welche
 * Planzeilen ein Mitarbeiter bereits übernommen oder verworfen hat.
 * Die Übernahmeregel selbst steht in prefill.ts.
 */

export interface NewAssignment {
  employee_id: string;
  site_id: string;
  date: string;
  start_time: string;
  end_time: string;
  break_minutes: number;
  note?: string | null;
}

// ---------------------------------------------------------------------------
// Schreibzugriffe (nur Büro — die Datenbank weist andere Rollen zurück)
// ---------------------------------------------------------------------------

export async function createAssignments(rows: NewAssignment[]): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await supabase.from('assignments').insert(rows);
  if (error) throw new Error(`Einsatz konnte nicht gespeichert werden: ${error.message}`);
}

export async function deleteAssignment(id: string): Promise<void> {
  const { error } = await supabase.from('assignments').delete().eq('id', id);
  if (error) throw new Error(`Einsatz konnte nicht gelöscht werden: ${error.message}`);
}

/**
 * Legt denselben Einsatz für einen Datumsbereich an (Serienanlage).
 * Wochenenden werden übersprungen, sofern nicht ausdrücklich gewünscht.
 */
export function expandSeries(
  base: Omit<NewAssignment, 'date'>,
  from: string,
  to: string,
  includeWeekend = false,
): NewAssignment[] {
  const rows: NewAssignment[] = [];
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);

  for (let d = start; d <= end; d = addDays(d, 1)) {
    const weekday = d.getDay(); // 0 = Sonntag, 6 = Samstag
    if (!includeWeekend && (weekday === 0 || weekday === 6)) continue;
    rows.push({ ...base, date: format(d, 'yyyy-MM-dd') });
  }
  return rows;
}

/** Übernimmt alle Einsätze einer Woche in die Folgewoche. */
export async function copyWeek(
  sourceAssignments: AssignmentRow[],
  targetWeekStart: Date,
  sourceWeekStart: Date,
): Promise<number> {
  const rows: NewAssignment[] = sourceAssignments.map((a) => {
    const offset = Math.round(
      (new Date(`${a.date}T00:00:00`).getTime() - sourceWeekStart.getTime()) / 86_400_000,
    );
    return {
      employee_id: a.employee_id,
      site_id: a.site_id,
      date: format(addDays(targetWeekStart, offset), 'yyyy-MM-dd'),
      start_time: a.start_time,
      end_time: a.end_time,
      break_minutes: a.break_minutes,
      note: a.note,
    };
  });
  await createAssignments(rows);
  return rows.length;
}

// ---------------------------------------------------------------------------
// Gedächtnis des automatischen Vorbefüllens
// ---------------------------------------------------------------------------

/** Ids der Planzeilen, die dieser Mitarbeiter bereits übernommen oder verworfen hat. */
export async function fetchHandledAssignmentIds(employeeId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('assignment_imports')
    .select('assignment_id')
    .eq('employee_id', employeeId);

  if (error) throw new Error(`Übernahmestand konnte nicht geladen werden: ${error.message}`);
  return new Set((data ?? []).map((row) => row.assignment_id as string));
}

export async function markAssignments(
  employeeId: string,
  assignmentIds: string[],
  state: 'imported' | 'dismissed',
): Promise<void> {
  if (assignmentIds.length === 0) return;
  const { error } = await supabase.from('assignment_imports').upsert(
    assignmentIds.map((assignment_id) => ({ assignment_id, employee_id: employeeId, state })),
    { onConflict: 'assignment_id,employee_id' },
  );
  if (error) throw new Error(`Übernahmestand konnte nicht gespeichert werden: ${error.message}`);
}
