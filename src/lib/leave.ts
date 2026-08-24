import { supabase } from './supabase.ts';

// Die reinen Rechenregeln liegen in leave-rules.ts und werden hier
// weitergereicht, damit die Oberfläche nur einen Anlaufpunkt hat.
export { countWorkingDays, overlapsExisting } from './leave-rules.ts';

/**
 * Urlaubsanträge.
 *
 * Genehmigen und Ablehnen laufen über Datenbankfunktionen, nicht über einzelne
 * Schreibbefehle: Status, Urlaubskonto und das Räumen der Einsätze gehören
 * zusammen und dürfen nicht halb passieren.
 *
 * Krankmeldungen gibt es hier nicht mehr — die stehen als Abwesenheitscode
 * 050-7 in der Wochenplanung. Die Datenbankfunktion `record_sick_leave` bleibt
 * bestehen, weil die bereits erfassten Krankmeldungen an ihr hängen.
 */

export async function approveLeaveRequest(id: string): Promise<number> {
  const { data, error } = await supabase.rpc('approve_leave_request', { p_id: id });
  if (error) throw new Error(`Antrag konnte nicht genehmigt werden: ${error.message}`);
  return (data as number) ?? 0;
}

/**
 * Genehmigten Urlaub zurückziehen, wenn umgeplant wird.
 *
 * Gelöscht wird nichts: Der Antrag bleibt als abgelehnter Vorgang mit Datum
 * stehen. Die Datenbankfunktion bucht die Tage zurück und räumt zugleich die
 * Urlaubszeilen aus noch nicht abgegebenen Wochenberichten — die stünden sonst
 * an Tagen, an denen wieder gearbeitet wird.
 */
export async function withdrawApprovedLeave(id: string): Promise<void> {
  const { error } = await supabase.rpc('withdraw_leave_request', { p_id: id });
  if (error) throw new Error(`Urlaub konnte nicht zurückgezogen werden: ${error.message}`);
}

export async function rejectLeaveRequest(id: string): Promise<void> {
  const { error } = await supabase.rpc('reject_leave_request', { p_id: id });
  if (error) throw new Error(`Antrag konnte nicht abgelehnt werden: ${error.message}`);
}
