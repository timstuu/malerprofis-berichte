-- Malerprofis Uderstadt — Grundschema
-- Ausführen im Supabase SQL Editor (einmalig, in dieser Reihenfolge).

-- ---------------------------------------------------------------------------
-- Tabellen
-- ---------------------------------------------------------------------------

-- Mitarbeiter. id ist identisch mit auth.users.id — das Büro legt den Auth-User
-- an und danach diese Zeile mit derselben UUID.
create table public.employees (
  id                   uuid primary key references auth.users(id) on delete cascade,
  first_name           text not null,
  last_name            text not null,
  role                 text not null default 'worker' check (role in ('admin', 'worker', 'tv')),
  remaining_leave_days integer not null default 30,
  active               boolean not null default true,
  created_at           timestamptz not null default now()
);

-- Baustellen inklusive der Abwesenheits-Codes (040-7 Feiertag, 060-7 Urlaub, ...).
create table public.sites (
  id              uuid primary key default gen_random_uuid(),
  number          text not null unique,
  address         text not null,
  customer        text,
  is_absence_code boolean not null default false,
  active          boolean not null default true,
  created_at      timestamptz not null default now()
);

-- Geplante Einsätze. Ein Datensatz = ein Mitarbeiter, ein Tag, eine Baustelle,
-- eine Zeitspanne. Mehrere pro Tag sind erlaubt.
create table public.assignments (
  id            uuid primary key default gen_random_uuid(),
  employee_id   uuid not null references public.employees(id) on delete cascade,
  site_id       uuid not null references public.sites(id) on delete restrict,
  date          date not null,
  start_time    time not null,
  end_time      time not null,
  break_minutes integer not null default 0,
  note          text,
  created_by    uuid references public.employees(id),
  created_at    timestamptz not null default now(),
  check (end_time > start_time)
);

create index assignments_date_idx on public.assignments (date);
create index assignments_employee_date_idx on public.assignments (employee_id, date);

-- Ein Wochenbericht pro Mitarbeiter und Kalenderwoche.
create table public.weekly_reports (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references public.employees(id) on delete cascade,
  week_start   date not null,               -- ISO-Montag der Woche
  status       text not null default 'draft' check (status in ('draft', 'signed')),
  signature    text,                        -- base64-PNG
  submitted_at timestamptz,
  updated_at   timestamptz not null default now(),
  unique (employee_id, week_start)
);

-- Die einzelnen Zeilen des Wochenberichts. source_assignment_id verweist auf die
-- Planzeile, aus der die Berichtszeile automatisch erzeugt wurde.
create table public.report_entries (
  id                   uuid primary key default gen_random_uuid(),
  report_id            uuid not null references public.weekly_reports(id) on delete cascade,
  date                 date not null,
  site_id              uuid references public.sites(id) on delete restrict,
  description          text,
  start_time           time,
  end_time             time,
  break_minutes        integer not null default 0,
  hours                numeric(5,2) not null default 0,
  source_assignment_id uuid references public.assignments(id) on delete set null,
  created_at           timestamptz not null default now()
);

create index report_entries_report_idx on public.report_entries (report_id);

-- Das Gedächtnis des automatischen Vorbefüllens: Eine Planzeile, die einmal
-- übernommen ('imported') oder vom Maler gelöscht ('dismissed') wurde, wird
-- nie wieder automatisch eingefügt.
create table public.assignment_imports (
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  employee_id   uuid not null references public.employees(id) on delete cascade,
  state         text not null check (state in ('imported', 'dismissed')),
  created_at    timestamptz not null default now(),
  primary key (assignment_id, employee_id)
);

-- Urlaubsanträge und Krankmeldungen.
-- Urlaub: vom Maler gestellt, Status 'pending', vom Büro entschieden.
-- Krank:  vom Büro erfasst, sofort mit Status 'approved'.
create table public.leave_requests (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  type        text not null default 'vacation' check (type in ('vacation', 'sick')),
  start_date  date not null,
  end_date    date not null,
  status      text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  days_count  integer not null default 0,
  comment     text,
  decided_by  uuid references public.employees(id),
  decided_at  timestamptz,
  created_at  timestamptz not null default now(),
  check (end_date >= start_date)
);

create index leave_requests_employee_idx on public.leave_requests (employee_id);
create index leave_requests_range_idx on public.leave_requests (start_date, end_date);

-- Gesetzliche Feiertage Hamburg.
create table public.holidays (
  date date primary key,
  name text not null
);

-- Web-Push-Empfänger. Ein Mitarbeiter kann mehrere Geräte haben.
create table public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Hilfsfunktion: Ist der angemeldete Benutzer Büro?
-- security definer, damit die Abfrage nicht selbst wieder durch RLS läuft.
-- ---------------------------------------------------------------------------

create function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.employees
    where id = auth.uid() and role = 'admin'
  );
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.employees          enable row level security;
alter table public.sites              enable row level security;
alter table public.assignments        enable row level security;
alter table public.weekly_reports     enable row level security;
alter table public.report_entries     enable row level security;
alter table public.assignment_imports enable row level security;
alter table public.leave_requests     enable row level security;
alter table public.holidays           enable row level security;
alter table public.push_subscriptions enable row level security;

-- Mitarbeiter und Baustellen: alle Angemeldeten lesen, nur das Büro schreibt.
create policy employees_select on public.employees
  for select to authenticated using (true);
create policy employees_write on public.employees
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy sites_select on public.sites
  for select to authenticated using (true);
create policy sites_write on public.sites
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Einsatzplanung: alle Maler sehen alles (damit jeder weiß, wer wo ist).
-- Geschrieben wird ausschließlich vom Büro.
create policy assignments_select on public.assignments
  for select to authenticated using (true);
