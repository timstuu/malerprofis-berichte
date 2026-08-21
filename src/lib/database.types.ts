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

export interface PushSubscriptionRow {
  id: string;
  employee_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}
