-- Malerprofis Uderstadt — Mitarbeiterfarben und neue Pausenregel
-- Ausführen im Supabase SQL Editor, nachdem 0004_week_notes.sql gelaufen ist.

-- ---------------------------------------------------------------------------
-- 1. Farbe je Mitarbeiter
--
-- Nur ein Bezeichner aus der Palette in src/lib/colors.ts, kein Farbwert:
-- Dieselbe Farbe muss auf der weißen Wochenplanung und auf dem fast schwarzen
-- Fernseher lesbar sein, und das entscheidet die Palette, nicht die Datenbank.
-- Wer keine Farbe hat, bekommt in der Oberfläche die erste der Palette.
-- ---------------------------------------------------------------------------

alter table public.employees
  add column if not exists color text;

-- ---------------------------------------------------------------------------
-- 2. Pausen nach festen Fenstern
--
-- Die Pausen liegen zu festen Uhrzeiten (10:00–10:30 und 13:00–13:30), sie sind
-- kein Kontingent. Abgezogen wird deshalb nur, was ein Einsatz zeitlich
-- überdeckt — wer um 14 Uhr anfängt, hat an keinem Fenster vorbeigearbeitet.
-- Freitags entfällt die zweite Pause; der Arbeitstag endet vor der Mittagszeit.
--
-- Diese Funktion muss mit breakMinutesFor() aus src/lib/hours.ts
-- übereinstimmen. Laufen beide auseinander, hat dieselbe Schicht je nach
-- Entstehungsweg unterschiedlich viele Stunden. Die Gegenprobe steht in
-- src/lib/hours.test.ts.
-- ---------------------------------------------------------------------------

create or replace function public.break_minutes_for(
  p_date  date,
  p_start time,
  p_end   time
)
returns integer
language sql
immutable
set search_path = public
as $$
  with shift as (
    select
      extract(epoch from p_start) / 60 as s,
      -- Über Mitternacht: Das Ende liegt am Folgetag, die Fenster nicht.
      case
        when p_end <= p_start then extract(epoch from p_end) / 60 + 1440
        else extract(epoch from p_end) / 60
      end as e
  ),
  windows as (
    -- extract(isodow): 5 = Freitag
    select * from (values (600, 630), (780, 810)) as w(f, t)
    where extract(isodow from p_date) <> 5 or w.f = 600
  )
  select coalesce(sum(greatest(0, least(shift.e, windows.t) - greatest(shift.s, windows.f))), 0)::int
  from shift, windows;
$$;

-- ---------------------------------------------------------------------------
-- 3. Bestehende Einsätze einmalig neu rechnen
--
-- Betrifft nur die Planung. Bereits gespeicherte Wochenberichte bleiben
-- unangetastet: Ihre Stunden stehen fest je Zeile in report_entries, und ein
-- unterschriebener Bericht darf sich nachträglich nicht ändern.
-- ---------------------------------------------------------------------------

update public.assignments
   set break_minutes = public.break_minutes_for(date, start_time, end_time)
 where break_minutes is distinct from public.break_minutes_for(date, start_time, end_time);
