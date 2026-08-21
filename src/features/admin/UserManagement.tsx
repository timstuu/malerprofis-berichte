import { useState } from 'react';
import { Plus, Trash2, KeyRound, Loader2, ShieldCheck, Monitor, HardHat, RefreshCw, Palmtree, Check } from 'lucide-react';
import { EMPLOYEE_COLORS, colorOf, nextFreeColor } from '../../lib/colors.ts';
import {
  createUser,
  deleteUser,
  setUserPassword,
  setUserRole,
  sortEmployees,
  suggestPassword,
} from '../../lib/users.ts';
import { supabase } from '../../lib/supabase.ts';
import type { Employee, Role } from '../../lib/database.types.ts';

/**
 * Benutzerverwaltung für das Büro: Konten anlegen, Rechte vergeben,
 * Resturlaub korrigieren, Passwörter zurücksetzen, Konten entfernen.
 *
 * Maler bekommen diesen Bereich nicht zu sehen — und selbst wenn: Die Edge
 * Function hinter diesen Schaltflächen prüft die Rolle bei jedem Aufruf.
 */

const ROLE_LABEL: Record<Role, string> = {
  admin: 'Büro',
  worker: 'Maler',
  tv: 'Anzeige (Fernseher)',
};

const ROLE_ICON: Record<Role, typeof ShieldCheck> = {
  admin: ShieldCheck,
  worker: HardHat,
  tv: Monitor,
};

