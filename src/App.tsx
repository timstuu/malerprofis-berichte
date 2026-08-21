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
  LayoutDashboard, 
  Clock, 
  CheckSquare, 
  Calendar, 
  Users, 
  Plus, 
  CheckCircle2, 
  XCircle, 
  ChevronRight,
  Menu,
  X,
  LogOut,
  FileText,
  Send,
  Trash2,
  Download,
  Pencil,
  Edit3,
  RotateCcw,
  Minus,
  Camera,
  Palmtree,
  Settings
} from 'lucide-react';
import SignatureCanvas from 'react-signature-canvas';
import { motion, AnimatePresence } from 'motion/react';
import { de } from 'date-fns/locale';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import Logo from './components/Logo.tsx';
import AdminPanel from './features/admin/AdminPanel.tsx';
import WeekGrid from './features/planning/WeekGrid.tsx';
import LeaveView from './features/leave/LeaveView.tsx';
import PushToggle from './features/leave/PushToggle.tsx';
import { useAuth } from './lib/auth.tsx';
import { calculateHours, WEEKDAYS } from './lib/hours.ts';
import {
  createLeaveRequest,
  decideLeaveRequest,
  emptyWeek,
  fetchAssignments,
  fetchEmployees,
  fetchHolidays,
  fetchLeaveRequests,
  fetchMyReportEntries,
  fetchSites,
  loadWeeklyReport,
  saveWeeklyReport,
  weekKey,
  withdrawLeaveRequest,
  type AssignmentRow,
  type ReportEntryRow,
  type WeeklyEntries,
  type WeeklyEntry,
} from './lib/data.ts';
import { fetchHandledAssignmentIds, markAssignments } from './lib/planning.ts';
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
  breaks: Record<string, number>;
  savedAt: string;
}

