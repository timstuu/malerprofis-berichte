-- Malerprofis Uderstadt — Fremdgewerke in der Wochenplanung
-- Ausführen im SQL Editor, nachdem 0005_employee_colors_and_breaks.sql lief.

-- ---------------------------------------------------------------------------
-- Zeilen für Fremdgewerke (Hebebühne, Tischler, Gerüstbauer …)
--
-- Bewusst nicht als Mitarbeiter: Eine Zeile in public.employees *ist* ein
-- Anmeldekonto (id references auth.users), und ein Tischler, der von der App
-- nichts weiß, braucht kein Login mit Zugriff auf die gesamte Planung.
--
-- Und bewusst je Woche: Fremdgewerke sind kurzfristig. Eine gepflegte
-- Stammdatenliste wäre Arbeit für etwas, das nächste Woche schon nicht mehr
-- gilt. Wiederkehrende Gewerke kommen über „Vorwoche übernehmen“ mit.
-- ---------------------------------------------------------------------------

create table if not exists public.trade_rows (
  id         uuid primary key default gen_random_uuid(),
  week_start date not null,                       -- ISO-Montag der Woche
  name       text not null,
  created_at timestamptz not null default now()
);

create index if not exists trade_rows_week_idx on public.trade_rows (week_start);

-- ---------------------------------------------------------------------------
-- Einträge einer Gewerk-Zeile
--
-- Eigene Tabelle statt einer Erweiterung von public.assignments: Ein
-- Gewerk-Eintrag teilt mit einem Einsatz nur Datum und Baustelle. Uhrzeiten und
-- Pause hat er nicht — für ein Fremdgewerk rechnet niemand Stunden ab. Sie in
-- assignments unterzubringen hieße, start_time, end_time und die Prüfbedingung
-- end_time > start_time für alle nullbar zu machen, also die meistgenutzte
-- Tabelle aufzuweichen, damit ein Sonderfall hineinpasst.
--
-- Nebeneffekt, der Ärger erspart: Die Vorbefüllung des Wochenberichts liest
-- ausschließlich assignments. Ein Gewerk kann damit konstruktionsbedingt keine
-- Stunden in irgendeinen Bericht schreiben.
-- ---------------------------------------------------------------------------

create table if not exists public.trade_entries (
  id           uuid primary key default gen_random_uuid(),
  trade_row_id uuid not null references public.trade_rows(id) on delete cascade,
  date         date not null,
  site_id      uuid not null references public.sites(id) on delete restrict,
  note         text,
  created_at   timestamptz not null default now()
);

create index if not exists trade_entries_row_idx on public.trade_entries (trade_row_id);
create index if not exists trade_entries_date_idx on public.trade_entries (date);

-- ---------------------------------------------------------------------------
-- Sicherheitsregeln: lesen alle Angemeldeten, schreiben nur das Büro.
-- Dieselbe Regel wie bei der Einsatzplanung — die Maler sollen sehen, wer sonst
-- noch auf ihrer Baustelle ist, ändern tut es das Büro.
-- ---------------------------------------------------------------------------

alter table public.trade_rows    enable row level security;
alter table public.trade_entries enable row level security;

drop policy if exists trade_rows_select on public.trade_rows;
create policy trade_rows_select on public.trade_rows
  for select to authenticated using (true);
drop policy if exists trade_rows_write on public.trade_rows;
create policy trade_rows_write on public.trade_rows
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists trade_entries_select on public.trade_entries;
create policy trade_entries_select on public.trade_entries
  for select to authenticated using (true);
drop policy if exists trade_entries_write on public.trade_entries;
create policy trade_entries_write on public.trade_entries
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Live-Aktualisierung für den Fernseher
--
-- Ohne diese Freigabe erscheint ein neu eingeplanter Tischler an der Wand erst
-- beim nächsten vollständigen Neuladen, also unter Umständen eine halbe Stunde
-- später.
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'trade_rows'
  ) then
    alter publication supabase_realtime add table public.trade_rows;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'trade_entries'
  ) then
    alter publication supabase_realtime add table public.trade_entries;
  end if;
end
$$;