export default function UserManagement({
  employees,
  currentUserId,
  onChanged,
}: {
  employees: Employee[];
  currentUserId: string;
  onChanged: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /** Id des Mitarbeiters, dessen Farbauswahl gerade offen steht. */
  const [colorFor, setColorFor] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [role, setRole] = useState<Role>('worker');
  const [password, setPassword] = useState(suggestPassword());
  const [leaveDays, setLeaveDays] = useState(30);

  const resetForm = () => {
    setEmail('');
    setFirstName('');
    setLastName('');
    setRole('worker');
    setPassword(suggestPassword());
    setLeaveDays(30);
  };

  const submit = async () => {
    setError(null);
    setNotice(null);

    if (!email.trim() || !firstName.trim() || !lastName.trim()) {
      setError('Bitte E-Mail, Vor- und Nachname ausfüllen.');
      return;
    }

    setBusyId('new');
    try {
      await createUser({
        email: email.trim(),
        password,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        role,
        remainingLeaveDays: leaveDays,
        color: nextFreeColor(employees),
      });
      setNotice(
        `${firstName} ${lastName} wurde angelegt. Zugangsdaten: ${email.trim()} / ${password}`,
      );
      resetForm();
      setOpen(false);
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setBusyId(null);
  };

  const changeRole = async (employee: Employee, next: Role) => {
    setError(null);
    setNotice(null);
    setBusyId(employee.id);
    try {
      await setUserRole(employee.id, next);
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setBusyId(null);
  };

  const resetPassword = async (employee: Employee) => {
    const suggestion = suggestPassword();
    const value = prompt(
      `Neues Passwort für ${employee.first_name} ${employee.last_name}:`,
      suggestion,
    );
    if (!value) return;

    setError(null);
    setNotice(null);
    setBusyId(employee.id);
    try {
      await setUserPassword(employee.id, value);
      setNotice(`Neues Passwort für ${employee.first_name} ${employee.last_name}: ${value}`);
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setBusyId(null);
  };

  const remove = async (employee: Employee) => {
    if (
      !confirm(
        `${employee.first_name} ${employee.last_name} wirklich löschen?\n\n` +
          'Damit verschwinden auch die Wochenberichte dieser Person. ' +
          'Wenn jemand nur nicht mehr im Betrieb ist, ist „Deaktivieren" die bessere Wahl.',
      )
    ) {
      return;
    }

    setError(null);
    setNotice(null);
    setBusyId(employee.id);
    try {
      await deleteUser(employee.id);
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setBusyId(null);
  };

  /**
   * Farbe eines Mitarbeiters setzen. Sie taucht in der Wochenplanung und auf
   * dem Fernseher an jeder Einsatzkachel auf — daran erkennt man seine Zeile
   * auch dann noch, wenn die Namensspalte seitlich aus dem Bild gescrollt ist.
   */
  const changeColor = async (employee: Employee, color: string) => {
    setColorFor(null);
    setError(null);
    setBusyId(employee.id);
    const { error: updateError } = await supabase
      .from('employees')
      .update({ color })
      .eq('id', employee.id);
    if (updateError) setError(updateError.message);
    else await onChanged();
    setBusyId(null);
  };

  /**
   * Resturlaub korrigieren. Genehmigte Urlaube zieht die App selbst ab; hier
   * wird nachgesteuert, etwa bei Resttagen aus dem Vorjahr.
   */
  const changeLeaveDays = async (employee: Employee) => {
    const value = prompt(
      `Resturlaub für ${employee.first_name} ${employee.last_name} (Tage):`,
      String(employee.remaining_leave_days),
    );
    if (value === null) return;

    const days = Number(value.replace(',', '.'));
    if (!Number.isFinite(days) || days < 0) {
      setError('Bitte eine gültige Zahl eingeben.');
      return;
    }

    setError(null);
    setNotice(null);
    setBusyId(employee.id);
    const { error: updateError } = await supabase
      .from('employees')
      .update({ remaining_leave_days: days })
      .eq('id', employee.id);
    if (updateError) setError(updateError.message);
    else await onChanged();
    setBusyId(null);
  };

  /**
   * Deaktivieren statt Löschen: Die Person kann sich nicht mehr in Planung und
   * Listen wiederfinden, ihre Berichte bleiben aber erhalten.
   */
  const toggleActive = async (employee: Employee) => {
    setError(null);
    setBusyId(employee.id);
    const { error: updateError } = await supabase
      .from('employees')
      .update({ active: !employee.active })
      .eq('id', employee.id);
    if (updateError) setError(updateError.message);
    else await onChanged();
    setBusyId(null);
  };

  // Gruppiert nach Art des Benutzers, darin nach Nachname aufsteigend.
  const sorted = sortEmployees(employees);

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold">Benutzer</h3>
        {!open && (
          <button
            onClick={() => {
              setOpen(true);
              setPassword(suggestPassword());
            }}
            className="text-xs bg-brand-accent1 text-white px-3 py-2 rounded-xl font-bold hover:bg-brand-accent1/90 flex items-center gap-1 cursor-pointer"
          >
            <Plus size={14} /> Benutzer anlegen
          </button>
        )}
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50/60 border border-red-100 rounded-xl p-3">
          {error}
        </p>
      )}
      {notice && (
        <div className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-xl p-3 flex items-start justify-between gap-3">
          <span>
            {notice}
            <br />
            <span className="text-xs text-emerald-700/70">
              Bitte notieren und weitergeben — das Passwort wird nirgends gespeichert und lässt sich
              später nicht mehr anzeigen, nur neu setzen.
            </span>
          </span>
          <button
            onClick={() => setNotice(null)}
            className="text-emerald-600/60 hover:text-emerald-800 text-xs font-bold cursor-pointer shrink-0"
          >
            OK
          </button>
        </div>
      )}

      {/* Neues Konto ------------------------------------------------- */}
      {open && (
        <div className="bg-white p-5 rounded-3xl shadow-sm border border-[#141414]/5 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="Vorname"
              className="p-3 bg-gray-100 rounded-xl text-sm"
            />
            <input
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Nachname"
              className="p-3 bg-gray-100 rounded-xl text-sm"
            />
          </div>

          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            inputMode="email"
            placeholder="E-Mail für die Anmeldung"
            className="w-full p-3 bg-gray-100 rounded-xl text-sm"
          />

          <div className="flex gap-2">
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Startpasswort"
              className="flex-1 p-3 bg-gray-100 rounded-xl text-sm font-mono"
            />
            <button
              onClick={() => setPassword(suggestPassword())}
              className="px-3 bg-gray-100 hover:bg-gray-200 rounded-xl cursor-pointer"
              title="Anderes Passwort vorschlagen"
            >
              <RefreshCw size={16} />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              className="p-3 bg-gray-100 rounded-xl text-sm"
            >
              <option value="worker">Maler</option>
              <option value="admin">Büro (darf alles verwalten)</option>
              <option value="tv">Anzeige für den Fernseher</option>
            </select>

            {role === 'worker' && (
              <div className="flex items-center gap-2">
                <label htmlFor="leave-days" className="text-sm text-[#141414]/60 shrink-0">
                  Urlaubstage
                </label>
                <input
                  id="leave-days"
                  type="number"
                  min={0}
                  value={leaveDays}
                  onChange={(e) => setLeaveDays(Number(e.target.value))}
                  className="w-full p-3 bg-gray-100 rounded-xl text-sm"
                />
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-1">
            <button
              onClick={() => {
                setOpen(false);
                setError(null);
              }}
              className="flex-1 bg-gray-200 hover:bg-gray-300 font-bold py-3 rounded-xl cursor-pointer"
            >
              Abbrechen
            </button>
            <button
              onClick={submit}
              disabled={busyId === 'new'}
              className="flex-1 flex items-center justify-center gap-2 bg-brand-accent1 hover:bg-brand-accent1/90 disabled:opacity-60 text-white font-bold py-3 rounded-xl cursor-pointer"
            >
              {busyId === 'new' && <Loader2 size={16} className="animate-spin" />}
              Anlegen
            </button>
          </div>
        </div>
      )}

      {/* Bestehende Konten ------------------------------------------- */}
      <div className="bg-white rounded-3xl overflow-hidden shadow-sm border border-[#141414]/5">
        {sorted.map((employee, i) => {
          const Icon = ROLE_ICON[employee.role];
          const isSelf = employee.id === currentUserId;
          const startsGroup = i === 0 || sorted[i - 1].role !== employee.role;

          return (
            <div key={employee.id} className="border-b border-[#141414]/5 last:border-none">
              {startsGroup && (
                <p className="px-4 pt-4 pb-1 text-[10px] font-bold uppercase tracking-wider text-[#141414]/40">
                  {ROLE_LABEL[employee.role]}
                </p>
              )}
              <div
                className={`p-4 flex flex-wrap items-center justify-between gap-3 ${
                  employee.active ? '' : 'opacity-50'
                }`}
              >
                <div className="min-w-0 flex items-center gap-3">
                  {employee.role === 'tv' ? (
                    <Icon size={18} className="text-[#141414]/30 shrink-0" />
                  ) : (
                    <span
                      className="w-[18px] h-[18px] rounded-md shrink-0 border border-black/10"
                      style={{ backgroundColor: colorOf(employee).swatch }}
                      title={`Farbe: ${colorOf(employee).label}`}
                    />
                  )}
                  <div className="min-w-0">
                    <p className="font-semibold text-sm truncate">
                      {employee.first_name} {employee.last_name}
                      {isSelf && (
                        <span className="text-xs text-[#141414]/40 font-normal"> (du)</span>
                      )}
                      {!employee.active && (
                        <span className="text-xs text-[#141414]/40 font-normal"> · deaktiviert</span>
                      )}
                    </p>
                    {employee.role !== 'tv' && (
                      <p className="text-xs text-[#141414]/50">
                        Resturlaub {employee.remaining_leave_days} Tage
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {busyId === employee.id ? (
                    <Loader2 size={18} className="animate-spin text-brand-accent1" />
                  ) : (
                    <>
                      <select
                        value={employee.role}
                        onChange={(e) => changeRole(employee, e.target.value as Role)}
                        disabled={isSelf}
                        className="text-xs bg-gray-100 rounded-xl px-2 py-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        title={isSelf ? 'Die eigenen Rechte lassen sich nicht ändern' : 'Rolle ändern'}
                      >
                        <option value="worker">Maler</option>
                        <option value="admin">Büro</option>
                        <option value="tv">Anzeige</option>
                      </select>

                      {employee.role !== 'tv' && (
                        <button
                          onClick={() => setColorFor(colorFor === employee.id ? null : employee.id)}
                          className="p-2 text-gray-500 hover:text-brand-accent1 hover:bg-gray-50 rounded-xl cursor-pointer"
                          title="Farbe wählen"
                        >
                          <span
                            className="block w-4 h-4 rounded border border-black/10"
                            style={{ backgroundColor: colorOf(employee).swatch }}
                          />
                        </button>
                      )}

                      {employee.role !== 'tv' && (
                        <button
                          onClick={() => changeLeaveDays(employee)}
                          className="p-2 text-gray-500 hover:text-brand-accent1 hover:bg-gray-50 rounded-xl cursor-pointer"
                          title="Resturlaub anpassen"
                        >
                          <Palmtree size={16} />
                        </button>
                      )}

                      <button
                        onClick={() => resetPassword(employee)}
                        className="p-2 text-gray-500 hover:text-brand-accent1 hover:bg-gray-50 rounded-xl cursor-pointer"
                        title="Passwort neu setzen"
                      >
                        <KeyRound size={16} />
                      </button>

                      <button
                        onClick={() => toggleActive(employee)}
                        className="text-xs bg-gray-100 hover:bg-gray-200 px-2.5 py-2 rounded-xl font-bold cursor-pointer"
                        title="Aus Planung und Listen nehmen, Berichte bleiben erhalten"
                      >
                        {employee.active ? 'Deaktivieren' : 'Aktivieren'}
                      </button>

                      <button
                        onClick={() => remove(employee)}
                        disabled={isSelf}
                        className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                        title={isSelf ? 'Das eigene Konto lässt sich nicht löschen' : 'Konto löschen'}
                      >
                        <Trash2 size={16} />
                      </button>
                    </>
                  )}
                </div>
              </div>

              {colorFor === employee.id && (
                <div className="px-4 pb-4 -mt-1">
                  <div className="flex flex-wrap gap-2 bg-gray-50 border border-gray-100 rounded-2xl p-3">
                    {EMPLOYEE_COLORS.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => changeColor(employee, c.id)}
                        title={c.label}
                        className="w-8 h-8 rounded-lg border border-black/10 flex items-center justify-center cursor-pointer hover:scale-110 transition-transform"
                        style={{ backgroundColor: c.swatch }}
                      >
                        {colorOf(employee).id === c.id && (
                          <Check size={16} className="text-white drop-shadow" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {employees.length === 0 && (
          <div className="p-8 text-center text-[#141414]/30 text-sm">Noch keine Benutzer.</div>
        )}
      </div>

      <p className="text-xs text-[#141414]/40">
        Anlegen, Rechte ändern und Löschen prüft die Datenbank zusätzlich selbst — auch wenn jemand
        die Oberfläche umgeht. Das letzte Büro-Konto lässt sich nicht entfernen. Über die Palme
        lässt sich der Resturlaub korrigieren; genehmigte Urlaube zieht die App selbst ab.
      </p>
    </section>
  );
}
