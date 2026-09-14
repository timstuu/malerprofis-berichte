import { createExpenseReceipt, type ExpenseReceiptInput, type ReceiptPhotoUpload } from './data.ts';

/**
 * Puffer für Belege, die ohne Netz erfasst wurden.
 *
 * Aufgebaut wie der Abnahme-Puffer in abnahme.ts: IndexedDB statt
 * localStorage, weil die Fotos als Blob mitliegen. Bearbeiten und Löschen
 * gehen bewusst nicht über den Puffer — nur neue Belege warten hier.
 */

const DB_NAME = 'auslagen-queue';
const STORE = 'pending';

/** Ein Beleg, der noch ans Büro muss. */
export interface PendingReceipt {
  /** Zugleich die Id des Belegs in der Datenbank. */
  id: string;
  input: ExpenseReceiptInput;
  photos: ReceiptPhotoUpload[];
  savedAt: string;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB nicht verfügbar'));
  });
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const request = run(db.transaction(STORE, mode).objectStore(STORE));
        // Verbindung wieder schließen, sonst sammeln sich offene an (siehe abnahme.ts).
        request.onsuccess = () => {
          db.close();
          resolve(request.result);
        };
        request.onerror = () => {
          db.close();
          reject(request.error ?? new Error('Zugriff fehlgeschlagen'));
        };
      }),
  );
}

/** Legt einen Beleg in den Puffer, bis wieder Netz da ist. */
export async function queueReceipt(input: ExpenseReceiptInput, photos: ReceiptPhotoUpload[]): Promise<void> {
  const entry: PendingReceipt = { id: input.id, input, photos, savedAt: new Date().toISOString() };
  await tx('readwrite', (store) => store.put(entry));
}

/** Alle wartenden Belege dieses Geräts. */
export async function pendingReceipts(): Promise<PendingReceipt[]> {
  try {
    return await tx<PendingReceipt[]>('readonly', (store) => store.getAll());
  } catch {
    return [];
  }
}

export async function pendingReceiptCount(): Promise<number> {
  try {
    return await tx<number>('readonly', (store) => store.count());
  } catch {
    return 0;
  }
}

/**
 * Wirft einen wartenden Beleg weg. Für den Fall, dass er nie durchgeht — etwa
 * weil das Konto inzwischen gesperrt ist — und sonst ewig „wartet“.
 */
export async function discardPendingReceipt(id: string): Promise<void> {
  await tx('readwrite', (store) => store.delete(id));
}

/**
 * Schickt alles nach, was im Puffer liegt, und gibt zurück, wie viele Belege
 * noch warten. Ein fehlgeschlagener Beleg blockiert die übrigen nicht.
 */
export async function flushReceiptQueue(): Promise<number> {
  const entries = await pendingReceipts();
  let remaining = 0;
  for (const entry of entries) {
    try {
      await createExpenseReceipt(entry.input, entry.photos);
      await tx('readwrite', (store) => store.delete(entry.id));
    } catch (error) {
      console.error('Beleg konnte nicht nachgereicht werden:', error);
      remaining += 1;
    }
  }
  return remaining;
}
