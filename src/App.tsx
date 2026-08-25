/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  format,
  startOfISOWeek,
  addDays,
  addWeeks,
  subWeeks,
  addMonths,
  subMonths,
} from 'date-fns';
import { 
  Clock, 
  CheckSquare, 
  Calendar, 
  Users, 
  Menu,
  X,
  LogOut,
  Trash2,
  Pencil,
  RotateCcw,
  Camera,
  Palmtree,
  Settings,
  Lock
} from 'lucide-react';
import SignatureCanvas from 'react-signature-canvas';
import { motion, AnimatePresence } from 'motion/react';
import { de } from 'date-fns/locale';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { jsPDF } from 'jspdf';
import Logo from './components/Logo.tsx';
import AdminPanel from './features/admin/AdminPanel.tsx';
import WeekGrid from './features/planning/WeekGrid.tsx';
import LeaveView from './features/leave/LeaveView.tsx';
import PushToggle from './features/leave/PushToggle.tsx';
import { useAuth } from './lib/auth.tsx';
import { breakMinutesForRole, calculateHours, WEEKDAYS } from './lib/hours.ts';
import {
  createLeaveRequest,
  decideLeaveRequest,
  emptyWeek,
  fetchAssignments,
  fetchEmployees,
  fetchDefaultHours,
  fetchHolidays,
  fetchLeaveRequests,
  fetchSites,
  loadWeeklyReport,
  saveWeeklyReport,
  submitAbnahmeProtocol,
  weekKey,
  withdrawLeaveRequest,
  type AssignmentRow,
  type WeeklyEntries,
  type WeeklyEntry,
} from './lib/data.ts';
import { fetchHandledAssignmentIds, markAssignments } from './lib/planning.ts';
import { flushAbnahmeQueue, pendingAbnahmeCount, queueAbnahme, shrinkPhoto } from './lib/abnahme.ts';
import DefaultHours from './features/admin/DefaultHours.tsx';
import { buildPrefill } from './lib/prefill.ts';
import type { Employee, Holiday, LeaveRequest, Site } from './lib/database.types.ts';

// Utility for tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Types
// Employee, LeaveRequest und Site kommen aus lib/database.types.ts und spiegeln
// das Datenbankschema. Die folgenden Typen betreffen nur die Oberfläche.

interface ReportHistory {
  date: string;
  type: 'Wochenbericht' | 'Abnahmeprotokoll';
  action: 'gespeichert' | 'versendet';
  detail: string;
}

/** Entwurf einer Woche, wie er lokal zwischengespeichert wird. */
interface WeekDraft {
  weekStart: string;
  entries: WeeklyEntries;
  savedAt: string;
}

const DRAFT_KEY = 'weekDraft';

/**
 * Inline-Editor einer Berichtszeile. Ersetzt die Anzeige-Karte, solange die
 * Zeile bearbeitet wird, und gibt beim Speichern eine neue `WeeklyEntry` zurück
 * — Id und Herkunft (`sourceAssignmentId`) bleiben erhalten, damit eine aus der
 * Planung übernommene Zeile ihre Verbindung behält.
 *
 * Die Pause folgt wie im Anlegen-Feld der Regel des Kontos; Stunden und Pause
 * werden aus den Zeiten gerechnet, nicht eingegeben. Abwesenheitszeilen
 * (Urlaub, Feiertag, Büro) landen gar nicht hier — der Bericht öffnet den Stift
 * nur für echte Arbeitszeilen.
 */