const DRAFT_KEY = 'weekDraft';

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'wochenbericht' | 'planung' | 'abnahme' | 'leave' | 'admin' | 'settings'>('dashboard');
  const [selectedWeek, setSelectedWeek] = useState(startOfISOWeek(new Date()));
  const { employee: currentUser, signOut } = useAuth();
  const isAdmin = currentUser?.role === 'admin';

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  /** Bereits gespeicherte Berichtszeilen des angemeldeten Mitarbeiters. */
  const [savedEntries, setSavedEntries] = useState<ReportEntryRow[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  /**
   * Einsätze im Umfeld von heute. Wird gebraucht, um vor einer Urlaubs-
   * genehmigung zu zeigen, wie viele geplante Einsätze dabei gelöscht werden.
   */
  const [nearbyAssignments, setNearbyAssignments] = useState<AssignmentRow[]>([]);
  const [reportHistory, setReportHistory] = useState<ReportHistory[]>([]);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedCalendarDay, setSelectedCalendarDay] = useState<Date>(new Date());
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

  const [weeklyBreaks, setWeeklyBreaks] = useState<Record<string, number>>({
    Montag: 0,
    Dienstag: 0,
    Mittwoch: 0,
    Donnerstag: 0,
    Freitag: 0,
    Samstag: 0,
    Sonntag: 0,
  });

  const handleDecreaseBreak = (day: string) => {
    setWeeklyBreaks(prev => {
      const current = prev[day] ?? 0;
      if (current === 60) return { ...prev, [day]: 30 };
      if (current === 30) return { ...prev, [day]: 0 };
      return prev;
    });
  };

  const handleIncreaseBreak = (day: string) => {
    setWeeklyBreaks(prev => {
      const current = prev[day] ?? 0;
      if (current === 0) return { ...prev, [day]: 30 };
      if (current === 30) return { ...prev, [day]: 60 };
      return prev;
    });
  };

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
    reader.onload = (e) => {
      const base64 = e.target?.result as string;
      const updated = [...abnahme.tasks];
      updated[index] = { ...updated[index], photo: base64 };
      setAbnahme(prev => ({ ...prev, tasks: updated }));
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
  const [signatureAction, setSignatureAction] = useState<'saveW' | 'sendW' | 'saveA' | 'sendA' | null>(null);
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
        fetchMyReportEntries(currentUser.id),
        fetchHolidays(from, to),
        fetchAssignments(from, to),
      ]);

      const [emp, siteList, leaves, entries, holidayList, assignments] = results;

      if (emp.status === 'fulfilled') setEmployees(emp.value);
      if (siteList.status === 'fulfilled') setSites(siteList.value);
      if (leaves.status === 'fulfilled') setLeaveRequests(leaves.value);
      if (entries.status === 'fulfilled') setSavedEntries(entries.value);
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

        const [assignments, handled, holidays] = await Promise.all([
          fetchAssignments(from, to),
          fetchHandledAssignmentIds(currentUser.id),
          fetchHolidays(from, to),
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
        setSavedEntries(await fetchMyReportEntries(currentUser.id));

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

      let base: WeeklyEntries;
      if (draft) {
        base = draft.entries;
        setWeeklyBreaks(draft.breaks);
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
      breaks: weeklyBreaks,
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  }, [weeklyEntries, weeklyBreaks, weekLoading, selectedWeek]);

  const persistWeek = React.useCallback(
    async (options: { signature?: string | null; sign?: boolean } = {}) => {
      if (!currentUser) return false;
      setSaveState('saving');
      try {
        await saveWeeklyReport(currentUser.id, selectedWeek, weeklyEntries, sites, options);
        setSavedEntries(await fetchMyReportEntries(currentUser.id));
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

  const generatePDFBlob = async (type: 'wochenbericht' | 'abnahme', signatures: { employee?: string, customer?: string }) => {
    const doc = new jsPDF();
    
    // Header
    doc.setFontSize(10);
    doc.text("Malermeister Uderstadt GmbH", 20, 15);
    doc.text("Luisenweg 7, 20537 Hamburg", 20, 20);
    
    try {
      const img = new Image();
      const baseUrl = import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;
      img.src = `${window.location.origin}${baseUrl}logo.png?v=1.0.4`;
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
    doc.text(type === 'wochenbericht' ? 'Wochenbericht' : 'Abnahmeprotokoll', 20, 40);
    doc.setFontSize(12);
    doc.text(`Mitarbeiter: ${userName.firstName} ${userName.lastName}`, 20, 50);
    
    let currentY = 60;
    
    if (type === 'wochenbericht') {
        const germanDayToOffset: { [key: string]: number } = {
          Montag: 0,
          Dienstag: 1,
          Mittwoch: 2,
          Donnerstag: 3,
          Freitag: 4,
          Samstag: 5,
          Sonntag: 6,
        };
        const tableData = Object.entries(weeklyEntries).flatMap(([day, data]) => {
          const offset = germanDayToOffset[day] ?? 0;
          const entryDate = format(addDays(selectedWeek, offset), 'dd.MM.yyyy');
          return data.entries.map(e => [
            entryDate, 
            e.projectNumber || '-', 
            e.project, 
            e.description || '-', 
            e.startTime || '-', 
            e.endTime || '-', 
            e.pause !== undefined ? `${e.pause} Min.` : '-', 
            `${e.hours} h`
          ]);
        });
        autoTable(doc, {
          startY: currentY,
          head: [['Datum', 'Nr.', 'Baustelle', 'Beschreibung', 'Startzeit', 'Endzeit', 'Pause', 'Std.']],
          body: tableData,
        });
        currentY = (doc as any).lastAutoTable.finalY + 20;
        
        // Signature area
        doc.text(`Datum: ${format(new Date(), 'dd.MM.yyyy')}`, 20, currentY);
        doc.text("Unterschrift Mitarbeiter:", 20, currentY + 10);
        if (signatures.employee) {
            doc.addImage(signatures.employee, 'PNG', 20, currentY + 15, 50, 20);
        }
    } else {
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
    }
    
    return doc.output('blob');
  };

  const handleSaveReport = async (type: 'wochenbericht' | 'abnahme', customSignatures?: { employee?: string, customer?: string }) => {
    if (!userName.firstName || !userName.lastName) {
      alert("Bitte geben Sie zuerst Ihren Namen in den Einstellungen ein.");
      return;
    }
    let signatures: { employee?: string, customer?: string } = {};
    if (type === 'wochenbericht') {
        if (sigCanvas.current && !sigCanvas.current.isEmpty()) {
            signatures.employee = sigCanvas.current.getCanvas().toDataURL('image/png');
        }
    } else {
        signatures.employee = customSignatures?.employee || abnahme.employeeSignature;
        signatures.customer = customSignatures?.customer || abnahme.customerSignature;
    }

    const blob = await generatePDFBlob(type, signatures);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${type === 'wochenbericht' ? 'Wochenbericht' : 'Abnahmeprotokoll'}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
    addReportToHistory(
      type === 'wochenbericht' ? 'Wochenbericht' : 'Abnahmeprotokoll', 
      'gespeichert',
      type === 'wochenbericht' 
        ? `${format(selectedWeek, 'dd.MM.')} - ${format(addDays(selectedWeek, 6), 'dd.MM.yyyy')}`
        : abnahme.number
    );
  };

  const handleSendReport = async (type: 'wochenbericht' | 'abnahme', customSignatures?: { employee?: string, customer?: string }) => {
    if (!userName.firstName || !userName.lastName) {
      alert("Bitte geben Sie zuerst Ihren Namen in den Einstellungen ein.");
      return;
    }
    let signatures: { employee?: string, customer?: string } = {};
    if (type === 'wochenbericht') {
        if (sigCanvas.current && !sigCanvas.current.isEmpty()) {
            signatures.employee = sigCanvas.current.getCanvas().toDataURL('image/png');
        }
    } else {
        signatures.employee = customSignatures?.employee || abnahme.employeeSignature;
        signatures.customer = customSignatures?.customer || abnahme.customerSignature;
    }

    const blob = await generatePDFBlob(type, signatures);
    const reader = new FileReader();
    reader.readAsDataURL(blob);
    reader.onloadend = () => {
      const base64data = reader.result;
      window.location.href = `mailto:?subject=${type === 'wochenbericht' ? 'Wochenbericht' : 'Abnahmeprotokoll'}&body=Anbei der Bericht.&attachment=${base64data}`;
    };
    addReportToHistory(
      type === 'wochenbericht' ? 'Wochenbericht' : 'Abnahmeprotokoll', 
      'versendet',
      type === 'wochenbericht' 
        ? `${format(selectedWeek, 'dd.MM.')} - ${format(addDays(selectedWeek, 6), 'dd.MM.yyyy')}`
        : abnahme.number
    );
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
    setWeeklyBreaks({
      Montag: 0,
      Dienstag: 0,
      Mittwoch: 0,
      Donnerstag: 0,
      Freitag: 0,
      Samstag: 0,
      Sonntag: 0,
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
    else if (signatureAction === 'saveA' || signatureAction === 'sendA') {
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
            
            if (signatureAction === 'saveA') {
              handleSaveReport('abnahme', { employee: empSig, customer: custSig });
            } else {
              handleSendReport('abnahme', { employee: empSig, customer: custSig });
            }
            
            setAbnahme(prev => ({...prev, employeeSignature: undefined, customerSignature: undefined})); // Reset signatures
        }
    }
    setIsSignatureModalOpen(false);
    setSignatureAction(null);
    setSignatureStep('employee');
    sigCanvas.current?.clear();
  };

  // Calendar helper functions
  const getCalendarDays = () => {
    const firstDayOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
    const lastDayOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);
    
    const startDate = startOfISOWeek(firstDayOfMonth);
    const endDate = addDays(startOfISOWeek(lastDayOfMonth), 6);
    
    const days: Date[] = [];
    let curr = startDate;
    while (curr <= endDate) {
      days.push(curr);
      curr = addDays(curr, 1);
    }
    return days;
  };

  const getCalendarDayStatus = (date: Date) => {
    const dayStr = format(date, 'yyyy-MM-dd');
    const isCurrentMonth = date.getMonth() === currentMonth.getMonth() && date.getFullYear() === currentMonth.getFullYear();
    
    if (!isCurrentMonth) {
      return 'outside';
    }

    // Check sick requests / entries first
    const hasSickLeave = leaveRequests.some(req => {
      if (req.employee_id !== currentUser?.id || req.status === 'rejected') return false;
      const isSickType = req.type.toLowerCase().includes('sick') || req.type.toLowerCase().includes('krank');
      return isSickType && dayStr >= req.start_date && dayStr <= req.end_date;
    });

    const dayOfWeekIndex = (date.getDay() + 6) % 7; // Monday = 0, Sunday = 6
    const correspondingWeekDayDate = addDays(selectedWeek, dayOfWeekIndex);
    const hasDraftSick = (() => {
      if (format(correspondingWeekDayDate, 'yyyy-MM-dd') === dayStr) {
        const germanDays = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
        const germanDayName = germanDays[date.getDay()];
        const draftEntries = weeklyEntries[germanDayName]?.entries || [];
        return draftEntries.some(e => 
          e.project.toLowerCase().includes('krank') || 
          e.description.toLowerCase().includes('krank')
        );
      }
      return false;
    })();

    // Bereits gespeicherte Berichtszeilen dieses Tages
    const dailySavedEntries = savedEntries.filter(entry => entry.date === dayStr);
    const hasTimeEntrySick = dailySavedEntries.some(e =>
      (e.sites?.address ?? '').toLowerCase().includes('krank') ||
      (e.description ?? '').toLowerCase().includes('krank')
    );

    if (hasSickLeave || hasDraftSick || hasTimeEntrySick) {
      return 'sick';
    }

    // Check leave requests (Urlaub or Flex is BLAU)
    const hasLeave = leaveRequests.some(req => {
      if (req.employee_id !== currentUser?.id || req.status === 'rejected') return false;
      const isSickType = req.type.toLowerCase().includes('sick') || req.type.toLowerCase().includes('krank');
      return !isSickType && dayStr >= req.start_date && dayStr <= req.end_date;
    });

    // Check draft weekly entries for vacation / flex
    const hasDraftVacation = (() => {
      if (format(correspondingWeekDayDate, 'yyyy-MM-dd') === dayStr) {
        const germanDays = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
        const germanDayName = germanDays[date.getDay()];
        const draftEntries = weeklyEntries[germanDayName]?.entries || [];
        return draftEntries.some(e => 
          e.project.toLowerCase().includes('urlaub') || 
          e.project.toLowerCase().includes('flex') ||
          e.description.toLowerCase().includes('urlaub') ||
          e.description.toLowerCase().includes('flex')
        );
      }
      return false;
    })();

    // Check saved report entries for vacation / flex
    const hasTimeEntryVacation = dailySavedEntries.some(e => {
      const address = (e.sites?.address ?? '').toLowerCase();
      const description = (e.description ?? '').toLowerCase();
      return (
        address.includes('urlaub') ||
        address.includes('flex') ||
        description.includes('urlaub') ||
        description.includes('flex')
      );
    });

    if (hasLeave || hasDraftVacation || hasTimeEntryVacation) {
      return 'leave';
    }

    // Check work hours (GRÜN)
    const totalTimeHours = dailySavedEntries.reduce((sum, e) => sum + Number(e.hours), 0);

    let totalDraftHours = 0;
    if (format(correspondingWeekDayDate, 'yyyy-MM-dd') === dayStr) {
      const germanDays = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
      const germanDayName = germanDays[date.getDay()];
      const draftEntries = weeklyEntries[germanDayName]?.entries || [];
      totalDraftHours = draftEntries.reduce((sum, e) => sum + e.hours, 0);
    }

    if (totalTimeHours > 0 || totalDraftHours > 0) {
      return 'work';
    }

    return 'empty';
  };

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'planung', label: 'Wochenplanung', icon: Calendar },
    { id: 'wochenbericht', label: 'Wochenberichte', icon: Clock },
    { id: 'abnahme', label: 'Abnahme', icon: CheckSquare },
    { id: 'leave', label: 'Urlaub', icon: Palmtree },
    ...(isAdmin ? [{ id: 'admin', label: 'Verwaltung', icon: Users }] : []),
    { id: 'settings', label: 'Einstellungen', icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-brand-bg text-[#141414] font-sans">
      {/* Sidebar / Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-[#141414]/10 px-6 py-2 md:top-0 md:bottom-auto md:h-screen md:w-64 md:border-t-0 md:border-r flex md:flex-col z-50">
        <div className="hidden md:flex items-center justify-center py-6 px-4">
          <Logo className="w-48 h-auto" />
        </div>

        <div className="flex flex-1 justify-around md:flex-col md:justify-start md:gap-2">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id as any)}
              className={cn(
                "flex flex-col md:flex-row items-center gap-1 md:gap-3 p-2 md:px-4 md:py-3 rounded-xl transition-all",
                activeTab === item.id 
                  ? "text-brand-accent1 md:bg-brand-accent1/10 font-medium" 
                  : "text-[#141414]/50 hover:text-[#141414]"
              )}
            >
              <item.icon size={20} />
              <span className="text-[10px] md:text-sm">{item.label}</span>
            </button>
          ))}
        </div>
      </nav>

      {/* Main Content */}
      <main className="pb-24 md:pb-0 md:pl-64 min-h-screen">
        <header className="sticky top-0 bg-gray-100/80 backdrop-blur-md z-40 px-6 py-3 flex items-center justify-between md:hidden">
          <Logo className="w-36 h-auto" />
          <div className="w-8 h-8 bg-[#E4E3E0] rounded-full flex items-center justify-center text-xs font-bold">
            {currentUser?.first_name[0]}
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
            {activeTab === 'dashboard' && (
              <motion.div
                key="dashboard"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                {/* Header Welcome Card */}
                <div className="bg-white p-6 rounded-3xl border border-[#141414]/5 shadow-sm">
                  <h2 className="text-2xl font-bold tracking-tight mb-1 text-gray-900">
                    Moin, {userName.firstName || currentUser?.first_name || 'Mitarbeiter'}!
                  </h2>
                  <p className="text-sm text-[#141414]/60">
                    Heute ist {format(new Date(), 'EEEE', { locale: de })}, der {format(new Date(), 'd. MMMM yyyy', { locale: de })}
                  </p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                  {/* Calendar main section */}
                  <div className="lg:col-span-3 bg-white p-5 md:p-6 rounded-3xl shadow-sm border border-[#141414]/5 space-y-4">
                    {/* Month header & navigation */}
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex flex-col">
                        <h3 className="text-lg font-bold text-[#141414] capitalize">
                          {format(currentMonth, 'MMMM yyyy', { locale: de })}
                        </h3>
                      </div>
                      <div className="flex items-center gap-1 bg-gray-50 p-1 rounded-xl border border-gray-100 shadow-inner">
                        <button 
                          onClick={() => setCurrentMonth(prev => subMonths(prev, 1))} 
                          className="p-1.5 hover:bg-white hover:shadow-sm rounded-lg transition-all text-gray-600 font-bold"
                          title="Vorheriger Monat"
                        >
                          &lt;
                        </button>
                        <button 
                          onClick={() => setCurrentMonth(new Date())} 
                          className="px-2 py-1 text-[10px] font-bold hover:bg-white hover:shadow-sm rounded-lg transition-all text-gray-500 uppercase"
                          title="Aktueller Monat"
                        >
                          Heute
                        </button>
                        <button 
                          onClick={() => setCurrentMonth(prev => addMonths(prev, 1))} 
                          className="p-1.5 hover:bg-white hover:shadow-sm rounded-lg transition-all text-gray-600 font-bold"
                          title="Nächster Monat"
                        >
                          &gt;
                        </button>
                      </div>
                    </div>

                    {/* Week days header */}
                    <div className="grid grid-cols-7 gap-1 md:gap-2 text-center">
                      {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map(d => (
                        <div key={d} className="text-[10px] md:text-xs font-bold text-gray-400 uppercase tracking-wider">
                          {d}
                        </div>
                      ))}
                    </div>

                    {/* Days grid */}
                    <div className="grid grid-cols-7 gap-2 md:gap-3">
                      {getCalendarDays().map((day, idx) => {
                        const status = getCalendarDayStatus(day);
                        const isSelected = format(day, 'yyyy-MM-dd') === format(selectedCalendarDay, 'yyyy-MM-dd');
                        const isToday = format(day, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');
                        
                        return (
                          <button
                            key={idx}
                            onClick={() => setSelectedCalendarDay(day)}
                            className={cn(
                              "aspect-square w-full max-w-[44px] mx-auto flex flex-col items-center justify-center rounded-full font-semibold text-xs md:text-sm relative transition-all duration-150 outline-none",
                              status === 'outside' && "border border-dashed border-gray-200 text-gray-300 bg-gray-50/30",
                              status === 'work' && "bg-emerald-500 text-white border border-emerald-500 shadow-sm shadow-emerald-100",
                              status === 'leave' && "bg-blue-500 text-white border border-blue-500 shadow-sm shadow-blue-100",
                              status === 'sick' && "bg-red-500 text-white border border-red-500 shadow-sm shadow-red-100",
                              status === 'empty' && "bg-white text-gray-700 border border-gray-200 hover:border-brand-accent1 hover:bg-gray-50 cursor-pointer",
                              isSelected && "ring-2 ring-brand-accent1 ring-offset-2 scale-105 z-10 font-bold"
                            )}
                          >
                            <span>{day.getDate()}</span>
                            {isToday && (
                              <span className={cn(
                                "absolute bottom-1 w-1 h-1 rounded-full",
                                status === 'work' || status === 'leave' || status === 'sick' ? 'bg-white' : 'bg-brand-accent1'
                              )} />
                            )}
                          </button>
                        );
                      })}
                    </div>

                    {/* Calendar legend */}
                    <div className="pt-2">
                      <div className="bg-gray-50/70 p-4 rounded-2xl border border-gray-100/50">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2.5">Legende</p>
                        <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-xs">
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full bg-emerald-500" />
                            <span className="text-gray-600">Stunden erfasst</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full bg-blue-500" />
                            <span className="text-gray-600">Urlaub / Flex</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full bg-red-500" />
                            <span className="text-gray-600">Krank</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full bg-white border border-gray-200" />
                            <span className="text-gray-600">Keine Berichte</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Day details sidebar/card */}
                  <div className="lg:col-span-2 space-y-4">
                    <div className="bg-white p-5 md:p-6 rounded-3xl shadow-sm border border-[#141414]/5 space-y-4 h-full flex flex-col justify-between">
                      <div>
                        <h3 className="text-lg font-bold text-[#141414]">Details zum Tag</h3>
                        <p className="text-sm text-brand-accent1 font-medium capitalize">
                          {format(selectedCalendarDay, 'EEEE, d. MMMM yyyy', { locale: de })}
                        </p>
                      </div>

                      <div className="flex-1 overflow-y-auto space-y-3 min-h-[220px] mt-4">
                        {(() => {
                          const selectedDayStr = format(selectedCalendarDay, 'yyyy-MM-dd');
                          
                          // 1. Bereits gespeicherte Berichtszeilen dieses Tages
                          const dayTimeEntries = savedEntries.filter(e => e.date === selectedDayStr);

                          // 2. Get Draft weekly entries if in selectedWeek
                          const isDayInSelectedWeek = format(startOfISOWeek(selectedCalendarDay), 'yyyy-MM-dd') === format(selectedWeek, 'yyyy-MM-dd');
                          const dayDraftEntries = (() => {
                            if (isDayInSelectedWeek) {
                              const germanDays = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
                              const germanDayName = germanDays[selectedCalendarDay.getDay()];
                              return weeklyEntries[germanDayName]?.entries || [];
                            }
                            return [];
                          })();

                          // 3. Get Leave requests
                          const dayLeaveRequests = leaveRequests.filter(req => {
                            if (req.employee_id !== currentUser?.id) return false;
                            return selectedDayStr >= req.start_date && selectedDayStr <= req.end_date;
                          });

                          const hasAnyEntries = dayTimeEntries.length > 0 || dayDraftEntries.length > 0 || dayLeaveRequests.length > 0;

                          if (!hasAnyEntries) {
                            return (
                              <div className="h-full flex flex-col items-center justify-center text-center p-4 py-8 space-y-4">
                                <p className="text-sm text-gray-400">Keine Stunden oder Abwesenheiten für diesen Tag erfasst.</p>
                                <div className="flex flex-col gap-2 w-full">
                                  <button 
                                    onClick={() => {
                                      setSelectedWeek(startOfISOWeek(selectedCalendarDay));
                                      setActiveTab('wochenbericht');
                                    }} 
                                    className="w-full text-xs font-bold bg-gray-50 hover:bg-gray-100 border border-gray-100 text-brand-accent2 py-3 rounded-xl transition-all"
                                  >
                                    Bericht ausfüllen
                                  </button>
                                  <button 
                                    onClick={() => setActiveTab('leave')} 
                                    className="w-full text-xs font-bold bg-gray-50 hover:bg-gray-100 border border-gray-100 text-blue-600 py-3 rounded-xl transition-all"
                                  >
                                    Urlaub einreichen
                                  </button>
                                </div>
                              </div>
                            );
                          }

                          return (
                            <div className="space-y-3">
                              {/* Leave Requests */}
                              {dayLeaveRequests.map((req, idx) => {
                                const isSick = req.type.toLowerCase().includes('sick') || req.type.toLowerCase().includes('krank');
                                const typeLabel = isSick ? 'Krankmeldung' : (req.type === 'vacation' ? 'Urlaub' : 'Flex');
                                return (
                                  <div 
                                    key={`leave-${idx}`} 
                                    className={cn(
                                      "flex justify-between items-center p-4 rounded-2xl border",
                                      isSick ? "bg-red-50/50 border-red-100/50" : "bg-blue-50/50 border-blue-100/50"
                                    )}
                                  >
                                    <div>
                                      <p className={cn("font-semibold text-sm", isSick ? "text-red-900" : "text-blue-900")}>Abwesenheit ({typeLabel})</p>
                                      <p className={cn("text-xs capitalize", isSick ? "text-red-500" : "text-blue-500")}>Status: {req.status === 'approved' ? 'Genehmigt' : req.status === 'rejected' ? 'Abgelehnt' : 'Ausstehend'}</p>
                                    </div>
                                    <span className={cn(
                                      "text-[10px] font-bold px-2.5 py-1 rounded-lg uppercase",
                                      isSick ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700"
                                    )}>{req.status}</span>
                                  </div>
                                );
                              })}

                              {/* Gespeicherte Berichtszeilen */}
                              {dayTimeEntries.map((e, idx) => (
                                <div key={`time-${idx}`} className="flex justify-between items-center bg-emerald-50/50 p-4 rounded-2xl border border-emerald-100">
                                  <div>
                                    <p className="font-semibold text-sm text-emerald-900">
                                      {e.sites?.address ?? 'Ohne Baustelle'}{' '}
                                      <span className="text-[10px] text-emerald-700 font-bold uppercase">(Bericht)</span>
                                    </p>
                                    <p className="text-xs text-emerald-600">{e.description || 'Keine Notiz'}</p>
                                  </div>
                                  <span className="font-mono text-sm font-bold bg-emerald-100 text-emerald-800 px-3 py-1 rounded-xl">{e.hours} Std.</span>
                                </div>
                              ))}

                              {/* Draft weekly Entries */}
                              {dayDraftEntries.map((e, idx) => (
                                <div key={`draft-${idx}`} className="flex justify-between items-center bg-amber-50/50 p-4 rounded-2xl border border-amber-100">
                                  <div>
                                    <p className="font-semibold text-sm text-amber-900">
                                      {e.project} <span className="text-[10px] text-amber-700 font-bold uppercase">(Entwurf)</span>
                                    </p>
                                    <p className="text-xs text-amber-600">{e.description || 'Keine Beschreibung'}</p>
                                  </div>
                                  <span className="font-mono text-sm font-bold bg-amber-100 text-amber-800 px-3 py-1 rounded-xl">{e.hours} Std.</span>
                                </div>
                              ))}

                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

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
                        {weeklyEntries[day]?.entries.map(entry => (
                          <div key={entry.id} className="relative p-3.5 bg-gray-50 rounded-2xl border border-gray-100 flex flex-col gap-1.5">
                            {/* Löschen-Funktion als kleines Icon oben rechts */}
                            <button
                              onClick={() => handleDeleteEntry(day, entry)}
                              className="absolute top-2.5 right-2.5 text-gray-400 hover:text-red-500 hover:bg-gray-100 p-1.5 rounded-xl transition-colors cursor-pointer"
                              title="Eintrag löschen"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>

                            {/* Erste Zeile: Baustellennummer als Text */}
                            {entry.projectNumber && (
                              <div className="text-xs font-mono font-bold text-gray-500">
                                {entry.projectNumber}
                              </div>
                            )}

                            {/* Darunter: Baustelle / Adresse mit Stunden in Klammern */}
                            <div>
                              <p className="text-[#141414] font-medium text-sm leading-snug pr-7">
                                {entry.project} ({entry.hours}h)
                              </p>
                              {entry.startTime && entry.endTime && (
                                <p className="text-[11px] text-gray-500 font-medium mt-0.5">
                                  {entry.startTime} - {entry.endTime} {entry.pause ? `(Pause: ${entry.pause} Min.)` : '(Keine Pause)'}
                                </p>
                              )}
                            </div>

                            {/* Falls Tätigkeitsbeschreibung vorhanden, ohne Präfix anzeigen */}
                            {entry.description && (
                              <div className="bg-white/60 p-2.5 rounded-xl border border-gray-100 mt-1 pr-7">
                                <p className="text-gray-600 text-xs leading-relaxed whitespace-pre-wrap">{entry.description}</p>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>

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

                        <textarea id={`desc-${day}`} placeholder="Tätigkeitsbeschreibung" className="w-full p-3 bg-gray-100 rounded-xl border-none h-20 text-sm" />
                        
                        <div className="flex gap-2">
                          <div className="flex-1">
                            <label className="text-[11px] font-semibold text-[#141414]/40 uppercase tracking-wider block mb-1">Startzeit</label>
                            <input type="time" id={`start-${day}`} className="w-full p-3 bg-gray-100 rounded-xl border-none text-sm outline-none" />
                          </div>
                          <div className="flex-1">
                            <label className="text-[11px] font-semibold text-[#141414]/40 uppercase tracking-wider block mb-1">Endzeit</label>
                            <input type="time" id={`end-${day}`} className="w-full p-3 bg-gray-100 rounded-xl border-none text-sm outline-none" />
                          </div>
                        </div>

                        <div className="flex items-center justify-between bg-gray-50 p-3 rounded-xl border border-gray-100 mt-1">
                          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Mit Pause</span>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleDecreaseBreak(day)}
                              className="w-8 h-8 flex items-center justify-center bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg transition-colors cursor-pointer"
                              title="Pause verringern"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                            <span className="text-xs font-bold text-gray-700 min-w-[70px] text-center">
                              {weeklyBreaks[day] ?? 0} Minuten
                            </span>
                            <button
                              type="button"
                              onClick={() => handleIncreaseBreak(day)}
                              className="w-8 h-8 flex items-center justify-center bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg transition-colors cursor-pointer"
                              title="Pause verlängern"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
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
                          if (!startTime || !endTime) {
                            alert("Bitte Start- und Endzeit eingeben.");
                            return;
                          }

                          const breakMins = weeklyBreaks[day] ?? 0;
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
                          
                          setWeeklyBreaks(prev => ({ ...prev, [day]: 0 }));
                        }} className="w-full bg-brand-accent2 text-white p-2 rounded-xl font-bold hover:bg-brand-accent2/90 cursor-pointer">Baustelle hinzufügen</button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex flex-col sm:flex-row gap-3 pt-6 w-full">
                  <button onClick={handleResetWeeklyReport} className="w-full sm:flex-1 bg-gray-200 text-[#141414] p-4 rounded-2xl font-bold hover:bg-gray-300 transition-colors cursor-pointer text-center">Woche leeren</button>
                  <button onClick={() => handleSaveReport('wochenbericht')} className="w-full sm:flex-1 bg-gray-200 text-[#141414] p-4 rounded-2xl font-bold hover:bg-gray-300 transition-colors cursor-pointer text-center">Als PDF</button>
                  <button onClick={() => persistWeek()} className="w-full sm:flex-1 bg-brand-accent2 text-white p-4 rounded-2xl font-bold hover:bg-brand-accent2/90 transition-colors cursor-pointer text-center">Entwurf speichern</button>
                  <button onClick={() => { setIsSignatureModalOpen(true); setSignatureAction('sendW'); }} className="w-full sm:flex-1 bg-brand-accent1 text-white p-4 rounded-2xl font-bold hover:bg-brand-accent1/90 transition-colors cursor-pointer text-center">Bericht abgeben</button>
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

                    {/* Bottom preview buttons - Abbrechen, then Abnahme speichern, then Abnahme senden */}
                    <div className="flex flex-col sm:flex-row gap-4 pt-6">
                      <button onClick={() => setIsAbnahmePreview(false)} className="w-full sm:flex-1 bg-gray-200 text-[#141414] p-4 rounded-2xl font-bold hover:bg-gray-300 transition-colors cursor-pointer text-center">Abbrechen</button>
                      <button onClick={() => { setIsSignatureModalOpen(true); setSignatureAction('saveA'); }} className="w-full sm:flex-1 bg-brand-accent2 text-white p-4 rounded-2xl font-bold hover:bg-brand-accent2/90 transition-colors cursor-pointer text-center">Abnahme speichern</button>
                      <button onClick={() => { setIsSignatureModalOpen(true); setSignatureAction('sendA'); }} className="w-full sm:flex-1 bg-brand-accent1 text-white p-4 rounded-2xl font-bold hover:bg-brand-accent1/90 transition-colors cursor-pointer text-center">Abnahme senden</button>
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {isSignatureModalOpen && (
              <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                <div className="bg-white p-6 rounded-3xl w-full max-w-lg space-y-4">
                  <h3 className="font-bold text-lg">
                    {signatureAction === 'saveA' || signatureAction === 'sendA' 
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
                        <p className="text-xs text-[#141414]/50">Version 1.0.4 (Build 2026.07.13)</p>
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
