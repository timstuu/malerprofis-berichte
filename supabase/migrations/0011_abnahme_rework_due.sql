-- ---------------------------------------------------------------------------
-- Frist für die Nacharbeiten
--
-- Bei einer Abnahme mit Mängeln hält der Maler fest, bis wann nachgebessert
-- wird. Das Feld darf leer bleiben: Steht der Termin noch nicht fest, weist
-- das Protokoll ihn ausdrücklich als offen aus, statt ein Datum zu erfinden.
--
-- Deshalb nullable und ohne Vorgabe — kein Datum heißt hier "noch nicht
-- terminiert", nicht "heute".
-- ---------------------------------------------------------------------------

alter table public.abnahme_protocols
  add column if not exists rework_due date;
