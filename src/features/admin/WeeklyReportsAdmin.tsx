import { useCallback, useEffect, useState } from 'react';
import { addDays, addWeeks, format, startOfISOWeek, subWeeks } from 'date-fns';
import { de } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Download, Loader2, Unlock } from 'lucide-react';
import {
  fetchSubmittedReports,
  reopenWeeklyReport,
  type SubmittedReport,
} from '../../lib/data.ts';
import { downloadWeeklyReportPdf } from '../../lib/report-pdf.ts';

/**
 * Die abgegebenen Wochenberichte einer Woche.
 *
 * Das Büro blättert wie in der Planung durch die Wochen und lädt sich jeden
 * Bericht einzeln als PDF. Entwürfe stehen bewusst nicht in der Liste: Zu
 * beurteilen ist nur, was der Maler unterschrieben abgegeben hat.
 */
export default function WeeklyReportsAdmin() {
  const [weekStart, setWeekStart] = useState(() => startOfISOWeek(new Date()));
  const [reports, setReports] = useState<SubmittedReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** Id des Berichts, an dem gerade gearbeitet wird — sperrt nur dessen Knöpfe. */
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchSubmittedReports(weekStart);
      // Nach Nachname sortiert, damit die Liste von Woche zu Woche gleich
      // aussieht und niemand suchen muss.
      rows.sort((a, b) =>
        (a.employees?.last_name ?? '').localeCompare(b.employees?.last_name ?? '', 'de'),
      );
      setReports(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [weekStart]);

  useEffect(() => {
    load();
  }, [load]);

  const totalHours = (report: SubmittedReport) =>
    Math.round(report.report_entries.reduce((sum, e) => sum + Number(e.hours), 0) * 100) / 100;

  const download = async (report: SubmittedReport) => {
    setBusyId(report.id);
    setError(null);
    try {
      await downloadWeeklyReportPdf({
        firstName: report.employees?.first_name ?? '',
        lastName: report.employees?.last_name ?? '',
        weekStart,
        signature: report.signature,
        entries: report.report_entries.map((e) => ({
          date: e.date,
          // Der Klartext steht in der Berichtszeile selbst; der Verweis auf den
          // Baustellenstamm greift nur bei älteren Zeilen.
          siteNumber: e.site_number ?? e.sites?.number ?? '',
          siteAddress: e.site_address ?? e.sites?.address ?? '',
          description: e.description ?? '',
          startTime: e.start_time?.slice(0, 5) ?? '',
          endTime: e.end_time?.slice(0, 5) ?? '',
          breakMinutes: e.break_minutes,
          hours: Number(e.hours),
        })),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  };

  const reopen = async (report: SubmittedReport) => {
    const name = `${report.employees?.first_name ?? ''} ${report.employees?.last_name ?? ''}`.trim();
    if (
      !confirm(
        `Bericht von ${name} zur Korrektur freigeben?\n\n` +
          'Der Bericht verschwindet aus dieser Liste und ist für den Mitarbeiter wieder ' +
          'bearbeitbar. Die Unterschrift wird dabei verworfen — er muss neu unterschreiben ' +
          'und neu abgeben.',
      )
    ) {
      return;
    }
    setBusyId(report.id);
    setError(null);
    try {
      await reopenWeeklyReport(report.id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="space-y-4">
      <h3 className="text-lg font-bold">Wochenberichte</h3>

      {/* Dieselbe Wochenauswahl wie im Wochenplan: linksbündig über der Liste
          statt als eigene Kopfzeile in der Karte. */}
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
          {format(addDays(weekStart, 6), 'dd.MM.yyyy')}
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

      <div className="bg-white rounded-3xl shadow-sm border border-[#141414]/5 overflow-hidden">
        {error && (
          <p className="m-4 text-sm text-red-600 bg-red-50/60 border border-red-100 rounded-xl p-3">
            {error}
          </p>
        )}

        {reports.map((report) => (
          <div
            key={report.id}
            className="p-4 flex flex-col sm:flex-row sm:items-center gap-3 border-b border-[#141414]/5 last:border-none"
          >
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm text-gray-900 truncate">
                {report.employees?.first_name} {report.employees?.last_name}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                {totalHours(report)} Std.
                {report.submitted_at &&
                  ` · abgegeben am ${format(new Date(report.submitted_at), 'dd.MM.yyyy HH:mm')}`}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => download(report)}
                disabled={busyId === report.id}
                className="flex items-center gap-1.5 bg-brand-accent1 text-white px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-brand-accent1/90 disabled:opacity-60 cursor-pointer"
              >
                <Download size={16} /> PDF
              </button>
              <button
                onClick={() => reopen(report)}
                disabled={busyId === report.id}
                className="flex items-center gap-1.5 bg-gray-100 text-gray-700 px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-gray-200 disabled:opacity-60 cursor-pointer"
                title="Zur Korrektur freigeben"
              >
                <Unlock size={16} /> Entsperren
              </button>
            </div>
          </div>
        ))}

        {!loading && reports.length === 0 && (
          <div className="p-8 text-center text-[#141414]/30 text-sm">
            Für diese Woche liegt noch kein abgegebener Bericht vor.
          </div>
        )}
      </div>
    </section>
  );
}
