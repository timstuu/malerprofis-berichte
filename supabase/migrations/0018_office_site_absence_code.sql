-- Malerprofis Uderstadt — 001-7 Büroarbeit als feste Baustelle
-- Ausführen im Supabase SQL Editor, nachdem 0017_site_total_hours.sql lief.

-- ---------------------------------------------------------------------------
-- 1. 001-7 gehört zu den festen Baustellen
--
-- Die Nummer steckt fest im Code (OFFICE_SITE_NUMBER in prefill.ts): Auf sie
-- bucht der Wochenbericht die Standardzeiten der Büro-Konten. Sie war nur nie
-- als solche gekennzeichnet — 0001 hat die sechs Abwesenheitscodes gesät,
-- 001-7 aber musste von Hand angelegt werden (0007 warnt bloß, wenn sie fehlt).
--
-- Das Frontend ging längst davon aus: Zwei Kommentare in App.tsx zählen „Büro"
-- ausdrücklich zu den Abwesenheitscodes, und die Testdaten in prefill.test.ts
-- führen 001-7 seit jeher mit is_absence_code = true. Hier holen die Daten die
-- Absicht ein.
--
-- Wirkung: keine Knöpfe und kein Stundenfeld in der Verwaltung, nicht in der
-- Baustellen-Leiste der Wochenplanung, nicht mehr als Vorauswahl im
-- Einsatzformular (001-7 stand dort als kleinste Nummer bisher ganz oben), und
-- die Bürozeile im Wochenbericht ist nicht mehr von Hand editierbar — löschen
-- lässt sie sich weiterhin.
-- ---------------------------------------------------------------------------

insert into public.sites (number, address, is_absence_code) values
  ('001-7', 'Büroarbeit', true)
on conflict (number) do nothing;

update public.sites
  set is_absence_code = true
  where number = '001-7' and is_absence_code is distinct from true;

-- ---------------------------------------------------------------------------
-- 2. Feste Baustellen tragen keine Gesamtstunden
--
-- Urlaub, Krank, Feiertag und Büroarbeit haben kein Kontingent, das sich
-- aufbrauchen ließe. Die Oberfläche bietet das Feld dort gar nicht erst an
-- (AdminPanel) und supplyColumns() sortiert sie ohnehin aus — die Regel gehört
-- trotzdem in die Datenbank, damit sie nicht an der Oberfläche hängt.
-- ---------------------------------------------------------------------------

update public.sites
  set total_hours = null
  where is_absence_code and total_hours is not null;

alter table public.sites drop constraint if exists sites_absence_without_hours;
alter table public.sites add constraint sites_absence_without_hours
  check (not is_absence_code or total_hours is null);
