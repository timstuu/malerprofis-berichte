import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import {
  deleteExpenseReceipt,
  fetchExpenseReceipts,
  receiptPhotoPath,
  receiptPhotoUrls,
  updateExpenseReceipt,
  type ExpenseReceiptRow,
} from '../../lib/data.ts';
import { formatEuro, sumCents, toCents } from '../../lib/expenses.ts';
import ReceiptCard from '../expenses/ReceiptCard.tsx';
import ReceiptForm, { type ReceiptFormResult } from '../expenses/ReceiptForm.tsx';

interface EmployeeGroup {
  employeeId: string;
  name: string;
  lastName: string;
  receipts: ExpenseReceiptRow[];
}

/**
 * Die offenen Belege der ganzen Mannschaft.
 *
 * Aufgeführt wird nur, wer offene Belege hat — wie bei den Wochenberichten
 * gibt es keine Liste derer, die nichts eingereicht haben. Das Büro darf
 * offene Belege ändern und löschen, etwa wenn ein Betrag vertippt ist.
 */
export default function ExpensesAdmin({ currentUserId }: { currentUserId: string }) {
  const [receipts, setReceipts] = useState<ExpenseReceiptRow[]>([]);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openEmployeeId, setOpenEmployeeId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setReceipts(await fetchExpenseReceipts({ openOnly: true }));
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

  return (
    <section className="space-y-4">
      <h3 className="text-lg font-bold flex items-center gap-2">
        Auslagen
        {loading && <Loader2 size={16} className="animate-spin text-brand-accent1" />}
      </h3>

      <div className="bg-white rounded-3xl shadow-sm border border-[#141414]/5 overflow-hidden">
        {error && (
          <p className="m-4 text-sm text-red-600 bg-red-50/60 border border-red-100 rounded-xl p-3">{error}</p>
        )}

        {groups.map((group) => {
          const open = openEmployeeId === group.employeeId;
          return (
            <div key={group.employeeId} className="border-b border-[#141414]/5 last:border-none">
              <button
                onClick={() => toggle(group)}
                className="w-full p-4 flex items-center gap-3 text-left cursor-pointer hover:bg-gray-50"
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
    </section>
  );
}
