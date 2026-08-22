import { useEffect, useState } from 'react';
import { Loader2, Check } from 'lucide-react';
import { fetchDefaultHours, saveDefaultHours } from '../../lib/data.ts';
import { WEEKDAYS, calculateHours, statutoryBreakMinutes } from '../../lib/hours.ts';

/**
 * Standard-Arbeitszeiten eines Büro-Kontos, je Wochentag einzeln.
 *
 * Büro-Konten stehen nicht in der Wochenplanung — ihre Stunden entstehen aus
 * dieser Vorgabe, die der Wochenbericht beim Öffnen einer Woche übernimmt.
 *
 * Ein leerer Wochentag heißt „an dem Tag wird nicht gearbeitet"; es gibt
 * deshalb kein zusätzliches Häkchen zum An- und Abschalten. Wer den Samstag
 * leert, hat ihn damit abgeschaltet.
 *
 * Die Netto-Stunden stehen bewusst neben jeder Zeile: Hier legt jemand eine
 * Regel fest, die anschließend jede Woche unbesehen greift — was dabei
 * herauskommt, muss man sehen können, bevor man speichert.
 */
export default function DefaultHours({ employeeId }: { employeeId: string }) {
  const [rows, setRows] = useState<{ start: string; end: string }[]>(
    WEEKDAYS.map(() => ({ start: '', end: '' })),
  );
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const stored = await fetchDefaultHours(employeeId);
        if (cancelled) return;
        const next = WEEKDAYS.map(() => ({ start: '', end: '' }));
        for (const row of stored) {
          // ISO-Wochentag zählt ab 1, WEEKDAYS beginnt bei Montag.
          const index = row.weekday - 1;
          if (index >= 0 && index < next.length) {
            next[index] = { start: row.start_time.slice(0, 5), end: row.end_time.slice(0, 5) };
          }
        }
        setRows(next);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
      if (!cancelled) setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [employeeId]);

  const update = (index: number, field: 'start' | 'end', value: string) => {
    setRows((current) => current.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
    setSaved(false);
  };

  const save = async () => {
    // Halb ausgefüllte Tage sind kein Speicherfehler, sondern eine offene
    // Eingabe — nur beides zusammen ergibt einen Arbeitstag.
    const incomplete = rows.findIndex((r) => Boolean(r.start) !== Boolean(r.end));
    if (incomplete >= 0) {
      setError(`${WEEKDAYS[incomplete]}: Bitte Beginn und Ende angeben oder beides leer lassen.`);
      return;
    }
    const reversed = rows.findIndex((r) => r.start && r.end && r.end <= r.start);
    if (reversed >= 0) {
      setError(`${WEEKDAYS[reversed]}: Das Ende muss nach dem Beginn liegen.`);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await saveDefaultHours(
        employeeId,
        rows.flatMap((r, i) =>
          r.start && r.end
            ? [{ weekday: i + 1, start_time: `${r.start}:00`, end_time: `${r.end}:00` }]
            : [],
        ),
      );
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  };

  const weekTotal = rows.reduce(
    (total, r) =>
      r.start && r.end && r.end > r.start
        ? total + calculateHours(r.start, r.end, statutoryBreakMinutes(r.start, r.end))
        : total,
    0,
  );

  if (loading) {
    return (
      <div className="bg-white rounded-3xl shadow-sm border border-[#141414]/5 p-8 flex justify-center">
        <Loader2 className="animate-spin text-[#141414]/30" size={20} />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-[#141414]/5 overflow-hidden">
      <div className="p-6 pb-4">
        <p className="text-sm text-[#141414]/60">
          Diese Zeiten übernimmt Ihr Wochenbericht auf Baustelle 001-7, sobald Sie eine Woche
          öffnen. Tage ohne Eintrag bleiben leer. Feiertage und genehmigter Urlaub gehen vor.
        </p>
      </div>

      <div className="divide-y divide-[#141414]/5">
        {WEEKDAYS.map((day, i) => {
          const row = rows[i];
          const complete = Boolean(row.start && row.end && row.end > row.start);
          const pause = complete ? statutoryBreakMinutes(row.start, row.end) : 0;
          const net = complete ? calculateHours(row.start, row.end, pause) : 0;

          return (
            <div key={day} className="px-6 py-3 flex items-center gap-3 flex-wrap">
              <span className="w-24 shrink-0 text-sm font-bold">{day}</span>

              <input
                type="time"
                value={row.start}
                onChange={(e) => update(i, 'start', e.target.value)}
                className="text-sm p-2 bg-white border border-gray-200 rounded-xl"
                aria-label={`${day} Beginn`}
              />
              <input
                type="time"
                value={row.end}
                onChange={(e) => update(i, 'end', e.target.value)}
                className="text-sm p-2 bg-white border border-gray-200 rounded-xl"
                aria-label={`${day} Ende`}
              />

              {complete ? (
                <span className="text-xs text-[#141414]/50">
                  {net.toLocaleString('de-DE')} Std. netto
                  {pause > 0 ? ` · ${pause} Min. Pause` : ' · ohne Pause'}
                </span>
              ) : (
                <span className="text-xs text-[#141414]/30">frei</span>
              )}
            </div>
          );
        })}
      </div>

      <div className="p-6 pt-4 flex items-center gap-4 flex-wrap border-t border-[#141414]/5">
        <button
          onClick={save}
          disabled={busy}
          className="bg-brand-accent1 text-white text-sm font-bold px-5 py-2.5 rounded-xl disabled:opacity-60 cursor-pointer"
        >
          {busy ? 'Speichert …' : 'Speichern'}
        </button>

        <span className="text-xs text-[#141414]/50">
          {weekTotal.toLocaleString('de-DE')} Std. in der Woche
        </span>

        {saved && !busy && (
          <span className="flex items-center gap-1 text-xs font-bold text-emerald-600">
            <Check size={14} /> Gespeichert
          </span>
        )}
      </div>

      {error && (
        <p className="mx-6 mb-6 bg-red-50 text-red-700 text-sm p-3 rounded-xl border border-red-100">
          {error}
        </p>
      )}
    </div>
  );
}
