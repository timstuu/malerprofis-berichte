-- Malerprofis Uderstadt — Stundenkontingent je Baustelle
-- Ausführen im Supabase SQL Editor, nachdem 0016_expense_entertainment.sql lief.

-- ---------------------------------------------------------------------------
-- 1. Veranschlagte Gesamtstunden
--
-- Nullbar, und die Null ausdrücklich verboten: „nicht hinterlegt" und „nichts
-- mehr übrig" sind zweierlei. Ohne Zahl erscheint die Baustelle gar nicht erst
-- in der Leiste der Wochenplanung; mit aufgebrauchtem Rest verschwindet sie
-- wieder. Wären beide dasselbe, ließe sich eine frisch angelegte Baustelle nie
-- von einer überplanten unterscheiden.
--
-- numeric(8,2), weil halbe Stunden die Währung dieser App sind — die
-- Regelschicht hat 8,5 Stunden, nicht 8 oder 9.
-- ---------------------------------------------------------------------------

alter table public.sites
  add column if not exists total_hours numeric(8,2);

alter table public.sites
  drop constraint if exists sites_total_hours_positive;

alter table public.sites
  add constraint sites_total_hours_positive
  check (total_hours is null or total_hours > 0);

-- 0001_init.sql legt Indizes auf date und (employee_id, date) an, aber keinen
-- auf site_id — genau danach gruppiert die Sicht weiter unten.
create index if not exists assignments_site_idx on public.assignments (site_id);

-- ---------------------------------------------------------------------------
-- 2. Verplante Stunden je Baustelle
--
-- Die erste Sicht in diesem Projekt — das ist Absicht, kein Versehen.
--
-- Gezählt wird der Plan, nicht der Bericht: Die Leiste beantwortet „was kann
-- noch eingeplant werden", nicht „was ist noch zu tun". Und sie zählt über alle
-- Zeiten, Vergangenheit wie Zukunft, ohne Stichtag.
--
-- Warum in der Datenbank und nicht im Browser: Die Wochenplanung lädt
-- absichtlich immer nur sechs Tage (fetchAssignments). Eine Summe über alles im
-- Browser hieße, bei jedem abgelegten Block die gesamte Einsatzhistorie
-- herunterzuladen.
--
-- Warum eine Sicht und keine gepflegte Spalte auf sites: Zwischen Browser und
-- Datenbank steht kein Server. Eine Zahl, die bei jedem Anlegen, Verschieben,
-- Löschen, beim Übernehmen der Vorwoche und bei jedem `on delete cascade`
-- mitwandern müsste, liefe irgendwann falsch — und niemand merkte es.
--
-- Die Rechnung ist der SQL-Zwilling von calculateHours() aus src/lib/hours.ts:
-- brutto minus gespeicherte Pause. Laufen beide auseinander, zeigt die Leiste
-- einen anderen Rest, als der Plan hergibt. Die Gegenprobe steht in
-- src/lib/site-hours.test.ts. Über Mitternacht muss sie nicht rechnen können —
-- `check (end_time > start_time)` auf assignments schließt das aus.
--
-- security_invoker = true ist nicht optional: Ohne das gehörte die Sicht dem
-- postgres-Konto und umginge damit die Zeilenregeln. So gilt darunter
-- assignments_select (using (true)) — die Leiste sieht genau die Zeilen, die
-- das Raster ohnehin anzeigt, und die Sicht führt kein eigenes Recht ein.
-- ---------------------------------------------------------------------------

create or replace view public.site_planned_hours
with (security_invoker = true) as
  select
    a.site_id,
    round(
      sum(
        extract(epoch from (a.end_time - a.start_time)) / 3600.0
        - a.break_minutes / 60.0
      )::numeric,
      2
    ) as planned_hours
  from public.assignments a
  group by a.site_id;

grant select on public.site_planned_hours to authenticated;

-- Welche Baustellen in der Leiste landen (aktiv, kein Abwesenheitscode,
-- Gesamtstunden gesetzt, Rest größer null), entscheidet supplyColumns() in
-- src/lib/site-hours.ts. Die Sicht kennt nur assignments und bleibt dadurch
-- trivial — die Auswahl steht an einer Stelle, nicht an zweien.
