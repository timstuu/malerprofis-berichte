-- ---------------------------------------------------------------------------
-- Monatsabschluss der Auslagen
--
-- Ein Abschluss muss drei Dinge in einem Zug erledigen: prüfen, dass die
-- Auszahlungen genau die Summe der Belege ergeben, den Abschluss anlegen und
-- die Belege daran hängen (und damit sperren). Aus dem Browser in einzelnen
-- Schritten ginge zwischendurch etwas schief — deshalb Datenbankfunktionen.
--
-- Die Belege werden als Liste übergeben, so wie das Büro sie beim Abschließen
-- vor sich sah. Kommt währenddessen ein Beleg aus einem Handy-Puffer nach,
-- rutscht er nicht ungesehen mit, sondern bleibt offen für den nächsten Monat.
-- ---------------------------------------------------------------------------

create or replace function public.close_expense_settlement(
  p_employee    uuid,
  p_month       date,
  p_settled_on  date,
  p_receipt_ids uuid[],
  p_payouts     jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expected int;
  v_count    int;
  v_total    numeric(10,2);
  v_paid     numeric(10,2);
  v_id       uuid;
begin
  if not public.is_admin() then
    raise exception 'Nur das Büro darf Auslagen abrechnen.';
  end if;

  select count(distinct x) into v_expected from unnest(p_receipt_ids) as x;
  if v_expected = 0 then
    raise exception 'Keine Belege zum Abrechnen.';
  end if;

  if jsonb_typeof(p_payouts) <> 'array' or jsonb_array_length(p_payouts) = 0 then
    raise exception 'Bitte mindestens eine Auszahlungszeile angeben.';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_payouts) as p
    where p->>'kind' is null
       or p->>'kind' not in ('ueberweisung', 'bar', 'vorschuss')
       or p->>'date' is null
       or coalesce((p->>'amount')::numeric, 0) <= 0
  ) then
    raise exception 'Eine Auszahlungszeile ist unvollständig.';
  end if;

  -- Belege sperren, damit sie niemand zwischen Prüfen und Verknüpfen ändert.
  perform 1 from public.expense_receipts where id = any(p_receipt_ids) for update;

  select count(*), coalesce(sum(gross), 0)
    into v_count, v_total
  from public.expense_receipts
  where id = any(p_receipt_ids)
    and employee_id = p_employee
    and settlement_id is null;

  if v_count <> v_expected then
    raise exception 'Mindestens ein Beleg wurde inzwischen geändert, gelöscht oder abgerechnet. Bitte neu laden.';
  end if;

  select round(coalesce(sum((p->>'amount')::numeric), 0), 2)
    into v_paid
  from jsonb_array_elements(p_payouts) as p;

  if v_paid <> v_total then
    raise exception 'Die Auszahlungen (% €) ergeben nicht die Summe der Belege (% €).', v_paid, v_total;
  end if;

  begin
    insert into public.expense_settlements (employee_id, month, settled_on, total, payouts, created_by)
    values (
      p_employee,
      date_trunc('month', p_month)::date,
      coalesce(p_settled_on, current_date),
      v_total,
      p_payouts,
      auth.uid()
    )
    returning id into v_id;
  exception when unique_violation then
    raise exception 'Für diesen Monat gibt es schon eine Abrechnung dieses Mitarbeiters.';
  end;

  update public.expense_receipts
     set settlement_id = v_id
   where id = any(p_receipt_ids);

  return v_id;
end;
$$;

-- Zurücknehmen löscht den Abschluss. Die Belege werden über
-- `on delete set null` von selbst wieder offen und damit bearbeitbar.
create or replace function public.reopen_expense_settlement(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Nur das Büro darf eine Abrechnung zurücknehmen.';
  end if;

  delete from public.expense_settlements where id = p_id;
  if not found then
    raise exception 'Abrechnung nicht gefunden.';
  end if;
end;
$$;
