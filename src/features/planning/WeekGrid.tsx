import { useEffect, useRef, useState } from 'react';
import { addDays, addWeeks, format, subWeeks } from 'date-fns';
import { de } from 'date-fns/locale';
import { motion } from 'motion/react';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  Copy,
  Loader2,
  Pencil,
  Check,
  Wrench,
  StickyNote,
  Maximize2,
  X,
} from 'lucide-react';
import {
  copyTradeRowsToWeek,
  createTradeEntry,
  createTradeRow,
  deleteTradeEntry,
  deleteTradeRow,
  fetchAssignments,
  fetchHolidays,
  fetchApprovedVacations,
  fetchTradeEntries,
  fetchTradeRows,
  fetchWeekNotes,
  moveTradeEntry,
  renameTradeRow,
  saveWeekNote,
  updateTradeEntry,
  type AssignmentRow,
} from '../../lib/data.ts';
import {
  copyWeek,
  createAssignments,
  deleteAssignment,
  fetchImportedAssignmentIds,
  moveAssignment,
  updateAssignment,
  recordPlanChanges,
  updateAssignmentNote,
} from '../../lib/planning.ts';
import { WEEKDAYS, breakMinutesForDate, defaultShiftFor, weekdayOf } from '../../lib/hours.ts';
import { sortEmployees } from '../../lib/users.ts';
import { colorOf } from '../../lib/colors.ts';
import FullscreenPlan from './FullscreenPlan.tsx';
import type {
  Employee,
  Holiday,
  LeaveRequest,
  Site,
  TradeEntryRow,
  TradeRow,
  WeekNote,
} from '../../lib/database.types.ts';

/**
 * Einsatzplanung des Büros: Mitarbeiter als Zeilen, Wochentage als Spalten.
 *
 * Für Maler ist dieselbe Ansicht schreibgeschützt sichtbar, damit jeder weiß,
 * wer wo ist. Auch das Büro sieht zuerst nur die Übersicht: Geändert wird erst
 * nach einem Klick auf „Bearbeiten“ (`canEdit`). Das schützt die Planung vor
 * versehentlichen Klicks, wenn jemand nur nachschauen wollte.
 *
 * Das Raster ist bewusst keine `<table>`: Eine Kachel muss sich über Zell- und
 * Zeilengrenzen hinweg ziehen lassen, und ein `<td>` schneidet alles ab, was
 * über seine Grenzen hinausragt.
 */

/** Anzahl der geplanten Tage: Montag bis Samstag. */
const DAY_COUNT = 6;

