import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { ChevronLeft, ChevronRight, Wrench, X } from 'lucide-react';
import { colorOf } from '../../lib/colors.ts';
import type { AssignmentRow } from '../../lib/data.ts';
import type { Employee, TradeEntryRow, TradeRow } from '../../lib/database.types.ts';

/**
 * Der Wochenplan bildschirmfüllend — zum Ansehen, nicht zum Planen.
 *
 * Zwei Dinge unterscheiden ihn vom Raster darunter:
 *
 * 1. **Ein eigenes, kompaktes Raster ohne Mindestbreite.** Das normale Raster
 *    ist feste 64rem breit und scrollt waagerecht; quer gehalten hätte die
 *    Woche trotzdem nicht aufs Display gepasst. Hier teilen sich die Tage den
 *    vorhandenen Platz, damit nur noch nach unten gescrollt wird.
 *
 * 2. **Gedreht, aber nur wenn nötig.** Auf dem iPhone lässt sich das Querformat
 *    nicht erzwingen — weder die Vollbild-Schnittstelle noch die Drehsperre
 *    sind dort ansteuerbar. Steckt das Gerät im Hochformat fest, weil die
 *    Displaysperre an ist, dreht sich stattdessen der Inhalt um 90°: Das Handy
 *    wird nach links gekippt. Dreht das Gerät von selbst ins Querformat,
 *    bleibt alles ungedreht — dann scrollt es ganz normal.
 */
/** Breite der Namensspalte. */
const NAME_COLUMN = '4.5rem';

/** So viele Tage füllen am Handy die Breite — Montag bis Freitag. */
const DAYS_ACROSS = 5;

