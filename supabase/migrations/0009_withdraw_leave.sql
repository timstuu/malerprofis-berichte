-- ---------------------------------------------------------------------------
-- Genehmigten Urlaub zurückziehen
--
-- Wird ein Urlaub umgeplant, soll der Vorgang nachvollziehbar bleiben: Der
-- Antrag wird deshalb nicht gelöscht, sondern abgelehnt. Die Urlaubstage kommen
-- aufs Konto zurück, der Eintrag bleibt mit Datum in der Liste stehen.
--
-- Dazu gehört das Aufräumen im Wochenbericht. Die Vorbefüllung schreibt für
-- genehmigte Urlaubstage eine 060-7-Zeile in den Bericht des Malers und
-- speichert sie. Bliebe sie stehen, hätte er Urlaubsstunden an einem Tag, an
-- dem er arbeiten soll. Bereits abgegebene Berichte bleiben unangetastet — sie
-- sind unterschrieben.
--
-- Als Datenbankfunktion, aus zwei Gründen: Konto, Status und Berichtszeilen
-- gehören zusammen und dürfen nicht halb passieren. Und die Zeilen gehören
-- einem anderen Mitarbeiter — ohne security definer verbieten die RLS-Regeln
-- dem Büro den Zugriff darauf, und zwar lautlos.
-- ---------------------------------------------------------------------------

create or replace function public.withdraw_leave_request(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  req public.leave_requests;
begin
  if not public.is_admin() then
    raise exception 'Nur das Büro darf Anträge zurückziehen.';
  end if;

  select * into req from public.leave_requests where id = p_id for update;
  if not found then
    raise exception 'Antrag nicht gefunden.';
  end if;

  if req.type <> 'vacation' then
    raise exception 'Nur Urlaubsanträge können zurückgezogen werden.';
  end if;

  if req.status <> 'approved' then
    raise exception 'Nur ein genehmigter Antrag kann zurückgezogen werden.';
  end if;

  -- Bucht die Tage zurück und setzt den Status samt Zeitpunkt und Person.
  perform public.reject_leave_request(p_id);

  -- Die automatisch erzeugten Urlaubszeilen aus offenen Berichten entfernen.
  delete from public.report_entries e
   using public.weekly_reports r
   where e.report_id = r.id
     and r.employee_id = req.employee_id
     and r.status is distinct from 'signed'
     and e.date between req.start_date and req.end_date
     and (
       e.site_number = '060-7'
       or e.site_id = (select id from public.sites where number = '060-7')
     );
end;
$$;

grant execute on function public.withdraw_leave_request(uuid) to authenticated;
