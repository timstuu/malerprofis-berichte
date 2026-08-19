-- Malerprofis Uderstadt — Urlaub, Krankmeldung, Push
-- Ausführen im Supabase SQL Editor, nachdem 0001_init.sql gelaufen ist.

-- ---------------------------------------------------------------------------
-- Werktage eines Zeitraums (Mo-Fr, ohne gesetzliche Feiertage)
-- ---------------------------------------------------------------------------

create or replace function public.count_working_days(p_start date, p_end date)
returns integer
language sql
stable
set search_path = public
as $$
  select count(*)::int
  from generate_series(p_start::timestamp, p_end::timestamp, interval '1 day') as d
  where extract(isodow from d) < 6                       -- 6 = Samstag, 7 = Sonntag
    and not exists (select 1 from public.holidays h where h.date = d::date);
$$;

-- ---------------------------------------------------------------------------
-- Antrag genehmigen
--
-- Läuft als eine Einheit: Status setzen, Urlaubstage abbuchen und die Einsätze
-- des Zeitraums räumen. Entweder passiert alles oder nichts — ein halb
-- genehmigter Urlaub mit abgebuchten Tagen, aber stehen gebliebenen Einsätzen
-- wäre im Alltag kaum zu bemerken und schwer zu reparieren.
--
-- security definer, weil die Funktion mehrere Tabellen anfassen muss. Deshalb
-- prüft sie die Berechtigung ausdrücklich selbst.
-- ---------------------------------------------------------------------------

create or replace function public.approve_leave_request(p_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  req        public.leave_requests;
  work_days  integer;
begin
  if not public.is_admin() then
    raise exception 'Nur das Büro darf Anträge entscheiden.';
  end if;

  select * into req from public.leave_requests where id = p_id for update;
  if not found then
    raise exception 'Antrag nicht gefunden.';
  end if;

  -- Bereits genehmigt: nichts tun, damit ein Doppelklick keine Tage doppelt abbucht.
  if req.status = 'approved' then
    return req.days_count;
  end if;

  work_days := public.count_working_days(req.start_date, req.end_date);

  update public.leave_requests
     set status     = 'approved',
         days_count = work_days,
         decided_by = auth.uid(),
         decided_at = now()
   where id = p_id;

  -- Nur Urlaub zehrt am Kontingent, Krankheit nicht.
  if req.type = 'vacation' then
    update public.employees
       set remaining_leave_days = remaining_leave_days - work_days
     where id = req.employee_id;
  end if;

  -- Geplante Einsätze im Zeitraum entfallen.
  delete from public.assignments
   where employee_id = req.employee_id
     and date between req.start_date and req.end_date;

  return work_days;
end;
$$;

-- ---------------------------------------------------------------------------
-- Antrag ablehnen. War er bereits genehmigt, kommen die Tage zurück aufs Konto.
-- Die gelöschten Einsätze kehren nicht zurück — sie sind fort.
-- ---------------------------------------------------------------------------

create or replace function public.reject_leave_request(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  req public.leave_requests;
begin
  if not public.is_admin() then
    raise exception 'Nur das Büro darf Anträge entscheiden.';
  end if;

  select * into req from public.leave_requests where id = p_id for update;
  if not found then
    raise exception 'Antrag nicht gefunden.';
  end if;

  if req.status = 'approved' and req.type = 'vacation' then
    update public.employees
       set remaining_leave_days = remaining_leave_days + req.days_count
     where id = req.employee_id;
  end if;

  update public.leave_requests
     set status     = 'rejected',
         days_count = 0,
         decided_by = auth.uid(),
         decided_at = now()
   where id = p_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Krankmeldung durch das Büro: sofort gültig, ohne Genehmigungsschritt,
-- zehrt nicht am Urlaubskonto und räumt die Einsätze des Zeitraums.
-- ---------------------------------------------------------------------------

create or replace function public.record_sick_leave(
  p_employee uuid,
  p_start    date,
  p_end      date
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Krankmeldungen erfasst nur das Büro.';
  end if;

  insert into public.leave_requests
    (employee_id, type, start_date, end_date, status, days_count, decided_by, decided_at)
  values
    (p_employee, 'sick', p_start, p_end, 'approved',
     public.count_working_days(p_start, p_end), auth.uid(), now())
  returning id into new_id;

  delete from public.assignments
   where employee_id = p_employee
     and date between p_start and p_end;

  return new_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Wird ein genehmigter Urlaub gelöscht, kommen die Tage zurück aufs Konto.
-- Als Trigger, damit das unabhängig davon greift, wer löscht und wie.
-- ---------------------------------------------------------------------------

create or replace function public.restore_leave_days()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status = 'approved' and old.type = 'vacation' and old.days_count > 0 then
    update public.employees
       set remaining_leave_days = remaining_leave_days + old.days_count
     where id = old.employee_id;
  end if;
  return old;
end;
$$;

drop trigger if exists leave_requests_restore_days on public.leave_requests;
create trigger leave_requests_restore_days
  before delete on public.leave_requests
  for each row execute function public.restore_leave_days();

-- ---------------------------------------------------------------------------
-- Rechte: Die Funktionen prüfen selbst, wer sie aufrufen darf.
-- ---------------------------------------------------------------------------

grant execute on function public.approve_leave_request(uuid) to authenticated;
grant execute on function public.reject_leave_request(uuid)  to authenticated;
grant execute on function public.record_sick_leave(uuid, date, date) to authenticated;
grant execute on function public.count_working_days(date, date) to authenticated;
