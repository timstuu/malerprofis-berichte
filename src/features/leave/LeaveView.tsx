import { useState } from 'react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { Plus, Trash2, Loader2, CalendarDays } from 'lucide-react';
import { countWorkingDays, overlapsExisting } from '../../lib/leave.ts';
import type { Employee, Holiday, LeaveRequest } from '../../lib/database.types.ts';

/**
 * Urlaub aus Sicht des Malers: Antrag stellen, eigene Anträge mit Status
 * verfolgen, Resturlaub sehen.
 */
export default function LeaveView({
  currentUser,
  leaveRequests,
  holidays,
  onSubmit,
  onWithdraw,
}: {
  currentUser: Employee;
  leaveRequests: LeaveRequest[];
  holidays: Holiday[];
  onSubmit: (start: string, end: string) => Promise<void>;
  onWithdraw: (id: string) => Promise<void>;
}) {
  const today = format(new Date(), 'yyyy-MM-dd');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const mine = leaveRequests
    .filter((r) => r.employee_id === currentUser.id)
    .sort((a, b) => b.start_date.localeCompare(a.start_date));

  const days = countWorkingDays(start, end, holidays);
  const pendingDays = mine
    .filter((r) => r.status === 'pending')
    .reduce((sum, r) => sum + countWorkingDays(r.start_date, r.end_date, holidays), 0);

  const submit = async () => {
    setError(null);

    if (!start || !end) return setError('Bitte Start- und Enddatum wählen.');
    if (end < start) return setError('Das Enddatum liegt vor dem Startdatum.');
    if (days === 0) return setError('Der Zeitraum enthält keine Werktage.');
    if (overlapsExisting(start, end, currentUser.id, leaveRequests)) {
      return setError('Für diesen Zeitraum gibt es bereits einen Antrag.');
    }
    if (days > currentUser.remaining_leave_days) {
      return setError(
        `Nicht genug Resturlaub: ${days} Tage beantragt, ${currentUser.remaining_leave_days} verfügbar.`,
      );
    }

    setBusy(true);
    try {
      await onSubmit(start, end);
      setStart('');
      setEnd('');
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Urlaub</h2>
        {!open && (
          <button
            onClick={() => setOpen(true)}
            className="bg-brand-accent1 text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 cursor-pointer"
          >
            <Plus size={18} /> Antrag stellen
          </button>
        )}
      </div>

      {/* Urlaubskonto */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white p-5 rounded-3xl shadow-sm border border-[#141414]/5">
          <p className="text-xs font-bold uppercase tracking-wider text-[#141414]/40">Resturlaub</p>
          <p className="text-3xl font-bold text-brand-accent2 mt-1">
            {currentUser.remaining_leave_days}
            <span className="text-sm font-medium text-[#141414]/40 ml-1">Tage</span>
          </p>
        </div>
        <div className="bg-white p-5 rounded-3xl shadow-sm border border-[#141414]/5">
          <p className="text-xs font-bold uppercase tracking-wider text-[#141414]/40">Beantragt</p>
          <p className="text-3xl font-bold text-amber-500 mt-1">
            {pendingDays}
            <span className="text-sm font-medium text-[#141414]/40 ml-1">Tage offen</span>
          </p>
        </div>
      </div>

      {/* Antragsformular */}
      {open && (
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-[#141414]/5 space-y-4">
          <h3 className="font-bold flex items-center gap-2">
            <CalendarDays size={18} className="text-brand-accent1" /> Neuer Urlaubsantrag
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label htmlFor="leave-start" className="text-xs font-bold uppercase tracking-wider text-gray-500">
                Von
              </label>
              <input
                id="leave-start"
                type="date"
                min={today}
                value={start}
                onChange={(e) => setStart(e.target.value)}
                className="w-full p-3 bg-gray-100 rounded-xl text-sm"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="leave-end" className="text-xs font-bold uppercase tracking-wider text-gray-500">
                Bis
              </label>
              <input
                id="leave-end"
                type="date"
                min={start || today}
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                className="w-full p-3 bg-gray-100 rounded-xl text-sm"
              />
            </div>
          </div>

          {days > 0 && (
            <p className="text-sm text-[#141414]/60">
              Das sind <span className="font-bold text-[#141414]">{days} Urlaubstage</span>{' '}
              (Werktage ohne Feiertage). Danach verbleiben{' '}
              {currentUser.remaining_leave_days - days} Tage.
            </p>
          )}

          {error && (
            <p className="text-sm text-red-600 bg-red-50/60 border border-red-100 rounded-xl p-3">
              {error}
            </p>
          )}

          <div className="flex gap-3">
            <button
              onClick={() => {
                setOpen(false);
                setError(null);
              }}
              className="flex-1 bg-gray-200 hover:bg-gray-300 font-bold py-3 rounded-xl cursor-pointer"
            >
              Abbrechen
            </button>
            <button
              onClick={submit}
              disabled={busy}
              className="flex-1 flex items-center justify-center gap-2 bg-brand-accent1 hover:bg-brand-accent1/90 disabled:opacity-60 text-white font-bold py-3 rounded-xl cursor-pointer"
            >
              {busy && <Loader2 size={16} className="animate-spin" />}
              Antrag einreichen
            </button>
          </div>
        </div>
      )}

      {/* Eigene Anträge */}
      <div className="bg-white rounded-3xl overflow-hidden shadow-sm border border-[#141414]/5">
        <div className="p-4 bg-[#E4E3E0]/30">
          <p className="text-xs font-bold uppercase tracking-widest text-[#141414]/40">
            Deine Anträge
          </p>
        </div>

        {mine.map((req, i) => (
          <div
            key={req.id}
            className={`p-4 flex items-center justify-between gap-3 ${i !== 0 ? 'border-t border-[#141414]/5' : ''}`}
          >
            <div className="min-w-0">
              <p className="font-medium">
                {format(new Date(`${req.start_date}T00:00:00`), 'dd.MM.', { locale: de })} –{' '}
                {format(new Date(`${req.end_date}T00:00:00`), 'dd.MM.yyyy', { locale: de })}
              </p>
              <p className="text-xs text-[#141414]/50">
                {req.type === 'sick' ? 'Krankmeldung' : 'Urlaub'}
                {req.days_count > 0 && ` · ${req.days_count} Tage`}
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <span
                className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase ${
                  req.status === 'approved'
                    ? 'bg-emerald-100 text-emerald-700'
                    : req.status === 'rejected'
                      ? 'bg-red-100 text-red-700'
                      : 'bg-amber-100 text-amber-700'
                }`}
              >
                {req.status === 'approved'
                  ? 'Genehmigt'
                  : req.status === 'rejected'
                    ? 'Abgelehnt'
                    : 'Ausstehend'}
              </span>

              {req.status === 'pending' && (
                <button
                  onClick={() => {
                    if (confirm('Antrag zurückziehen?')) onWithdraw(req.id);
                  }}
                  className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl cursor-pointer"
                  title="Zurückziehen"
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          </div>
        ))}

        {mine.length === 0 && (
          <div className="p-12 text-center text-[#141414]/30">
            <p>Noch keine Urlaubsanträge.</p>
          </div>
        )}
      </div>
    </div>
  );
}
