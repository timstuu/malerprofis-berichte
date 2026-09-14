import React, { useRef, useState } from 'react';
import { format } from 'date-fns';
import { Camera, Loader2, RotateCcw, X } from 'lucide-react';
import SignatureCanvas from 'react-signature-canvas';
import { shrinkPhoto } from '../../lib/abnahme.ts';
import {
  CATEGORY_SUGGESTIONS,
  COMPANY_INVOICE_HINT,
  VAT_MODES,
  centsToInput,
  formatEuro,
  isEntertainment,
  needsCompanyInvoice,
  parseEuro,
  receiptVat,
  toCents,
  validateReceipt,
} from '../../lib/expenses.ts';
import type { ExpenseReceipt, VatMode } from '../../lib/database.types.ts';

/** Was das Formular beim Speichern herausgibt. */
export interface ReceiptFormResult {
  receiptDate: string;
  vendor: string;
  category: string;
  vatMode: VatMode;
  grossCents: number;
  vat7Cents: number;
  vat19Cents: number;
  /** Nur bei Bewirtung, sonst null. */
  entertainmentGuests: string | null;
  entertainmentOccasion: string | null;
  entertainmentSignature: string | null;
  /** Bereits hochgeladene Fotos, die bleiben. */
  keptPaths: string[];
  /** Neu aufgenommene Fotos, schon verkleinert. */
  newPhotos: Blob[];
  /** Bereits hochgeladene Fotos, die entfernt wurden. */
  removedPaths: string[];
}

interface NewPhoto {
  key: string;
  dataUrl: string;
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('Foto konnte nicht gelesen werden'));
    reader.readAsDataURL(file);
  });
}

const inputClass = 'w-full p-3 bg-gray-100 rounded-xl border-none text-sm focus:outline-none focus:ring-2 focus:ring-brand-accent1/20';
const labelClass = 'text-[11px] font-semibold text-[#141414]/40 uppercase tracking-wider block mb-1';
/**
 * Safari am iPhone gibt Datumsfeldern eine eigene Mindestbreite und ignoriert
 * `w-full` — ohne Eigen-Darstellung passt sich das Feld den anderen an.
 */
export const dateInputClass = 'appearance-none min-w-0 [&::-webkit-date-and-time-value]:text-left';

/**
 * Anlegen und Bearbeiten eines Belegs — für den Maler wie fürs Büro.
 *
 * Die Felder folgen der Excel-Vorlage: Datum, Name/Ort, Art, Brutto und die
 * Mehrwertsteuer. Bei einem einzelnen Satz rechnet die App die Steuer selbst,
 * bei „7 % + 19 %“ werden beide Beträge vom Beleg abgetippt, weil sich die
 * Aufteilung aus dem Brutto nicht ergibt.
 *
 * Bei der Art „Bewirtung“ kommen die Angaben des bisherigen Papierformulars
 * dazu: bewirtete Personen, Anlass und die Unterschrift des Mitarbeiters.
 *
 * Wirft `onSubmit` einen Fehler, bleibt das Formular mit allen Eingaben
 * stehen und zeigt die Meldung.
 */
