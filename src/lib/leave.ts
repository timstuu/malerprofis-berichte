import { supabase } from './supabase.ts';

// Die reinen Rechenregeln liegen in leave-rules.ts und werden hier
// weitergereicht, damit die Oberfläche nur einen Anlaufpunkt hat.
export { countWorkingDays, overlapsExisting } from './leave-rules.ts';

/**
 * Urlaubsanträge und Krankmeldungen.
 *
 * Genehmigen, Ablehnen und das Erfassen einer Krankmeldung laufen über
 * Datenbankfunktionen, nicht über einzelne Schreibbefehle: Status, Urlaubskonto
 * und das Räumen der Einsätze gehören zusammen und dürfen nicht halb passieren.
 */

export async function approveLeaveRequest(id: string): Promise<number> {
  const { data, error } = await supabase.rpc('approve_leave_request', { p_id: id });
  if (error) throw new Error(`Antrag konnte nicht genehmigt werden: ${error.message}`);
  return (data as number) ?? 0;
}

export async function rejectLeaveRequest(id: string): Promise<void> {
  const { error } = await supabase.rpc('reject_leave_request', { p_id: id });
  if (error) throw new Error(`Antrag konnte nicht abgelehnt werden: ${error.message}`);
}

export async function recordSickLeave(
  employeeId: string,
  startDate: string,
  endDate: string,
): Promise<void> {
  const { error } = await supabase.rpc('record_sick_leave', {
    p_employee: employeeId,
    p_start: startDate,
    p_end: endDate,
  });
  if (error) throw new Error(`Krankmeldung konnte nicht erfasst werden: ${error.message}`);
}
