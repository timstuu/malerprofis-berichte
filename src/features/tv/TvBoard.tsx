import { useCallback, useEffect, useState } from 'react';
import { addDays, format } from 'date-fns';
import { de } from 'date-fns/locale';
import { supabase } from '../../lib/supabase.ts';
import {
  fetchAssignments,
  fetchEmployees,
  fetchHolidays,
  fetchLeaveRequests,
  fetchTradeEntries,
  fetchTradeRows,
  fetchWeekNotes,
  type AssignmentRow,
} from '../../lib/data.ts';
import { WEEKDAYS } from '../../lib/hours.ts';
import { sortEmployees } from '../../lib/users.ts';
import { colorOf } from '../../lib/colors.ts';
import Logo from '../../components/Logo.tsx';
import YearCalendar from './YearCalendar.tsx';
import type {
  Employee,
  Holiday,
  LeaveRequest,
  TradeEntryRow,
  TradeRow,
  WeekNote,
} from '../../lib/database.types.ts';

/**
 * Anzeige für den Fernseher im Büro.
 *
 * Drei Seiten, von Hand weitergeblättert; die gewählte Seite bleibt stehen.
 * Startseite ist das Logo, damit im Ruhezustand nichts Personenbezogenes an der
 * Wand hängt.
 *
 * Gedacht für einen Chrome im Kiosk-Modus an einem kleinen Rechner am HDMI-Port.
 * Bedient wird mit Pfeiltasten oder einem Funk-Presenter (die senden meist
 * Bild auf/ab).
 */

type Page = 0 | 1 | 2;
const PAGE_COUNT = 3;

function mondayOf(date: Date): Date {
  const day = (date.getDay() + 6) % 7; // Montag = 0
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() - day);
}