create policy assignments_write on public.assignments
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Feiertage: alle lesen, nur Büro pflegt.
create policy holidays_select on public.holidays
  for select to authenticated using (true);
create policy holidays_write on public.holidays
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Wochenberichte: nur die eigenen. Das Büro darf alle lesen, aber nicht ändern —
-- ein unterschriebener Bericht gehört dem Mitarbeiter.
create policy weekly_reports_select on public.weekly_reports
  for select to authenticated using (employee_id = auth.uid() or public.is_admin());
create policy weekly_reports_insert on public.weekly_reports
  for insert to authenticated with check (employee_id = auth.uid());
create policy weekly_reports_update on public.weekly_reports
  for update to authenticated using (employee_id = auth.uid()) with check (employee_id = auth.uid());
create policy weekly_reports_delete on public.weekly_reports
  for delete to authenticated using (employee_id = auth.uid());

create policy report_entries_select on public.report_entries
  for select to authenticated using (
    exists (select 1 from public.weekly_reports r
            where r.id = report_id and (r.employee_id = auth.uid() or public.is_admin()))
  );
create policy report_entries_write on public.report_entries
  for all to authenticated using (
    exists (select 1 from public.weekly_reports r
            where r.id = report_id and r.employee_id = auth.uid())
  ) with check (
    exists (select 1 from public.weekly_reports r
            where r.id = report_id and r.employee_id = auth.uid())
  );

create policy assignment_imports_rw on public.assignment_imports
  for all to authenticated using (employee_id = auth.uid()) with check (employee_id = auth.uid());

-- Abwesenheiten: eigene immer, fremde erst wenn genehmigt. Das Büro sieht alles.
-- Der TV-Account fällt unter dieselbe Regel und sieht daher genau die
-- genehmigten Einträge — Krankmeldungen werden vom Büro sofort als 'approved'
-- angelegt und sind damit sichtbar.
create policy leave_requests_select on public.leave_requests
  for select to authenticated using (
    employee_id = auth.uid() or status = 'approved' or public.is_admin()
  );
-- Ein Maler stellt Anträge nur für sich und nur als 'pending'. Krankmeldungen
-- kann er nicht selbst erfassen.
create policy leave_requests_insert on public.leave_requests
  for insert to authenticated with check (
    (employee_id = auth.uid() and status = 'pending' and type = 'vacation')
    or public.is_admin()
  );
-- Entscheiden darf nur das Büro. Der Maler darf einen eigenen, noch offenen
-- Antrag zurückziehen.
create policy leave_requests_update on public.leave_requests
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy leave_requests_delete on public.leave_requests
  for delete to authenticated using (
    public.is_admin() or (employee_id = auth.uid() and status = 'pending')
  );

create policy push_subscriptions_rw on public.push_subscriptions
  for all to authenticated using (employee_id = auth.uid()) with check (employee_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Feiertage Hamburg erzeugen
-- ---------------------------------------------------------------------------

-- Ostersonntag nach dem gregorianischen Osteralgorithmus.
create function public.easter_sunday(p_year integer)
returns date
language plpgsql
immutable
as $$
declare
  a int; b int; c int; d int; e int; f int; g int;
  h int; i int; k int; l int; m int; mo int; da int;
begin
  a := p_year % 19;
  b := p_year / 100;
  c := p_year % 100;
  d := b / 4;
  e := b % 4;
  f := (b + 8) / 25;
  g := (b - f + 1) / 3;
  h := (19 * a + b - d - g + 15) % 30;
  i := c / 4;
  k := c % 4;
  l := (32 + 2 * e + 2 * i - h - k) % 7;
  m := (a + 11 * h + 22 * l) / 451;
  mo := (h + l - 7 * m + 114) / 31;
  da := ((h + l - 7 * m + 114) % 31) + 1;
  return make_date(p_year, mo, da);
end;
$$;

-- Legt die gesetzlichen Feiertage Hamburgs für ein Jahr an. Nachträglich für
-- weitere Jahre aufrufbar:  select public.seed_holidays(2031);
create function public.seed_holidays(p_year integer)
returns void
language plpgsql
as $$
declare
  ostern date := public.easter_sunday(p_year);
begin
  insert into public.holidays (date, name) values
    (make_date(p_year, 1, 1),   'Neujahr'),
    (ostern - 2,                'Karfreitag'),
    (ostern + 1,                'Ostermontag'),
    (make_date(p_year, 5, 1),   'Tag der Arbeit'),
    (ostern + 39,               'Christi Himmelfahrt'),
    (ostern + 50,               'Pfingstmontag'),
    (make_date(p_year, 10, 3),  'Tag der Deutschen Einheit'),
    (make_date(p_year, 10, 31), 'Reformationstag'),
    (make_date(p_year, 12, 25), '1. Weihnachtstag'),
    (make_date(p_year, 12, 26), '2. Weihnachtstag')
  on conflict (date) do nothing;
end;
$$;

select public.seed_holidays(y) from generate_series(2026, 2032) as y;

-- ---------------------------------------------------------------------------
-- Abwesenheits-Codes als Baustellen (bisher fest im Frontend verdrahtet)
-- ---------------------------------------------------------------------------

insert into public.sites (number, address, is_absence_code) values
  ('040-7', 'Feiertag',            true),
  ('050-7', 'Krank',               true),
  ('060-7', 'Urlaub',              true),
  ('061-7', 'Flexstunden minus',   true),
  ('070-7', 'Lagerarbeiten',       true),
  ('073-7', 'Mitarbeiterschulung', true)
on conflict (number) do nothing;
