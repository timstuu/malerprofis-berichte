import { useState } from 'react';
import { Plus, Pencil, Loader2, Archive, ArchiveRestore, ChevronDown } from 'lucide-react';
import { supabase } from '../../lib/supabase.ts';
import { fetchArchivedSites, setSiteTotalHours } from '../../lib/data.ts';
import UserManagement from './UserManagement.tsx';
import WeeklyReportsAdmin from './WeeklyReportsAdmin.tsx';
import AbnahmeProtocolsAdmin from './AbnahmeProtocolsAdmin.tsx';
import ExpensesAdmin from './ExpensesAdmin.tsx';
import LeaveAdmin from '../leave/LeaveAdmin.tsx';
import type { Employee, Holiday, LeaveRequest, Site } from '../../lib/database.types.ts';

/**
 * Verwaltung: Urlaubsanträge entscheiden, Benutzer und Baustellen pflegen.
 *
 * Sichtbar nur für Rolle 'admin'. Die Datenbank weist Schreibzugriffe anderer
 * Rollen ohnehin zurück — die Ausblendung hier ist reine Bequemlichkeit, keine
 * Sicherheitsmaßnahme.
 */
export default function AdminPanel({
  employees,
  sites,
  leaveRequests,
  holidays,
  assignmentCountInRange,
  currentUserId,
  onChanged,
}: {
  employees: Employee[];
  sites: Site[];
  leaveRequests: LeaveRequest[];
  holidays: Holiday[];
  assignmentCountInRange: (employeeId: string, start: string, end: string) => number;
  currentUserId: string;
  onChanged: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newNumber, setNewNumber] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [newCustomer, setNewCustomer] = useState('');
  const [newHours, setNewHours] = useState('');
  /** null = noch nie geladen. Das Archiv holt sich erst, wer danach fragt. */
  const [archived, setArchived] = useState<Site[] | null>(null);
  const [showArchive, setShowArchive] = useState(false);

  const run = async (action: () => Promise<{ error: { message: string } | null }>) => {
    setBusy(true);
    setError(null);
    const { error: actionError } = await action();
    if (actionError) {
      setError(actionError.message);
    } else {
      await onChanged();
    }
    setBusy(false);
  };

  /**
   * Zwilling zu run() für die Funktionen aus data.ts: Die werfen, statt ein
   * { error } zurückzugeben.
   */
  const runSafe = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  };

  /**
   * Stundenzahl aus einem Eingabefeld. Leer heißt null — die Baustelle taucht
   * dann nicht in der Leiste der Wochenplanung auf. Komma wird zu Punkt: Wer
   * 8,5 tippt, meint 8.5.
   */
  const parseHours = (raw: string): number | null | 'ungültig' => {
    const text = raw.trim().replace(',', '.');
    if (!text) return null;
    const value = Number(text);
    return Number.isFinite(value) && value > 0 ? value : 'ungültig';
  };

  const INVALID_HOURS = 'Bitte eine Stundenzahl größer als 0 angeben oder das Feld leeren.';

  const addSite = async () => {
    if (!newNumber.trim() || !newAddress.trim()) {
      setError('Bitte Nummer und Adresse angeben.');
      return;
    }
    const hours = parseHours(newHours);
    if (hours === 'ungültig') {
      setError(INVALID_HOURS);
      return;
    }
    await run(async () =>
      supabase.from('sites').insert({
        number: newNumber.trim(),
        address: newAddress.trim(),
        customer: newCustomer.trim() || null,
        // Nur mitschicken, wenn wirklich etwas eingetippt wurde: Sonst
        // scheiterte das Anlegen einer Baustelle daran, dass 0017 noch nicht
        // eingespielt ist.
        ...(hours !== null && { total_hours: hours }),
      }),
    );
    setNewNumber('');
    setNewAddress('');
    setNewCustomer('');
    setNewHours('');
  };

  /**
   * Gesamtstunden ändern sich öfter als Nummer und Adresse — deshalb ein Feld
   * in der Zeile und keine dritte prompt()-Frage.
   */
  const saveSiteHours = async (site: Site, raw: string) => {
    const hours = parseHours(raw);
    if (hours === 'ungültig') {
      setError(INVALID_HOURS);
      return;
    }
    if (hours === (site.total_hours ?? null)) return;
    await runSafe(() => setSiteTotalHours(site.id, hours));
  };

  const editSite = async (site: Site) => {
    const number = prompt('Baustellennummer:', site.number);
    if (number === null) return;
    const address = prompt('Baustelle / Adresse:', site.address);
    if (address === null) return;
    await run(async () =>
      supabase
        .from('sites')
        .update({ number: number.trim(), address: address.trim() })
        .eq('id', site.id),
    );
  };

  /**
   * Baustellen werden archiviert statt gelöscht — an ihnen hängen
   * Berichtszeilen vergangener Wochen, die erhalten bleiben müssen.
   *
   * Archiviert heißt: raus aus allen Auswahlfeldern, raus aus der Leiste der
   * Wochenplanung, aber jederzeit zurückholbar. Alte Berichte zeigen die
   * Baustelle unverändert.
   */
  const setSiteActive = async (site: Site, active: boolean) => {
    if (
      !active &&
      !confirm(
        `"${site.number} – ${site.address}" archivieren?\n\n` +
          'Sie verschwindet aus allen Auswahlfeldern. Alte Berichte bleiben ' +
          'unverändert, und zurückholen lässt sie sich jederzeit über das Archiv.',
      )
    ) {
      return;
    }
    await run(async () => supabase.from('sites').update({ active }).eq('id', site.id));
    // Das Archiv hängt an einer eigenen Abfrage und erfährt von der Änderung
    // sonst nichts.
    if (archived !== null) setArchived(await fetchArchivedSites());
  };

  const toggleArchive = async () => {
    if (showArchive) {
      setShowArchive(false);
      return;
    }
    setShowArchive(true);
    if (archived === null) {
      setBusy(true);
      setError(null);
      try {
        setArchived(await fetchArchivedSites());
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
      setBusy(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <h2 className="text-2xl font-bold">Verwaltung</h2>
        {busy && <Loader2 size={18} className="animate-spin text-brand-accent1" />}
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50/60 border border-red-100 rounded-xl p-3">
          {error}
        </p>
      )}

      {/* Reihenfolge nach Gebrauch im Büro: erst was laufend hereinkommt
          (Berichte, Abnahmen, Anträge), dann die Stammdaten. */}

      {/* --------------------------------------------------------------- */}
      <WeeklyReportsAdmin />

      {/* --------------------------------------------------------------- */}
      <AbnahmeProtocolsAdmin />

      {/* --------------------------------------------------------------- */}
      <ExpensesAdmin currentUserId={currentUserId} />

      {/* --------------------------------------------------------------- */}
      <LeaveAdmin
        employees={employees}
        leaveRequests={leaveRequests}
        holidays={holidays}
        assignmentCountInRange={assignmentCountInRange}
        onChanged={onChanged}
      />

      {/* --------------------------------------------------------------- */}
      <section className="space-y-4">
        <h3 className="text-lg font-bold">Baustellen</h3>

        <div className="bg-white p-5 rounded-3xl shadow-sm border border-[#141414]/5 space-y-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              value={newNumber}
              onChange={(e) => setNewNumber(e.target.value)}
              placeholder="Nummer (z. B. 080-7)"
              className="p-3 bg-gray-100 rounded-xl text-sm font-mono sm:w-40"
            />
            <input
              value={newAddress}
              onChange={(e) => setNewAddress(e.target.value)}
              placeholder="Baustelle / Adresse"
              className="p-3 bg-gray-100 rounded-xl text-sm flex-1"
            />
            <input
              value={newCustomer}
              onChange={(e) => setNewCustomer(e.target.value)}
              placeholder="Kunde (optional)"
              className="p-3 bg-gray-100 rounded-xl text-sm sm:w-48"
            />
            <input
              value={newHours}
              onChange={(e) => setNewHours(e.target.value)}
              placeholder="Std. gesamt"
              inputMode="decimal"
              title="Veranschlagte Gesamtstunden. Leer lassen, wenn die Baustelle nicht in der Leiste der Wochenplanung erscheinen soll."
              className="p-3 bg-gray-100 rounded-xl text-sm text-right sm:w-32"
            />
            <button
              onClick={addSite}
              disabled={busy}
              className="flex items-center justify-center gap-1 bg-brand-accent1 text-white px-4 py-3 rounded-xl text-sm font-bold hover:bg-brand-accent1/90 disabled:opacity-60 cursor-pointer"
            >
              <Plus size={16} /> Anlegen
            </button>
          </div>
        </div>

        <div className="bg-white rounded-3xl overflow-hidden shadow-sm border border-[#141414]/5">
          {sites.map((site) => (
            <div
              key={site.id}
              className="p-4 flex items-center justify-between border-b border-[#141414]/5 last:border-none"
            >
              <div className="flex-1 min-w-0 mr-4">
                <p className="font-semibold text-sm text-gray-900 truncate">
                  <span className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded text-xs font-mono mr-2">
                    {site.number}
                  </span>
                  {site.address}
                </p>
                {site.customer && <p className="text-xs text-gray-500 mt-0.5">{site.customer}</p>}
              </div>
              {/* Abwesenheitscodes bleiben unantastbar: Ihre Nummern stecken
                  fest im Code der Planung und im Urlaubskonto. Sie bekommen
                  deshalb keine Knöpfe — die Zeile bleibt einfach ruhig. */}
              {!site.is_absence_code && (
                <div className="flex items-center gap-1">
                  {/* Der Schlüssel enthält den gespeicherten Wert, damit das
                      Feld nach dem Speichern den Stand aus der Datenbank
                      zeigt — dasselbe Mittel wie beim Umbenennen einer
                      Gewerkzeile in der Wochenplanung. */}
                  <input
                    key={`${site.id}-${site.total_hours ?? ''}`}
                    defaultValue={site.total_hours ?? ''}
                    onBlur={(e) => saveSiteHours(site, e.target.value)}
                    disabled={busy}
                    placeholder="Std."
                    inputMode="decimal"
                    aria-label={`Gesamtstunden ${site.number}`}
                    title="Veranschlagte Gesamtstunden. Leer heißt: taucht in der Leiste der Wochenplanung nicht auf."
                    className="w-24 p-2 mr-1 bg-gray-100 rounded-xl text-sm text-right disabled:opacity-60"
                  />
                  <button
                    onClick={() => editSite(site)}
                    className="p-2 text-gray-500 hover:text-brand-accent1 hover:bg-gray-50 rounded-xl cursor-pointer"
                    title="Bearbeiten"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    onClick={() => setSiteActive(site, false)}
                    className="p-2 text-gray-400 hover:text-[#141414] hover:bg-gray-50 rounded-xl cursor-pointer"
                    title="Archivieren"
                  >
                    <Archive size={16} />
                  </button>
                </div>
              )}
            </div>
          ))}
          {sites.length === 0 && (
            <div className="p-8 text-center text-[#141414]/30 text-sm">Noch keine Baustellen.</div>
          )}
        </div>

        {/* Das Archiv liegt zugeklappt darunter: In der Liste oben soll stehen,
            was gerade läuft. Ohne diesen Weg wäre eine archivierte Baustelle
            nirgends mehr zu sehen und nicht zurückzuholen — fetchSites() lädt
            nur die aktiven. */}
        <div className="bg-white rounded-3xl shadow-sm border border-[#141414]/5 overflow-hidden">
          <button
            onClick={toggleArchive}
            className="w-full p-4 flex items-center gap-2 text-sm font-bold text-gray-500 hover:text-[#141414] hover:bg-gray-50 cursor-pointer"
          >
            <Archive size={16} />
            Archiv
            {archived !== null && (
              <span className="text-xs font-normal text-[#141414]/40">
                ({archived.length})
              </span>
            )}
            <ChevronDown
              size={16}
              className={`ml-auto transition-transform ${showArchive ? 'rotate-180' : ''}`}
            />
          </button>

          {showArchive && (
            <div className="border-t border-[#141414]/5">
              {archived?.map((site) => (
                <div
                  key={site.id}
                  className="p-4 flex items-center justify-between border-b border-[#141414]/5 last:border-none"
                >
                  <div className="flex-1 min-w-0 mr-4">
                    <p className="font-semibold text-sm text-gray-500 truncate">
                      <span className="bg-gray-100 text-gray-500 px-2 py-0.5 rounded text-xs font-mono mr-2">
                        {site.number}
                      </span>
                      {site.address}
                    </p>
                    {site.customer && (
                      <p className="text-xs text-gray-400 mt-0.5">{site.customer}</p>
                    )}
                  </div>
                  <button
                    onClick={() => setSiteActive(site, true)}
                    disabled={busy}
                    className="flex items-center gap-1.5 text-xs font-bold text-gray-500 hover:text-[#141414] bg-gray-100 hover:bg-gray-200 px-3 py-2 rounded-xl disabled:opacity-60 cursor-pointer"
                  >
                    <ArchiveRestore size={14} /> Zurückholen
                  </button>
                </div>
              ))}
              {archived?.length === 0 && (
                <div className="p-8 text-center text-[#141414]/30 text-sm">
                  Keine archivierten Baustellen.
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* --------------------------------------------------------------- */}
      <UserManagement
        employees={employees}
        currentUserId={currentUserId}
        onChanged={onChanged}
      />

    </div>
  );
}
