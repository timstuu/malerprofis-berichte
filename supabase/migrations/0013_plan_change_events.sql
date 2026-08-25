-- ---------------------------------------------------------------------------
-- Eine Meldung je abgeschlossener Planungsrunde
--
-- Vorher hing die Benachrichtigung am Webhook auf `assignments` und damit an
-- der einzelnen Zeile. Wer einen Tag umplante, löste dabei eine Nachricht nach
-- der anderen aus, und jede trug Baustelle und Uhrzeit — zusammen mehr, als
-- am Handy zu lesen ist.
--
-- Jetzt entscheidet das Büro, wann die Runde vorbei ist: Beim Klick auf
-- „Fertig" schreibt die Wochenplanung genau eine Zeile je geänderter Woche,
-- mit den betroffenen Malern darin. Der Webhook hängt an dieser Tabelle statt
-- an `assignments` — die einzelne Änderung bleibt damit stumm.
--
-- Die Zeile ist ein Ereignis, kein Zustand: Sie wird geschrieben und nie
-- wieder angefasst. Wer wann umgeplant hat, lässt sich daran nachlesen.
-- ---------------------------------------------------------------------------

create table if not exists public.plan_change_events (
  id           uuid primary key default gen_random_uuid(),
  -- ISO-Montag der Woche, für die geplant wurde.
  week_start   date not null,
  -- Die Maler, deren eigene Einsätze sich geändert haben. Wessen Woche
  -- unangetastet blieb, steht hier nicht drin und bekommt nichts.
  employee_ids uuid[] not null,
  created_by   uuid references public.employees(id) on delete set null,
  created_at   timestamptz not null default now()
);

create index if not exists plan_change_events_created_idx
  on public.plan_change_events (created_at desc);

alter table public.plan_change_events enable row level security;

-- Nur das Büro plant, also darf auch nur das Büro eine solche Runde
-- abschließen. Ohne diese Regel könnte sich jemand selbst eine Meldung
-- schicken — oder schlimmer, allen anderen.
create policy plan_change_events_insert on public.plan_change_events
  for insert to authenticated with check (public.is_admin());

-- Lesen braucht die App nicht; die Edge Function liest mit dem
-- Dienstschlüssel. Die Regel steht trotzdem hier, damit ein Blick ins
-- Dashboard nicht an RLS scheitert.
create policy plan_change_events_select on public.plan_change_events
  for select to authenticated using (public.is_admin());