/** Abwesenheitscodes, unter denen Feiertag und Urlaub im Raster erscheinen. */
const HOLIDAY_SITE_NUMBER = '040-7';
const VACATION_SITE_NUMBER = '060-7';

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
  // Abwesenheiten werden nur angezeigt, nicht geplant: Sie stammen aus dem
  // genehmigten Antrag bzw. dem Feiertagskalender und haben hier keine eigene
  // Zeile, die jemand löschen könnte.
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [notes, setNotes] = useState<WeekNote[]>([]);
  const [tradeRows, setTradeRows] = useState<TradeRow[]>([]);
  const [tradeEntries, setTradeEntries] = useState<TradeEntryRow[]>([]);
  const [tradeEditing, setTradeEditing] = useState<{ rowId: string; date: string } | null>(null);
  // Id des Einsatzes bzw. Gewerk-Eintrags, der gerade zum Ändern offen ist.
  // Die Kachel wird dann durch ihr vorbelegtes Formular ersetzt.
  const [editAssignmentId, setEditAssignmentId] = useState<string | null>(null);
  const [editTradeId, setEditTradeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ employeeId: string; date: string } | null>(null);
  /** Bildschirmfüllende Ansicht des Plans — nur zum Ansehen. */
  const [fullscreen, setFullscreen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  /**
   * Wer während der laufenden Bearbeitung betroffen war, je Woche.
   *
   * Die Maler bekommen erst beim Klick auf „Fertig" eine einzige Meldung je
   * Woche — nicht bei jedem Zug. Der Bearbeitungsmodus überlebt den
   * Wochenwechsel, deshalb eine Zuordnung je Woche und nicht nur ein Merker
   * für die gerade sichtbare.
   */
  const pendingChanges = useRef(new Map<string, Set<string>>());
  /**
   * Kurze Rückmeldung nach dem Abschluss einer Runde.
   *
   * Ohne sie sieht ein gelungener Versand genauso aus wie gar nichts — beides
   * still. Das Büro soll sehen, dass die Maler Bescheid wissen.
   */
  const [handover, setHandover] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  /**
   * Rechtecke aller Zellen, gesammelt beim Rendern. Beim Loslassen einer Kachel
   * entscheidet der Zeigerpunkt, in welcher Zelle sie gelandet ist — anders als
   * bei den Ziehereignissen des Browsers funktioniert das auch mit dem Finger.
   */
  const cellRects = useRef(new Map<string, DOMRect>());

  const readOnly = !canEdit || !editMode;
  const weekEnd = addDays(weekStart, DAY_COUNT - 1);

  /**
   * Vermerkt, dass sich für diese Maler in der sichtbaren Woche etwas geändert
   * hat. Verschickt wird nichts — das passiert beim Beenden der Bearbeitung.
   *
   * Beim Verschieben auf einen anderen Maler sind zwei Personen betroffen:
   * Der eine verliert den Einsatz, der andere bekommt ihn. Deshalb nimmt die
   * Funktion mehrere Kennungen entgegen.
   */
  const markPlanChanged = (...employeeIds: string[]) => {
    const key = format(weekStart, 'yyyy-MM-dd');
    const affected = pendingChanges.current.get(key) ?? new Set<string>();
    for (const id of employeeIds) affected.add(id);
    pendingChanges.current.set(key, affected);
  };

  /**
   * Beendet die Bearbeitung und schickt je geänderter Woche eine Meldung.
   *
   * Scheitert das Melden, bleiben die Vermerke stehen: Der nächste Abschluss
   * nimmt sie wieder mit, statt sie stillschweigend zu verlieren. Die
   * Planänderung selbst ist davon nicht betroffen — die steht längst in der
   * Datenbank.
   */
  const finishEditing = async () => {
    setEditing(null);
    setEditMode(false);
    setHandover(null);

    const pending = pendingChanges.current;
    if (pending.size === 0) return;
    const rows = [...pending.entries()].map(([weekStartIso, ids]) => ({
      weekStart: weekStartIso,
      employeeIds: [...ids],
    }));
    try {
      await recordPlanChanges(rows);
      pendingChanges.current = new Map();
      const betroffene = new Set(rows.flatMap((r) => r.employeeIds)).size;
      const wochen = rows.length;
      setHandover(
        `${betroffene} ${betroffene === 1 ? 'Maler wurde' : 'Maler wurden'} über die geänderte ` +
          `Planung benachrichtigt${wochen > 1 ? ` (${wochen} Wochen)` : ''}.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const days = Array.from({ length: DAY_COUNT }, (_, i) => {
    const date = addDays(weekStart, i);
    return { label: WEEKDAYS[i], date, iso: format(date, 'yyyy-MM-dd') };
  });

  const load = async () => {
    setLoading(true);
    try {
      const from = format(weekStart, 'yyyy-MM-dd');
      const to = format(weekEnd, 'yyyy-MM-dd');
      const [assign, weekNotes, rows, entries, holidayList, leaveList] = await Promise.all([
        fetchAssignments(from, to),
        fetchWeekNotes(from, to),
        fetchTradeRows(from),
        fetchTradeEntries(from, to),
        fetchHolidays(from, to),
        fetchApprovedVacations(from, to),
      ]);
      setAssignments(assign);
      setHolidays(holidayList);
      setLeaves(leaveList);
      setNotes(weekNotes);
      setTradeRows(rows);
      setTradeEntries(entries);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    setEditing(null);
    setTradeEditing(null);
    setEditAssignmentId(null);
    setEditTradeId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart]);

  // Nur Maler. Büro-Konten werden nicht eingeplant — sie hinterlegen ihre
  // Standard-Arbeitszeiten in den Einstellungen und tauchen deshalb weder hier
  // noch am Fernseher als Zeile auf.
  // Dieselbe Reihenfolge wie in der Benutzerverwaltung und am Fernseher.
  const workers = sortEmployees(employees.filter((e) => e.active && e.role === 'worker'));

  const noteOn = (date: string) => notes.find((n) => n.date === date)?.text ?? '';
  const hasNotes = notes.some((n) => n.text.trim().length > 0);

  const storeNote = async (date: string, text: string) => {
    if (!currentEmployeeId) return;
    if (text.trim() === noteOn(date)) return; // nichts geändert
    try {
      await saveWeekNote(date, text, currentEmployeeId);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const cellAssignments = (employeeId: string, date: string) =>
    assignments.filter((a) => a.employee_id === employeeId && a.date === date);

  /**
   * Abwesenheiten einer Zelle: Feiertag für alle, genehmigter Urlaub für den
   * Einzelnen. Beides ist abgeleitet und wird nicht gespeichert — wird ein
   * Antrag zurückgezogen, verschwindet die Kachel von selbst.
   *
   * Geplant werden darf trotzdem: Wer am Feiertag oder im Urlaub doch arbeitet,
   * bekommt seinen Einsatz daneben.
   */
  const cellAbsences = (employeeId: string, date: string) => {
    const found: { key: string; number: string; label: string }[] = [];

    const holiday = holidays.find((h) => h.date === date);
    if (holiday) {
      found.push({ key: `feiertag-${date}`, number: HOLIDAY_SITE_NUMBER, label: holiday.name });
    }

    const onVacation = leaves.some(
      (l) => l.employee_id === employeeId && date >= l.start_date && date <= l.end_date,
    );
    if (onVacation) {
      found.push({ key: `urlaub-${employeeId}-${date}`, number: VACATION_SITE_NUMBER, label: 'Urlaub' });
    }

    return found;
  };

  const remove = async (assignment: AssignmentRow) => {
    if (!confirm(`Einsatz „${assignment.sites?.address ?? ''}“ löschen?`)) return;
    try {
      await deleteAssignment(assignment.id);
      markPlanChanged(assignment.employee_id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  /** Legt eine Kopie in dieselbe Zelle — von dort wird sie hingezogen, wo sie hin soll. */
  const duplicate = async (assignment: AssignmentRow) => {
    try {
      await createAssignments([
        {
          employee_id: assignment.employee_id,
          site_id: assignment.site_id,
          date: assignment.date,
          start_time: assignment.start_time,
          end_time: assignment.end_time,
          break_minutes: assignment.break_minutes,
          note: assignment.note,
        },
      ]);
      markPlanChanged(assignment.employee_id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const move = async (assignment: AssignmentRow, employeeId: string, date: string) => {
    if (assignment.employee_id === employeeId && assignment.date === date) return;

    try {
      // Steht die Schicht schon im Wochenbericht des bisherigen Mitarbeiters,
      // bleibt sie dort auch nach dem Verschieben stehen. Das lässt sich von
      // hier aus nicht aufräumen, ohne einen fremden Bericht zu verändern —
      // also wird gefragt, statt es stillschweigend zu tun.
      if (assignment.employee_id !== employeeId) {
        const imported = await fetchImportedAssignmentIds([assignment.id]);
        if (imported.has(assignment.id)) {
          const previous = workers.find((w) => w.id === assignment.employee_id);
          const name = previous ? `${previous.first_name} ${previous.last_name}` : 'der Kollege';
          if (
            !confirm(
              `${name} hat diesen Einsatz bereits in seinen Wochenbericht übernommen.\n\n` +
                'Nach dem Verschieben steht die Schicht in beiden Berichten. Die Zeile im ' +
                'alten Bericht muss von Hand gelöscht werden.\n\nTrotzdem verschieben?',
            )
          ) {
            return;
          }
        }
      }

      await moveAssignment(assignment.id, {
        employeeId,
        date,
        startTime: assignment.start_time,
        endTime: assignment.end_time,
      });
      markPlanChanged(assignment.employee_id, employeeId);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  // --- Fremdgewerke ------------------------------------------------------

  const tradeCell = (rowId: string, date: string) =>
    tradeEntries.filter((e) => e.trade_row_id === rowId && e.date === date);

  const run = async (action: () => Promise<unknown>) => {
    try {
      await action();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const addTradeRow = async () => {
    const name = prompt('Welches Gewerk? (z. B. Hebebühne, Tischler)');
    if (name === null || !name.trim()) return;
    await run(() => createTradeRow(format(weekStart, 'yyyy-MM-dd'), name.trim()));
  };

  const removeTradeRow = async (row: TradeRow) => {
    const count = tradeEntries.filter((e) => e.trade_row_id === row.id).length;
    const warning = count > 0 ? `\n\n${count} ${count === 1 ? 'Eintrag' : 'Einträge'} verschwinden mit.` : '';
    if (!confirm(`Zeile „${row.name}“ entfernen?${warning}`)) return;
    await run(() => deleteTradeRow(row.id));
  };

  const duplicatePreviousWeek = async () => {
    const previousStart = subWeeks(weekStart, 1);
    try {
      // Nur die Zeilen, die auch zu sehen sind: In alten Wochen können noch
      // Einsätze von Büro-Konten liegen. Ohne diesen Filter holte „Vorwoche
      // übernehmen“ genau die Daten zurück, die Migration 0007 entfernt hat —
      // unsichtbar im Raster und trotzdem im Wochenbericht wirksam.
      const visible = new Set(workers.map((w) => w.id));
      const previous = (
        await fetchAssignments(
          format(previousStart, 'yyyy-MM-dd'),
          format(addDays(previousStart, DAY_COUNT - 1), 'yyyy-MM-dd'),
        )
      ).filter((a) => visible.has(a.employee_id));
      if (previous.length === 0) {
        setError('In der Vorwoche ist nichts geplant.');
        return;
      }
      if (!confirm(`${previous.length} Einsätze aus der Vorwoche übernehmen?`)) return;
      await copyWeek(previous, weekStart, previousStart);
      // Die Gewerk-Zeilen gelten nur für ihre Woche. Ohne diese Übernahme
      // müsste der Gerüstbauer, der jeden Montag kommt, jede Woche neu
      // eingetippt werden.
      await copyTradeRowsToWeek(
        format(previousStart, 'yyyy-MM-dd'),
        format(weekStart, 'yyyy-MM-dd'),
      );
      markPlanChanged(...previous.map((a) => a.employee_id));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  /** Merkt sich die Lage einer Zelle, solange sie im Dokument steht. */
  const registerCell = (key: string) => (node: HTMLDivElement | null) => {
    if (node) cellRects.current.set(key, node.getBoundingClientRect());
    else cellRects.current.delete(key);
  };

  /** In welcher Zelle liegt dieser Bildschirmpunkt? */
  const cellAt = (x: number, y: number): { employeeId: string; date: string } | null => {
    for (const [key, rect] of cellRects.current) {
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
        const [employeeId, date] = key.split('|');
        return { employeeId, date };
      }
    }
    return null;
  };

  /**
   * Rechtecke der Gewerk-Zellen, getrennt von denen der Mitarbeiter: Eine
   * Kachel darf nur in ihrer eigenen Art landen. Eine Mitarbeiterkachel trägt
   * Uhrzeiten und Pause, eine Gewerkkachel eine Notiz — beim Wechsel ginge das
   * eine verloren und das andere müsste erfunden werden.
   */
  const tradeRects = useRef(new Map<string, DOMRect>());

  const registerTradeCell = (key: string) => (node: HTMLDivElement | null) => {
    if (node) tradeRects.current.set(key, node.getBoundingClientRect());
    else tradeRects.current.delete(key);
  };

  const tradeCellAt = (x: number, y: number): { rowId: string; date: string } | null => {
    for (const [key, rect] of tradeRects.current) {
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
        const [rowId, date] = key.split('|');
        return { rowId, date };
      }
    }
    return null;
  };

  const gridTemplate = `10rem repeat(${DAY_COUNT}, minmax(8.5rem, 1fr))`;

  const weekLabel = `KW ${format(weekStart, 'I', { locale: de })} · ${format(weekStart, 'dd.MM.')} – ${format(weekEnd, 'dd.MM.yyyy')}`;

  return (
    <div className="space-y-4">
      {fullscreen && (
        <FullscreenPlan
          days={days}
          dayCount={DAY_COUNT}
          workers={workers}
          tradeRows={tradeRows}
          weekLabel={weekLabel}
          hasNotes={hasNotes}
          noteOn={noteOn}
          cellAssignments={cellAssignments}
          cellAbsences={cellAbsences}
          tradeCell={tradeCell}
          onPrev={() => setWeekStart(subWeeks(weekStart, 1))}
          onNext={() => setWeekStart(addWeeks(weekStart, 1))}
          onClose={() => setFullscreen(false)}
        />
      )}

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
          <button
            onClick={() => setFullscreen(true)}
            className="p-2 bg-gray-100 hover:bg-gray-200 rounded-xl cursor-pointer"
            aria-label="Wochenplan im Vollbild anzeigen"
            title="Vollbild"
          >
            <Maximize2 size={18} />
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
                if (editMode) {
                  finishEditing();
                } else {
                  setEditing(null);
                  setEditMode(true);
                }
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

      {handover && (
        <p className="text-sm text-emerald-800 bg-emerald-50/70 border border-emerald-100 rounded-xl p-3 flex items-center justify-between gap-3">
          {handover}
          <button
            onClick={() => setHandover(null)}
            className="text-emerald-700/60 hover:text-emerald-900 cursor-pointer shrink-0"
            aria-label="Hinweis schließen"
          >
            <X size={16} />
          </button>
        </p>
      )}

      {!readOnly && (
        <p className="text-xs text-[#141414]/40">
          Kacheln lassen sich auf andere Tage und Mitarbeiter ziehen.
        </p>
      )}

      <div className="bg-white rounded-3xl shadow-sm border border-[#141414]/5 overflow-x-auto">
        <div className="min-w-[64rem]">
          {/* Kopfzeile */}
          <div className="grid bg-gray-50/80" style={{ gridTemplateColumns: gridTemplate }}>
            <div className="text-left text-xs font-bold uppercase tracking-wider text-gray-500 p-3">
              Mitarbeiter
            </div>
            {days.map((day) => (
              <div
                key={day.iso}
                className="text-left text-xs font-bold uppercase tracking-wider text-gray-500 p-3"
              >
                {day.label.slice(0, 2)} {format(day.date, 'dd.MM.')}
              </div>
            ))}
          </div>

          {/* Hinweiszeile: gilt dem Tag, nicht einer Person — Betriebs-
              versammlung, Brückentag, Lager zu. Was eine einzelne Person
              betrifft, gehört als Abwesenheitscode in die Zellen darunter. */}
          {(!readOnly || hasNotes) && (
            <div
              className="grid border-t border-[#141414]/5 bg-amber-50/40"
              style={{ gridTemplateColumns: gridTemplate }}
            >
              <div className="p-3 flex items-center">
                <p className="text-xs font-bold uppercase tracking-wider text-amber-700/70">
                  Hinweise
                </p>
              </div>
              {days.map((day) => {
                const note = noteOn(day.iso);
                return (
                  <div key={day.iso} className="p-2 flex items-center">
                    {readOnly ? (
                      note && <p className="text-xs text-amber-900 px-1">{note}</p>
                    ) : (
                      <input
                        // Der Schlüssel enthält den gespeicherten Text: Nach dem
                        // Speichern wird das Feld neu aufgebaut und zeigt den
                        // Stand aus der Datenbank statt der alten Eingabe.
                        key={`${day.iso}-${note}`}
                        defaultValue={note}
                        onBlur={(e) => storeNote(day.iso, e.target.value)}
                        placeholder="—"
                        className="w-full text-xs px-2 py-1.5 bg-white/70 border border-amber-200 rounded-lg placeholder:text-amber-700/25 focus:outline-none focus:border-amber-400"
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Eine Zeile je Mitarbeiter */}
          {workers.map((employee) => {
            const color = colorOf(employee);

            return (
              <div
                key={employee.id}
                className={`grid border-t border-[#141414]/5 ${
                  employee.id === currentEmployeeId ? 'bg-brand-accent1/5' : ''
                }`}
                style={{ gridTemplateColumns: gridTemplate }}
              >
                <div className="p-3 flex items-start gap-2">
                  <span
                    className="w-1.5 self-stretch rounded-full shrink-0"
                    style={{ backgroundColor: color.swatch }}
                  />
                  <div className="min-w-0">
                    {/* Vor- und Nachname untereinander: In der schmalen
                        Namensspalte wurde sonst jeder längere Name abgeschnitten. */}
                    <p className="font-semibold text-sm leading-tight truncate">
                      {employee.first_name}
                    </p>
                    <p className="font-semibold text-sm leading-tight truncate">
                      {employee.last_name}
                    </p>
                    {employee.role === 'admin' && (
                      <span className="text-[10px] font-bold uppercase text-gray-400">Büro</span>
                    )}
                  </div>
                </div>

                {days.map((day) => {
                  const key = `${employee.id}|${day.iso}`;
                  const cell = cellAssignments(employee.id, day.iso);
                  const isEditing =
                    editing?.employeeId === employee.id && editing?.date === day.iso;

                  return (
                    <div
                      key={day.iso}
                      ref={registerCell(key)}
                      className={`p-2 min-h-[4.5rem] transition-colors ${
                        dropTarget === key ? 'bg-brand-accent1/10' : ''
                      }`}
                    >
                      <div className="space-y-1">
                        {cellAbsences(employee.id, day.iso).map((absence) => (
                          <AbsenceTile key={absence.key} number={absence.number} label={absence.label} />
                        ))}

                        {cell.map((a) =>
                          editAssignmentId === a.id ? (
                            <AssignmentForm
                              key={a.id}
                              sites={sites}
                              employeeId={a.employee_id}
                              date={a.date}
                              edit={a}
                              onCancel={() => setEditAssignmentId(null)}
                              onSaved={async () => {
                                setEditAssignmentId(null);
                                markPlanChanged(a.employee_id);
                                await load();
                              }}
                              onError={setError}
                            />
                          ) : (
                          <AssignmentTile
                            key={a.id}
                            assignment={a}
                            color={color}
                            readOnly={readOnly}
                            isDragging={draggingId === a.id}
                            onDragStart={() => setDraggingId(a.id)}
                            onDragMove={(x, y) => {
                              const target = cellAt(x, y);
                              setDropTarget(target ? `${target.employeeId}|${target.date}` : null);
                            }}
                            onDragEnd={(x, y) => {
                              setDraggingId(null);
                              setDropTarget(null);
                              const target = cellAt(x, y);
                              if (target) move(a, target.employeeId, target.date);
                            }}
                            onDelete={() => remove(a)}
                            onDuplicate={() => duplicate(a)}
                            onEdit={() => setEditAssignmentId(a.id)}
                            onNote={(note) =>
                              run(async () => {
                                await updateAssignmentNote(a.id, note);
                                markPlanChanged(a.employee_id);
                              })
                            }
                          />
                          ),
                        )}

                        {!readOnly &&
                          (isEditing ? (
                            <AssignmentForm
                              sites={sites}
                              employeeId={employee.id}
                              date={day.iso}
                              onCancel={() => setEditing(null)}
                              onSaved={async () => {
                                setEditing(null);
                                markPlanChanged(employee.id);
                                await load();
                              }}
                              onError={setError}
                            />
                          ) : (
                            <button
                              onClick={() => setEditing({ employeeId: employee.id, date: day.iso })}
                              className="w-full flex items-center justify-center gap-1 text-[11px] text-gray-400 hover:text-brand-accent1 hover:bg-gray-50 border border-dashed border-gray-200 rounded-xl py-1.5 cursor-pointer"
                            >
                              <Plus size={12} /> Einsatz
                            </button>
                          ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}

          {/* Fremdgewerke — Hebebühne, Tischler, Gerüstbauer. Stehen unter den
              eigenen Leuten, gelten nur für diese Woche und haben bewusst keine
              Uhrzeiten: Für ein Fremdgewerk rechnet niemand Stunden ab. */}
          {tradeRows.map((row) => (
            <div
              key={row.id}
              className="grid border-t border-[#141414]/5 bg-gray-50/40"
              style={{ gridTemplateColumns: gridTemplate }}
            >
              <div className="p-3 flex items-start gap-2">
                <Wrench size={14} className="text-gray-400 shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  {readOnly ? (
                    <p className="font-semibold text-sm truncate text-gray-700">{row.name}</p>
                  ) : (
                    <input
                      key={`${row.id}-${row.name}`}
                      defaultValue={row.name}
                      onBlur={(e) => {
                        const next = e.target.value.trim();
                        if (next && next !== row.name) run(() => renameTradeRow(row.id, next));
                      }}
                      className="w-full font-semibold text-sm bg-transparent border-b border-transparent hover:border-gray-300 focus:border-gray-400 focus:outline-none text-gray-700"
                    />
                  )}
                  <span className="text-[10px] font-bold uppercase text-gray-400">Fremdgewerk</span>
                </div>
                {!readOnly && (
                  <button
                    onClick={() => removeTradeRow(row)}
                    className="p-1 text-gray-300 hover:text-red-500 rounded-md cursor-pointer shrink-0"
                    title="Zeile entfernen"
                    aria-label="Gewerk-Zeile entfernen"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>

              {days.map((day) => {
                const key = `${row.id}|${day.iso}`;
                const cell = tradeCell(row.id, day.iso);
                const isEditing = tradeEditing?.rowId === row.id && tradeEditing?.date === day.iso;

                return (
                  <div
                    key={day.iso}
                    ref={registerTradeCell(key)}
                    className={`p-2 min-h-[4.5rem] transition-colors ${
                      dropTarget === key ? 'bg-gray-200/60' : ''
                    }`}
                  >
                    <div className="space-y-1">
                      {cell.map((entry) =>
                        editTradeId === entry.id ? (
                          <TradeEntryForm
                            key={entry.id}
                            sites={sites}
                            edit={entry}
                            onCancel={() => setEditTradeId(null)}
                            onSave={async (siteId, note) => {
                              setEditTradeId(null);
                              await run(() => updateTradeEntry(entry.id, { site_id: siteId, note }));
                            }}
                          />
                        ) : (
                        <TradeTile
                          key={entry.id}
                          entry={entry}
                          readOnly={readOnly}
                          onEdit={() => setEditTradeId(entry.id)}
                          onDragMove={(x, y) => {
                            const target = tradeCellAt(x, y);
                            setDropTarget(target ? `${target.rowId}|${target.date}` : null);
                          }}
                          onDragEnd={(x, y) => {
                            setDropTarget(null);
                            const target = tradeCellAt(x, y);
                            if (!target) return;
                            if (target.rowId === entry.trade_row_id && target.date === entry.date) return;
                            run(() =>
                              moveTradeEntry(entry.id, {
                                tradeRowId: target.rowId,
                                date: target.date,
                              }),
                            );
                          }}
                          onDelete={() => {
                            if (!confirm(`Eintrag „${entry.sites?.address ?? ''}“ löschen?`)) return;
                            run(() => deleteTradeEntry(entry.id));
                          }}
                          onDuplicate={() =>
                            run(() =>
                              createTradeEntry({
                                trade_row_id: entry.trade_row_id,
                                date: entry.date,
                                site_id: entry.site_id,
                                note: entry.note,
                              }),
                            )
                          }
                        />
                        ),
                      )}

                      {!readOnly &&
                        (isEditing ? (
                          <TradeEntryForm
                            sites={sites}
                            onCancel={() => setTradeEditing(null)}
                            onSave={async (siteId, note) => {
                              setTradeEditing(null);
                              await run(() =>
                                createTradeEntry({
                                  trade_row_id: row.id,
                                  date: day.iso,
                                  site_id: siteId,
                                  note,
                                }),
                              );
                            }}
                          />
                        ) : (
                          <button
                            onClick={() => setTradeEditing({ rowId: row.id, date: day.iso })}
                            className="w-full flex items-center justify-center gap-1 text-[11px] text-gray-400 hover:text-gray-600 hover:bg-gray-100 border border-dashed border-gray-200 rounded-xl py-1.5 cursor-pointer"
                          >
                            <Plus size={12} /> Eintrag
                          </button>
                        ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}

          {!readOnly && (
            <div className="border-t border-[#141414]/5 p-3">
              <button
                onClick={addTradeRow}
                className="flex items-center gap-2 text-xs font-bold text-gray-500 hover:text-[#141414] bg-gray-100 hover:bg-gray-200 px-3 py-2 rounded-xl cursor-pointer"
              >
                <Plus size={14} /> Gewerk
              </button>
            </div>
          )}
        </div>

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
 * Eine Einsatzkachel. Im Bearbeitungsmodus lässt sie sich mit Maus oder Finger
 * auf eine andere Zelle ziehen; die Farbe ist die des Mitarbeiters, damit man
 * seine Zeile auch dann wiederfindet, wenn die Namensspalte seitlich aus dem
 * Bild gescrollt ist.
 *
 * Die Notiz steht unter den Uhrzeiten und wird bewusst nicht abgeschnitten: Ein
 * halber Hinweis („Kunde ab …“) ist schlimmer als gar keiner.
 */
/**
 * Feiertag oder genehmigter Urlaub im Raster.
 *
 * Sieht aus wie ein Einsatz und nennt die Baustellennummer, ist aber nur
 * abgeleitet: keine Knöpfe, nicht verschiebbar, nicht löschbar. Der gestrichelte
 * Rahmen sagt genau das — hier ist nichts geplant, hier ist jemand weg.
 */
function AbsenceTile({ number, label }: { number: string; label: string }) {
  return (
    <div className="rounded-xl px-2 py-1.5 text-xs border border-dashed border-gray-300 bg-gray-50/80">
      <p className="font-bold truncate text-gray-500">{number}</p>
      <p className="text-[#141414]/60 truncate">{label}</p>
    </div>
  );
}

function AssignmentTile({
  assignment,
  color,
  readOnly,
  isDragging,
  onDragStart,
  onDragMove,
  onDragEnd,
  onDelete,
  onDuplicate,
  onEdit,
  onNote,
}: {
  assignment: AssignmentRow;
  color: ReturnType<typeof colorOf>;
  readOnly: boolean;
  isDragging: boolean;
  onDragStart: () => void;
  onDragMove: (x: number, y: number) => void;
  onDragEnd: (x: number, y: number) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onEdit: () => void;
  onNote: (note: string | null) => void;
}) {
  /** `null` = nicht in Bearbeitung; ein String ist der laufende Entwurf. */
  const [draft, setDraft] = useState<string | null>(null);

  const commitNote = () => {
    // Nach dem Abbruch mit Escape kann noch ein Blur folgen. Ohne diese Sperre
    // würde daraus ein leerer Entwurf und damit eine gelöschte Notiz.
    if (draft === null) return;
    const next = draft.trim();
    setDraft(null);
    if (next === (assignment.note ?? '')) return;
    onNote(next || null);
  };

  const body = (
    <>
      <p className="font-bold truncate" style={{ color: color.light.text }}>
        {assignment.sites?.number}
      </p>
      <p className="text-[#141414]/70 truncate">{assignment.sites?.address}</p>
      <p className="text-[#141414]/50 font-mono text-[10px]">
        {assignment.start_time.slice(0, 5)}–{assignment.end_time.slice(0, 5)}
      </p>
    </>
  );

  const noteLine = assignment.note && (
    <p className="mt-1 pt-1 border-t border-[#141414]/10 text-[10px] leading-tight text-[#141414]/75 whitespace-pre-wrap break-words">
      {assignment.note}
    </p>
  );

  if (readOnly) {
    return (
      <div
        className="rounded-xl px-2 py-1.5 text-xs border"
        style={{ backgroundColor: color.light.background, borderColor: color.light.border }}
      >
        {body}
        {noteLine}
      </div>
    );
  }

  return (
    <motion.div
      // Wer gerade eine Notiz tippt, darf die Kachel nicht versehentlich in die
      // Nachbarzelle ziehen — also Ziehen aus, solange das Feld offen ist.
      drag={draft === null}
      dragSnapToOrigin
      dragMomentum={false}
      dragElastic={0}
      onDragStart={onDragStart}
      onDrag={(_, info) => onDragMove(info.point.x, info.point.y)}
      onDragEnd={(_, info) => onDragEnd(info.point.x, info.point.y)}
      whileDrag={{ scale: 1.04, zIndex: 50, cursor: 'grabbing' }}
      className={`relative rounded-xl px-2 py-1.5 text-xs border touch-none select-none ${
        draft === null ? 'cursor-grab' : ''
      }`}
      style={{
        backgroundColor: color.light.background,
        borderColor: color.light.border,
        // Die gezogene Kachel muss über den Nachbarzellen liegen, sonst
        // verschwindet sie beim Ziehen unter der nächsten Zeile.
        zIndex: isDragging ? 50 : undefined,
        position: isDragging ? 'relative' : undefined,
      }}
    >
      {body}

      {draft === null ? (
        noteLine
      ) : (
        <textarea
          autoFocus
          rows={2}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onPointerDownCapture={(e) => e.stopPropagation()}
          onBlur={commitNote}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setDraft(null);
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              commitNote();
            }
          }}
          placeholder="z. B. Kunde ab 10 Uhr da"
          // Die Kachel selbst ist touch-none und select-none, damit das Ziehen sauber
          // läuft. Das Feld muss beides zurücknehmen, sonst lässt sich der Text
          // darin weder markieren noch mit dem Finger scrollen.
          className="w-full mt-1 text-[10px] leading-tight p-1 bg-white/80 border border-[#141414]/15 rounded-lg resize-none select-text touch-auto focus:outline-none focus:border-brand-accent1"
        />
      )}

      <div className="flex items-center gap-1 mt-1">
        <button
          onPointerDownCapture={(e) => e.stopPropagation()}
          onClick={onEdit}
          className="p-1 rounded-md text-[#141414]/40 hover:text-brand-accent1 hover:bg-white/70 cursor-pointer"
          title="Einsatz bearbeiten"
          aria-label="Einsatz bearbeiten"
        >
          <Pencil size={12} />
        </button>
        <button
          onPointerDownCapture={(e) => e.stopPropagation()}
          onClick={() => setDraft(assignment.note ?? '')}
          className={`p-1 rounded-md hover:bg-white/70 cursor-pointer ${
            assignment.note ? 'text-brand-accent1' : 'text-[#141414]/40 hover:text-brand-accent1'
          }`}
          title={assignment.note ? 'Notiz ändern' : 'Notiz hinzufügen'}
          aria-label={assignment.note ? 'Notiz ändern' : 'Notiz hinzufügen'}
        >
          <StickyNote size={12} />
        </button>
        <button
          onPointerDownCapture={(e) => e.stopPropagation()}
          onClick={onDuplicate}
          className="p-1 rounded-md text-[#141414]/40 hover:text-brand-accent1 hover:bg-white/70 cursor-pointer"
          title="Einsatz duplizieren"
          aria-label="Einsatz duplizieren"
        >
          <Copy size={12} />
        </button>
        <button
          onPointerDownCapture={(e) => e.stopPropagation()}
          onClick={onDelete}
          className="p-1 rounded-md text-[#141414]/40 hover:text-red-500 hover:bg-white/70 cursor-pointer"
          title="Einsatz löschen"
          aria-label="Einsatz löschen"
        >
          <Trash2 size={12} />
        </button>
      </div>
    </motion.div>
  );
}


/**
 * Kachel eines Fremdgewerks. Einheitlich grau statt in einer Mitarbeiterfarbe:
 * Auf einen Blick soll unterscheidbar sein, wer die eigenen Leute sind — und
 * die zwölf Palettenfarben bleiben den Malern.
 */
function TradeTile({
  entry,
  readOnly,
  onEdit,
  onDragMove,
  onDragEnd,
  onDelete,
  onDuplicate,
}: {
  entry: TradeEntryRow;
  readOnly: boolean;
  onEdit: () => void;
  onDragMove: (x: number, y: number) => void;
  onDragEnd: (x: number, y: number) => void;
  onDelete: () => void;
  onDuplicate: () => void;
}) {
  const body = (
    <>
      <p className="font-bold truncate text-gray-600">{entry.sites?.number}</p>
      <p className="text-[#141414]/70 truncate">{entry.sites?.address}</p>
      {entry.note && <p className="text-[#141414]/50 text-[10px] leading-tight">{entry.note}</p>}
    </>
  );

  if (readOnly) {
    return (
      <div className="rounded-xl px-2 py-1.5 text-xs border border-gray-200 bg-gray-100">
        {body}
      </div>
    );
  }

  return (
    <motion.div
      drag
      dragSnapToOrigin
      dragMomentum={false}
      dragElastic={0}
      onDrag={(_, info) => onDragMove(info.point.x, info.point.y)}
      onDragEnd={(_, info) => onDragEnd(info.point.x, info.point.y)}
      whileDrag={{ scale: 1.04, zIndex: 50, cursor: 'grabbing' }}
      className="relative rounded-xl px-2 py-1.5 text-xs border border-gray-200 bg-gray-100 cursor-grab touch-none select-none"
    >
      {body}

      <div className="flex items-center gap-1 mt-1">
        <button
          onPointerDownCapture={(e) => e.stopPropagation()}
          onClick={onEdit}
          className="p-1 rounded-md text-[#141414]/40 hover:text-[#141414] hover:bg-white/70 cursor-pointer"
          title="Eintrag bearbeiten"
          aria-label="Eintrag bearbeiten"
        >
          <Pencil size={12} />
        </button>
        <button
          onPointerDownCapture={(e) => e.stopPropagation()}
          onClick={onDuplicate}
          className="p-1 rounded-md text-[#141414]/40 hover:text-[#141414] hover:bg-white/70 cursor-pointer"
          title="Eintrag duplizieren"
          aria-label="Eintrag duplizieren"
        >
          <Copy size={12} />
        </button>
        <button
          onPointerDownCapture={(e) => e.stopPropagation()}
          onClick={onDelete}
          className="p-1 rounded-md text-[#141414]/40 hover:text-red-500 hover:bg-white/70 cursor-pointer"
          title="Eintrag löschen"
          aria-label="Eintrag löschen"
        >
          <Trash2 size={12} />
        </button>
      </div>
    </motion.div>
  );
}

/** Baustelle und ein freier Text — Uhrzeiten hat ein Fremdgewerk nicht. */
function TradeEntryForm({
  sites,
  edit,
  onCancel,
  onSave,
}: {
  sites: Site[];
  /** Gesetzt, wenn ein bestehender Gewerk-Eintrag geändert wird. */
  edit?: TradeEntryRow;
  onCancel: () => void;
  onSave: (siteId: string, note: string | null) => Promise<void>;
}) {
  const [siteId, setSiteId] = useState(
    edit?.site_id ?? sites.find((s) => !s.is_absence_code)?.id ?? '',
  );
  const [note, setNote] = useState(edit?.note ?? '');
  const [busy, setBusy] = useState(false);

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-2 space-y-1.5">
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

      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Notiz (z. B. ab 10 Uhr)"
        className="w-full text-[11px] p-1.5 bg-white border border-gray-200 rounded-lg"
      />

      <div className="flex gap-1 pt-1">
        <button
          onClick={async () => {
            if (!siteId) return;
            setBusy(true);
            await onSave(siteId, note.trim() || null);
            setBusy(false);
          }}
          disabled={busy}
          className="flex-1 bg-gray-600 text-white text-[11px] font-bold py-1.5 rounded-lg disabled:opacity-60 cursor-pointer"
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

/**
 * Eingabe eines Einsatzes: Baustelle, Beginn, Ende — mehr braucht die Planung
 * nicht. Die Pause ergibt sich aus den festen Pausenfenstern des Wochentags;
 * sie wird berechnet und gespeichert, aber bewusst nicht angezeigt.
 *
 * Dazu ein freies Notizfeld für das, was der Maler zu diesem Tag wissen muss.
 * Es steht nur im Raster; in den Wochenbericht wandert es nicht (prefill.ts).
 */
function AssignmentForm({
  sites,
  employeeId,
  date,
  edit,
  onCancel,
  onSaved,
  onError,
}: {
  sites: Site[];
  employeeId: string;
  date: string;
  /** Gesetzt, wenn ein bestehender Einsatz geändert wird statt einen neuen anzulegen. */
  edit?: AssignmentRow;
  onCancel: () => void;
  onSaved: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const day = new Date(`${date}T00:00:00`);
  const shift = defaultShiftFor(weekdayOf(day));

  const [siteId, setSiteId] = useState(
    edit?.site_id ?? sites.find((s) => !s.is_absence_code)?.id ?? '',
  );
  const [start, setStart] = useState(edit ? edit.start_time.slice(0, 5) : shift.start);
  const [end, setEnd] = useState(edit ? edit.end_time.slice(0, 5) : shift.end);
  const [note, setNote] = useState(edit?.note ?? '');
  const [busy, setBusy] = useState(false);

  const pause = breakMinutesForDate(start, end, day);

  const save = async () => {
    if (!siteId) {
      onError('Bitte eine Baustelle wählen.');
      return;
    }
    setBusy(true);
    try {
      if (edit) {
        await updateAssignment(edit.id, {
          siteId,
          date,
          startTime: start,
          endTime: end,
          note,
        });
      } else {
        await createAssignments([
          {
            employee_id: employeeId,
            site_id: siteId,
            date,
            start_time: start,
            end_time: end,
            break_minutes: pause,
            note: note.trim() || null,
          },
        ]);
      }
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

      {/* Am Handy untereinander — nebeneinander überlappen die beiden
          Zeitfelder in der schmalen Kachel. */}
      <div className="flex flex-col sm:flex-row gap-1">
        <input
          type="time"
          value={start}
          onChange={(e) => setStart(e.target.value)}
          className="w-full sm:w-1/2 text-[11px] p-1.5 bg-white border border-gray-200 rounded-lg"
        />
        <input
          type="time"
          value={end}
          onChange={(e) => setEnd(e.target.value)}
          className="w-full sm:w-1/2 text-[11px] p-1.5 bg-white border border-gray-200 rounded-lg"
        />
      </div>

      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Notiz (z. B. Kunde ab 10 Uhr da)"
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