export default function ReceiptForm({
  initial,
  photoUrls = {},
  canSign = true,
  title,
  submitLabel,
  onCancel,
  onSubmit,
}: {
  initial?: ExpenseReceipt;
  /** Signierte Adressen der bereits gespeicherten Fotos. */
  photoUrls?: Record<string, string>;
  /**
   * Darf hier unterschrieben werden? Nur der Mitarbeiter selbst — bearbeitet
   * das Büro einen fremden Beleg, bleibt dessen Unterschrift, wie sie ist.
   */
  canSign?: boolean;
  title: string;
  submitLabel: string;
  onCancel: () => void;
  onSubmit: (result: ReceiptFormResult) => Promise<void>;
}) {
  const today = format(new Date(), 'yyyy-MM-dd');
  const [receiptDate, setReceiptDate] = useState(initial?.receipt_date ?? today);
  const [vendor, setVendor] = useState(initial?.vendor ?? '');
  const [category, setCategory] = useState(initial?.category ?? '');
  const [vatMode, setVatMode] = useState<VatMode>(initial?.vat_mode ?? '19');
  const [gross, setGross] = useState(initial ? centsToInput(toCents(initial.gross)) : '');
  const [vat7, setVat7] = useState(initial?.vat_mode === 'mixed' ? centsToInput(toCents(initial.vat7)) : '');
  const [vat19, setVat19] = useState(initial?.vat_mode === 'mixed' ? centsToInput(toCents(initial.vat19)) : '');
  const [guests, setGuests] = useState(initial?.entertainment_guests ?? '');
  const [occasion, setOccasion] = useState(initial?.entertainment_occasion ?? '');
  /** Die schon gespeicherte Unterschrift, solange niemand neu unterschreibt. */
  const [keptSignature, setKeptSignature] = useState<string | null>(initial?.entertainment_signature ?? null);
  const [drawnSignature, setDrawnSignature] = useState<string | null>(null);
  const sigCanvas = useRef<SignatureCanvas>(null);
  const [keptPaths, setKeptPaths] = useState<string[]>(initial?.photo_paths ?? []);
  const [newPhotos, setNewPhotos] = useState<NewPhoto[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);

  const grossCents = parseEuro(gross);
  const computedVat =
    grossCents && (vatMode === '7' || vatMode === '19') ? receiptVat(vatMode, grossCents, 0, 0) : null;
  const entertainment = isEntertainment(category);
  const signature = keptSignature ?? drawnSignature;

  const addPhotos = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    // Zurücksetzen, damit dasselbe Foto nach dem Entfernen erneut wählbar ist.
    event.target.value = '';
    if (files.length === 0) return;
    setPhotoBusy(true);
    try {
      const added: NewPhoto[] = [];
      for (const file of files) {
        // Gleich beim Aufnehmen verkleinern: Ein volles Kamerabild geht über
        // eine schwache Verbindung kaum hoch und bläht später das PDF auf.
        const small = await shrinkPhoto(await readAsDataUrl(file));
        added.push({ key: crypto.randomUUID(), dataUrl: small });
      }
      setNewPhotos((prev) => [...prev, ...added]);
    } catch (error) {
      setErrors([error instanceof Error ? error.message : String(error)]);
    } finally {
      setPhotoBusy(false);
    }
  };

  const clearSignature = () => {
    sigCanvas.current?.clear();
    setDrawnSignature(null);
  };

  const submit = async () => {
    const vat7Cents = parseEuro(vat7);
    const vat19Cents = parseEuro(vat19);
    const problems = validateReceipt(
      {
        receiptDate,
        vendor,
        category,
        vatMode,
        grossCents,
        vat7Cents,
        vat19Cents,
        photoCount: keptPaths.length + newPhotos.length,
        entertainmentGuests: guests,
        entertainmentOccasion: occasion,
        hasSignature: !!signature,
      },
      today,
    );
    setErrors(problems);
    if (problems.length > 0 || grossCents === null) return;

    const vat = receiptVat(vatMode, grossCents, vat7Cents ?? 0, vat19Cents ?? 0);
    setBusy(true);
    try {
      const blobs = await Promise.all(newPhotos.map(async (p) => (await fetch(p.dataUrl)).blob()));
      await onSubmit({
        receiptDate,
        vendor: vendor.trim(),
        category: category.trim(),
        vatMode,
        grossCents,
        vat7Cents: vat.vat7,
        vat19Cents: vat.vat19,
        // Wird die Art von Bewirtung auf etwas anderes geändert, fallen die
        // Angaben weg, statt unsichtbar am Beleg hängen zu bleiben.
        entertainmentGuests: entertainment ? guests.trim() : null,
        entertainmentOccasion: entertainment ? occasion.trim() : null,
        entertainmentSignature: entertainment ? signature : null,
        keptPaths,
        newPhotos: blobs,
        removedPaths: (initial?.photo_paths ?? []).filter((p) => !keptPaths.includes(p)),
      });
    } catch (error) {
      setErrors([error instanceof Error ? error.message : String(error)]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-white p-5 rounded-3xl shadow-sm border border-brand-accent1/30 space-y-4">
      <h3 className="font-bold text-lg">{title}</h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Datum des Belegs</label>
          <input
            type="date"
            value={receiptDate}
            max={today}
            onChange={(e) => setReceiptDate(e.target.value)}
            className={`${inputClass} ${dateInputClass}`}
          />
        </div>
        <div>
          <label className={labelClass}>Name / Ort</label>
          <input
            type="text"
            value={vendor}
            onChange={(e) => setVendor(e.target.value)}
            placeholder="z. B. REWE Hamburg"
            className={inputClass}
          />
        </div>
      </div>

      <div>
        <label className={labelClass}>Art</label>
        <input
          type="text"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="Antippen oder selbst eintragen"
          className={inputClass}
        />
        <div className="flex flex-wrap gap-1.5 mt-2">
          {CATEGORY_SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => setCategory(suggestion)}
              className={
                category === suggestion
                  ? 'px-3 py-1.5 rounded-full text-xs font-bold bg-brand-accent1 text-white cursor-pointer'
                  : 'px-3 py-1.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 cursor-pointer'
              }
            >
              {suggestion}
            </button>
          ))}
        </div>
      </div>

      {entertainment && (
        <div className="space-y-3 bg-brand-accent1/5 border border-brand-accent1/15 rounded-2xl p-4">
          <p className="text-sm font-bold text-[#141414]">Angaben zur Bewirtung</p>
          <div>
            <label className={labelClass}>Bewirtete Personen</label>
            <textarea
              value={guests}
              onChange={(e) => setGuests(e.target.value)}
              placeholder="Namen aller Teilnehmer, auch dein eigener"
              className={`${inputClass} h-20 bg-white`}
            />
          </div>
          <div>
            <label className={labelClass}>Anlass der Bewirtung</label>
            <input
              type="text"
              value={occasion}
              onChange={(e) => setOccasion(e.target.value)}
              placeholder="z. B. Baubesprechung mit Kunde"
              className={`${inputClass} bg-white`}
            />
          </div>
          <div>
            <label className={labelClass}>Unterschrift des Mitarbeiters</label>
            {keptSignature ? (
              <div className="flex items-end gap-3">
                <img
                  src={keptSignature}
                  alt="Unterschrift"
                  className="h-20 bg-white border border-gray-200 rounded-xl"
                />
                {canSign && (
                  <button
                    type="button"
                    onClick={() => setKeptSignature(null)}
                    className="text-xs font-bold text-brand-accent1 hover:underline cursor-pointer"
                  >
                    Neu unterschreiben
                  </button>
                )}
              </div>
            ) : canSign ? (
              <div className="relative border rounded-xl overflow-hidden bg-white">
                <SignatureCanvas
                  ref={sigCanvas}
                  canvasProps={{ className: 'w-full h-36 cursor-crosshair' }}
                  onEnd={() => setDrawnSignature(sigCanvas.current?.getCanvas().toDataURL('image/png') ?? null)}
                />
                <button
                  type="button"
                  onClick={clearSignature}
                  className="absolute top-2 right-2 bg-white/80 hover:bg-white text-gray-600 hover:text-red-500 p-2 rounded-xl shadow-sm border border-[#141414]/5 cursor-pointer"
                  title="Unterschrift zurücksetzen"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-xl p-2.5">
                Die Unterschrift kann nur der Mitarbeiter selbst leisten. Er muss den Beleg dafür
                in seinem Reiter „Auslagen“ bearbeiten.
              </p>
            )}
          </div>
        </div>
      )}

      <div>
        <label className={labelClass}>Brutto gesamt (€)</label>
        <input
          type="text"
          inputMode="decimal"
          value={gross}
          onChange={(e) => setGross(e.target.value)}
          placeholder="z. B. 34,99"
          className={inputClass}
        />
        {needsCompanyInvoice(grossCents) && (
          <p className="text-xs font-medium text-amber-800 bg-amber-50 border border-amber-100 rounded-xl p-2.5 mt-2">
            {COMPANY_INVOICE_HINT}
          </p>
        )}
      </div>

      <div>
        <label className={labelClass}>Mehrwertsteuer</label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {VAT_MODES.map(({ mode, label }) => (
            <button
              key={mode}
              type="button"
              onClick={() => setVatMode(mode)}
              className={
                vatMode === mode
                  ? 'p-2.5 rounded-xl text-sm font-bold bg-brand-accent1 text-white cursor-pointer'
                  : 'p-2.5 rounded-xl text-sm font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 cursor-pointer'
              }
            >
              {label}
            </button>
          ))}
        </div>

        {vatMode === 'mixed' ? (
          <div className="grid grid-cols-2 gap-2 mt-2">
            <div>
              <label className={labelClass}>Steuer 7 % (€)</label>
              <input
                type="text"
                inputMode="decimal"
                value={vat7}
                onChange={(e) => setVat7(e.target.value)}
                placeholder="vom Beleg"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Steuer 19 % (€)</label>
              <input
                type="text"
                inputMode="decimal"
                value={vat19}
                onChange={(e) => setVat19(e.target.value)}
                placeholder="vom Beleg"
                className={inputClass}
              />
            </div>
          </div>
        ) : (
          computedVat && (
            <p className="text-[11px] text-gray-500 mt-1.5 px-0.5">
              enthält {formatEuro(computedVat.vat7 + computedVat.vat19)} MwSt
            </p>
          )
        )}
      </div>

      <div>
        <label className={labelClass}>Fotos vom Beleg</label>
        <div className="flex flex-wrap gap-2">
          {keptPaths.map((path) => (
            <div key={path} className="relative w-20 h-20 rounded-lg overflow-hidden border border-gray-200 bg-gray-50">
              {photoUrls[path] && <img src={photoUrls[path]} alt="Beleg" className="w-full h-full object-cover" />}
              <button
                type="button"
                onClick={() => setKeptPaths((prev) => prev.filter((p) => p !== path))}
                className="absolute top-1 right-1 bg-black/60 hover:bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center cursor-pointer"
                title="Foto entfernen"
              >
                <X size={12} />
              </button>
            </div>
          ))}
          {newPhotos.map((photo) => (
            <div key={photo.key} className="relative w-20 h-20 rounded-lg overflow-hidden border border-gray-200">
              <img src={photo.dataUrl} alt="Beleg" className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => setNewPhotos((prev) => prev.filter((p) => p.key !== photo.key))}
                className="absolute top-1 right-1 bg-black/60 hover:bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center cursor-pointer"
                title="Foto entfernen"
              >
                <X size={12} />
              </button>
            </div>
          ))}
          {/* Ohne `capture`: So bietet das Handy Kamera und Galerie an —
              ein schon fotografierter Beleg muss nicht neu aufgenommen werden. */}
          <label className="w-20 h-20 rounded-lg border-2 border-dashed border-gray-300 hover:border-brand-accent1 text-gray-400 hover:text-brand-accent1 flex flex-col items-center justify-center gap-1 cursor-pointer text-[10px] font-bold">
            {photoBusy ? <Loader2 size={18} className="animate-spin" /> : <Camera size={18} />}
            Foto
            <input type="file" accept="image/*" multiple className="hidden" onChange={addPhotos} />
          </label>
        </div>
      </div>

      {errors.length > 0 && (
        <ul className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl p-3 space-y-1">
          {errors.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      )}

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="flex-1 bg-gray-200 text-[#141414] p-3 rounded-xl font-bold hover:bg-gray-300 disabled:opacity-60 cursor-pointer text-sm"
        >
          Abbrechen
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={busy || photoBusy}
          className="flex-1 flex items-center justify-center gap-2 bg-brand-accent1 text-white p-3 rounded-xl font-bold hover:bg-brand-accent1/90 disabled:opacity-60 cursor-pointer text-sm"
        >
          {busy && <Loader2 size={16} className="animate-spin" />}
          {submitLabel}
        </button>
      </div>
    </div>
  );
}
