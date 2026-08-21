-- Malerprofis Uderstadt — Live-Aktualisierung für die Büroanzeige
-- Ausführen im Supabase SQL Editor, nachdem 0002_leave.sql gelaufen ist.

-- Ohne diese Freigabe verschickt Postgres keine Änderungsmeldungen; der
-- Fernseher würde erst beim nächsten Neuladen aktuell werden.
--
-- Welche Zeilen ein angemeldetes Gerät dabei zu sehen bekommt, entscheiden
-- weiterhin die RLS-Regeln aus 0001_init.sql — die Freigabe hier hebelt nichts
-- aus. Für das Anzeigekonto heißt das: alle Einsätze und alle genehmigten
-- Abwesenheiten, aber keine Wochenberichte und keine Unterschriften.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'assignments'
  ) then
    alter publication supabase_realtime add table public.assignments;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'leave_requests'
  ) then
    alter publication supabase_realtime add table public.leave_requests;
  end if;
end
$$;
