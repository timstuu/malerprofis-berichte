import { useState } from 'react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { Check, X, Loader2 } from 'lucide-react';
import { approveLeaveRequest, countWorkingDays, rejectLeaveRequest } from '../../lib/leave.ts';
import type { Employee, Holiday, LeaveRequest } from '../../lib/database.types.ts';

/**
 * Urlaubsanträge aus Sicht des Büros: offene Anträge entscheiden.
 *
 * Eine Genehmigung löscht die geplanten Einsätze des Zeitraums — das ist so
 * gewollt und lässt sich nicht rückgängig machen, deshalb steht die Zahl der
 * betroffenen Einsätze in der Rückfrage.
 *
 * Krankmeldungen werden hier bewusst nicht erfasst: Wer krank ist, bekommt in
 * der Wochenplanung den Abwesenheitscode 050-7 eingetragen. Ein zweiter Weg
 * für dieselbe Sache hätte nur die Frage aufgeworfen, welcher der richtige ist.
 */
export default function LeaveAdmin({
  employees,
  leaveRequests,
  holidays,
  assignmentCountInRange,
  onChanged,
}: {
  employees: Employee[];
  leaveRequests: LeaveRequest[];
  holidays: Holiday[];
  assignmentCountInRange: (employeeId: string, start: string, end: string) => number;
  onChanged: () => Promise<void>;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const nameOf = (id: string) => {
    const e = employees.find((x) => x.id === id);
    return e ? `${e.first_name} ${e.last_name}` : 'Unbekannt';
  };

  const pending = leaveRequests
    .filter((r) => r.status === 'pending')
    .sort((a, b) => a.start_date.localeCompare(b.start_date));

  const decided = leaveRequests
    .filter((r) => r.status !== 'pending')
    .sort((a, b) => b.start_date.localeCompare(a.start_date))
    .slice(0, 15);

  const decide = async (request: LeaveRequest, approve: boolean) => {
    setError(null);

    if (approve) {
      const days = countWorkingDays(request.start_date, request.end_date, holidays);
      const affected = assignmentCountInRange(
        request.employee_id,
        request.start_date,
        request.end_date,
      );
      const warning =
        affected > 0
          ? `\n\nAchtung: ${affected} geplante ${affected === 1 ? 'Einsatz wird' : 'Einsätze werden'} dabei gelöscht.`
          : '';
      if (
        !confirm(
          `${nameOf(request.employee_id)}: ${days} Urlaubstage genehmigen?${warning}`,
        )
      ) {
        return;
      }
    }

    setBusyId(request.id);
    try {
      if (approve) {
        await approveLeaveRequest(request.id);
      } else {
        await rejectLeaveRequest(request.id);
      }
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setBusyId(null);
  };

  return (
    <div className="space-y-8">
      {error && (
        <p className="text-sm text-red-600 bg-red-50/60 border border-red-100 rounded-xl p-3">
          {error}
        </p>
      )}

      {/* ------------------------------------------------------------- */}
      <section className="space-y-4">
        <h3 className="text-lg font-bold flex items-center gap-2">
          Offene Anträge
          {pending.length > 0 && (
            <span className="bg-amber-100 text-amber-700 text-xs font-bold px-2 py-0.5 rounded-full">
              {pending.length}
            </span>
          )}
        </h3>

        <div className="bg-white rounded-3xl overflow-hidden shadow-sm border border-[#141414]/5">
          {pending.map((req, i) => {
            const days = countWorkingDays(req.start_date, req.end_date, holidays);
            const affected = assignmentCountInRange(
              req.employee_id,
              req.start_date,
              req.end_date,
            );
            const employee = employees.find((e) => e.id === req.employee_id);

            return (
              <div
                key={req.id}
                className={`p-4 flex flex-wrap items-center justify-between gap-3 ${i !== 0 ? 'border-t border-[#141414]/5' : ''}`}
              >
                <div className="min-w-0">
                  <p className="font-semibold">{nameOf(req.employee_id)}</p>
                  <p className="text-sm text-[#141414]/60">
                    {format(new Date(`${req.start_date}T00:00:00`), 'dd.MM.', { locale: de })} –{' '}
                    {format(new Date(`${req.end_date}T00:00:00`), 'dd.MM.yyyy', { locale: de })} ·{' '}
                    {days} Tage
                  </p>
                  <p className="text-xs text-[#141414]/40 mt-0.5">
                    Resturlaub danach: {(employee?.remaining_leave_days ?? 0) - days} Tage
                    {affected > 0 && (
                      <span className="text-amber-600 font-medium">
                        {' '}
                        · {affected} geplante {affected === 1 ? 'Einsatz' : 'Einsätze'} entfallen
                      </span>
                    )}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {busyId === req.id ? (
                    <Loader2 size={18} className="animate-spin text-brand-accent1" />
                  ) : (
                    <>
                      <button
                        onClick={() => decide(req, true)}
                        className="flex items-center gap-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-bold px-3 py-2 rounded-xl cursor-pointer"
                      >
                        <Check size={14} /> Genehmigen
                      </button>
                      <button
                        onClick={() => decide(req, false)}
                        className="flex items-center gap-1 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-bold px-3 py-2 rounded-xl cursor-pointer"
                      >
                        <X size={14} /> Ablehnen
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}

          {pending.length === 0 && (
            <div className="p-8 text-center text-[#141414]/30 text-sm">
              Keine offenen Anträge.
            </div>
          )}
        </div>
      </section>

      {/* ------------------------------------------------------------- */}
      <section className="space-y-4">
        <h3 className="text-lg font-bold">Zuletzt entschieden</h3>
        <div className="bg-white rounded-3xl overflow-hidden shadow-sm border border-[#141414]/5">
          {decided.map((req, i) => (
            <div
              key={req.id}
              className={`p-4 flex items-center justify-between gap-3 ${i !== 0 ? 'border-t border-[#141414]/5' : ''}`}
            >
              <div className="min-w-0">
                <p className="font-medium text-sm">{nameOf(req.employee_id)}</p>
                <p className="text-xs text-[#141414]/50">
                  {format(new Date(`${req.start_date}T00:00:00`), 'dd.MM.', { locale: de })} –{' '}
                  {format(new Date(`${req.end_date}T00:00:00`), 'dd.MM.yyyy', { locale: de })} ·{' '}
                  {req.type === 'sick' ? 'Krank' : 'Urlaub'}
                </p>
              </div>
              <span
                className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase shrink-0 ${
                  req.status === 'approved'
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-red-100 text-red-700'
                }`}
              >
                {req.status === 'approved' ? 'Genehmigt' : 'Abgelehnt'}
              </span>
            </div>
          ))}
          {decided.length === 0 && (
            <div className="p-8 text-center text-[#141414]/30 text-sm">Noch nichts entschieden.</div>
          )}
        </div>
      </section>
    </div>
  );
}
