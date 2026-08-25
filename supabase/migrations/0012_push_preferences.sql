-- ---------------------------------------------------------------------------
-- Welche Benachrichtigungen jemand bekommen möchte
--
-- Der Schalter in den Einstellungen meldet das *Gerät* an (push_subscriptions).
-- Was darüber ankommt, ist dagegen eine Entscheidung der *Person*: Wer die
-- Planänderung am Handy nicht will, will sie auch am Tablet nicht. Deshalb
-- hängt diese Tabelle am Mitarbeiter und nicht am Endpunkt.
--
-- Eine fehlende Zeile bedeutet "eingeschaltet". Das hat zwei Vorteile: Die
-- bereits angemeldeten Geräte müssen nicht nachgetragen werden, und eine
-- später hinzukommende Benachrichtigungsart ist von sich aus aktiv, statt
-- unbemerkt bei allen stumm zu bleiben. Gespeichert wird also nur die
-- Abweichung vom Normalfall.
-- ---------------------------------------------------------------------------

create table if not exists public.push_preferences (
  employee_id uuid not null references public.employees(id) on delete cascade,
  -- Die Art der Nachricht. Kein Fremdschlüssel, sondern eine feste Liste:
  -- Die Werte stehen genauso in src/lib/push.ts und in der Edge Function.
  kind        text not null check (kind in ('leave_submitted', 'leave_decided', 'plan_changed')),
  enabled     boolean not null default true,
  updated_at  timestamptz not null default now(),
  primary key (employee_id, kind)
);

alter table public.push_preferences enable row level security;

-- Jeder pflegt ausschließlich seine eigenen Einstellungen. Das Büro hat hier
-- bewusst kein Mitspracherecht: Ob jemand nachts eine Nachricht bekommt, ist
-- keine Frage der Verwaltung.
--
-- Die Edge Function liest die Tabelle mit dem Dienstschlüssel und geht an RLS
-- vorbei — sie muss für alle Empfänger einer Nachricht nachsehen dürfen.
create policy push_preferences_rw on public.push_preferences
  for all to authenticated
  using (employee_id = auth.uid())
  with check (employee_id = auth.uid());
