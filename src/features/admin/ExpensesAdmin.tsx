import { useCallback, useEffect, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import { ChevronDown, ChevronUp, Download, Loader2, Lock, Plus, Trash2, Unlock } from 'lucide-react';
import {
  closeExpenseSettlement,
  deleteExpenseReceipt,
  downloadReceiptPhoto,
  fetchExpenseReceipts,
  fetchExpenseSettlements,
  receiptPhotoPath,
  receiptPhotoUrls,
  reopenExpenseSettlement,
  updateExpenseReceipt,
  type ExpenseReceiptRow,
  type ExpenseSettlementRow,
} from '../../lib/data.ts';
import { blobToDataUrl, downloadExpensePdf } from '../../lib/expense-pdf.ts';
import {
  PAYOUT_KINDS,
  centsToInput,
  formatEuro,
  numberReceipts,
  parseEuro,
  sumCents,
  toCents,
} from '../../lib/expenses.ts';
import type { PayoutKind } from '../../lib/database.types.ts';
import ReceiptCard from '../expenses/ReceiptCard.tsx';
import ReceiptForm, { type ReceiptFormResult } from '../expenses/ReceiptForm.tsx';

interface EmployeeGroup {
  employeeId: string;
  name: string;
  lastName: string;
  receipts: ExpenseReceiptRow[];
}

interface PayoutLine {
  key: string;
  date: string;
  kind: PayoutKind;
  amount: string;
}

const inputClass = 'w-full p-2.5 bg-gray-100 rounded-xl border-none text-sm focus:outline-none focus:ring-2 focus:ring-brand-accent1/20';
const labelClass = 'text-[11px] font-semibold text-[#141414]/40 uppercase tracking-wider block mb-1';

function monthLabel(month: string): string {
  return format(parseISO(month), 'MMMM yyyy', { locale: de });
}

/**
 * Monatsabschluss für einen Mitarbeiter.
 *
 * Voreingestellt ist eine Überweisung über die ganze Summe; ein schon
 * gezahlter Vorschuss kommt als weitere Zeile dazu. Abgeschlossen werden kann
 * nur, wenn kein Rest bleibt — die Datenbank prüft das noch einmal.
 */
function SettlementDialog({
  group,
  closedMonths,
  onCancel,
  onDone,
}: {
  group: EmployeeGroup;
  /** yyyy-MM der Monate, die für diesen Mitarbeiter schon abgerechnet sind. */
  closedMonths: string[];
  onCancel: () => void;
  onDone: () => Promise<void>;
}) {
  const today = format(new Date(), 'yyyy-MM-dd');
  const totalCents = sumCents(group.receipts);
  const [month, setMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [settledOn, setSettledOn] = useState(today);
  const [lines, setLines] = useState<PayoutLine[]>([
    { key: crypto.randomUUID(), date: today, kind: 'ueberweisung', amount: centsToInput(totalCents) },
  ]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amounts = lines.map((line) => parseEuro(line.amount));
  const linesValid = lines.length > 0 && lines.every((line, i) => line.date && (amounts[i] ?? 0) > 0);
  const rest = totalCents - amounts.reduce<number>((sum, cents) => sum + (cents ?? 0), 0);
  const monthTaken = closedMonths.includes(month);
  const canClose = !!month && !!settledOn && linesValid && rest === 0 && !monthTaken && !busy;

  const update = (key: string, patch: Partial<PayoutLine>) =>
    setLines((prev) => prev.map((line) => (line.key === key ? { ...line, ...patch } : line)));

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await closeExpenseSettlement({
        employeeId: group.employeeId,
        month: `${month}-01`,
        settledOn,
        receiptIds: group.receipts.map((r) => r.id),
        payouts: lines.map((line, i) => ({ date: line.date, kind: line.kind, amount: (amounts[i] ?? 0) / 100 })),
      });
      await onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white p-6 rounded-3xl w-full max-w-lg max-h-[90vh] overflow-y-auto space-y-5">
        <div>
          <h3 className="font-bold text-lg">Monatsabschluss</h3>
          <p className="text-sm text-gray-500">{group.name}</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Abrechnungsmonat</label>
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Datum</label>
            <input type="date" value={settledOn} onChange={(e) => setSettledOn(e.target.value)} className={inputClass} />
          </div>
        </div>
        {monthTaken && (
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-xl p-2.5">
            Für {group.name} ist dieser Monat schon abgerechnet. Bitte einen anderen Monat wählen oder die
            bestehende Abrechnung zurücknehmen.
          </p>
        )}

        <div>
          <p className={labelClass}>Belege</p>
          <ul className="text-sm divide-y divide-gray-100 bg-gray-50 rounded-xl px-3">
            {numberReceipts(group.receipts).map((receipt) => (
              <li key={receipt.id} className="py-2 flex justify-between gap-3">
                <span className="min-w-0 truncate">
                  <span className="font-mono text-xs text-gray-500 mr-2">{receipt.number}</span>
                  {format(parseISO(receipt.receipt_date), 'dd.MM.')} · {receipt.vendor}
                </span>
                <span className="whitespace-nowrap">{formatEuro(toCents(receipt.gross))}</span>
              </li>
            ))}
            <li className="py-2 flex justify-between font-bold">
              <span>Summe</span>
              <span>{formatEuro(totalCents)}</span>
            </li>
          </ul>
        </div>

        <div className="space-y-2">
          <p className={labelClass}>Auszahlung</p>
          {lines.map((line, i) => (
            <div key={line.key} className="grid grid-cols-[1fr_1fr_6rem_auto] gap-2 items-center">
              <input
                type="date"
                value={line.date}
                onChange={(e) => update(line.key, { date: e.target.value })}
                className={inputClass}
                aria-label="Datum der Auszahlung"
              />
              <select
                value={line.kind}
                onChange={(e) => update(line.key, { kind: e.target.value as PayoutKind })}
                className={inputClass}
                aria-label="Art der Auszahlung"
              >
                {PAYOUT_KINDS.map(({ kind, label }) => (
                  <option key={kind} value={kind}>{label}</option>
                ))}
              </select>
              <input
                type="text"
                inputMode="decimal"
                value={line.amount}
                onChange={(e) => update(line.key, { amount: e.target.value })}
                placeholder="0,00"
                className={`${inputClass} text-right ${line.amount && amounts[i] === null ? 'ring-2 ring-red-300' : ''}`}
                aria-label="Betrag"
              />
              <button
                type="button"
                onClick={() => setLines((prev) => prev.filter((l) => l.key !== line.key))}
                disabled={lines.length === 1}
                className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl cursor-pointer disabled:opacity-30 disabled:cursor-default"
                title="Zeile entfernen"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              setLines((prev) => [
                ...prev,
                // Die neue Zeile übernimmt den Rest, damit das Büro nur noch aufteilt.
                { key: crypto.randomUUID(), date: today, kind: 'vorschuss', amount: rest > 0 ? centsToInput(rest) : '' },
              ])
            }
            className="flex items-center gap-1.5 text-sm font-bold text-brand-accent1 hover:underline cursor-pointer"
          >
            <Plus size={14} /> Zeile hinzufügen
          </button>
          <div
            className={`flex justify-between text-sm font-bold rounded-xl p-2.5 ${rest === 0 ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}
          >
            <span>Rest</span>
            <span>{formatEuro(rest)}</span>
          </div>
        </div>

        {error && (
          <p className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl p-3">{error}</p>
        )}

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            disabled={busy}
            className="flex-1 bg-gray-200 p-3 rounded-xl font-bold hover:bg-gray-300 transition-colors cursor-pointer disabled:opacity-60"
          >
            Abbrechen
          </button>
          <button
            onClick={submit}
            disabled={!canClose}
            className="flex-1 flex items-center justify-center gap-2 bg-brand-accent1 text-white p-3 rounded-xl font-bold hover:bg-brand-accent1/90 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-default"
          >
            {busy && <Loader2 size={16} className="animate-spin" />}
            Abschließen
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Auslagen im Büro: offene Belege je Mitarbeiter und die Abrechnungen.
 *
 * Aufgeführt wird nur, wer offene Belege hat — wie bei den Wochenberichten
 * gibt es keine Liste derer, die nichts eingereicht haben. Das Büro darf
 * offene Belege ändern und löschen, etwa wenn ein Betrag vertippt ist, und
 * schließt je Mitarbeiter einen Monat ab.
 */
export default function ExpensesAdmin({ currentUserId }: { currentUserId: string }) {
  const [receipts, setReceipts] = useState<ExpenseReceiptRow[]>([]);
  const [settlements, setSettlements] = useState<ExpenseSettlementRow[]>([]);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openEmployeeId, setOpenEmployeeId] = useState<string | null>(null);
  const [closingEmployeeId, setClosingEmployeeId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [open, closings] = await Promise.all([
        fetchExpenseReceipts({ openOnly: true }),
        fetchExpenseSettlements(),
      ]);
      setReceipts(open);
      setSettlements(closings);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const groups: EmployeeGroup[] = [];
  for (const receipt of receipts) {
    let group = groups.find((g) => g.employeeId === receipt.employee_id);
    if (!group) {
      group = {
        employeeId: receipt.employee_id,
        name: `${receipt.employees?.first_name ?? ''} ${receipt.employees?.last_name ?? ''}`.trim(),
        lastName: receipt.employees?.last_name ?? '',
        receipts: [],
      };
      groups.push(group);
    }
    group.receipts.push(receipt);
  }
  groups.sort((a, b) => a.lastName.localeCompare(b.lastName, 'de'));
  const closingGroup = groups.find((g) => g.employeeId === closingEmployeeId) ?? null;

  const sortedSettlements = [...settlements].sort((a, b) =>
    a.month === b.month
      ? (a.employees?.last_name ?? '').localeCompare(b.employees?.last_name ?? '', 'de')
      : b.month.localeCompare(a.month),
  );

  const loadPhotos = async (list: ExpenseReceiptRow[]) => {
    const missing = list.flatMap((r) => r.photo_paths).filter((p) => !photoUrls[p]);
    try {
      const urls = await receiptPhotoUrls(missing);
      setPhotoUrls((prev) => ({ ...prev, ...urls }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const toggle = (group: EmployeeGroup) => {
    if (openEmployeeId === group.employeeId) {
      setOpenEmployeeId(null);
      return;
    }
    setOpenEmployeeId(group.employeeId);
    setEditId(null);
    loadPhotos(group.receipts);
  };

  const handleUpdate = async (receipt: ExpenseReceiptRow, result: ReceiptFormResult) => {
    const photos = result.newPhotos.map((blob) => ({
      path: receiptPhotoPath(receipt.employee_id, receipt.id),
      blob,
    }));
    await updateExpenseReceipt(
      {
        id: receipt.id,
        employeeId: receipt.employee_id,
        receiptDate: result.receiptDate,
        vendor: result.vendor,
        category: result.category,
        vatMode: result.vatMode,
        grossCents: result.grossCents,
        vat7Cents: result.vat7Cents,
        vat19Cents: result.vat19Cents,
        entertainmentGuests: result.entertainmentGuests,
        entertainmentOccasion: result.entertainmentOccasion,
        entertainmentSignature: result.entertainmentSignature,
      },
      result.keptPaths,
      photos,
      result.removedPaths,
      currentUserId,
    );
    setEditId(null);
    await load();
    // Neue Fotos brauchen eigene Adressen.
    if (photos.length > 0) {
      const urls = await receiptPhotoUrls(photos.map((p) => p.path)).catch(() => ({}));
      setPhotoUrls((prev) => ({ ...prev, ...urls }));
    }
  };

  const handleDelete = async (receipt: ExpenseReceiptRow) => {
    const name = `${receipt.employees?.first_name ?? ''} ${receipt.employees?.last_name ?? ''}`.trim();
    if (
      !confirm(
        `Beleg „${receipt.vendor}“ über ${formatEuro(toCents(receipt.gross))} von ${name} wirklich löschen?\n\n` +
          'Die Fotos werden mit gelöscht.',
      )
    ) {
      return;
    }
    setBusyId(receipt.id);
    setError(null);
    try {
      await deleteExpenseReceipt(receipt);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  };

  const downloadPdf = async (settlement: ExpenseSettlementRow) => {
    setBusyId(settlement.id);
    setError(null);
    try {
      const settled = await fetchExpenseReceipts({ settlementId: settlement.id });
      const photos: Record<string, string> = {};
      for (const path of settled.flatMap((r) => r.photo_paths)) {
        try {
          photos[path] = await blobToDataUrl(await downloadReceiptPhoto(path));
        } catch (photoError) {
          // Das PDF entsteht trotzdem und vermerkt das fehlende Foto.
          console.error(photoError);
        }
      }
      await downloadExpensePdf({
        firstName: settlement.employees?.first_name ?? '',
        lastName: settlement.employees?.last_name ?? '',
        settlement,
        receipts: settled,
        photos,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  };

  const reopen = async (settlement: ExpenseSettlementRow) => {
    const name = `${settlement.employees?.first_name ?? ''} ${settlement.employees?.last_name ?? ''}`.trim();
    if (
      !confirm(
        `Abrechnung ${monthLabel(settlement.month)} von ${name} zurücknehmen?\n\n` +
          'Die Belege sind danach wieder offen und lassen sich ändern. Die Abrechnung verschwindet; ' +
          'der Monat kann neu abgeschlossen werden.',
      )
    ) {
      return;
    }
    setBusyId(settlement.id);
    setError(null);
    try {
      await reopenExpenseSettlement(settlement.id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="space-y-4">
      <h3 className="text-lg font-bold flex items-center gap-2">
        Auslagen
        {loading && <Loader2 size={16} className="animate-spin text-brand-accent1" />}
      </h3>

      {error && (
        <p className="text-sm text-red-600 bg-red-50/60 border border-red-100 rounded-xl p-3">{error}</p>
      )}

      <div className="bg-white rounded-3xl shadow-sm border border-[#141414]/5 overflow-hidden">
        {groups.map((group) => {
          const open = openEmployeeId === group.employeeId;
          return (
            <div key={group.employeeId} className="border-b border-[#141414]/5 last:border-none">
              <div className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                <button
                  onClick={() => toggle(group)}
                  className="flex-1 min-w-0 flex items-center gap-3 text-left cursor-pointer"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-gray-900 truncate">{group.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {group.receipts.length} {group.receipts.length === 1 ? 'offener Beleg' : 'offene Belege'}
                    </p>
                  </div>
                  <span className="font-bold text-brand-accent2 whitespace-nowrap">
                    {formatEuro(sumCents(group.receipts))}
                  </span>
                  {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>
                <button
                  onClick={() => setClosingEmployeeId(group.employeeId)}
                  className="flex items-center justify-center gap-1.5 bg-brand-accent1 text-white px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-brand-accent1/90 cursor-pointer shrink-0"
                >
                  <Lock size={16} /> Monatsabschluss
                </button>
              </div>

              {open && (
                <div className="px-4 pb-4 space-y-3">
                  {group.receipts.map((receipt) =>
                    editId === receipt.id ? (
                      <ReceiptForm
                        key={receipt.id}
                        title="Beleg bearbeiten"
                        submitLabel="Übernehmen"
                        initial={receipt}
                        photoUrls={photoUrls}
                        canSign={receipt.employee_id === currentUserId}
                        onCancel={() => setEditId(null)}
                        onSubmit={(result) => handleUpdate(receipt, result)}
                      />
                    ) : (
                      <ReceiptCard
                        key={receipt.id}
                        receipt={receipt}
                        photoUrls={photoUrls}
                        busy={busyId === receipt.id}
                        onEdit={() => setEditId(receipt.id)}
                        onDelete={() => handleDelete(receipt)}
                      />
                    ),
                  )}
                </div>
              )}
            </div>
          );
        })}

        {!loading && groups.length === 0 && (
          <div className="p-8 text-center text-[#141414]/30 text-sm">Keine offenen Belege.</div>
        )}
      </div>

      {sortedSettlements.length > 0 && (
        <>
          <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wider pt-2">Abrechnungen</h4>
          <div className="bg-white rounded-3xl shadow-sm border border-[#141414]/5 overflow-hidden">
            {sortedSettlements.map((settlement) => (
              <div
                key={settlement.id}
                className="p-4 flex flex-col sm:flex-row sm:items-center gap-3 border-b border-[#141414]/5 last:border-none"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-gray-900 truncate">
                    {settlement.employees?.first_name} {settlement.employees?.last_name} · {monthLabel(settlement.month)}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {formatEuro(toCents(settlement.total))} · abgerechnet am{' '}
                    {format(parseISO(settlement.settled_on), 'dd.MM.yyyy')}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => downloadPdf(settlement)}
                    disabled={busyId === settlement.id}
                    className="flex items-center gap-1.5 bg-brand-accent1 text-white px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-brand-accent1/90 disabled:opacity-60 cursor-pointer"
                  >
                    {busyId === settlement.id ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />} PDF
                  </button>
                  <button
                    onClick={() => reopen(settlement)}
                    disabled={busyId === settlement.id}
                    className="flex items-center gap-1.5 bg-gray-100 text-gray-700 px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-gray-200 disabled:opacity-60 cursor-pointer"
                    title="Abrechnung zurücknehmen"
                  >
                    <Unlock size={16} /> Zurücknehmen
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {closingGroup && (
        <SettlementDialog
          group={closingGroup}
          closedMonths={settlements
            .filter((s) => s.employee_id === closingGroup.employeeId)
            .map((s) => s.month.slice(0, 7))}
          onCancel={() => setClosingEmployeeId(null)}
          onDone={async () => {
            setClosingEmployeeId(null);
            setOpenEmployeeId(null);
            await load();
          }}
        />
      )}
    </section>
  );
}