function ReportEntryEditor({
  entry,
  day,
  sites,
  office,
  onCancel,
  onSave,
}: {
  entry: WeeklyEntry;
  day: string;
  sites: Site[];
  /** Büro-Konto: gesetzliche Pause statt fester Fenster, Beschreibung freiwillig. */
  office: boolean;
  onCancel: () => void;
  onSave: (updated: WeeklyEntry) => void;
}) {
  const [projectNumber, setProjectNumber] = useState(entry.projectNumber ?? '');
  const [project, setProject] = useState(entry.project ?? '');
  const [description, setDescription] = useState(entry.description ?? '');
  const [start, setStart] = useState(entry.startTime ?? '');
  const [end, setEnd] = useState(entry.endTime ?? '');

  const pause = start && end
    ? breakMinutesForRole(start, end, day as (typeof WEEKDAYS)[number], office)
    : 0;
  const hours = start && end ? calculateHours(start, end, pause) : entry.hours;

  const save = () => {
    if (!project.trim()) {
      alert('Bitte Baustelle / Adresse eingeben.');
      return;
    }
    if (!office && !description.trim()) {
      alert('Bitte Tätigkeitsbeschreibung eingeben.');
      return;
    }
    if (!start || !end) {
      alert('Bitte Start- und Endzeit eingeben.');
      return;
    }
    if (hours <= 0) {
      alert('Die berechnete Arbeitszeit muss größer als 0 sein.');
      return;
    }
    onSave({
      ...entry,
      projectNumber: projectNumber.trim(),
      project: project.trim(),
      description: description.trim(),
      startTime: start,
      endTime: end,
      pause,
      hours,
    });
  };

  return (
    <div className="p-3.5 bg-white rounded-2xl border border-brand-accent2/40 flex flex-col gap-2">
      <input
        type="text"
        list="editentry-num"
        value={projectNumber}
        onChange={(e) => setProjectNumber(e.target.value)}
        placeholder="Baustellennummer"
        className="w-full p-2.5 bg-gray-100 rounded-xl border-none text-sm"
      />
      <datalist id="editentry-num">
        {sites.map((p) => (
          <option key={`enum-${p.id}`} value={p.number}>{p.address}</option>
        ))}
      </datalist>

      <input
        type="text"
        list="editentry-proj"
        value={project}
        onChange={(e) => setProject(e.target.value)}
        placeholder="Baustelle/Adresse"
        className="w-full p-2.5 bg-gray-100 rounded-xl border-none text-sm"
      />
      <datalist id="editentry-proj">
        {sites.map((p) => (
          <option key={`eproj-${p.id}`} value={p.address}>{p.number}</option>
        ))}
      </datalist>

      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder={office ? 'Tätigkeitsbeschreibung' : 'Tätigkeitsbeschreibung *'}
        className="w-full p-2.5 bg-gray-100 rounded-xl border-none h-16 text-sm"
      />

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="flex-1">
          <label className="text-[11px] font-semibold text-[#141414]/40 uppercase tracking-wider block mb-1">Startzeit</label>
          <input type="time" value={start} onChange={(e) => setStart(e.target.value)} className="w-full p-2.5 bg-gray-100 rounded-xl border-none text-sm outline-none" />
        </div>
        <div className="flex-1">
          <label className="text-[11px] font-semibold text-[#141414]/40 uppercase tracking-wider block mb-1">Endzeit</label>
          <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className="w-full p-2.5 bg-gray-100 rounded-xl border-none text-sm outline-none" />
        </div>
      </div>

      <p className="text-[11px] text-gray-500 px-0.5">
        {start && end ? `${hours} Std. · ${pause ? `Pause ${pause} Min.` : 'keine Pause'}` : 'Zeiten eingeben'}
      </p>

      <div className="flex gap-2 pt-1">
        <button onClick={save} className="flex-1 bg-brand-accent2 text-white p-2.5 rounded-xl font-bold hover:bg-brand-accent2/90 cursor-pointer text-sm">Übernehmen</button>
        <button onClick={onCancel} className="flex-1 bg-gray-200 text-[#141414] p-2.5 rounded-xl font-bold hover:bg-gray-300 cursor-pointer text-sm">Abbruch</button>
      </div>
    </div>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'wochenbericht' | 'planung' | 'abnahme' | 'leave' | 'admin' | 'settings'>('planung');
  const [selectedWeek, setSelectedWeek] = useState(startOfISOWeek(new Date()));
  const { employee: currentUser, signOut } = useAuth();
  const isAdmin = currentUser?.role === 'admin';

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  /**
   * Status des gerade geöffneten Wochenberichts. Ein 'signed' abgegebener
   * Bericht ist gesperrt: kein Bearbeiten, kein Löschen, kein Hinzufügen.
   */
  const [reportStatus, setReportStatus] = useState<'draft' | 'signed' | null>(null);
  /** Berichtszeile, die gerade zum Ändern offen ist (Tag + Zeilen-Id). */
  const [editReport, setEditReport] = useState<{ day: string; id: string } | null>(null);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  /**
   * Einsätze im Umfeld von heute. Wird gebraucht, um vor einer Urlaubs-
   * genehmigung zu zeigen, wie viele geplante Einsätze dabei gelöscht werden.
   */
  const [nearbyAssignments, setNearbyAssignments] = useState<AssignmentRow[]>([]);
  const [reportHistory, setReportHistory] = useState<ReportHistory[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'offline'>('idle');
  const [prefillNotice, setPrefillNotice] = useState<string | null>(null);

  // Der Name kommt aus den Stammdaten, nicht mehr aus dem Gerätespeicher.
  const userName = {
    firstName: currentUser?.first_name ?? '',
    lastName: currentUser?.last_name ?? '',
  };

  /**
   * Baustellennummer und Adresse gehören zusammen: Wird das eine Feld
   * ausgefüllt, ergänzt sich das andere aus dem zentralen Baustellenstamm.
   */
  const handleFieldSync = (day: string, fieldType: 'number' | 'address', value: string) => {
    if (fieldType === 'number') {
      const match = sites.find(p => p.number.toLowerCase() === value.trim().toLowerCase());
      if (match) {
        const addrInput = document.getElementById(`proj-${day}`) as HTMLInputElement;
        if (addrInput) {
          addrInput.value = match.address;
        }
      }
    } else {
      const match = sites.find(p => p.address.toLowerCase() === value.trim().toLowerCase());
      if (match) {
        const numInput = document.getElementById(`num-${day}`) as HTMLInputElement;
        if (numInput) {
          numInput.value = match.number;
        }
      }
    }
  };

  useEffect(() => {
    const savedHistory = localStorage.getItem('reportHistory');
    if (savedHistory) setReportHistory(JSON.parse(savedHistory));
  }, []);

  const addReportToHistory = (type: 'Wochenbericht' | 'Abnahmeprotokoll', action: 'gespeichert' | 'versendet', detail: string) => {
    const newEntry: ReportHistory = {
      date: new Date().toISOString(),
      type,
      action,
      detail
    };
    const updatedHistory = [newEntry, ...reportHistory];
    setReportHistory(updatedHistory);
    localStorage.setItem('reportHistory', JSON.stringify(updatedHistory));
  };
  const [weeklyEntries, setWeeklyEntries] = useState<WeeklyEntries>(emptyWeek());

  const [abnahme, setAbnahme] = useState<{
    address: string;
    number: string;
    participants: string[];
    type: 'teil' | 'gesamt';
    status: 'ohne' | 'mit';
    tasks: { text: string; photo?: string }[];
    employeeSignature?: string;
    customerSignature?: string;
  }>({
    address: '',
    number: '',
    participants: [] as string[],
    type: 'gesamt',
    status: 'ohne',
    tasks: [] as { text: string; photo?: string }[]
  });
  const [newParticipant, setNewParticipant] = useState('');
  const [newTask, setNewTask] = useState('');
  const [signatureStep, setSignatureStep] = useState<'employee' | 'customer'>('employee');
  const [isAbnahmePreview, setIsAbnahmePreview] = useState(false);
  /** Abnahmen, die noch auf Netz warten — nur zur Anzeige. */
  const [pendingAbnahmen, setPendingAbnahmen] = useState(0);

  const handleAbnahmeFieldSync = (fieldType: 'number' | 'address', value: string) => {
    const allProjects = sites;
    if (fieldType === 'number') {
      const match = allProjects.find(p => p.number.toLowerCase() === value.trim().toLowerCase());
      if (match) {
        setAbnahme(prev => ({ ...prev, number: value, address: match.address }));
      } else {
        setAbnahme(prev => ({ ...prev, number: value }));
      }
    } else {
      const match = allProjects.find(p => p.address.toLowerCase() === value.trim().toLowerCase());
      if (match) {
        setAbnahme(prev => ({ ...prev, address: value, number: match.number }));
      } else {
        setAbnahme(prev => ({ ...prev, address: value }));
      }
    }
  };

  const handlePhotoUpload = (index: number, event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = e.target?.result as string;
      // Direkt beim Aufnehmen verkleinern. Sonst trägt die PDF das volle
      // Kamerabild und geht über eine Baustellenverbindung nicht mehr hoch.
      const small = await shrinkPhoto(base64);
      setAbnahme(prev => {
        const updated = [...prev.tasks];
        updated[index] = { ...updated[index], photo: small };
        return { ...prev, tasks: updated };
      });
    };
    reader.readAsDataURL(file);
  };

  const getDayTotal = (entries: { hours: number }[]) => entries.reduce((sum, e) => sum + e.hours, 0);
  const getWeeklyTotal = () => Object.entries(weeklyEntries).reduce((sum, [_, dayData]) => sum + getDayTotal(dayData.entries), 0);
  
  const resetAbnahme = () => {
    setAbnahme({
      address: '',
      number: '',
      participants: [],
      type: 'gesamt',
      status: 'ohne',
      tasks: []
    });
    setIsAbnahmePreview(false);
  };
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSignatureModalOpen, setIsSignatureModalOpen] = useState(false);
  const [signatureAction, setSignatureAction] = useState<'sendW' | 'saveA' | null>(null);
  const sigCanvas = React.useRef<SignatureCanvas>(null);

  // Stammdaten und eigene Daten laden. Fehler werden angezeigt statt
  // verschluckt — sonst läuft die App unbemerkt mit leeren Listen.
  const reloadData = React.useCallback(async () => {
    if (!currentUser) return;
    try {
      // Zeitfenster für Feiertage und für die Einsätze, die eine Urlaubs-
      // genehmigung betreffen könnte.
      const from = format(subMonths(new Date(), 1), 'yyyy-MM-dd');
      const to = format(addMonths(new Date(), 14), 'yyyy-MM-dd');

      // Bewusst einzeln ausgewertet: Scheitert eine Abfrage, sollen die
      // übrigen Listen trotzdem gefüllt werden. Zuvor blieb bei einem einzigen
      // Fehlschlag alles leer — auch die Mitarbeiterliste.
      const results = await Promise.allSettled([
        fetchEmployees(),
        fetchSites(),
        fetchLeaveRequests(),
        fetchHolidays(from, to),
        fetchAssignments(from, to),
      ]);

      const [emp, siteList, leaves, holidayList, assignments] = results;

      if (emp.status === 'fulfilled') setEmployees(emp.value);
      if (siteList.status === 'fulfilled') setSites(siteList.value);
      if (leaves.status === 'fulfilled') setLeaveRequests(leaves.value);
      if (holidayList.status === 'fulfilled') setHolidays(holidayList.value);
      if (assignments.status === 'fulfilled') setNearbyAssignments(assignments.value);

      const failures = results
        .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
        .map((r) => (r.reason instanceof Error ? r.reason.message : String(r.reason)));

      if (failures.length > 0) {
        console.error('Daten konnten nicht vollständig geladen werden:', failures);
        setLoadError(failures.join(' · '));
      } else {
        setLoadError(null);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setLoadError(message);
      console.error('Daten konnten nicht geladen werden:', message);
    }
  }, [currentUser]);

  useEffect(() => {
    reloadData();
  }, [reloadData]);

  /** Wie viele geplante Einsätze fallen in diesen Zeitraum? */
  const assignmentCountInRange = (employeeId: string, start: string, end: string) =>
    nearbyAssignments.filter(
      (a) => a.employee_id === employeeId && a.date >= start && a.date <= end,
    ).length;

  const handleAddLeaveRequest = async (startDate: string, endDate: string) => {
    if (!currentUser) return;
    try {
      await createLeaveRequest(currentUser.id, startDate, endDate);
      setLeaveRequests(await fetchLeaveRequests());
      setActiveTab('leave');
    } catch (error) {
      alert(error instanceof Error ? error.message : String(error));
    }
  };

  const handleUpdateLeaveStatus = async (id: string, status: 'approved' | 'rejected') => {
    try {
      await decideLeaveRequest(id, status);
      setLeaveRequests(await fetchLeaveRequests());
    } catch (error) {
      alert(error instanceof Error ? error.message : String(error));
    }
  };

  const handleWithdrawLeaveRequest = async (id: string) => {
    try {
      await withdrawLeaveRequest(id);
      setLeaveRequests(await fetchLeaveRequests());
    } catch (error) {
      alert(error instanceof Error ? error.message : String(error));
    }
  };

  // -------------------------------------------------------------------------
  // Wochenbericht: laden, lokal spiegeln, speichern
  // -------------------------------------------------------------------------

  const [weekLoading, setWeekLoading] = useState(true);

  /**
   * Übernimmt geplante Einsätze, genehmigten Urlaub und Feiertage in den
   * Bericht. Läuft automatisch, sobald eine Woche geladen ist — additiv, ohne
   * je vorhandene Eingaben zu überschreiben.
   */
  const runPrefill = React.useCallback(
    async (base: WeeklyEntries): Promise<WeeklyEntries> => {
      if (!currentUser || sites.length === 0) return base;

      try {
        const from = weekKey(selectedWeek);
        const to = format(addDays(selectedWeek, 6), 'yyyy-MM-dd');

        const [assignments, handled, holidays, defaultHours] = await Promise.all([
          fetchAssignments(from, to),
          fetchHandledAssignmentIds(currentUser.id),
          fetchHolidays(from, to),
          // Nur Büro-Konten haben Standardzeiten. Für jeden Maler wäre das eine
          // Abfrage, die garantiert nichts zurückgibt.
          currentUser.role === 'admin' ? fetchDefaultHours(currentUser.id) : Promise.resolve([]),
        ]);

        const result = buildPrefill(
          selectedWeek,
          base,
          assignments,
          handled,
          leaveRequests,
          holidays,
          sites,
          currentUser.id,
          defaultHours,
        );

        if (result.addedCount === 0) return base;

        // Reihenfolge ist wichtig: erst den Bericht speichern, dann die
        // Planzeilen als übernommen vermerken. Andersherum wären sie bei einem
        // Fehler als erledigt markiert, ohne je gespeichert worden zu sein —
        // und kämen nie wieder.
        await saveWeeklyReport(currentUser.id, selectedWeek, result.entries, sites);
        if (result.importedAssignmentIds.length > 0) {
          await markAssignments(currentUser.id, result.importedAssignmentIds, 'imported');
        }

        setPrefillNotice(
          `${result.addedCount} ${result.addedCount === 1 ? 'Eintrag wurde' : 'Einträge wurden'} aus der Planung übernommen.`,
        );
        return result.entries;
      } catch (error) {
        // Ohne Netz bleibt es beim bisherigen Stand — der Bericht ist trotzdem nutzbar.
        console.error('Planung konnte nicht übernommen werden:', error);
        return base;
      }
    },
    [currentUser, selectedWeek, sites, leaveRequests],
  );

  // Beim Wechsel von Woche oder Benutzer: erst den lokalen Entwurf, sonst den
  // gespeicherten Stand aus der Datenbank. Der lokale Entwurf hat Vorrang, weil
  // er Eingaben enthalten kann, die mangels Netz noch nicht übertragen wurden.
  useEffect(() => {
    if (!currentUser) return;
    let cancelled = false;
    setWeekLoading(true);

    (async () => {
      const key = weekKey(selectedWeek);

      let draft: WeekDraft | null = null;
      try {
        const raw = localStorage.getItem(DRAFT_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as WeekDraft;
          if (parsed.weekStart === key) draft = parsed;
        }
      } catch (e) {
        console.error('Lokaler Entwurf konnte nicht gelesen werden:', e);
      }

      let remote: Awaited<ReturnType<typeof loadWeeklyReport>> = null;
      try {
        remote = await loadWeeklyReport(currentUser.id, selectedWeek);
      } catch (e) {
        console.error('Wochenbericht konnte nicht geladen werden:', e);
        setSaveState('offline');
      }

      if (cancelled) return;

      setReportStatus(remote ? (remote.status === 'signed' ? 'signed' : 'draft') : null);
      setEditReport(null);

      let base: WeeklyEntries;
      if (remote?.status === 'signed') {
        // Ein abgegebener Bericht wird genau so gezeigt, wie er unterschrieben
        // wurde — kein lokaler Entwurf schiebt sich mehr davor.
        base = remote.entries;
      } else if (draft) {
        base = draft.entries;
      } else if (remote) {
        base = remote.entries;
      } else {
        base = emptyWeek();
      }

      // Planung übernehmen, bevor der Stand angezeigt wird — so sieht der Maler
      // seine Woche gleich vollständig. In einen bereits abgegebenen und
      // unterschriebenen Bericht läuft bewusst nichts mehr nach.
      const withPlan = remote?.status === 'signed' ? base : await runPrefill(base);
      if (cancelled) return;

      setWeeklyEntries(withPlan);
      setWeekLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [currentUser, selectedWeek, runPrefill]);

  /**
   * Wochentage, an denen eine Arbeitszeile ohne Tätigkeitsbeschreibung steht.
   *
   * Geprüft wird beim Abgeben und nicht nur am Eingabefeld: Zeilen aus der
   * Wochenplanung kommen absichtlich ohne Beschreibung in den Bericht (die
   * Notiz des Büros ist keine), und genau die würden sonst leer beim Büro
   * landen. Abwesenheitszeilen — Urlaub, Feiertag, Lager — beschreiben sich
   * selbst und bleiben außen vor, ebenso die Büro-Konten.
   */
  const daysMissingDescription = (): string[] => {
    if (isAdmin) return [];
    return WEEKDAYS.filter((day) =>
      (weeklyEntries[day]?.entries ?? []).some((entry) => {
        const site = sites.find((s) => s.number === entry.projectNumber);
        if (site?.is_absence_code) return false;
        return !entry.description?.trim();
      }),
    );
  };

  /**
   * Löscht eine Berichtszeile. Stammt sie aus der Planung, wird sie als
   * verworfen vermerkt und nie wieder automatisch eingefügt.
   */
  const handleDeleteEntry = async (day: string, entry: WeeklyEntry) => {
    const filtered = (weeklyEntries[day]?.entries || []).filter(e => e.id !== entry.id);
    setWeeklyEntries({ ...weeklyEntries, [day]: { entries: filtered } });

    if (entry.sourceAssignmentId && currentUser) {
      try {
        await markAssignments(currentUser.id, [entry.sourceAssignmentId], 'dismissed');
      } catch (error) {
        console.error('Verworfene Planzeile konnte nicht vermerkt werden:', error);
      }
    }
  };

  // Jede Änderung sofort lokal sichern. Ohne das war die eingegebene Woche nach
  // einem Neuladen der Seite verloren.
  useEffect(() => {
    if (weekLoading) return;
    const draft: WeekDraft = {
      weekStart: weekKey(selectedWeek),
      entries: weeklyEntries,
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  }, [weeklyEntries, weekLoading, selectedWeek]);

  const persistWeek = React.useCallback(
    async (options: { signature?: string | null; sign?: boolean } = {}) => {
      if (!currentUser) return false;
      setSaveState('saving');
      try {
        await saveWeeklyReport(currentUser.id, selectedWeek, weeklyEntries, sites, options);
        setSaveState('saved');
        return true;
      } catch (error) {
        console.error('Wochenbericht konnte nicht übertragen werden:', error);
        // Der lokale Entwurf bleibt bestehen und wird später erneut versucht.
        setSaveState('offline');
        return false;
      }
    },
    [currentUser, selectedWeek, weeklyEntries, sites],
  );

  // Sobald wieder Netz da ist, den lokalen Stand nachreichen.
  useEffect(() => {
    const onOnline = () => {
      if (saveState === 'offline') persistWeek();
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [saveState, persistWeek]);

  // Gepufferte Abnahmen nachreichen: einmal beim Start und bei jedem
  // Netzwechsel. Die PDF liegt schon auf dem Gerät des Malers, hier geht es
  // nur noch um den Weg ins Büro.
  useEffect(() => {
    if (!currentUser) return;
    let aborted = false;
    const flush = async () => {
      if (await pendingAbnahmeCount() === 0) {
        if (!aborted) setPendingAbnahmen(0);
        return;
      }
      const remaining = await flushAbnahmeQueue();
      if (!aborted) setPendingAbnahmen(remaining);
    };
    flush();
    window.addEventListener('online', flush);
    return () => {
      aborted = true;
      window.removeEventListener('online', flush);
    };
  }, [currentUser]);

  // Nur noch das Abnahmeprotokoll wird auf dem Gerät zum PDF. Der
  // Wochenbericht geht als Daten ans Büro und wird dort gedruckt.
  const generatePDFBlob = async (signatures: { employee?: string, customer?: string }) => {
    const doc = new jsPDF();
    
    // Header
    doc.setFontSize(10);
    doc.text("Malermeister Uderstadt GmbH", 20, 15);
    doc.text("Luisenweg 7, 20537 Hamburg", 20, 20);
    
    try {
      const img = new Image();
      const baseUrl = import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;
      img.src = `${window.location.origin}${baseUrl}logo.png?v=${__APP_VERSION__}`;
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });
      
      const maxWidth = 40;
      const maxHeight = 20;
      let logoWidth = maxWidth;
      let logoHeight = maxHeight;
      if (img.width && img.height) {
        const ratio = img.width / img.height;
        if (ratio > maxWidth / maxHeight) {
          logoWidth = maxWidth;
          logoHeight = maxWidth / ratio;
        } else {
          logoHeight = maxHeight;
          logoWidth = maxHeight * ratio;
        }
      }
      const logoX = 190 - logoWidth; // Aligns the right edge to x=190
      doc.addImage(img, 'PNG', logoX, 10, logoWidth, logoHeight); 
    } catch (e) {
      console.error("Failed to load logo.png for PDF generation, using fallback", e);
      doc.setFontSize(14);
      doc.text("Malerprofis", 150, 20);
      doc.setFontSize(10);
    }
    
    doc.setFontSize(16);
    doc.text('Abnahmeprotokoll', 20, 40);
    doc.setFontSize(12);
    doc.text(`Mitarbeiter: ${userName.firstName} ${userName.lastName}`, 20, 50);
    
    let currentY = 60;
    
    doc.text(`Baustelle / Adresse: ${abnahme.address}`, 20, currentY);
    doc.text(`Baustellennummer: ${abnahme.number}`, 20, currentY + 10);
    doc.text(`Teilnehmer: ${abnahme.participants.join(', ')}`, 20, currentY + 20);
    doc.text(`Art der Abnahme: ${abnahme.type === 'teil' ? 'Teilabnahme' : 'Gesamtabnahme'}`, 20, currentY + 30);
    doc.text(`Status: ${abnahme.status === 'ohne' ? 'Ohne sichtbare Mängel' : 'Mit Mängeln/Restarbeiten'}`, 20, currentY + 40);

    currentY += 50;
    if (abnahme.status === 'mit' && abnahme.tasks && abnahme.tasks.length > 0) {
      doc.text(`Mängel/Kommentar:`, 20, currentY);
      currentY += 10;

      abnahme.tasks.forEach((task) => {
        // Check if text would overflow
        if (currentY > 275) {
          doc.addPage();
          currentY = 20;
        }
        doc.text(`- ${task.text}`, 25, currentY);
        currentY += 7;

        if (task.photo) {
          // Check if image would overflow (needs 37.5mm + margin)
          if (currentY > 230) {
            doc.addPage();
            currentY = 20;
          }
          try {
            let formatType = 'JPEG';
            if (task.photo.includes('image/png')) {
              formatType = 'PNG';
            }
            doc.addImage(task.photo, formatType, 25, currentY, 50, 37.5);
            currentY += 42;
          } catch (e) {
            console.error("Error drawing photo in PDF:", e);
            doc.text("[Fehler beim Laden des Fotos]", 25, currentY);
            currentY += 7;
          }
        }
      });
      currentY += 5;
    }

    // Signature area
    if (currentY > 240) {
      doc.addPage();
      currentY = 20;
    }

    doc.text(`Datum: ${format(new Date(), 'dd.MM.yyyy')}`, 20, currentY);
    doc.text("Unterschrift Mitarbeiter:", 20, currentY + 10);
    if (signatures.employee) {
        doc.addImage(signatures.employee, 'PNG', 20, currentY + 15, 50, 20);
    }

    doc.text(`Datum: ${format(new Date(), 'dd.MM.yyyy')}`, 120, currentY);
    doc.text("Unterschrift Kunde:", 120, currentY + 10);
    if (signatures.customer) {
        doc.addImage(signatures.customer, 'PNG', 120, currentY + 15, 50, 20);
    }

    return doc.output('blob');
  };

  /**
   * Speichert die unterschriebene Abnahme: PDF aufs Gerät, dieselbe Datei ans
   * Büro.
   *
   * Der Download kommt zuerst und ohne Bedingung. Er ist der Teil, auf den
   * sich der Maler vor Ort verlässt — er darf nicht daran scheitern, dass die
   * Baustelle kein Netz hat. Die Übertragung wandert dann notfalls in den
   * Puffer und geht später von allein raus.
   */
  const handleSaveReport = async (customSignatures?: { employee?: string, customer?: string }) => {
    if (!userName.firstName || !userName.lastName) {
      alert("Bitte geben Sie zuerst Ihren Namen in den Einstellungen ein.");
      return;
    }
    const signatures = {
      employee: customSignatures?.employee || abnahme.employeeSignature,
      customer: customSignatures?.customer || abnahme.customerSignature,
    };

    const blob = await generatePDFBlob(signatures);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Abnahmeprotokoll.pdf';
    a.click();
    URL.revokeObjectURL(url);
    addReportToHistory('Abnahmeprotokoll', 'gespeichert', abnahme.number);

    if (!currentUser) {
      alert('PDF ist auf dem Gerät gespeichert. Ohne Anmeldung konnte die Abnahme aber nicht ans Büro übertragen werden.');
      return;
    }

    const input = {
      siteNumber: abnahme.number,
      siteAddress: abnahme.address,
      participants: abnahme.participants,
      type: abnahme.type,
      status: abnahme.status,
      // Nur die Texte. Die Fotos stecken in der PDF, die gerade hochgeht.
      defects: abnahme.status === 'mit' ? abnahme.tasks.map((t) => t.text) : [],
    };

    try {
      await submitAbnahmeProtocol(currentUser.id, input, blob);
      alert('Abnahme gespeichert und ans Büro übertragen.');
      resetAbnahme();
    } catch (error) {
      console.error('Abnahme konnte nicht übertragen werden:', error);
      try {
        await queueAbnahme(currentUser.id, input, blob);
        setPendingAbnahmen((n) => n + 1);
        alert('Keine Verbindung. Die PDF liegt auf dem Gerät, die Abnahme wird automatisch ans Büro übertragen, sobald wieder Netz da ist.');
        resetAbnahme();
      } catch (queueError) {
        // Puffern ging auch nicht — dann darf das Formular nicht geleert
        // werden, sonst ist die Eingabe weg und nur die PDF bleibt übrig.
        console.error('Abnahme konnte nicht gepuffert werden:', queueError);
        alert('Die Abnahme konnte weder übertragen noch auf dem Gerät gesichert werden. Die PDF ist gespeichert — bitte die Abnahme mit Netz erneut speichern.');
      }
    }
  };

  const handleResetWeeklyReport = () => {
    setWeeklyEntries({
      Montag: { entries: [] },
      Dienstag: { entries: [] },
      Mittwoch: { entries: [] },
      Donnerstag: { entries: [] },
      Freitag: { entries: [] },
      Samstag: { entries: [] },
      Sonntag: { entries: [] },
    });
  };

  const handleSignatureConfirm = async () => {
    // Wochenbericht abgeben: unterschreiben und in die Datenbank schreiben.
    // Ein Versand entfällt — das Büro sieht den Bericht dort direkt.
    if (signatureAction === 'sendW') {
      if (!sigCanvas.current || sigCanvas.current.isEmpty()) {
        alert('Bitte unterschreibe den Bericht.');
        return;
      }
      const signature = sigCanvas.current.getCanvas().toDataURL('image/png');
      const ok = await persistWeek({ signature, sign: true });
      addReportToHistory(
        'Wochenbericht',
        'gespeichert',
        `${format(selectedWeek, 'dd.MM.')} - ${format(addDays(selectedWeek, 6), 'dd.MM.yyyy')}`,
      );
      alert(
        ok
          ? 'Wochenbericht wurde abgegeben.'
          : 'Keine Verbindung. Der Bericht ist auf dem Gerät gesichert und wird automatisch übertragen, sobald wieder Netz da ist.',
      );
    }
    else if (signatureAction === 'saveA') {
        if (signatureStep === 'employee') {
            const empSig = sigCanvas.current?.getCanvas().toDataURL('image/png');
            setAbnahme(prev => ({...prev, employeeSignature: empSig}));
            setSignatureStep('customer');
            sigCanvas.current?.clear();
            return; // Do not close modal
        } else {
            const custSig = sigCanvas.current?.getCanvas().toDataURL('image/png');
            const empSig = abnahme.employeeSignature;

            setAbnahme(prev => ({...prev, customerSignature: custSig}));
            handleSaveReport({ employee: empSig, customer: custSig });
            setAbnahme(prev => ({...prev, employeeSignature: undefined, customerSignature: undefined})); // Reset signatures
        }
    }
    setIsSignatureModalOpen(false);
    setSignatureAction(null);
    setSignatureStep('employee');
    sigCanvas.current?.clear();
  };

  // Escape schließt das Menü. Ohne das bliebe es am Handy offen stehen, wenn
  // jemand mit Tastatur arbeitet — und der Fangbereich daneben liegt über der
  // ganzen Seite.
  useEffect(() => {
    if (!isMobileMenuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsMobileMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isMobileMenuOpen]);

  const navItems = [
    { id: 'planung', label: 'Wochenplanung', icon: Calendar },
    { id: 'wochenbericht', label: 'Wochenberichte', icon: Clock },
    { id: 'abnahme', label: 'Abnahme', icon: CheckSquare },
    { id: 'leave', label: 'Urlaub', icon: Palmtree },
    ...(isAdmin ? [{ id: 'admin', label: 'Verwaltung', icon: Users }] : []),
    { id: 'settings', label: 'Einstellungen', icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-brand-bg text-[#141414] font-sans">
      {/* Seitenleiste — nur am großen Bildschirm. Am Handy führt das
          Burger-Menü oben rechts durch dieselben Reiter. */}
      <nav className="hidden md:flex fixed top-0 bottom-auto h-screen w-64 bg-white border-r border-[#141414]/10 px-6 py-2 flex-col z-50">
        <div className="flex items-center justify-center py-6 px-4">
          <Logo className="w-48 h-auto" />
        </div>

        <div className="flex flex-1 flex-col justify-start gap-2">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id as any)}
              className={cn(
                "flex flex-row items-center gap-3 px-4 py-3 rounded-xl transition-all",
                activeTab === item.id
                  ? "text-brand-accent1 bg-brand-accent1/10 font-medium"
                  : "text-[#141414]/50 hover:text-[#141414]"
              )}
            >
              <item.icon size={20} />
              <span className="text-sm">{item.label}</span>
            </button>
          ))}
        </div>
      </nav>

      {/* Main Content */}
      <main className="md:pl-64 min-h-screen">
        <header className="sticky top-0 bg-gray-100/80 backdrop-blur-md z-40 px-6 py-3 flex items-center justify-between md:hidden">
          <Logo className="w-36 h-auto" />

          {/* Burger-Menü. Das Panel hängt am Kopf und schließt beim Auswählen,
              bei einem Tipp daneben und mit Escape. */}
          <div className="relative">
            <button
              onClick={() => setIsMobileMenuOpen((open) => !open)}
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/70 border border-[#141414]/10 cursor-pointer"
              aria-label="Menü"
              aria-expanded={isMobileMenuOpen}
            >
              {isMobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
            </button>

            {isMobileMenuOpen && (
              <>
                {/* Fängt den Tipp daneben ab, ohne die Seite abzudunkeln. */}
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setIsMobileMenuOpen(false)}
                  aria-hidden
                />
                <div className="absolute right-0 top-11 z-50 w-56 bg-white rounded-2xl shadow-lg border border-[#141414]/10 p-2">
                  {navItems.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => {
                        setActiveTab(item.id as any);
                        setIsMobileMenuOpen(false);
                      }}
                      className={cn(
                        'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors',
                        activeTab === item.id
                          ? 'text-brand-accent1 bg-brand-accent1/10 font-medium'
                          : 'text-[#141414]/70 hover:bg-gray-50',
                      )}
                    >
                      <item.icon size={18} />
                      {item.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </header>

        <div className="max-w-5xl mx-auto p-6">
          {loadError && (
            <div className="mb-6 text-sm text-red-700 bg-red-50 border border-red-100 rounded-2xl p-4">
              <p className="font-bold">Daten konnten nicht geladen werden.</p>
              <p className="mt-1 text-red-600">{loadError}</p>
              <button
                onClick={reloadData}
                className="mt-3 bg-red-100 hover:bg-red-200 text-red-800 font-bold text-xs px-3 py-2 rounded-xl cursor-pointer"
              >
                Erneut versuchen
              </button>
            </div>
          )}
          {prefillNotice && (
            <div className="mb-6 flex items-center justify-between gap-4 text-sm text-brand-accent1 bg-brand-accent1/10 border border-brand-accent1/20 rounded-2xl p-4">
              <span>{prefillNotice}</span>
              <button
                onClick={() => setPrefillNotice(null)}
                className="text-brand-accent1/60 hover:text-brand-accent1 cursor-pointer"
                aria-label="Hinweis schließen"
              >
                <X size={16} />
              </button>
            </div>
          )}
          {saveState === 'offline' && (
            <div className="mb-6 text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-2xl p-4">
              Keine Verbindung — deine Eingaben sind auf dem Gerät gesichert und werden automatisch
              übertragen, sobald wieder Netz da ist.
            </div>
          )}

          <AnimatePresence mode="wait">
            {activeTab === 'wochenbericht' && (
              <motion.div
                key="wochenbericht"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                <div className="bg-white p-6 rounded-3xl shadow-sm border border-[#141414]/5 mb-6 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <h2 className="text-2xl font-bold">Wochenberichte</h2>
                    <div className="flex items-center gap-2 self-start sm:self-auto">
                        <button onClick={() => setSelectedWeek(subWeeks(selectedWeek, 1))} className="p-2 rounded-xl bg-gray-100 cursor-pointer hover:bg-gray-200 transition-colors">&lt;</button>
                        <span className="font-medium text-sm sm:text-base">{format(selectedWeek, 'dd.MM.')} - {format(addDays(selectedWeek, 6), 'dd.MM.yyyy')}</span>
                        <button onClick={() => setSelectedWeek(addWeeks(selectedWeek, 1))} className="p-2 rounded-xl bg-gray-100 cursor-pointer hover:bg-gray-200 transition-colors">&gt;</button>
                    </div>
                  </div>
                  <div className="flex flex-col md:flex-row md:items-center justify-between">
                    <p className="text-sm text-[#141414]/50">Gesamtwochenstunden</p>
                    <p className="text-3xl font-bold text-brand-accent2">{getWeeklyTotal()} Std.</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'].map((day, index) => (
                    <div key={day} className="bg-white p-6 rounded-3xl shadow-sm border border-[#141414]/5 space-y-4">
                      <div className="flex justify-between items-center border-b pb-2">
                        <div className="flex flex-col">
                            <h3 className="font-bold text-lg">{day}</h3>
                            <span className="text-sm text-[#141414]/50">{format(addDays(selectedWeek, index), 'dd.MM.yyyy')}</span>
                        </div>
                        <span className="text-brand-accent2 font-bold">{getDayTotal(weeklyEntries[day]?.entries || [])} Std.</span>
                      </div>
                      
                      <div className="space-y-3">
                        {weeklyEntries[day]?.entries.map(entry => {
                          // Urlaub, Feiertag und Büro (Abwesenheitscodes) sind
                          // nicht bearbeitbar — sie entstehen automatisch und
                          // folgen eigenen Regeln. Ein abgegebener Bericht ist
                          // ganz gesperrt.
                          const entrySite = sites.find(s => s.number === entry.projectNumber);
                          const isAbsence = entrySite?.is_absence_code ?? false;
                          const locked = reportStatus === 'signed';

                          if (editReport?.day === day && editReport?.id === entry.id) {
                            return (
                              <ReportEntryEditor
                                key={entry.id}
                                entry={entry}
                                day={day}
                                sites={sites}
                                office={isAdmin}
                                onCancel={() => setEditReport(null)}
                                onSave={(updated) => {
                                  setWeeklyEntries(prev => ({
                                    ...prev,
                                    [day]: {
                                      entries: (prev[day]?.entries ?? []).map(e =>
                                        e.id === entry.id ? updated : e,
                                      ),
                                    },
                                  }));
                                  setEditReport(null);
                                }}
                              />
                            );
                          }

                          return (
                          <div key={entry.id} className="relative p-3.5 bg-gray-50 rounded-2xl border border-gray-100 flex flex-col gap-1.5">
                            {/* Bearbeiten und Löschen als kleine Icons oben rechts */}
                            {!locked && (
                              <div className="absolute top-2.5 right-2.5 flex items-center gap-1">
                                {!isAbsence && (
                                  <button
                                    onClick={() => setEditReport({ day, id: entry.id })}
                                    className="text-gray-400 hover:text-brand-accent2 hover:bg-gray-100 p-1.5 rounded-xl transition-colors cursor-pointer"
                                    title="Eintrag bearbeiten"
                                  >
                                    <Pencil className="w-4 h-4" />
                                  </button>
                                )}
                                <button
                                  onClick={() => handleDeleteEntry(day, entry)}
                                  className="text-gray-400 hover:text-red-500 hover:bg-gray-100 p-1.5 rounded-xl transition-colors cursor-pointer"
                                  title="Eintrag löschen"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            )}

                            {/* Erste Zeile: Baustellennummer als Text */}
                            {entry.projectNumber && (
                              <div className="text-xs font-mono font-bold text-gray-500">
                                {entry.projectNumber}
                              </div>
                            )}

                            {/* Darunter: Baustelle / Adresse mit Stunden in Klammern */}
                            <div>
                              <p className="text-[#141414] font-medium text-sm leading-snug pr-14">
                                {entry.project} ({entry.hours}h)
                              </p>
                              {entry.startTime && entry.endTime && (
                                <p className="text-[11px] text-gray-500 font-medium mt-0.5">
                                  {entry.startTime} - {entry.endTime} {entry.pause ? `(Pause: ${entry.pause} Min.)` : '(Keine Pause)'}
                                </p>
                              )}
                            </div>

                            {/* Falls Tätigkeitsbeschreibung vorhanden, ohne Präfix anzeigen */}
                            {entry.description ? (
                              <div className="bg-white/60 p-2.5 rounded-xl border border-gray-100 mt-1">
                                <p className="text-gray-600 text-xs leading-relaxed whitespace-pre-wrap">{entry.description}</p>
                              </div>
                            ) : (
                              // Aus der Planung übernommene Zeilen kommen ohne
                              // Beschreibung an. Der Maler muss sehen, wo noch
                              // etwas fehlt, bevor er abgeben will.
                              !isAbsence && !isAdmin && (
                                <div className="bg-amber-50 border border-amber-100 p-2.5 rounded-xl mt-1">
                                  <p className="text-amber-700 text-xs font-medium">Tätigkeitsbeschreibung fehlt</p>
                                </div>
                              )
                            )}
                          </div>
                          );
                        })}
                      </div>

                      {reportStatus === 'signed' ? (
                      <div className="flex items-center gap-2 text-xs text-gray-400 bg-gray-50 rounded-xl p-3 mt-1">
                        <Lock className="w-3.5 h-3.5 shrink-0" />
                        Abgegeben — dieser Tag ist gesperrt.
                      </div>
                      ) : (
                      <div className="space-y-2 pt-2">
                        <input
                          type="text"
                          id={`num-${day}`}
                          list={`datalist-num-${day}`}
                          placeholder="Baustellennummer"
                          className="w-full p-3 bg-gray-100 rounded-xl border-none text-sm"
                          onChange={(e) => handleFieldSync(day, 'number', e.target.value)}
                          onInput={(e) => handleFieldSync(day, 'number', (e.target as HTMLInputElement).value)}
                          onBlur={(e) => handleFieldSync(day, 'number', e.target.value)}
                        />
                        <datalist id={`datalist-num-${day}`}>
                          {sites.map((p) => (
                            <option key={`num-${p.id}`} value={p.number}>{p.address}</option>
                          ))}
                        </datalist>

                        <input
                          type="text"
                          id={`proj-${day}`}
                          list={`datalist-proj-${day}`}
                          placeholder="Baustelle/Adresse"
                          className="w-full p-3 bg-gray-100 rounded-xl border-none text-sm"
                          onChange={(e) => handleFieldSync(day, 'address', e.target.value)}
                          onInput={(e) => handleFieldSync(day, 'address', (e.target as HTMLInputElement).value)}
                          onBlur={(e) => handleFieldSync(day, 'address', e.target.value)}
                        />
                        <datalist id={`datalist-proj-${day}`}>
                          {sites.map((p) => (
                            <option key={`proj-${p.id}`} value={p.address}>{p.number}</option>
                          ))}
                        </datalist>

                        <textarea id={`desc-${day}`} placeholder={isAdmin ? 'Tätigkeitsbeschreibung' : 'Tätigkeitsbeschreibung *'} className="w-full p-3 bg-gray-100 rounded-xl border-none h-20 text-sm" />
                        
                        <div className="flex flex-col sm:flex-row gap-2">
                          <div className="flex-1">
                            <label className="text-[11px] font-semibold text-[#141414]/40 uppercase tracking-wider block mb-1">Startzeit</label>
                            <input type="time" id={`start-${day}`} className="w-full p-3 bg-gray-100 rounded-xl border-none text-sm outline-none" />
                          </div>
                          <div className="flex-1">
                            <label className="text-[11px] font-semibold text-[#141414]/40 uppercase tracking-wider block mb-1">Endzeit</label>
                            <input type="time" id={`end-${day}`} className="w-full p-3 bg-gray-100 rounded-xl border-none text-sm outline-none" />
                          </div>
                        </div>

                        {(() => {
                          const daysOrder = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
                          const prevDay = index > 0 ? daysOrder[index - 1] : null;
                          if (!prevDay) return null;
                          return (
                            <button
                              type="button"
                              onClick={() => {
                                const prevEntries = weeklyEntries[prevDay]?.entries || [];
                                if (prevEntries.length === 0) {
                                  alert(`Keine Einträge für ${prevDay} vorhanden.`);
                                  return;
                                }
                                const cloned = prevEntries.map(e => ({
                                  ...e,
                                  id: Date.now().toString() + '-' + Math.random()
                                }));
                                setWeeklyEntries({
                                  ...weeklyEntries,
                                  [day]: {
                                    entries: [...(weeklyEntries[day]?.entries || []), ...cloned]
                                  }
                                });
                              }}
                              className="w-full p-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-xl font-bold transition-colors text-center text-xs cursor-pointer uppercase tracking-wider"
                            >
                              {prevDay} übernehmen
                            </button>
                          );
                        })()}

                        <button onClick={() => {
                          const project = (document.getElementById(`proj-${day}`) as HTMLInputElement).value;
                          const projectNumber = (document.getElementById(`num-${day}`) as HTMLInputElement).value;
                          const description = (document.getElementById(`desc-${day}`) as HTMLInputElement).value;
                          const startTime = (document.getElementById(`start-${day}`) as HTMLInputElement).value;
                          const endTime = (document.getElementById(`end-${day}`) as HTMLInputElement).value;
                          
                          if (!project) {
                            alert("Bitte Baustelle / Adresse eingeben.");
                            return;
                          }
                          if (!isAdmin && !description.trim()) {
                            alert("Bitte Tätigkeitsbeschreibung eingeben.");
                            return;
                          }
                          if (!startTime || !endTime) {
                            alert("Bitte Start- und Endzeit eingeben.");
                            return;
                          }

                          // Beim Maler liegt die Pause zu festen Uhrzeiten und
                          // wird nicht eingegeben: Abgezogen wird, was der
                          // Einsatz davon überdeckt. Zwei Baustellen an einem
                          // Tag ziehen dieselbe Pause deshalb nicht doppelt ab.
                          // Im Büro gilt stattdessen § 4 ArbZG.
                          const breakMins = breakMinutesForRole(startTime, endTime, day as typeof WEEKDAYS[number], isAdmin);
                          const hours = calculateHours(startTime, endTime, breakMins);

                          if (hours <= 0) {
                            alert("Die berechnete Arbeitszeit muss größer als 0 sein.");
                            return;
                          }

                          setWeeklyEntries({...weeklyEntries, [day]: { entries: [...(weeklyEntries[day]?.entries || []), { id: Date.now().toString(), project, projectNumber, description, hours, startTime, endTime, pause: breakMins }] }});

                          (document.getElementById(`proj-${day}`) as HTMLInputElement).value = '';
                          (document.getElementById(`num-${day}`) as HTMLInputElement).value = '';
                          (document.getElementById(`desc-${day}`) as HTMLInputElement).value = '';
                          (document.getElementById(`start-${day}`) as HTMLInputElement).value = '';
                          (document.getElementById(`end-${day}`) as HTMLInputElement).value = '';
                        }} className="w-full bg-brand-accent2 text-white p-2 rounded-xl font-bold hover:bg-brand-accent2/90 cursor-pointer">Baustelle hinzufügen</button>
                      </div>
                      )}
                    </div>
                  ))}
                </div>
                <div className="flex flex-col sm:flex-row gap-3 pt-6 w-full">
                  {reportStatus === 'signed' ? (
                    <div className="w-full flex items-center justify-center gap-2 bg-emerald-50 text-emerald-700 border border-emerald-100 p-4 rounded-2xl font-bold text-center">
                      <Lock className="w-4 h-4" /> Abgegeben und gesperrt
                    </div>
                  ) : (
                    <>
                      <button onClick={handleResetWeeklyReport} className="w-full sm:flex-1 bg-gray-200 text-[#141414] p-4 rounded-2xl font-bold hover:bg-gray-300 transition-colors cursor-pointer text-center">Woche leeren</button>
                      <button onClick={() => persistWeek()} className="w-full sm:flex-1 bg-brand-accent2 text-white p-4 rounded-2xl font-bold hover:bg-brand-accent2/90 transition-colors cursor-pointer text-center">Entwurf speichern</button>
                      <button onClick={() => {
                        // Vor der Unterschrift prüfen, nicht danach — sonst
                        // unterschreibt der Maler und erfährt erst dann, dass
                        // noch etwas fehlt.
                        const missing = daysMissingDescription();
                        if (missing.length > 0) {
                          alert(
                            'Bei jedem Einsatz muss eine Tätigkeitsbeschreibung stehen.\n\nEs fehlt noch: ' +
                              missing.join(', '),
                          );
                          return;
                        }
                        setIsSignatureModalOpen(true);
                        setSignatureAction('sendW');
                      }} className="w-full sm:flex-1 bg-brand-accent1 text-white p-4 rounded-2xl font-bold hover:bg-brand-accent1/90 transition-colors cursor-pointer text-center">Bericht abgeben</button>
                    </>
                  )}
                </div>
              </motion.div>
            )}

            {activeTab === 'abnahme' && (
              <motion.div
                key="abnahme"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                <h2 className="text-2xl font-bold">Abnahmeprotokoll</h2>
                {pendingAbnahmen > 0 && (
                  <p className="text-sm bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-3">
                    {pendingAbnahmen === 1
                      ? 'Eine Abnahme wartet noch auf die Übertragung ans Büro. Sie geht automatisch raus, sobald wieder Netz da ist.'
                      : `${pendingAbnahmen} Abnahmen warten noch auf die Übertragung ans Büro. Sie gehen automatisch raus, sobald wieder Netz da ist.`}
                  </p>
                )}
                {!isAbnahmePreview ? (
                  <div className="space-y-6">
                    {/* Container 1: Projektdaten */}
                    <div className="bg-white p-6 rounded-3xl shadow-sm border border-[#141414]/5 space-y-4">
                      <h3 className="text-lg font-bold text-[#141414] border-b pb-2">Projektdaten</h3>
                      
                      <div className="space-y-3">
                        <div>
                          <label className="text-xs font-semibold text-[#141414]/50 uppercase tracking-wider block mb-1">Baustellennummer</label>
                          <input
                            type="text"
                            id="abnahme-num"
                            list="datalist-abnahme-num"
                            placeholder="z.B. 040-7"
                            value={abnahme.number}
                            onChange={(e) => handleAbnahmeFieldSync('number', e.target.value)}
                            onInput={(e) => handleAbnahmeFieldSync('number', (e.target as HTMLInputElement).value)}
                            onBlur={(e) => handleAbnahmeFieldSync('number', e.target.value)}
                            className="w-full p-4 bg-gray-100 rounded-xl text-sm"
                          />
                          <datalist id="datalist-abnahme-num">
                            {sites.map((p) => (
                              <option key={`abnahme-num-${p.id}`} value={p.number}>{p.address}</option>
                            ))}
                          </datalist>
                        </div>

                        <div>
                          <label className="text-xs font-semibold text-[#141414]/50 uppercase tracking-wider block mb-1">Baustelle / Adresse</label>
                          <input
                            type="text"
                            id="abnahme-proj"
                            list="datalist-abnahme-proj"
                            placeholder="z.B. Luisenweg 7, Hamburg"
                            value={abnahme.address}
                            onChange={(e) => handleAbnahmeFieldSync('address', e.target.value)}
                            onInput={(e) => handleAbnahmeFieldSync('address', (e.target as HTMLInputElement).value)}
                            onBlur={(e) => handleAbnahmeFieldSync('address', e.target.value)}
                            className="w-full p-4 bg-gray-100 rounded-xl text-sm"
                          />
                          <datalist id="datalist-abnahme-proj">
                            {sites.map((p) => (
                              <option key={`abnahme-proj-${p.id}`} value={p.address}>{p.number}</option>
                            ))}
                          </datalist>
                        </div>
                      </div>
                    </div>

                    {/* Container 2: Teilnehmer */}
                    <div className="bg-white p-6 rounded-3xl shadow-sm border border-[#141414]/5 space-y-4">
                      <h3 className="text-lg font-bold text-[#141414] border-b pb-2">Teilnehmer</h3>
                      
                      <div className="space-y-3">
                        <label className="text-xs font-semibold text-[#141414]/50 uppercase tracking-wider block">Teilnehmer der Abnahme hinzufügen</label>
                        <div className="w-full">
                          <input
                            type="text"
                            placeholder="Name des Teilnehmers (Mit Enter bestätigen)"
                            value={newParticipant}
                            onChange={e => setNewParticipant(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                if(newParticipant.trim()) {
                                  setAbnahme({...abnahme, participants: [...abnahme.participants, newParticipant.trim()]});
                                  setNewParticipant('');
                                }
                              }
                            }}
                            className="w-full p-3.5 bg-gray-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-accent1/20"
                          />
                        </div>
                        
                        {abnahme.participants.length > 0 ? (
                          <div className="flex flex-wrap gap-2 pt-2">
                            {abnahme.participants.map((p, i) => (
                              <span key={i} className="bg-gray-100 border border-gray-200/50 pl-3 pr-2 py-1.5 rounded-full text-xs font-medium text-gray-700 flex items-center gap-1.5 shadow-sm">
                                {p}
                                <button
                                  type="button"
                                  onClick={() => {
                                    const filtered = abnahme.participants.filter((_, idx) => idx !== i);
                                    setAbnahme({ ...abnahme, participants: filtered });
                                  }}
                                  className="w-4 h-4 rounded-full bg-gray-200 hover:bg-red-100 hover:text-red-600 flex items-center justify-center text-[10px] text-gray-500 transition-colors cursor-pointer"
                                  title="Entfernen"
                                >
                                  ×
                                </button>
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-[#141414]/40 italic">Keine Teilnehmer hinzugefügt.</p>
                        )}
                      </div>
                    </div>

                    {/* Container 3: Abnahme */}
                    <div className="bg-white p-6 rounded-3xl shadow-sm border border-[#141414]/5 space-y-4">
                      <h3 className="text-lg font-bold text-[#141414] border-b pb-2">Abnahme</h3>
                      
                      <div className="space-y-4">
                        {/* 1. Art der Abnahme */}
                        <div className="space-y-2">
                          <label className="text-xs font-semibold text-[#141414]/50 uppercase tracking-wider block">Art der Abnahme</label>
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => setAbnahme({ ...abnahme, type: 'teil' })}
                              className={cn(
                                "px-2 py-3.5 rounded-xl border text-xs sm:text-sm font-semibold transition-all cursor-pointer text-center break-words whitespace-normal leading-tight flex items-center justify-center min-h-[48px]",
                                abnahme.type === 'teil'
                                  ? "bg-brand-accent1/15 border-brand-accent1 text-brand-accent1 shadow-sm font-bold"
                                  : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100"
                              )}
                            >
                              Teilabnahme
                            </button>
                            <button
                              type="button"
                              onClick={() => setAbnahme({ ...abnahme, type: 'gesamt' })}
                              className={cn(
                                "px-2 py-3.5 rounded-xl border text-xs sm:text-sm font-semibold transition-all cursor-pointer text-center break-words whitespace-normal leading-tight flex items-center justify-center min-h-[48px]",
                                abnahme.type === 'gesamt'
                                  ? "bg-brand-accent1/15 border-brand-accent1 text-brand-accent1 shadow-sm font-bold"
                                  : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100"
                              )}
                            >
                              Gesamtabnahme
                            </button>
                          </div>
                        </div>

                        {/* 2. Mängelstatus */}
                        <div className="space-y-2 pt-2">
                          <label className="text-xs font-semibold text-[#141414]/50 uppercase tracking-wider block">Mängelstatus</label>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => setAbnahme({ ...abnahme, status: 'ohne' })}
                              className={cn(
                                "px-2 py-3.5 rounded-xl border text-xs sm:text-sm font-semibold transition-all cursor-pointer text-center flex items-center justify-center gap-2 break-words whitespace-normal leading-tight min-h-[48px]",
                                abnahme.status === 'ohne'
                                  ? "bg-emerald-50 border-emerald-500 text-emerald-800 shadow-sm font-bold"
                                  : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100"
                              )}
                            >
                              Ohne sichtbare Mängel
                            </button>
                            <button
                              type="button"
                              onClick={() => setAbnahme({ ...abnahme, status: 'mit' })}
                              className={cn(
                                "px-2 py-3.5 rounded-xl border text-xs sm:text-sm font-semibold transition-all cursor-pointer text-center flex items-center justify-center gap-2 break-words whitespace-normal leading-tight min-h-[48px]",
                                abnahme.status === 'mit'
                                  ? "bg-red-50 border-red-500 text-red-800 shadow-sm font-bold"
                                  : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100"
                              )}
                            >
                              Mit Mängeln/Restarbeiten
                            </button>
                          </div>
                        </div>

                        {/* 3. Mängel/Kommentar bei "Mit Mängeln/Restarbeiten" */}
                        {abnahme.status === 'mit' && (
                          <div className="space-y-2 pt-2 border-t border-gray-100/80 mt-3 animate-fade-in">
                            <label className="text-xs font-semibold text-[#141414]/50 uppercase tracking-wider block">Mängel/Kommentar</label>
                            <div className="w-full">
                              <input
                                type="text"
                                placeholder="z.B. Sockelleiste im Flur nachbessern (Mit Enter bestätigen)"
                                value={newTask}
                                onChange={e => setNewTask(e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    if(newTask.trim()) {
                                      setAbnahme({...abnahme, tasks: [...abnahme.tasks, { text: newTask.trim() }]});
                                      setNewTask('');
                                    }
                                  }
                                }}
                                className="w-full p-3.5 bg-gray-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-accent1/20"
                              />
                            </div>
                            
                            {abnahme.tasks.length > 0 ? (
                              <div className="space-y-3 pt-2">
                                {abnahme.tasks.map((task, i) => (
                                  <div key={i} className="bg-gray-50 border border-gray-200/50 p-3.5 rounded-xl flex flex-col gap-2 shadow-sm animate-fade-in">
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="text-sm font-medium text-gray-700">{task.text}</span>
                                      
                                      <div className="flex items-center gap-2">
                                        {/* Camera Upload Button */}
                                        <label htmlFor={`photo-upload-${i}`} className="p-2 rounded-full hover:bg-gray-200 text-gray-500 hover:text-brand-accent1 transition-colors cursor-pointer flex items-center justify-center" title="Foto hinzufügen">
                                          <Camera className="w-4 h-4" />
                                          <input
                                            type="file"
                                            id={`photo-upload-${i}`}
                                            accept="image/*"
                                            className="hidden"
                                            onChange={(e) => handlePhotoUpload(i, e)}
                                          />
                                        </label>

                                        {/* Remove Button */}
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const filtered = abnahme.tasks.filter((_, idx) => idx !== i);
                                            setAbnahme({ ...abnahme, tasks: filtered });
                                          }}
                                          className="w-7 h-7 rounded-full bg-gray-200 hover:bg-red-100 hover:text-red-600 flex items-center justify-center text-sm text-gray-500 transition-colors cursor-pointer"
                                          title="Entfernen"
                                        >
                                          ×
                                        </button>
                                      </div>
                                    </div>

                                    {/* Thumbnail if photo exists */}
                                    {task.photo && (
                                      <div className="relative w-24 h-24 rounded-lg overflow-hidden border border-gray-300 shadow-inner group mt-1">
                                        <img src={task.photo} alt={`Mangel ${i + 1}`} className="w-full h-full object-cover" />
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const updated = [...abnahme.tasks];
                                            updated[i] = { ...updated[i], photo: undefined };
                                            setAbnahme({ ...abnahme, tasks: updated });
                                          }}
                                          className="absolute top-1 right-1 bg-black/60 hover:bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold transition-colors cursor-pointer shadow-md"
                                          title="Foto entfernen"
                                        >
                                          ×
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-xs text-[#141414]/40 italic">Keine Mängel / Arbeiten hinzugefügt.</p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Bottom buttons - Abbrechen first, then Abnahme erstellen */}
                    <div className="flex flex-col sm:flex-row gap-4 pt-6">
                      <button
                        onClick={resetAbnahme}
                        className="w-full bg-gray-200 text-[#141414] p-4 rounded-2xl font-bold hover:bg-gray-300 transition-colors cursor-pointer text-center"
                      >
                        Abbrechen
                      </button>
                      <button
                        onClick={() => {
                          if (!abnahme.address) {
                            alert("Bitte gib eine Baustelle / Adresse an.");
                            return;
                          }
                          setIsAbnahmePreview(true);
                        }}
                        className="w-full bg-brand-accent1 text-white p-4 rounded-2xl font-bold hover:bg-brand-accent1/90 transition-colors cursor-pointer text-center"
                      >
                        Abnahme erstellen
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {/* Header with Title and 'Vorschau' label */}
                    <div className="flex items-center justify-between border-b pb-3">
                      <h3 className="text-xl font-bold text-[#141414]">Vorschau des Abnahmeprotokolls</h3>
                      <span className="bg-brand-accent1/10 text-brand-accent1 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">Vorschau</span>
                    </div>

                    {/* Container 1: Projektdaten */}
                    <div className="bg-white p-6 rounded-3xl shadow-sm border border-[#141414]/5 space-y-3">
                      <h4 className="text-md font-bold text-[#141414] border-b pb-1.5 uppercase tracking-wide text-xs text-gray-500">Projektdaten</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                        <div>
                          <p className="text-xs font-semibold text-[#141414]/40 uppercase">Baustellennummer</p>
                          <p className="text-sm font-bold text-gray-800">{abnahme.number || '-'}</p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-[#141414]/40 uppercase">Baustelle / Adresse</p>
                          <p className="text-sm font-bold text-gray-800">{abnahme.address || '-'}</p>
                        </div>
                      </div>
                    </div>

                    {/* Container 2: Teilnehmer */}
                    <div className="bg-white p-6 rounded-3xl shadow-sm border border-[#141414]/5 space-y-3">
                      <h4 className="text-md font-bold text-[#141414] border-b pb-1.5 uppercase tracking-wide text-xs text-gray-500">Teilnehmer</h4>
                      <div className="pt-1">
                        {abnahme.participants.length > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {abnahme.participants.map((p, i) => (
                              <span key={i} className="bg-gray-100 border border-gray-200/50 px-3 py-1.5 rounded-full text-xs font-medium text-gray-700">
                                {p}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-gray-400 italic">Keine Teilnehmer angegeben</p>
                        )}
                      </div>
                    </div>

                    {/* Container 3: Abnahme */}
                    <div className="bg-white p-6 rounded-3xl shadow-sm border border-[#141414]/5 space-y-3">
                      <h4 className="text-md font-bold text-[#141414] border-b pb-1.5 uppercase tracking-wide text-xs text-gray-500">Abnahme</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                        <div>
                          <p className="text-xs font-semibold text-[#141414]/40 uppercase">Art der Abnahme</p>
                          <span className="inline-block mt-1 px-3 py-1 bg-brand-accent1/10 text-brand-accent1 text-xs font-bold rounded-lg">
                            {abnahme.type === 'teil' ? 'Teilabnahme' : 'Gesamtabnahme'}
                          </span>
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-[#141414]/40 uppercase">Mängelstatus</p>
                          <span className={cn(
                            "inline-block mt-1 px-3 py-1 text-xs font-bold rounded-lg",
                            abnahme.status === 'ohne' ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"
                          )}>
                            {abnahme.status === 'ohne' ? 'Ohne sichtbare Mängel' : 'Mit Mängeln/Restarbeiten'}
                          </span>
                        </div>
                      </div>

                      {abnahme.status === 'mit' && (
                        <div className="pt-3 border-t border-gray-100/80 mt-2">
                          <p className="text-xs font-semibold text-[#141414]/40 uppercase pb-1.5">Mängel/Kommentar</p>
                          {abnahme.tasks.length > 0 ? (
                            <div className="space-y-3.5 pl-2 pt-1">
                              {abnahme.tasks.map((task, i) => (
                                <div key={i} className="flex flex-col gap-2 pb-3 border-b border-gray-100 last:border-0 last:pb-0">
                                  <div className="flex items-start gap-2">
                                    <span className="text-brand-accent1 text-sm font-bold">•</span>
                                    <span className="text-sm text-gray-700 font-medium">{task.text}</span>
                                  </div>
                                  {task.photo && (
                                    <div className="w-28 h-21 ml-4 rounded-lg overflow-hidden border border-gray-200 shadow-sm">
                                      <img src={task.photo} alt={`Mangel ${i + 1}`} className="w-full h-full object-cover" />
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-gray-400 italic pl-2">Keine Mängel/Kommentare angegeben</p>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Ein Versand entfällt — gespeichert heißt: PDF aufs Gerät
                        und dieselbe Datei ans Büro. */}
                    <div className="flex flex-col sm:flex-row gap-4 pt-6">
                      <button onClick={() => setIsAbnahmePreview(false)} className="w-full sm:flex-1 bg-gray-200 text-[#141414] p-4 rounded-2xl font-bold hover:bg-gray-300 transition-colors cursor-pointer text-center">Abbrechen</button>
                      <button onClick={() => { setIsSignatureModalOpen(true); setSignatureAction('saveA'); }} className="w-full sm:flex-1 bg-brand-accent1 text-white p-4 rounded-2xl font-bold hover:bg-brand-accent1/90 transition-colors cursor-pointer text-center">Abnahme speichern</button>
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {isSignatureModalOpen && (
              <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                <div className="bg-white p-6 rounded-3xl w-full max-w-lg space-y-4">
                  <h3 className="font-bold text-lg">
                    {signatureAction === 'saveA'
                       ? (signatureStep === 'employee' ? 'Unterschrift Mitarbeiter' : 'Unterschrift Kunde')
                       : 'Hiermit bestätige ich die Richtigkeit der Eingaben:'}
                  </h3>
                  <div className="relative border rounded-xl overflow-hidden bg-gray-50">
                    <SignatureCanvas 
                      ref={sigCanvas} 
                      canvasProps={{ className: 'w-full h-40 cursor-crosshair' }} 
                    />
                    <button
                      type="button"
                      onClick={() => sigCanvas.current?.clear()}
                      className="absolute top-2.5 right-2.5 bg-white/80 hover:bg-white text-gray-600 hover:text-red-500 p-2 rounded-xl shadow-sm border border-[#141414]/5 transition-all cursor-pointer flex items-center justify-center"
                      title="Unterschrift zurücksetzen"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex gap-4">
                    <button onClick={() => setIsSignatureModalOpen(false)} className="flex-1 bg-gray-200 p-3 rounded-xl font-bold hover:bg-gray-300 transition-colors cursor-pointer text-center">Abbrechen</button>
                    <button onClick={handleSignatureConfirm} className="flex-1 bg-brand-accent1 text-white p-3 rounded-xl font-bold hover:bg-brand-accent1/90 transition-colors cursor-pointer text-center">Unterschreiben</button>
                  </div>
                </div>
              </div>
            )}







            {activeTab === 'leave' && currentUser && (
              <motion.div
                key="leave"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-8"
              >
                <LeaveView
                  currentUser={currentUser}
                  leaveRequests={leaveRequests}
                  holidays={holidays}
                  onSubmit={handleAddLeaveRequest}
                  onWithdraw={handleWithdrawLeaveRequest}
                />
              </motion.div>
            )}

            {activeTab === 'planung' && (
              <motion.div
                key="planung"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                {/* Begrüßung. Nennt bewusst immer den heutigen Tag — unabhängig
                    davon, durch welche Woche das Raster darunter gerade blättert. */}
                <div className="bg-white p-6 rounded-3xl border border-[#141414]/5 shadow-sm">
                  <h2 className="text-2xl font-bold tracking-tight mb-1 text-gray-900">
                    Moin, {userName.firstName || currentUser?.first_name || 'Mitarbeiter'}!
                  </h2>
                  <p className="text-sm text-[#141414]/60">
                    Heute ist {format(new Date(), 'EEEE', { locale: de })}, der{' '}
                    {format(new Date(), 'd. MMMM yyyy', { locale: de })}
                  </p>
                </div>

                <div>
                  <h2 className="text-2xl font-bold">Wochenplanung</h2>
                  <p className="text-sm text-[#141414]/50 mt-1">
                    {isAdmin
                      ? 'Wer ist diese Woche wo. Zum Ändern auf „Bearbeiten“ tippen — die Maler sehen die Planung sofort.'
                      : 'Wer ist diese Woche wo. Geplant wird im Büro.'}
                  </p>
                </div>
                <WeekGrid
                  employees={employees}
                  sites={sites}
                  canEdit={isAdmin}
                  currentEmployeeId={currentUser?.id}
                />
              </motion.div>
            )}

            {activeTab === 'admin' && isAdmin && (
              <motion.div
                key="admin"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <AdminPanel
                  employees={employees}
                  sites={sites}
                  leaveRequests={leaveRequests}
                  holidays={holidays}
                  assignmentCountInRange={assignmentCountInRange}
                  currentUserId={currentUser?.id ?? ''}
                  onChanged={reloadData}
                />
              </motion.div>
            )}

            {activeTab === 'settings' && (
              <motion.div
                key="settings"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-8"
              >
                <h2 className="text-2xl font-bold">Einstellungen</h2>

                {isAdmin && currentUser && (
                  <section className="space-y-4">
                    <h3 className="text-lg font-bold">Standard-Arbeitszeiten</h3>
                    <DefaultHours employeeId={currentUser.id} />
                  </section>
                )}

                <section className="space-y-4">
                  <h3 className="text-lg font-bold">Berichtshistorie</h3>
                  <div className="bg-white rounded-3xl overflow-hidden shadow-sm border border-[#141414]/5">
                    {reportHistory.map((h, i) => (
                      <div key={i} className={cn("p-4 flex items-center justify-between", i !== 0 && "border-t border-[#141414]/5")}>
                        <div>
                          <p className="font-medium">{h.type} ({h.detail})</p>
                          <p className="text-xs text-[#141414]/50">{format(new Date(h.date), 'dd.MM.yyyy HH:mm')}</p>
                        </div>
                        <span className={cn(
                          "px-3 py-1 rounded-full text-[10px] font-bold uppercase",
                          h.action === 'gespeichert' ? "bg-blue-100 text-blue-700" : "bg-emerald-100 text-emerald-700"
                        )}>
                          {h.action}
                        </span>
                      </div>
                    ))}
                    {reportHistory.length === 0 && (
                      <div className="p-8 text-center text-[#141414]/30 text-sm">
                        Keine Berichte bisher.
                      </div>
                    )}
                  </div>
                </section>

                <section className="space-y-4">
                  <h3 className="text-lg font-bold">App-Info</h3>
                  <div className="bg-white rounded-3xl shadow-sm border border-[#141414]/5 divide-y divide-[#141414]/5">
                    <div className="p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                      <div className="space-y-1">
                        <p className="text-sm font-bold text-gray-900">Malerprofis Uderstadt</p>
                        <p className="text-xs text-[#141414]/50">Version {__APP_VERSION__} (Build {__BUILD_DATE__})</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          Auf dem neuesten Stand
                        </span>
                        <button
                          onClick={() => window.location.reload()}
                          className="text-xs bg-gray-50 hover:bg-gray-100 border border-gray-200 text-gray-700 px-3 py-2 rounded-xl font-bold transition-colors cursor-pointer"
                        >
                          Nach Updates suchen
                        </button>
                      </div>
                    </div>

                    {currentUser && (
                      <div className="p-6">
                        <PushToggle employeeId={currentUser.id} />
                      </div>
                    )}
                  </div>
                </section>

                <button
                  onClick={signOut}
                  className="w-full flex items-center justify-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-4 rounded-2xl transition-colors cursor-pointer"
                >
                  <LogOut size={18} /> Abmelden
                </button>
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </main>

    </div>
  );
}