export default function FullscreenPlan({
  days,
  dayCount,
  workers,
  tradeRows,
  weekLabel,
  hasNotes,
  noteOn,
  cellAssignments,
  cellAbsences,
  tradeCell,
  onPrev,
  onNext,
  onClose,
}: {
  days: { label: string; date: Date; iso: string }[];
  dayCount: number;
  workers: Employee[];
  tradeRows: TradeRow[];
  weekLabel: string;
  hasNotes: boolean;
  noteOn: (date: string) => string;
  cellAssignments: (employeeId: string, date: string) => AssignmentRow[];
  cellAbsences: (
    employeeId: string,
    date: string,
  ) => { key: string; number: string; label: string }[];
  tradeCell: (rowId: string, date: string) => TradeEntryRow[];
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
}) {
  // Im Hochformat wird gedreht, im Querformat nicht. Die Abfrage reagiert auch
  // darauf, dass jemand das Gerät bei offener Ansicht dreht.
  const [portrait, setPortrait] = useState(
    () => window.matchMedia('(orientation: portrait)').matches,
  );

  useEffect(() => {
    const query = window.matchMedia('(orientation: portrait)');
    const update = () => setPortrait(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  // Escape schließt; die Seite darunter darf derweil nicht mitscrollen.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  // Wie breit ist die Ansicht? Im gedrehten Zustand ist das die Höhe des
  // Geräts, sonst dessen Breite.
  const [viewWidth, setViewWidth] = useState(() =>
    window.matchMedia('(orientation: portrait)').matches ? window.innerHeight : window.innerWidth,
  );

  useEffect(() => {
    const update = () =>
      setViewWidth(
        window.matchMedia('(orientation: portrait)').matches
          ? window.innerHeight
          : window.innerWidth,
      );
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);

  // Auf dem Handy füllen Montag bis Freitag die Breite; der Samstag wird
  // herangescrollt. Sechs Tage nebeneinander ließen pro Tag nur rund 95 Pixel —
  // zu schmal, um eine Adresse zu erkennen. Auf großen Bildschirmen passen alle
  // Tage ohnehin nebeneinander.
  const narrow = viewWidth < 1024;
  const template = narrow
    ? `${NAME_COLUMN} repeat(${dayCount}, calc((100% - ${NAME_COLUMN}) / ${DAYS_ACROSS}))`
    : `${NAME_COLUMN} repeat(${dayCount}, minmax(0, 1fr))`;

  return (
    <div className="fixed inset-0 z-[60] bg-white overflow-hidden">
      {/* dvh trifft die sichtbare Höhe genauer, fehlt aber auf älteren
          Systemen — deshalb zuerst vh als Rückfall. */}
      <style>{`
        .fsplan { width: 100vw; height: 100vh; }
        .fsplan-rot {
          width: 100vh; height: 100vw;
          transform: rotate(90deg) translateY(-100%);
          transform-origin: top left;
        }
        @supports (height: 100dvh) {
          .fsplan { width: 100dvw; height: 100dvh; }
          .fsplan-rot { width: 100dvh; height: 100dvw; }
        }
      `}</style>

      <div
        className={`${portrait ? 'fsplan-rot' : 'fsplan'} absolute top-0 left-0 flex flex-col`}
      >
        <div className="flex items-center gap-2 px-3 py-2 border-b border-[#141414]/10 bg-gray-50 shrink-0">
          <button
            onClick={onPrev}
            className="p-1.5 bg-white border border-gray-200 rounded-lg cursor-pointer"
            aria-label="Vorherige Woche"
          >
            <ChevronLeft size={16} />
          </button>
          <div className="text-xs font-bold flex-1 text-center truncate">{weekLabel}</div>
          <button
            onClick={onNext}
            className="p-1.5 bg-white border border-gray-200 rounded-lg cursor-pointer"
            aria-label="Nächste Woche"
          >
            <ChevronRight size={16} />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 bg-white border border-gray-200 rounded-lg cursor-pointer"
            aria-label="Vollbild schließen"
          >
            <X size={16} />
          </button>
        </div>

        <div className={`flex-1 overflow-y-auto ${narrow ? 'overflow-x-auto' : 'overflow-x-hidden'}`}>
          <div
            className="grid bg-gray-50/80 sticky top-0 z-10"
            style={{ gridTemplateColumns: template }}
          >
            <div className="text-[9px] font-bold uppercase text-gray-500 px-1.5 py-1">Wer</div>
            {days.map((day) => (
              <div
                key={day.iso}
                className="text-[9px] font-bold uppercase text-gray-500 px-1.5 py-1 truncate"
              >
                {day.label.slice(0, 2)} {format(day.date, 'dd.MM.')}
              </div>
            ))}
          </div>

          {hasNotes && (
            <div
              className="grid border-t border-[#141414]/5 bg-amber-50/40"
              style={{ gridTemplateColumns: template }}
            >
              <div className="px-1.5 py-1 text-[9px] font-bold uppercase text-amber-700/70">
                Hinweise
              </div>
              {days.map((day) => (
                <div key={day.iso} className="px-1 py-1">
                  <p className="text-[9px] leading-tight text-amber-900 break-words">
                    {noteOn(day.iso)}
                  </p>
                </div>
              ))}
            </div>
          )}

          {workers.map((employee) => {
            const color = colorOf(employee);
            return (
              <div
                key={employee.id}
                className="grid border-t border-[#141414]/5"
                style={{ gridTemplateColumns: template }}
              >
                <div className="px-1.5 py-1 flex items-start gap-1">
                  <span
                    className="w-1 self-stretch rounded-full shrink-0"
                    style={{ backgroundColor: color.swatch }}
                  />
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold leading-tight truncate">
                      {employee.first_name}
                    </p>
                    <p className="text-[10px] font-semibold leading-tight truncate">
                      {employee.last_name}
                    </p>
                  </div>
                </div>

                {days.map((day) => (
                  <div key={day.iso} className="p-1 space-y-0.5">
                    {cellAbsences(employee.id, day.iso).map((absence) => (
                      <div
                        key={absence.key}
                        className="rounded-md px-1 py-0.5 border border-dashed border-gray-300 bg-gray-50/80"
                      >
                        <p className="text-[9px] font-bold text-gray-500 truncate">
                          {absence.number}
                        </p>
                        <p className="text-[9px] text-[#141414]/60 truncate">{absence.label}</p>
                      </div>
                    ))}

                    {cellAssignments(employee.id, day.iso).map((a) => (
                      <div
                        key={a.id}
                        className="rounded-md px-1 py-0.5 border"
                        style={{
                          backgroundColor: color.light.background,
                          borderColor: color.light.border,
                        }}
                      >
                        <p
                          className="text-[9px] font-bold truncate"
                          style={{ color: color.light.text }}
                        >
                          {a.sites?.number}
                        </p>
                        <p className="text-[9px] text-[#141414]/70 truncate">{a.sites?.address}</p>
                        <p className="text-[8px] text-[#141414]/50 font-mono">
                          {a.start_time.slice(0, 5)}–{a.end_time.slice(0, 5)}
                        </p>
                        {a.note && (
                          <p className="text-[8px] text-[#141414]/70 leading-tight break-words">
                            {a.note}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            );
          })}

          {tradeRows.map((row) => (
            <div
              key={row.id}
              className="grid border-t border-[#141414]/5 bg-gray-50/40"
              style={{ gridTemplateColumns: template }}
            >
              <div className="px-1.5 py-1 flex items-start gap-1">
                <Wrench size={10} className="text-gray-400 shrink-0 mt-0.5" />
                <p className="text-[10px] font-semibold leading-tight text-gray-700 truncate">
                  {row.name}
                </p>
              </div>

              {days.map((day) => (
                <div key={day.iso} className="p-1 space-y-0.5">
                  {tradeCell(row.id, day.iso).map((entry) => (
                    <div
                      key={entry.id}
                      className="rounded-md px-1 py-0.5 border border-gray-200 bg-white"
                    >
                      <p className="text-[9px] font-bold text-gray-600 truncate">
                        {entry.sites?.number}
                      </p>
                      <p className="text-[9px] text-[#141414]/70 truncate">
                        {entry.sites?.address}
                      </p>
                      {entry.note && (
                        <p className="text-[8px] text-[#141414]/50 leading-tight break-words">
                          {entry.note}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
