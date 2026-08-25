import { submitAbnahmeProtocol, type AbnahmeInput } from './data.ts';

/**
 * Zwei Dinge, die die Abnahme auf der Baustelle braucht: kleine Fotos und
 * einen Puffer für fehlende Verbindung.
 */

// ---------------------------------------------------------------------------
// Fotos verkleinern
// ---------------------------------------------------------------------------

/** Längste Kante eines Mängelfotos in der PDF. */
const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.7;

/**
 * Rechnet ein Foto aus der Kamera auf eine vernünftige Größe herunter.
 *
 * Ein Handyfoto kommt mit mehreren Megabyte an, und die PDF trägt es
 * unkomprimiert weiter — bei drei Mängeln wird daraus eine Datei, die weder
 * über eine Baustellenverbindung hochgeht noch sich als Mail weiterleiten
 * lässt. Für die Dokumentation eines Kratzers reichen 1600 Pixel.
 *
 * Schlägt das Verkleinern fehl, wird das Original zurückgegeben: Ein großes
 * Foto ist besser als gar keins.
 */
export function shrinkPhoto(dataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
      // Schon klein genug — dann nicht noch einmal durch JPEG schicken, das
      // würde nur Qualität kosten.
      if (scale === 1 && dataUrl.startsWith('data:image/jpeg')) {
        resolve(dataUrl);
        return;
      }
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      try {
        resolve(canvas.toDataURL('image/jpeg', JPEG_QUALITY));
      } catch {
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

// ---------------------------------------------------------------------------
// Offline-Puffer
// ---------------------------------------------------------------------------

const DB_NAME = 'abnahme-queue';
const STORE = 'pending';

/** Eine Abnahme, die noch ans Büro muss. */
interface PendingAbnahme {
  id: string;
  employeeId: string;
  input: AbnahmeInput;
  pdf: Blob;
  savedAt: string;
}

/**
 * IndexedDB statt localStorage, weil dort eine PDF mit Fotos liegt. Als Text
 * kodiert wäre sie ein Vielfaches größer und würde das localStorage-Limit
 * reißen — ausgerechnet dann, wenn mehrere Abnahmen auf Netz warten.
 */
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
        // Die Verbindung wird wieder geschlossen. Bliebe sie offen, sammelt
        // jeder Zugriff eine weitere an, und eine spätere Änderung am
        // Datenbankschema käme nicht mehr durch.
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

/** Legt eine Abnahme in den Puffer, bis wieder Netz da ist. */
export async function queueAbnahme(
  employeeId: string,
  input: AbnahmeInput,
  pdf: Blob,
): Promise<void> {
  const entry: PendingAbnahme = {
    id: crypto.randomUUID(),
    employeeId,
    input,
    pdf,
    savedAt: new Date().toISOString(),
  };
  await tx('readwrite', (store) => store.add(entry));
}

/** Wie viele Abnahmen noch auf die Übertragung warten. */
export async function pendingAbnahmeCount(): Promise<number> {
  try {
    return await tx<number>('readonly', (store) => store.count());
  } catch {
    return 0;
  }
}

/**
 * Schickt alles nach, was im Puffer liegt, und gibt zurück, wie viele
 * Abnahmen noch warten.
 *
 * Ein fehlgeschlagener Eintrag bleibt stehen und blockiert die übrigen nicht —
 * beim nächsten Versuch ist er wieder dabei.
 */
export async function flushAbnahmeQueue(): Promise<number> {
  let entries: PendingAbnahme[];
  try {
    entries = await tx<PendingAbnahme[]>('readonly', (store) => store.getAll());
  } catch {
    return 0;
  }

  let remaining = 0;
  for (const entry of entries) {
    try {
      await submitAbnahmeProtocol(entry.employeeId, entry.input, entry.pdf);
      await tx('readwrite', (store) => store.delete(entry.id));
    } catch (error) {
      console.error('Abnahme konnte nicht nachgereicht werden:', error);
      remaining += 1;
    }
  }
  return remaining;
}
