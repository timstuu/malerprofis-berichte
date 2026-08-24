import { useState } from 'react';
import { Plus, Trash2, Pencil, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase.ts';
import UserManagement from './UserManagement.tsx';
import WeeklyReportsAdmin from './WeeklyReportsAdmin.tsx';
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

  const addSite = async () => {
    if (!newNumber.trim() || !newAddress.trim()) {
      setError('Bitte Nummer und Adresse angeben.');
      return;
    }
    await run(async () =>
      supabase.from('sites').insert({
        number: newNumber.trim(),
        address: newAddress.trim(),
        customer: newCustomer.trim() || null,
      }),
    );
    setNewNumber('');
    setNewAddress('');
    setNewCustomer('');
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
   * Baustellen werden deaktiviert statt gelöscht — an ihnen hängen
   * Berichtszeilen vergangener Wochen, die erhalten bleiben müssen.
   */
  const deactivateSite = async (site: Site) => {
    if (!confirm(`"${site.number} – ${site.address}" wirklich ausblenden?`)) return;
    await run(async () => supabase.from('sites').update({ active: false }).eq('id', site.id));
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

      {/* --------------------------------------------------------------- */}
      <LeaveAdmin
        employees={employees}
        leaveRequests={leaveRequests}
        holidays={holidays}
        assignmentCountInRange={assignmentCountInRange}
        onChanged={onChanged}
      />

      {/* --------------------------------------------------------------- */}
      <WeeklyReportsAdmin />

      {/* --------------------------------------------------------------- */}
      <UserManagement
        employees={employees}
        currentUserId={currentUserId}
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
              {site.is_absence_code ? (
                <span className="text-[10px] font-bold uppercase text-gray-400">Abwesenheit</span>
              ) : (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => editSite(site)}
                    className="p-2 text-gray-500 hover:text-brand-accent1 hover:bg-gray-50 rounded-xl cursor-pointer"
                    title="Bearbeiten"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    onClick={() => deactivateSite(site)}
                    className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl cursor-pointer"
                    title="Ausblenden"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              )}
            </div>
          ))}
          {sites.length === 0 && (
            <div className="p-8 text-center text-[#141414]/30 text-sm">Noch keine Baustellen.</div>
          )}
        </div>
      </section>

    </div>
  );
}
