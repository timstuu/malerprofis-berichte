import { addDays, format } from 'date-fns';
import { supabase } from './supabase.ts';
import { breakMinutesForDate } from './hours.ts';
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
 * Verschiebt einen Einsatz auf einen anderen Tag und/oder Mitarbeiter.
 *
 * Die Pause wird dabei neu gerechnet: Sie hängt am Wochentag — freitags
 * entfällt die zweite. Ein von Donnerstag auf Freitag gezogener Einsatz behielte
 * sonst 60 Minuten Abzug, die es an dem Tag gar nicht gibt.
 */
export async function moveAssignment(
  id: string,
  target: { employeeId: string; date: string; startTime: string; endTime: string },
): Promise<void> {
  const { error } = await supabase
    .from('assignments')
    .update({
      employee_id: target.employeeId,
      date: target.date,
      break_minutes: breakMinutesForDate(
        target.startTime.slice(0, 5),
        target.endTime.slice(0, 5),
        new Date(`${target.date}T00:00:00`),
      ),
    })
    .eq('id', id);
  if (error) throw new Error(`Einsatz konnte nicht verschoben werden: ${error.message}`);
}

/**
 * Wer von diesen Einsätzen wurde bereits in einen Wochenbericht übernommen?
 *
 * Wird vor dem Verschieben gebraucht: Landet ein bereits übernommener Einsatz
 * bei einem Kollegen, steht die Schicht anschließend in zwei Berichten — im
 * alten bleibt die Zeile stehen, im neuen kommt sie hinzu. Das lässt sich nicht
 * verhindern, ohne fremde Berichte anzufassen, also wird gefragt statt
 * stillschweigend verschoben.
 */
export async function fetchImportedAssignmentIds(ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const { data, error } = await supabase
    .from('assignment_imports')
    .select('assignment_id')
    .in('assignment_id', ids)
    .eq('state', 'imported');

  if (error) throw new Error(`Übernahmestand konnte nicht geladen werden: ${error.message}`);
  return new Set((data ?? []).map((row) => row.assignment_id as string));
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
      break_minutes: breakMinutesForDate(
        a.start_time.slice(0, 5),
        a.end_time.slice(0, 5),
        addDays(targetWeekStart, offset),
      ),
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
