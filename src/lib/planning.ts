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
  /** Hinweis fürs Raster, z. B. „Kunde ab 10 Uhr da“. Bleibt in der Planung. */
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

/**
 * Setzt oder löscht den Hinweis an einem Einsatz.
 *
 * Der Text ist reine Planungsinformation — er steht im Raster und auf keinem
 * Wochenbericht (siehe prefill.ts). Wer ihn leert, bekommt `null` gespeichert,
 * damit die Kachel danach wieder ohne Hinweiszeile auskommt.
 */
export async function updateAssignmentNote(id: string, note: string | null): Promise<void> {
  const { error } = await supabase
    .from('assignments')
    .update({ note: note && note.trim() ? note.trim() : null })
    .eq('id', id);
  if (error) throw new Error(`Notiz konnte nicht gespeichert werden: ${error.message}`);
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
 * Ändert Baustelle und Uhrzeiten eines bestehenden Einsatzes.
 *
 * Mitarbeiter und Tag bleiben, wie sie sind — die verschiebt man durch Ziehen.
 * Die Pause wird wie beim Anlegen neu aus dem Wochentag gerechnet, damit ein
 * geänderter Einsatz nicht auf einem alten Abzug sitzen bleibt.
 *
 * Bewusst ohne Rücksicht darauf, ob die Schicht schon in einem Wochenbericht
 * steht: Anders als beim Verschieben wird hier nicht gewarnt. Ein bereits
 * übernommener Bericht bleibt auf seinem Stand; das ist so entschieden.
 */
export async function updateAssignment(
  id: string,
  fields: { siteId: string; date: string; startTime: string; endTime: string; note?: string | null },
): Promise<void> {
  const { error } = await supabase
    .from('assignments')
    .update({
      site_id: fields.siteId,
      start_time: fields.startTime,
      end_time: fields.endTime,
      break_minutes: breakMinutesForDate(
        fields.startTime.slice(0, 5),
        fields.endTime.slice(0, 5),
        new Date(`${fields.date}T00:00:00`),
      ),
      note: fields.note && fields.note.trim() ? fields.note.trim() : null,
    })
    .eq('id', id);
  if (error) throw new Error(`Einsatz konnte nicht geändert werden: ${error.message}`);
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

/**
 * Übernimmt alle Einsätze einer Woche in die Folgewoche.
 *
 * Die Notizen bleiben bewusst zurück: „Kunde ab 10 Uhr da“ galt für einen
 * bestimmten Tag. Käme der Satz mit in die neue Woche, stünde dort ein Hinweis,
 * den niemand geschrieben hat und den die Maler trotzdem befolgen.
 */
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
      note: null,
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

/**
 * Schließt eine Planungsrunde ab: eine Zeile je geänderter Woche.
 *
 * Ausgelöst wird das vom Klick auf „Fertig" in der Wochenplanung, nicht von
 * der einzelnen Änderung. Daran hängt der Webhook, der die Maler
 * benachrichtigt — deshalb steht hier bewusst eine Sammelmeldung und keine
 * Liste der einzelnen Eingriffe.
 */
export async function recordPlanChanges(
  rows: { weekStart: string; employeeIds: string[] }[],
): Promise<void> {
  const usable = rows.filter((r) => r.employeeIds.length > 0);
  if (usable.length === 0) return;
  const { error } = await supabase.from('plan_change_events').insert(
    usable.map((r) => ({ week_start: r.weekStart, employee_ids: r.employeeIds })),
  );
  if (error) {
    throw new Error(`Die Maler konnten nicht benachrichtigt werden: ${error.message}`);
  }
}
