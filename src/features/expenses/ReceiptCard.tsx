import { format, parseISO } from 'date-fns';
import { CloudOff, Lock, Pencil, Trash2 } from 'lucide-react';
import { formatEuro, toCents } from '../../lib/expenses.ts';
import type { VatMode } from '../../lib/database.types.ts';

/** Die Angaben, die eine Belegkarte braucht — gespeichert oder aus dem Puffer. */
export interface ReceiptCardData {
  receipt_date: string;
  vendor: string;
  category: string;
  vat_mode: VatMode;
  gross: number | string;
  vat7: number | string;
  vat19: number | string;
  photo_paths: string[];
  entertainment_guests?: string | null;
  entertainment_occasion?: string | null;
}

function vatText(receipt: ReceiptCardData): string {
  const parts: string[] = [];
  if (toCents(receipt.vat7) > 0) parts.push(`7 %: ${formatEuro(toCents(receipt.vat7))}`);
  if (toCents(receipt.vat19) > 0) parts.push(`19 %: ${formatEuro(toCents(receipt.vat19))}`);
  return parts.length > 0 ? `MwSt ${parts.join(' · ')}` : 'ohne MwSt';
}

/**
 * Ein Beleg in einer Liste. Stift und Mülleimer erscheinen nur, wenn ihre
 * Aktion übergeben wird — ein abgerechneter oder gepufferter Beleg zeigt
 * stattdessen, warum er sich nicht ändern lässt.
 */
export default function ReceiptCard({
  receipt,
  number,
  photoUrls = {},
  state = 'open',
  busy = false,
  onEdit,
  onDelete,
}: {
  receipt: ReceiptCardData;
  number?: number;
  photoUrls?: Record<string, string>;
  state?: 'open' | 'locked' | 'pending';
  busy?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  return (
    <div className="relative p-3.5 bg-gray-50 rounded-2xl border border-gray-100 flex flex-col gap-1.5">
      {(onEdit || onDelete) && (
        <div className="absolute top-2.5 right-2.5 flex items-center gap-1">
          {onEdit && (
            <button
              onClick={onEdit}
              disabled={busy}
              className="text-gray-400 hover:text-brand-accent2 hover:bg-gray-100 p-1.5 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
              title="Beleg bearbeiten"
            >
              <Pencil className="w-4 h-4" />
            </button>
          )}
          {onDelete && (
            <button
              onClick={onDelete}
              disabled={busy}
              className="text-gray-400 hover:text-red-500 hover:bg-gray-100 p-1.5 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
              title={state === 'pending' ? 'Wartenden Beleg verwerfen' : 'Beleg löschen'}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      <div className="text-xs font-bold text-gray-500">
        {number !== undefined && <span className="font-mono mr-2">Nr. {number}</span>}
        {format(parseISO(receipt.receipt_date), 'dd.MM.yyyy')} · {receipt.category}
      </div>

      <div className="flex items-baseline justify-between gap-3 pr-16">
        <p className="text-[#141414] font-medium text-sm leading-snug">{receipt.vendor}</p>
      </div>
      {(receipt.entertainment_guests || receipt.entertainment_occasion) && (
        <div className="bg-white/60 p-2.5 rounded-xl border border-gray-100 text-xs text-gray-600 space-y-0.5">
          {receipt.entertainment_occasion && <p>Anlass: {receipt.entertainment_occasion}</p>}
          {receipt.entertainment_guests && (
            <p className="whitespace-pre-wrap">Personen: {receipt.entertainment_guests}</p>
          )}
        </div>
      )}
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[11px] text-gray-500 font-medium">{vatText(receipt)}</p>
        <p className="text-brand-accent2 font-bold text-sm whitespace-nowrap">
          {formatEuro(toCents(receipt.gross))}
        </p>
      </div>

      {receipt.photo_paths.some((path) => photoUrls[path]) && (
        <div className="flex flex-wrap gap-1.5 mt-1">
          {receipt.photo_paths.map((path) =>
            photoUrls[path] ? (
              <a
                key={path}
                href={photoUrls[path]}
                target="_blank"
                rel="noopener noreferrer"
                className="w-14 h-14 rounded-lg overflow-hidden border border-gray-200 block"
                title="Foto groß öffnen"
              >
                <img src={photoUrls[path]} alt="Beleg" className="w-full h-full object-cover" />
              </a>
            ) : null,
          )}
        </div>
      )}

      {state === 'pending' && (
        <div className="flex items-center gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-xl p-2.5 mt-1">
          <CloudOff className="w-3.5 h-3.5 shrink-0" />
          Wartet auf Netz · {receipt.photo_paths.length} {receipt.photo_paths.length === 1 ? 'Foto' : 'Fotos'}
        </div>
      )}
      {state === 'locked' && (
        <div className="flex items-center gap-2 text-xs text-gray-400 mt-1">
          <Lock className="w-3.5 h-3.5 shrink-0" />
          Abgerechnet — gesperrt.
        </div>
      )}
    </div>
  );
}
