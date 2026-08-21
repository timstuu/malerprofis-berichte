-- Malerprofis Uderstadt — Hinweiszeile der Wochenplanung
-- Ausführen im Supabase SQL Editor, nachdem 0003_realtime.sql gelaufen ist.

-- ---------------------------------------------------------------------------
-- Ein freier Hinweis je Kalendertag, für den ganzen Betrieb
--
-- Gedacht für das, was dem Tag gehört und nicht einer Person:
-- Betriebsversammlung, Brückentag, Lager geschlossen, Kunde kommt.
-- Was eine einzelne Person betrifft, gehört weiterhin als Abwesenheitscode
-- (Urlaub, Krank, Schulung) in die Einsatzplanung.
--
-- Der Tag ist der Schlüssel: Pro Tag gibt es genau einen Hinweis, und ein
-- zweiter Eintrag überschreibt den ersten statt sich danebenzulegen.
-- ---------------------------------------------------------------------------

create table if not exists public.week_notes (
  date       date primary key,
  text       text not null,
  updated_by uuid references public.employees(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.week_notes enable row level security;

-- Lesen dürfen alle Angemeldeten: Die Maler sehen die Planung schreibgeschützt
-- mit, und der Hinweis ist genau für sie gedacht. Geschrieben wird nur im Büro.
drop policy if exists week_notes_select on public.week_notes;
create policy week_notes_select on public.week_notes
  for select to authenticated using (true);

drop policy if exists week_notes_write on public.week_notes;
create policy week_notes_write on public.week_notes
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Live-Aktualisierung für den Fernseher
--
-- Ohne diese Freigabe erscheint ein neuer Hinweis an der Wand erst beim
-- nächsten vollständigen Neuladen — also unter Umständen eine halbe Stunde
-- später. Für einen Hinweis wie „Betriebsversammlung 14 Uhr" ist das zu spät.
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'week_notes'
  ) then
    alter publication supabase_realtime add table public.week_notes;
  end if;
end
$$;
