import { useEffect, useState } from 'react';
import { addDays, addWeeks, format, subWeeks } from 'date-fns';
import { de } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Plus, Trash2, Copy, Loader2, Pencil, Check } from 'lucide-react';
import { fetchAssignments, type AssignmentRow } from '../../lib/data.ts';
import {
  copyWeek,
  createAssignments,
  deleteAssignment,
  expandSeries,
} from '../../lib/planning.ts';
import { WEEKDAYS } from '../../lib/hours.ts';
import type { Employee, Site } from '../../lib/database.types.ts';

/**
 * Einsatzplanung des Büros: Mitarbeiter als Zeilen, Wochentage als Spalten.
 *
 * Für Maler ist dieselbe Ansicht schreibgeschützt sichtbar, damit jeder weiß,
 * wer wo ist. Auch das Büro sieht zuerst nur die Übersicht: Geändert wird erst
 * nach einem Klick auf „Bearbeiten“ (`canEdit`). Das schützt die Planung vor
 * versehentlichen Klicks, wenn jemand nur nachschauen wollte.
 */
export default function WeekGrid({
  employees,
  sites,
  canEdit = false,
  currentEmployeeId,
}: {
  employees: Employee[];
  sites: Site[];
  canEdit?: boolean;
  currentEmployeeId?: string;
}) {
  const [weekStart, setWeekStart] = useState(() => {
    const now = new Date();
    const day = (now.getDay() + 6) % 7; // Montag = 0
    return new Date(now.getFullYear(), now.getMonth(), now.getDate() - day);
  });
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ employeeId: string; date: string } | null>(null);
  const [editMode, setEditMode] = useState(false);

  const readOnly = !canEdit || !editMode;
  const weekEnd = addDays(weekStart, 6);

  const load = async () => {
    setLoading(true);
    try {
      setAssignments(
        await fetchAssignments(format(weekStart, 'yyyy-MM-dd'), format(weekEnd, 'yyyy-MM-dd')),
      );
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart]);

  const workers = employees.filter((e) => e.active && e.role !== 'tv');

  const cellAssignments = (employeeId: string, date: string) =>
    assignments.filter((a) => a.employee_id === employeeId && a.date === date);

  const remove = async (id: string) => {
    if (!confirm('Diesen Einsatz löschen?')) return;
    try {
      await deleteAssignment(id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const duplicatePreviousWeek = async () => {
    const previousStart = subWeeks(weekStart, 1);
    try {
      const previous = await fetchAssignments(
        format(previousStart, 'yyyy-MM-dd'),
        format(addDays(previousStart, 6), 'yyyy-MM-dd'),
      );
      if (previous.length === 0) {
        setError('In der Vorwoche ist nichts geplant.');
        return;
      }
      if (!confirm(`${previous.length} Einsätze aus der Vorwoche übernehmen?`)) return;
      await copyWeek(previous, weekStart, previousStart);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setWeekStart(subWeeks(weekStart, 1))}
            className="p-2 bg-gray-100 hover:bg-gray-200 rounded-xl cursor-pointer"
            aria-label="Vorherige Woche"
          >
            <ChevronLeft size={18} />
          </button>
          <div className="text-sm font-bold min-w-[13rem] text-center">
            KW {format(weekStart, 'I', { locale: de })} · {format(weekStart, 'dd.MM.')} –{' '}
            {format(weekEnd, 'dd.MM.yyyy')}
          </div>
          <button
            onClick={() => setWeekStart(addWeeks(weekStart, 1))}
            className="p-2 bg-gray-100 hover:bg-gray-200 rounded-xl cursor-pointer"
            aria-label="Nächste Woche"
          >
            <ChevronRight size={18} />
          </button>
          {loading && <Loader2 size={16} className="animate-spin text-brand-accent1" />}
        </div>

        <div className="flex items-center gap-2">
          {!readOnly && (
            <button
              onClick={duplicatePreviousWeek}
              className="flex items-center gap-2 text-xs font-bold bg-gray-100 hover:bg-gray-200 px-3 py-2 rounded-xl cursor-pointer"
            >
              <Copy size={14} /> Vorwoche übernehmen
            </button>
          )}

          {canEdit && (
            <button
              onClick={() => {
                setEditing(null);
                setEditMode((on) => !on);
              }}
              className={`flex items-center gap-2 text-xs font-bold px-3 py-2 rounded-xl cursor-pointer ${
                editMode
                  ? 'bg-brand-accent1 text-white hover:bg-brand-accent1/90'
                  : 'bg-gray-100 hover:bg-gray-200'
              }`}
            >
              {editMode ? (
                <>
                  <Check size={14} /> Fertig
                </>
              ) : (
                <>
                  <Pencil size={14} /> Bearbeiten
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50/60 border border-red-100 rounded-xl p-3">
          {error}
        </p>
      )}

      <div className="bg-white rounded-3xl shadow-sm border border-[#141414]/5 overflow-x-auto">
        <table className="w-full min-w-[900px] border-collapse">
          <thead>
            <tr className="bg-gray-50/80">
              <th className="text-left text-xs font-bold uppercase tracking-wider text-gray-500 p-3 w-40">
                Mitarbeiter
              </th>
              {WEEKDAYS.slice(0, 6).map((day, i) => (
                <th
                  key={day}
                  className="text-left text-xs font-bold uppercase tracking-wider text-gray-500 p-3"
                >
                  {day.slice(0, 2)} {format(addDays(weekStart, i), 'dd.MM.')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {workers.map((employee) => (
              <tr
                key={employee.id}
                className={
                  employee.id === currentEmployeeId
                    ? 'border-t border-[#141414]/5 bg-brand-accent1/5'
                    : 'border-t border-[#141414]/5'
                }
              >
                <td className="p-3 align-top">
                  <p className="font-semibold text-sm">
                    {employee.first_name} {employee.last_name}
                  </p>
                  {employee.role === 'admin' && (
                    <span className="text-[10px] font-bold uppercase text-gray-400">Büro</span>
                  )}
                </td>

                {WEEKDAYS.slice(0, 6).map((day, i) => {
                  const date = format(addDays(weekStart, i), 'yyyy-MM-dd');
                  const cell = cellAssignments(employee.id, date);
                  const isEditing =
                    editing?.employeeId === employee.id && editing?.date === date;

                  return (
                    <td key={day} className="p-2 align-top min-w-[8rem]">
                      <div className="space-y-1">
                        {cell.map((a) => (
                          <div
                            key={a.id}
                            className="group bg-brand-accent1/10 rounded-xl px-2 py-1.5 text-xs"
                          >
                            <p className="font-bold text-brand-accent1 truncate">
                              {a.sites?.number}
                            </p>
                            <p className="text-[#141414]/70 truncate">{a.sites?.address}</p>
                            <p className="text-[#141414]/50 font-mono text-[10px]">
                              {a.start_time.slice(0, 5)}–{a.end_time.slice(0, 5)}
                              {a.break_minutes > 0 && ` (${a.break_minutes}′)`}
                            </p>
                            {!readOnly && (
                              <button
                                onClick={() => remove(a.id)}
                                className="mt-1 text-[10px] text-gray-400 hover:text-red-500 flex items-center gap-1 cursor-pointer"
                              >
                                <Trash2 size={11} /> Löschen
                              </button>
                            )}
                          </div>
                        ))}

                        {!readOnly &&
                          (isEditing ? (
                            <AssignmentForm
                              sites={sites}
                              employeeId={employee.id}
                              date={date}
                              onCancel={() => setEditing(null)}
                              onSaved={async () => {
                                setEditing(null);
                                await load();
                              }}
                              onError={setError}
                            />
                          ) : (
                            <button
                              onClick={() => setEditing({ employeeId: employee.id, date })}
                              className="w-full flex items-center justify-center gap-1 text-[11px] text-gray-400 hover:text-brand-accent1 hover:bg-gray-50 border border-dashed border-gray-200 rounded-xl py-1.5 cursor-pointer"
                            >
                              <Plus size={12} /> Einsatz
                            </button>
                          ))}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>

        {workers.length === 0 && (
          <div className="p-8 text-center text-[#141414]/30 text-sm">
            Noch keine Mitarbeiter hinterlegt.
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Eingabe eines Einsatzes. Mit Datumsbereich lassen sich mehrere Tage auf
 * einmal planen; Wochenenden bleiben dabei ausgespart.
 */
function AssignmentForm({
  sites,
  employeeId,
  date,
  onCancel,
  onSaved,
  onError,
}: {
  sites: Site[];
  employeeId: string;
  date: string;
  onCancel: () => void;
  onSaved: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const [siteId, setSiteId] = useState(sites.find((s) => !s.is_absence_code)?.id ?? '');
  const [start, setStart] = useState('07:00');
  const [end, setEnd] = useState('16:00');
  const [pause, setPause] = useState(30);
  const [until, setUntil] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!siteId) {
      onError('Bitte eine Baustelle wählen.');
      return;
    }
    setBusy(true);
    try {
      const base = {
        employee_id: employeeId,
        site_id: siteId,
        start_time: start,
        end_time: end,
        break_minutes: pause,
        note: note.trim() || null,
      };
      const rows = until ? expandSeries(base, date, until) : [{ ...base, date }];
      await createAssignments(rows);
      await onSaved();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  };

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-xl p-2 space-y-1.5">
      <select
        value={siteId}
        onChange={(e) => setSiteId(e.target.value)}
        className="w-full text-[11px] p-1.5 bg-white border border-gray-200 rounded-lg"
      >
        {sites.map((s) => (
          <option key={s.id} value={s.id}>
            {s.number} · {s.address}
          </option>
        ))}
      </select>

      <div className="flex gap-1">
        <input
          type="time"
          value={start}
          onChange={(e) => setStart(e.target.value)}
          className="w-1/2 text-[11px] p-1.5 bg-white border border-gray-200 rounded-lg"
        />
        <input
          type="time"
          value={end}
          onChange={(e) => setEnd(e.target.value)}
          className="w-1/2 text-[11px] p-1.5 bg-white border border-gray-200 rounded-lg"
        />
      </div>

      <select
        value={pause}
        onChange={(e) => setPause(Number(e.target.value))}
        className="w-full text-[11px] p-1.5 bg-white border border-gray-200 rounded-lg"
      >
        <option value={0}>Keine Pause</option>
        <option value={30}>30 Min Pause</option>
        <option value={60}>60 Min Pause</option>
      </select>

      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Notiz (optional)"
        className="w-full text-[11px] p-1.5 bg-white border border-gray-200 rounded-lg"
      />

      <label className="block text-[10px] text-gray-500 pt-1">Serie bis (optional)</label>
      <input
        type="date"
        value={until}
        min={date}
        onChange={(e) => setUntil(e.target.value)}
        className="w-full text-[11px] p-1.5 bg-white border border-gray-200 rounded-lg"
      />

      <div className="flex gap-1 pt-1">
        <button
          onClick={save}
          disabled={busy}
          className="flex-1 bg-brand-accent1 text-white text-[11px] font-bold py-1.5 rounded-lg disabled:opacity-60 cursor-pointer"
        >
          {busy ? '…' : 'Speichern'}
        </button>
        <button
          onClick={onCancel}
          className="flex-1 bg-gray-200 text-[11px] font-bold py-1.5 rounded-lg cursor-pointer"
        >
          Abbruch
        </button>
      </div>
    </div>
  );
}
