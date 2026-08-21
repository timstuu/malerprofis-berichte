import { useMemo } from 'react';
import type { Employee, Holiday, LeaveRequest } from '../../lib/database.types.ts';

/**
 * Jahresübersicht der Abwesenheiten für den Büro-Fernseher.
 *
 * Ein Jahr hat 365 Spalten — als Tabelle mit lesbaren Zahlen ist das auf einem
 * Bildschirm aus drei Metern Entfernung nicht darstellbar. Stattdessen bekommt
 * jeder Mitarbeiter ein durchgehendes Jahresband: Man erkennt auf einen Blick
 * die Muster (wer ist wann weg, wo überschneidet es sich), und die Monatsraster
 * darüber machen einzelne Zeiträume zuordenbar.
 */

const MONTH_LABELS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

type DayKind = 'none' | 'vacation' | 'sick' | 'holiday' | 'weekend';

const DAY_COLORS: Record<DayKind, string> = {
  none: 'transparent',
  vacation: '#3981b7', // Markenblau
  sick: '#dc2626',
  holiday: '#cbd5e1',
  weekend: '#f1f5f9',
};

function isoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export default function YearCalendar({
  year,
  employees,
  leaveRequests,
  holidays,
}: {
  year: number;
  employees: Employee[];
  leaveRequests: LeaveRequest[];
  holidays: Holiday[];
}) {
  const days = useMemo(() => {
    const result: { date: string; month: number; weekend: boolean; holiday: boolean }[] = [];
    const holidaySet = new Set(holidays.map((h) => h.date));

    const cursor = new Date(year, 0, 1);
    while (cursor.getFullYear() === year) {
      const date = isoDate(cursor);
      const weekday = cursor.getDay();
      result.push({
        date,
        month: cursor.getMonth(),
        weekend: weekday === 0 || weekday === 6,
        holiday: holidaySet.has(date),
      });
      cursor.setDate(cursor.getDate() + 1);
    }
    return result;
  }, [year, holidays]);

  /** Abwesenheiten je Mitarbeiter und Tag, vorab aufgelöst. */
  const kindByEmployee = useMemo(() => {
    const map = new Map<string, Map<string, DayKind>>();

    for (const employee of employees) {
      const perDay = new Map<string, DayKind>();
      const own = leaveRequests.filter(
        (r) => r.employee_id === employee.id && r.status === 'approved',
      );

      for (const request of own) {
        const cursor = new Date(`${request.start_date}T00:00:00`);
        const end = new Date(`${request.end_date}T00:00:00`);
        while (cursor <= end) {
          // Krankheit überschreibt Urlaub, falls sich beides überlagert.
          const date = isoDate(cursor);
          if (request.type === 'sick' || !perDay.has(date)) {
            perDay.set(date, request.type === 'sick' ? 'sick' : 'vacation');
          }
          cursor.setDate(cursor.getDate() + 1);
        }
      }
      map.set(employee.id, perDay);
    }
    return map;
  }, [employees, leaveRequests]);

  const monthStarts = useMemo(() => {
    const starts: { month: number; index: number; length: number }[] = [];
    for (let m = 0; m < 12; m++) {
      const index = days.findIndex((d) => d.month === m);
      const length = days.filter((d) => d.month === m).length;
      starts.push({ month: m, index, length });
    }
    return starts;
  }, [days]);

  const today = isoDate(new Date());

  return (
    <div className="flex flex-col h-full">
      {/* Monatsleiste */}
      <div className="flex pl-[14vw] pr-4">
        {monthStarts.map(({ month, length }) => (
          <div
            key={month}
            style={{ flexGrow: length, flexBasis: 0 }}
            className="text-center text-[1.4vw] font-bold text-white/50 border-l border-white/10 py-2"
          >
            {MONTH_LABELS[month]}
          </div>
        ))}
      </div>

      {/* Ein Band je Mitarbeiter */}
      <div className="flex-1 flex flex-col justify-around pr-4 pb-4">
        {employees.map((employee) => {
          const perDay = kindByEmployee.get(employee.id) ?? new Map<string, DayKind>();

          return (
            <div key={employee.id} className="flex items-center gap-2">
              <div className="w-[14vw] shrink-0 pr-3 text-right">
                <p className="text-[1.6vw] font-bold text-white truncate leading-tight">
                  {employee.first_name}
                </p>
                <p className="text-[1.1vw] text-white/40 truncate leading-tight">
                  {employee.last_name}
                </p>
              </div>

              <div className="flex-1 flex h-[4.5vh] rounded-md overflow-hidden bg-white/5">
                {days.map((day) => {
                  const kind: DayKind =
                    perDay.get(day.date) ??
                    (day.holiday ? 'holiday' : day.weekend ? 'weekend' : 'none');

                  return (
                    <div
                      key={day.date}
                      style={{
                        flexGrow: 1,
                        flexBasis: 0,
                        backgroundColor: DAY_COLORS[kind],
                        // Der heutige Tag bekommt eine helle Kante, damit man
                        // sich auf dem Jahresband sofort zurechtfindet.
                        boxShadow: day.date === today ? 'inset 0 0 0 1px #ffffff' : undefined,
                      }}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}

        {employees.length === 0 && (
          <p className="text-center text-[2vw] text-white/30">Keine Mitarbeiter hinterlegt.</p>
        )}
      </div>

      {/* Legende */}
      <div className="flex items-center justify-center gap-8 pb-2">
        {[
          ['Urlaub', DAY_COLORS.vacation],
          ['Krank', DAY_COLORS.sick],
          ['Feiertag', DAY_COLORS.holiday],
          ['Wochenende', DAY_COLORS.weekend],
        ].map(([label, color]) => (
          <div key={label} className="flex items-center gap-2">
            <div className="w-[1.6vw] h-[1.6vw] rounded" style={{ backgroundColor: color }} />
            <span className="text-[1.2vw] text-white/60">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