export default function TvBoard() {
  const [page, setPage] = useState<Page>(0);
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()));
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [weekNotes, setWeekNotes] = useState<WeekNote[]>([]);
  const [tradeRows, setTradeRows] = useState<TradeRow[]>([]);
  const [tradeEntries, setTradeEntries] = useState<TradeEntryRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const year = new Date().getFullYear();

  const load = useCallback(async () => {
    try {
      const [emp, assign, leaves, holidayList, notes, rows, entries] = await Promise.all([
        fetchEmployees(),
        fetchAssignments(
          format(weekStart, 'yyyy-MM-dd'),
          format(addDays(weekStart, 6), 'yyyy-MM-dd'),
        ),
        fetchLeaveRequests(),
        fetchHolidays(`${year}-01-01`, `${year}-12-31`),
        fetchWeekNotes(
          format(weekStart, 'yyyy-MM-dd'),
          format(addDays(weekStart, 6), 'yyyy-MM-dd'),
        ),
        fetchTradeRows(format(weekStart, 'yyyy-MM-dd')),
        fetchTradeEntries(
          format(weekStart, 'yyyy-MM-dd'),
          format(addDays(weekStart, 6), 'yyyy-MM-dd'),
        ),
      ]);
      // Das Anzeigekonto selbst ist keine Person und gehört nicht auf den Schirm.
      // Dieselbe Reihenfolge wie im Büro — sonst sucht man an der Wand an einer
      // anderen Stelle als auf dem Planungsschirm.
      setEmployees(sortEmployees(emp.filter((e) => e.active && e.role !== 'tv')));
      setAssignments(assign);
      setLeaveRequests(leaves);
      setHolidays(holidayList);
      setWeekNotes(notes);
      setTradeRows(rows);
      setTradeEntries(entries);
      setUpdatedAt(new Date());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [weekStart, year]);

  useEffect(() => {
    load();
  }, [load]);

  // Änderungen aus dem Büro erscheinen ohne Zutun. Zusätzlich alle 30 Minuten
  // ein vollständiges Neuladen — falls die Verbindung zwischendurch abreißt,
  // merkt das am Fernseher sonst niemand.
  useEffect(() => {
    const channel = supabase
      .channel('tv-board')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'assignments' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leave_requests' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'week_notes' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trade_rows' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trade_entries' }, () => load())
      .subscribe();

    const timer = window.setInterval(load, 30 * 60 * 1000);

    return () => {
      supabase.removeChannel(channel);
      window.clearInterval(timer);
    };
  }, [load]);

  // Zur Wochenmitte hinaus bleibt der Fernseher auf der aktuellen Woche:
  // einmal pro Stunde prüfen, ob inzwischen Montag ist.
  useEffect(() => {
    const timer = window.setInterval(() => {
      const current = mondayOf(new Date());
      if (format(current, 'yyyy-MM-dd') !== format(weekStart, 'yyyy-MM-dd')) {
        setWeekStart(current);
      }
    }, 60 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [weekStart]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      switch (event.key) {
        case 'ArrowRight':
        case 'PageDown':
        case ' ':
          setPage((p) => ((p + 1) % PAGE_COUNT) as Page);
          break;
        case 'ArrowLeft':
        case 'PageUp':
          setPage((p) => ((p + PAGE_COUNT - 1) % PAGE_COUNT) as Page);
          break;
        case '1':
          setPage(0);
          break;
        case '2':
          setPage(1);
          break;
        case '3':
          setPage(2);
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="min-h-screen bg-[#141414] text-white overflow-hidden cursor-none select-none">
      {page === 0 && <LogoPage />}
      {page === 1 && (
        <WeekPage
          weekStart={weekStart}
          employees={employees}
          assignments={assignments}
          leaveRequests={leaveRequests}
          holidays={holidays}
          weekNotes={weekNotes}
          tradeRows={tradeRows}
          tradeEntries={tradeEntries}
        />
      )}
      {page === 2 && (
        <div className="h-screen flex flex-col p-[2vw]">
          <h1 className="text-[2.6vw] font-bold mb-2">Urlaubsplan {year}</h1>
          <div className="flex-1 min-h-0">
            <YearCalendar
              year={year}
              employees={employees}
              leaveRequests={leaveRequests}
              holidays={holidays}
            />
          </div>
        </div>
      )}

      {/* Fußzeile: Seitenanzeige und Stand der Daten, bewusst dezent */}
      {page !== 0 && (
        <div className="fixed bottom-[1vh] right-[1.5vw] flex items-center gap-4 text-[0.9vw] text-white/25">
          {error ? (
            <span className="text-red-400">Keine Verbindung</span>
          ) : (
            updatedAt && <span>Stand {format(updatedAt, 'HH:mm')}</span>
          )}
          <span>{page + 1} / {PAGE_COUNT}</span>
        </div>
      )}
    </div>
  );
}

/** Ruhezustand: nur das Firmenlogo, keine Personendaten. */
function LogoPage() {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="h-screen flex flex-col items-center justify-center gap-[4vh] bg-white">
      <Logo className="w-[45vw] h-auto" />
      <div className="text-center">
        <p className="text-[3vw] font-bold text-[#141414] leading-none">{format(now, 'HH:mm')}</p>
        <p className="text-[1.4vw] text-[#141414]/50 mt-2 capitalize">
          {format(now, 'EEEE, d. MMMM yyyy', { locale: de })}
        </p>
      </div>
    </div>
  );
}

/** Wochenplanung: Mitarbeiter als Zeilen, Mo–Fr als Spalten. */
export function WeekPage({
  weekStart,
  employees,
  assignments,
  leaveRequests,
  holidays,
  weekNotes = [],
  tradeRows = [],
  tradeEntries = [],
}: {
  weekStart: Date;
  employees: Employee[];
  assignments: AssignmentRow[];
  leaveRequests: LeaveRequest[];
  holidays: Holiday[];
  weekNotes?: WeekNote[];
  tradeRows?: TradeRow[];
  tradeEntries?: TradeEntryRow[];
}) {
  const days = WEEKDAYS.slice(0, 5).map((label, index) => {
    const date = addDays(weekStart, index);
    const iso = format(date, 'yyyy-MM-dd');
    return {
      label,
      date,
      iso,
      isToday: iso === format(new Date(), 'yyyy-MM-dd'),
      holiday: holidays.find((h) => h.date === iso),
      note: weekNotes.find((n) => n.date === iso)?.text ?? null,
    };
  });

  // Die Hinweiszeile erscheint nur, wenn sie etwas zu sagen hat. Der Fernseher
  // rechnet mit fester Höhe: Eine dauerhaft leere Zeile nähme jeder
  // Mitarbeiterzeile Platz weg, den sie für die Baustellennamen braucht.
  const hasNotes = days.some((day) => day.note);

  // Nur Gewerke zeigen, die diese Woche auch etwas zu sagen haben: Das Layout
  // rechnet mit fester Höhe, jede zusätzliche Zeile nimmt allen Mitarbeitern
  // Platz weg — auch an Tagen, an denen kein Tischler eingeplant ist.
  const activeTrades = tradeRows.filter((row) =>
    tradeEntries.some(
      (entry) => entry.trade_row_id === row.id && days.some((day) => day.iso === entry.date),
    ),
  );

  const absenceOn = (employeeId: string, iso: string) =>
    leaveRequests.find(
      (r) =>
        r.employee_id === employeeId &&
        r.status === 'approved' &&
        iso >= r.start_date &&
        iso <= r.end_date,
    );

  return (
    <div className="h-screen flex flex-col p-[2vw]">
      <div className="flex items-baseline justify-between mb-[2vh]">
        <h1 className="text-[2.6vw] font-bold">Einsatzplanung</h1>
        <p className="text-[1.6vw] text-white/50">
          KW {format(weekStart, 'I', { locale: de })} · {format(weekStart, 'dd.MM.')} –{' '}
          {format(addDays(weekStart, 4), 'dd.MM.yyyy')}
        </p>
      </div>

      <div className="flex-1 min-h-0 flex flex-col">
        {/* Kopfzeile */}
        <div className="flex gap-[0.6vw] mb-[0.8vh]">
          <div className="w-[13vw] shrink-0" />
          {days.map((day) => (
            <div
              key={day.iso}
              className={`flex-1 text-center py-[0.6vh] rounded-lg ${
                day.isToday ? 'bg-brand-accent1/30' : 'bg-white/5'
              }`}
            >
              <p className="text-[1.5vw] font-bold leading-tight">{day.label.slice(0, 2)}</p>
              <p className="text-[1vw] text-white/40 leading-tight">{format(day.date, 'dd.MM.')}</p>
            </div>
          ))}
        </div>

        {/* Hinweise zum Tag — gilt dem Betrieb, nicht einer Person */}
        {hasNotes && (
          <div className="flex gap-[0.6vw] mb-[0.8vh]">
            <div className="w-[13vw] shrink-0 flex items-center pr-2">
              <p className="text-[1.1vw] uppercase tracking-wider text-white/35">Hinweise</p>
            </div>
            {days.map((day) => (
              <div
                key={day.iso}
                className={`flex-1 min-w-0 rounded-lg px-[0.5vw] py-[0.7vh] flex items-center ${
                  day.note ? 'bg-brand-accent2/25' : 'bg-white/[0.03]'
                }`}
              >
                {day.note && (
                  <p className="text-[1.1vw] leading-[1.2] line-clamp-2">{day.note}</p>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Eine Zeile je Mitarbeiter */}
        <div className="flex-1 flex flex-col gap-[0.6vh] min-h-0">
          {employees.map((employee) => {
            const color = colorOf(employee);

            return (
            <div key={employee.id} className="flex gap-[0.6vw] flex-1 min-h-0">
              <div className="w-[13vw] shrink-0 flex items-center gap-[0.5vw] pr-2">
                <span
                  className="w-[0.4vw] self-stretch my-[0.6vh] rounded-full shrink-0"
                  style={{ backgroundColor: color.swatch }}
                />
                <div className="min-w-0">
                  <p className="text-[1.5vw] font-bold leading-tight truncate">
                    {employee.first_name}
                  </p>
                  <p className="text-[1.1vw] text-white/40 leading-tight truncate">
                    {employee.last_name}
                  </p>
                </div>
              </div>

              {days.map((day) => {
                const cell = assignments.filter(
                  (a) => a.employee_id === employee.id && a.date === day.iso,
                );
                const absence = absenceOn(employee.id, day.iso);

                return (
                  <div
                    key={day.iso}
                    className={`flex-1 min-w-0 rounded-lg p-[0.5vw] flex flex-col justify-center gap-[0.4vh] ${
                      day.holiday
                        ? 'bg-white/5'
                        : absence
                          ? absence.type === 'sick'
                            ? 'bg-red-500/25'
                            : 'bg-brand-accent1/25'
                          : cell.length > 0
                            ? ''
                            : 'bg-white/[0.03]'
                    }`}
                    // Abwesenheit und Feiertag behalten ihre eigene Farbe: Sie
                    // sagt aus, dass jemand nicht da ist, und das ist an der
                    // Wand die wichtigere Auskunft als die Zuordnung zur Zeile.
                    style={
                      !day.holiday && !absence && cell.length > 0
                        ? { backgroundColor: color.dark.background }
                        : undefined
                    }
                  >
                    {day.holiday ? (
                      <p className="text-[1.1vw] text-white/50 text-center">{day.holiday.name}</p>
                    ) : absence ? (
                      <p className="text-[1.4vw] font-bold text-center">
                        {absence.type === 'sick' ? 'Krank' : 'Urlaub'}
                      </p>
                    ) : (
                      cell.map((a) => (
                        <div key={a.id} className="min-w-0">
                          {/* Umbruch statt Abschneiden: Auf dem Fernseher ist
                              die Baustelle die eigentliche Information — ein
                              abgeschnittener Name macht die Anzeige wertlos. */}
                          <p className="text-[1.1vw] font-bold leading-[1.15] line-clamp-2">
                            {a.sites?.address}
                          </p>
                          <p className="text-[0.9vw] text-white/50 leading-tight truncate">
                            {a.sites?.number} · {a.start_time.slice(0, 5)}–{a.end_time.slice(0, 5)}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                );
              })}
            </div>
            );
          })}

          {activeTrades.map((row) => (
            <div key={row.id} className="flex gap-[0.6vw] flex-1 min-h-0">
              <div className="w-[13vw] shrink-0 flex items-center gap-[0.5vw] pr-2">
                <span className="w-[0.4vw] self-stretch my-[0.6vh] rounded-full shrink-0 bg-white/25" />
                <div className="min-w-0">
                  <p className="text-[1.3vw] font-bold leading-tight truncate text-white/75">
                    {row.name}
                  </p>
                  <p className="text-[0.9vw] text-white/30 leading-tight">Fremdgewerk</p>
                </div>
              </div>

              {days.map((day) => {
                const cell = tradeEntries.filter(
                  (e) => e.trade_row_id === row.id && e.date === day.iso,
                );

                return (
                  <div
                    key={day.iso}
                    className={`flex-1 min-w-0 rounded-lg p-[0.5vw] flex flex-col justify-center gap-[0.4vh] ${
                      cell.length > 0 ? 'bg-white/10' : 'bg-white/[0.03]'
                    }`}
                  >
                    {cell.map((entry) => (
                      <div key={entry.id} className="min-w-0">
                        <p className="text-[1.1vw] font-bold leading-[1.15] line-clamp-2 text-white/80">
                          {entry.sites?.address}
                        </p>
                        <p className="text-[0.9vw] text-white/40 leading-tight truncate">
                          {entry.sites?.number}
                          {entry.note && ` · ${entry.note}`}
                        </p>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          ))}

          {employees.length === 0 && (
            <p className="text-center text-[2vw] text-white/30 mt-[10vh]">
              Keine Mitarbeiter hinterlegt.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
