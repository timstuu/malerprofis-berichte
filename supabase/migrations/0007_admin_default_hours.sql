-- Malerprofis Uderstadt — Standard-Arbeitszeiten der Büro-Konten
-- Ausführen im SQL Editor, nachdem 0006_trade_rows.sql lief.
--
-- Diese Migration gibt aus, wie viele Einsätze sie löscht, bevor sie es tut.
-- Bitte die Ausgabe unter „Messages" ansehen.

-- ---------------------------------------------------------------------------
-- 1. Standard-Arbeitszeit je Büro-Konto und Wochentag
--
-- Büro-Konten stehen nicht mehr in der Wochenplanung: Ein Admin hat keine
-- Baustelle, und eine Zeile im Raster, in der nie etwas steht, kostet nur
-- Platz. Ihre Stunden entstehen deshalb aus dieser Vorgabe, die der
-- Wochenbericht beim Öffnen einer Woche übernimmt.
--
-- Eine Zeile je Wochentag statt vierzehn Spalten an public.employees: Ein
-- Wochentag ohne Zeile heißt „an dem Tag wird nicht gearbeitet". Mit Spalten
-- bräuchte dieselbe Aussage vierzehn Mal NULL und eine Regel, was ein halb
-- gefülltes Paar bedeutet.
-- ---------------------------------------------------------------------------

create table if not exists public.employee_default_hours (
  employee_id uuid not null references public.employees(id) on delete cascade,
  weekday     integer not null check (weekday between 1 and 7),  -- 1 = Montag
  start_time  time not null,
  end_time    time not null,
  created_at  timestamptz not null default now(),
  primary key (employee_id, weekday),
  check (end_time > start_time)
);

-- ---------------------------------------------------------------------------
-- 2. Sicherheitsregeln: jeder nur seine eigenen Zeiten
--
-- Anders als bei Planung und Baustellen darf hier auch das Büro nicht in
-- fremde Zeilen schreiben. Die Zeiten sind eine Aussage über die eigene
-- Arbeitszeit; wer sie ändern darf, ändert damit fremde Stundenzettel.
-- ---------------------------------------------------------------------------

alter table public.employee_default_hours enable row level security;

drop policy if exists employee_default_hours_own on public.employee_default_hours;
create policy employee_default_hours_own on public.employee_default_hours
  for all to authenticated
  using (employee_id = auth.uid())
  with check (employee_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 3. Geplante Einsätze der Büro-Konten ab dieser Woche entfernen
--
-- Ohne Zeile im Raster wären sie unsichtbar und würden trotzdem weiter den
-- Wochenbericht ihres Kontos vorbefüllen — Daten, die wirken, aber niemand
-- mehr sieht.
--
-- Vergangene Wochen bleiben bewusst stehen: Sie belegen, was einmal geplant
-- war. Bereits in einen Bericht übernommene Zeilen sind ohnehin nicht
-- betroffen — report_entries.source_assignment_id ist ON DELETE SET NULL, die
-- Berichtszeile mit ihren Stunden bleibt also unverändert erhalten.
-- ---------------------------------------------------------------------------

do $$
declare
  cutoff  date := date_trunc('week', current_date)::date;  -- Montag dieser Woche
  betroffen integer;
begin
  select count(*) into betroffen
    from public.assignments a
    join public.employees e on e.id = a.employee_id
   where e.role = 'admin' and a.date >= cutoff;

  raise notice 'Einsätze von Büro-Konten ab % : % werden gelöscht.', cutoff, betroffen;

  delete from public.assignments a
   using public.employees e
   where e.id = a.employee_id
     and e.role = 'admin'
     and a.date >= cutoff;
end
$$;

-- ---------------------------------------------------------------------------
-- 4. Gegenprobe: Baustelle 001-7 muss es geben
--
-- Auf diese Nummer bucht der Wochenbericht die Bürostunden. Fehlt sie, legt
-- die Vorbefüllung stillschweigend gar keine Zeile an (siehe prefill.ts) —
-- besser eine Warnung hier als ein leerer Bericht nächste Woche.
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from public.sites where number = '001-7') then
    raise warning 'Baustelle 001-7 (Büroarbeit) fehlt — Bürostunden werden nicht eingetragen.';
  end if;
end
$$;
