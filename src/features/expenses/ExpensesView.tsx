import { useCallback, useEffect, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import { ChevronDown, ChevronUp, Loader2, Plus } from 'lucide-react';
import {
  createExpenseReceipt,
  deleteExpenseReceipt,
  fetchExpenseReceipts,
  fetchExpenseSettlements,
  receiptPhotoPath,
  receiptPhotoUrls,
  updateExpenseReceipt,
  type ExpenseReceiptInput,
  type ExpenseReceiptRow,
} from '../../lib/data.ts';
import {
  discardPendingReceipt,
  pendingReceipts,
  queueReceipt,
  type PendingReceipt,
} from '../../lib/expense-queue.ts';
import { formatEuro, numberReceipts, payoutLabel, sumCents, toCents } from '../../lib/expenses.ts';
import type { Employee, ExpenseSettlement } from '../../lib/database.types.ts';
import ReceiptCard from './ReceiptCard.tsx';
import ReceiptForm, { type ReceiptFormResult } from './ReceiptForm.tsx';

type Mode = { type: 'list' } | { type: 'new' } | { type: 'edit'; id: string };

function inputFrom(result: ReceiptFormResult, id: string, employeeId: string): ExpenseReceiptInput {
  return {
    id,
    employeeId,
    receiptDate: result.receiptDate,
    vendor: result.vendor,
    category: result.category,
    vatMode: result.vatMode,
    grossCents: result.grossCents,
    vat7Cents: result.vat7Cents,
    vat19Cents: result.vat19Cents,
  };
}

/**
 * Der Reiter „Auslagen“: eigene Belege erfassen und sehen, was erstattet wird.
 *
 * Oben die offenen Belege mit ihrer laufenden Summe, darunter die
 * Abrechnungen des Büros. Admins erfassen hier ihre eigenen Belege genauso;
 * die Belege der ganzen Mannschaft stehen unter Verwaltung.
 */
export default function ExpensesView({
  currentUser,
  syncTick,
}: {
  currentUser: Employee;
  /** Zählt hoch, wenn der Puffer im Hintergrund Belege nachgereicht hat. */
  syncTick: number;
}) {
  const [receipts, setReceipts] = useState<ExpenseReceiptRow[]>([]);
  const [settlements, setSettlements] = useState<ExpenseSettlement[]>([]);
  const [pending, setPending] = useState<PendingReceipt[]>([]);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>({ type: 'list' });
  const [openSettlementId, setOpenSettlementId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    // Der Puffer liegt auf dem Gerät und ist auch ohne Netz lesbar.
    setPending((await pendingReceipts()).filter((p) => p.input.employeeId === currentUser.id));
    try {
      const [rows, closings] = await Promise.all([
        fetchExpenseReceipts({ employeeId: currentUser.id }),
        fetchExpenseSettlements(currentUser.id),
      ]);
      setReceipts(rows);
      setSettlements(closings);
      const openPaths = rows.filter((r) => !r.settlement_id).flatMap((r) => r.photo_paths);
      setPhotoUrls(await receiptPhotoUrls(openPaths));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [currentUser.id]);

  useEffect(() => {
    load();
  }, [load, syncTick]);

  const openReceipts = receipts.filter((r) => !r.settlement_id);
  const openCents =
    sumCents(openReceipts) + pending.reduce((sum, p) => sum + p.input.grossCents, 0);
  const openCount = openReceipts.length + pending.length;

  const handleCreate = async (result: ReceiptFormResult) => {
    const id = crypto.randomUUID();
    const input = inputFrom(result, id, currentUser.id);
    const photos = result.newPhotos.map((blob) => ({ path: receiptPhotoPath(currentUser.id, id), blob }));
    try {
      await createExpenseReceipt(input, photos);
    } catch (uploadError) {
      console.error('Beleg konnte nicht übertragen werden:', uploadError);
      try {
        await queueReceipt(input, photos);
      } catch (queueError) {
        // Weder oben noch auf dem Gerät — dann muss das Formular stehen bleiben.
        console.error('Beleg konnte nicht gepuffert werden:', queueError);
        throw new Error('Der Beleg konnte weder übertragen noch auf dem Handy gesichert werden. Bitte mit Netz erneut speichern.');
      }
      alert('Keine Verbindung. Der Beleg ist auf dem Handy gesichert und wird automatisch übertragen, sobald wieder Netz da ist.');
    }
    setMode({ type: 'list' });
    await load();
  };

  const handleUpdate = async (receipt: ExpenseReceiptRow, result: ReceiptFormResult) => {
    const input = inputFrom(result, receipt.id, receipt.employee_id);
    const photos = result.newPhotos.map((blob) => ({
      path: receiptPhotoPath(receipt.employee_id, receipt.id),
      blob,
    }));
    await updateExpenseReceipt(input, result.keptPaths, photos, result.removedPaths, currentUser.id);
    setMode({ type: 'list' });
    await load();
  };

  const handleDelete = async (receipt: ExpenseReceiptRow) => {
    if (!confirm(`Beleg „${receipt.vendor}“ über ${formatEuro(toCents(receipt.gross))} wirklich löschen?\n\nDie Fotos werden mit gelöscht.`)) {
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

  const handleDiscard = async (entry: PendingReceipt) => {
    if (!confirm(`Wartenden Beleg „${entry.input.vendor}“ verwerfen? Er wird dann nie übertragen.`)) return;
    await discardPendingReceipt(entry.id);
    await load();
  };

  const toggleSettlement = async (settlementId: string) => {
    if (openSettlementId === settlementId) {
      setOpenSettlementId(null);
      return;
    }
    setOpenSettlementId(settlementId);
    const paths = receipts.filter((r) => r.settlement_id === settlementId).flatMap((r) => r.photo_paths);
    try {
      const urls = await receiptPhotoUrls(paths.filter((p) => !photoUrls[p]));
      setPhotoUrls((prev) => ({ ...prev, ...urls }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-[#141414]/5 space-y-4">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold">Auslagen</h2>
          {loading && <Loader2 size={18} className="animate-spin text-brand-accent1" />}
        </div>
        <div className="flex flex-col md:flex-row md:items-center justify-between">
          <p className="text-sm text-[#141414]/50">
            Offen: {openCount} {openCount === 1 ? 'Beleg' : 'Belege'} · wird mit der nächsten Abrechnung erstattet
          </p>
          <p className="text-3xl font-bold text-brand-accent2">{formatEuro(openCents)}</p>
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-2xl p-4">{error}</p>
      )}

      {mode.type === 'new' ? (
        <ReceiptForm
          title="Neuer Beleg"
          submitLabel="Beleg speichern"
          onCancel={() => setMode({ type: 'list' })}
          onSubmit={handleCreate}
        />
      ) : (
        <button
          onClick={() => setMode({ type: 'new' })}
          className="w-full flex items-center justify-center gap-2 bg-brand-accent1 text-white p-4 rounded-2xl font-bold hover:bg-brand-accent1/90 transition-colors cursor-pointer"
        >
          <Plus size={18} /> Beleg erfassen
        </button>
      )}

      <section className="space-y-3">
        <h3 className="text-lg font-bold">Offene Belege</h3>

        {pending.map((entry) => (
          <ReceiptCard
            key={entry.id}
            state="pending"
            receipt={{
              receipt_date: entry.input.receiptDate,
              vendor: entry.input.vendor,
              category: entry.input.category,
              vat_mode: entry.input.vatMode,
              gross: entry.input.grossCents / 100,
              vat7: entry.input.vat7Cents / 100,
              vat19: entry.input.vat19Cents / 100,
              photo_paths: entry.photos.map((p) => p.path),
            }}
            onDelete={() => handleDiscard(entry)}
          />
        ))}

        {openReceipts.map((receipt) =>
          mode.type === 'edit' && mode.id === receipt.id ? (
            <ReceiptForm
              key={receipt.id}
              title="Beleg bearbeiten"
              submitLabel="Übernehmen"
              initial={receipt}
              photoUrls={photoUrls}
              onCancel={() => setMode({ type: 'list' })}
              onSubmit={(result) => handleUpdate(receipt, result)}
            />
          ) : (
            <ReceiptCard
              key={receipt.id}
              receipt={receipt}
              photoUrls={photoUrls}
              busy={busyId === receipt.id}
              onEdit={() => setMode({ type: 'edit', id: receipt.id })}
              onDelete={() => handleDelete(receipt)}
            />
          ),
        )}

        {!loading && openCount === 0 && (
          <div className="bg-white rounded-3xl border border-[#141414]/5 p-8 text-center text-[#141414]/30 text-sm">
            Keine offenen Belege.
          </div>
        )}
      </section>

      {settlements.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-lg font-bold">Abgerechnet</h3>
          <div className="bg-white rounded-3xl shadow-sm border border-[#141414]/5 overflow-hidden">
            {settlements.map((settlement) => {
              const open = openSettlementId === settlement.id;
              const settled = numberReceipts(receipts.filter((r) => r.settlement_id === settlement.id));
              return (
                <div key={settlement.id} className="border-b border-[#141414]/5 last:border-none">
                  <button
                    onClick={() => toggleSettlement(settlement.id)}
                    className="w-full p-4 flex items-center gap-3 text-left cursor-pointer hover:bg-gray-50"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-gray-900">
                        {format(parseISO(settlement.month), 'MMMM yyyy', { locale: de })}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {settled.length} {settled.length === 1 ? 'Beleg' : 'Belege'} · abgerechnet am{' '}
                        {format(parseISO(settlement.settled_on), 'dd.MM.yyyy')}
                      </p>
                    </div>
                    <span className="font-bold text-brand-accent2">{formatEuro(toCents(settlement.total))}</span>
                    {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>

                  {open && (
                    <div className="px-4 pb-4 space-y-3">
                      {settlement.payouts.length > 0 && (
                        <ul className="text-sm text-gray-700 bg-gray-50 rounded-xl p-3 space-y-1">
                          {settlement.payouts.map((payout, i) => (
                            <li key={i} className="flex justify-between gap-3">
                              <span>
                                {format(parseISO(payout.date), 'dd.MM.yyyy')} · {payoutLabel(payout.kind)}
                              </span>
                              <span className="font-medium whitespace-nowrap">
                                {formatEuro(toCents(payout.amount))}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                      {settled.map((receipt) => (
                        <ReceiptCard
                          key={receipt.id}
                          receipt={receipt}
                          number={receipt.number}
                          photoUrls={photoUrls}
                          state="locked"
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
