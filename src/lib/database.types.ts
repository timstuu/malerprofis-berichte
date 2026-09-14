/**
 * Datentypen der Supabase-Tabellen.
 * Spiegelt supabase/migrations/0001_init.sql wider — bei Schemaänderungen
 * müssen beide Dateien gemeinsam angepasst werden.
 */

export type Role = 'admin' | 'worker' | 'tv';
export type ReportStatus = 'draft' | 'signed';
export type LeaveType = 'vacation' | 'sick';
export type LeaveStatus = 'pending' | 'approved' | 'rejected';
export type ImportState = 'imported' | 'dismissed';

export interface Employee {
  id: string;
  first_name: string;
  last_name: string;
  role: Role;
  remaining_leave_days: number;
  active: boolean;
  /** Bezeichner aus der Palette in colors.ts, nicht der Farbwert selbst. */
  color: string | null;
  created_at?: string;
}

export interface Site {
  id: string;
  number: string;
  address: string;
  customer: string | null;
  is_absence_code: boolean;
  active: boolean;
}

export interface Assignment {
  id: string;
  employee_id: string;
  site_id: string;
  date: string; // yyyy-MM-dd
  start_time: string; // HH:MM:SS
  end_time: string;
  break_minutes: number;
  /**
   * Hinweis des Büros an den Maler, z. B. „Kunde ab 10 Uhr da“. Steht nur im
   * Planungsraster — der Wochenbericht übernimmt ihn bewusst nicht.
   */
  note: string | null;
  created_by: string | null;
  created_at?: string;
}

export interface WeeklyReport {
  id: string;
  employee_id: string;
  week_start: string; // yyyy-MM-dd, ISO-Montag
  status: ReportStatus;
  signature: string | null;
  submitted_at: string | null;
  updated_at?: string;
}

export interface ReportEntry {
  id: string;
  report_id: string;
  date: string;
  site_id: string | null;
  /** Baustelle als Klartext — auch wenn sie nicht im Stammdatenkatalog steht. */
  site_number: string | null;
  site_address: string | null;
  description: string | null;
  start_time: string | null;
  end_time: string | null;
  break_minutes: number;
  hours: number;
  source_assignment_id: string | null;
}

export interface AssignmentImport {
  assignment_id: string;
  employee_id: string;
  state: ImportState;
}

export interface LeaveRequest {
  id: string;
  employee_id: string;
  type: LeaveType;
  start_date: string;
  end_date: string;
  status: LeaveStatus;
  days_count: number;
  comment: string | null;
  decided_by: string | null;
  decided_at: string | null;
  created_at?: string;
}

/**
 * Eine Zeile für ein Fremdgewerk in der Wochenplanung — Hebebühne, Tischler,
 * Gerüstbauer. Gilt nur für ihre Woche; kein Mitarbeiter, kein Anmeldekonto.
 */
export interface TradeRow {
  id: string;
  week_start: string; // yyyy-MM-dd, ISO-Montag
  name: string;
  created_at?: string;
}

/** Ein Eintrag einer Gewerk-Zeile: Baustelle an einem Tag, dazu eine Notiz. */
export interface TradeEntry {
  id: string;
  trade_row_id: string;
  date: string;
  site_id: string;
  note: string | null;
  created_at?: string;
}

/** Gewerk-Eintrag mit den Stammdaten seiner Baustelle. */
export interface TradeEntryRow extends TradeEntry {
  sites: { number: string; address: string } | null;
}

/**
 * Die Standard-Arbeitszeit eines Büro-Kontos an einem Wochentag.
 *
 * Nur für Rolle 'admin' gedacht: Büro-Konten werden nicht eingeplant, ihre
 * Stunden entstehen deshalb nicht aus Einsätzen, sondern aus dieser Vorgabe.
 * Ein Wochentag ohne Zeile bedeutet „an dem Tag wird nicht gearbeitet" — die
 * Zeile ist die Aussage, nicht ihr Inhalt.
 */
export interface DefaultHours {
  employee_id: string;
  /** ISO-Wochentag: 1 = Montag … 7 = Sonntag. */
  weekday: number;
  start_time: string; // HH:MM:SS
  end_time: string;
}

/** Ein freier Hinweis für einen Kalendertag, gültig für den ganzen Betrieb. */
export interface WeekNote {
  date: string; // yyyy-MM-dd
  text: string;
  updated_by: string | null;
  updated_at?: string;
}

export interface Holiday {
  date: string;
  name: string;
}

/**
 * Wie die Mehrwertsteuer eines Belegs erfasst ist. Bei einem einzelnen Satz
 * rechnet die App die Steuer aus dem Brutto, bei 'mixed' stehen beide Beträge
 * so da, wie der Maler sie vom Beleg abgelesen hat.
 */
export type VatMode = 'none' | '7' | '19' | 'mixed';
export type PayoutKind = 'ueberweisung' | 'bar' | 'vorschuss';

/** Ein Kassenbeleg. Offen, solange `settlement_id` leer ist. */
export interface ExpenseReceipt {
  id: string;
  employee_id: string;
  receipt_date: string; // yyyy-MM-dd
  /** „Name/Ort“ der Excel-Vorlage. */
  vendor: string;
  /** „Art“ der Excel-Vorlage. */
  category: string;
  vat_mode: VatMode;
  /** Euro, wie numeric aus der Datenbank kommt. */
  gross: number;
  vat7: number;
  vat19: number;
  photo_paths: string[];
  settlement_id: string | null;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

/** Eine Auszahlungszeile unter der Summe eines Abschlusses. */
export interface ExpensePayout {
  date: string; // yyyy-MM-dd
  kind: PayoutKind;
  /** Euro. */
  amount: number;
}

/** Monatsabschluss der Auslagen eines Mitarbeiters. */
export interface ExpenseSettlement {
  id: string;
  employee_id: string;
  month: string; // yyyy-MM-01
  settled_on: string; // yyyy-MM-dd
  total: number;
  payouts: ExpensePayout[];
  created_by: string | null;
  created_at: string;
}

export interface PushSubscriptionRow {
  id: string;
  employee_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}
