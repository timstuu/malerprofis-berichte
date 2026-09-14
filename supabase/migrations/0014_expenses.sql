-- ---------------------------------------------------------------------------
-- Auslagen
--
-- Bisher sammelte das Büro die Kassenbelege der Mitarbeiter auf Papier und
-- tippte sie in eine Excel-Vorlage ab. Jetzt erfasst jeder seine Belege selbst
-- am Handy, mit Foto, und das Büro rechnet sie je Mitarbeiter in einem
-- Monatsabschluss ab.
--
-- Ein Beleg ist offen, solange er an keinem Abschluss hängt. Offen heißt:
-- Der Mitarbeiter und jeder Admin dürfen ihn ändern und löschen. Hängt er an
-- einem Abschluss, ist er gesperrt — auch fürs Büro. Wer dann noch etwas
-- korrigieren will, nimmt den Abschluss zurück.
--
-- Der Abschluss nimmt alle offenen Belege mit, gleich von wann. Der Monat des
-- Abschlusses ist der Abrechnungsmonat, nicht der Monat der Belege — ein im
-- September nachgereichter Juli-Beleg landet in der September-Abrechnung.
-- ---------------------------------------------------------------------------

create table if not exists public.expense_settlements (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references public.employees(id) on delete cascade,
  -- Abrechnungsmonat, immer der Monatserste.
  month        date not null check (extract(day from month) = 1),
  settled_on   date not null default current_date,
  total        numeric(10,2) not null check (total > 0),
  -- Auszahlungszeilen wie unten in der Excel-Vorlage:
  -- [{ "date": "2026-09-14", "kind": "ueberweisung"|"bar"|"vorschuss", "amount": 70.93 }]
  -- Sie ergeben zusammen genau die Summe; das prüft die Abschlussfunktion.
  payouts      jsonb not null default '[]'::jsonb,
  -- Bewusst ohne Fremdschlüssel: Ein zweiter Verweis auf employees machte die
  -- Verknüpfung employees(...) in den Abfragen mehrdeutig.
  created_by   uuid,
  created_at   timestamptz not null default now(),
  unique (employee_id, month)
);

create table if not exists public.expense_receipts (
  -- Die Id vergibt das Handy. Ein Beleg, der ohne Netz im Puffer lag, wird
  -- beim Nachreichen dadurch nicht doppelt angelegt, wenn ein früherer Versuch
  -- kurz vor der Antwort abgebrochen ist.
  id             uuid primary key default gen_random_uuid(),
  employee_id    uuid not null references public.employees(id) on delete cascade,
  receipt_date   date not null,
  -- „Name/Ort“ der Vorlage, z. B. „REWE Hamburg“.
  vendor         text not null check (length(trim(vendor)) > 0),
  -- „Art“ der Vorlage, z. B. „Bewirtung/Kaffee Büro“.
  category       text not null check (length(trim(category)) > 0),
  vat_mode       text not null check (vat_mode in ('none', '7', '19', 'mixed')),
  gross          numeric(10,2) not null check (gross > 0),
  -- Die Steuerbeträge stehen immer hier, auch wenn die App sie aus einem
  -- einzelnen Satz errechnet hat. Liste und PDF zeigen, was gespeichert ist,
  -- statt selbst nachzurechnen.
  vat7           numeric(10,2) not null default 0 check (vat7 >= 0),
  vat19          numeric(10,2) not null default 0 check (vat19 >= 0),
  -- Pfade im Bucket `auslagen`. Ohne Foto gibt es keinen Beleg.
  photo_paths    text[] not null check (cardinality(photo_paths) >= 1),
  -- Wird der Abschluss zurückgenommen (gelöscht), sind die Belege von selbst
  -- wieder offen.
  settlement_id  uuid references public.expense_settlements(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  updated_by     uuid
);

create index if not exists expense_receipts_open_idx
  on public.expense_receipts (employee_id) where settlement_id is null;
create index if not exists expense_receipts_settlement_idx
  on public.expense_receipts (settlement_id);

alter table public.expense_receipts    enable row level security;
alter table public.expense_settlements enable row level security;

-- Belege: sehen der Mitarbeiter selbst und das Büro. Anlegen nur für sich.
-- Ändern und löschen der Mitarbeiter und das Büro — aber nur offene Belege.
-- Das `with check` beim Ändern verhindert, dass jemand einen Beleg über die
-- Schnittstelle selbst an einen Abschluss hängt.
create policy expense_receipts_select on public.expense_receipts
  for select to authenticated using (employee_id = auth.uid() or public.is_admin());

create policy expense_receipts_insert on public.expense_receipts
  for insert to authenticated with check (employee_id = auth.uid() and settlement_id is null);

create policy expense_receipts_update on public.expense_receipts
  for update to authenticated
  using ((employee_id = auth.uid() or public.is_admin()) and settlement_id is null)
  with check ((employee_id = auth.uid() or public.is_admin()) and settlement_id is null);

create policy expense_receipts_delete on public.expense_receipts
  for delete to authenticated
  using ((employee_id = auth.uid() or public.is_admin()) and settlement_id is null);

-- Abschlüsse: nur lesen. Angelegt und zurückgenommen werden sie ausschließlich
-- über Datenbankfunktionen, die Summe und Sperre in einem Zug prüfen.
create policy expense_settlements_select on public.expense_settlements
  for select to authenticated using (employee_id = auth.uid() or public.is_admin());

-- ---------------------------------------------------------------------------
-- Ablage der Belegfotos
--
-- Privater Bucket, Auslieferung nur über kurzlebige signierte URLs.
-- Pfad: <employee_id>/<receipt_id>/<foto>.jpg
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('auslagen', 'auslagen', false)
on conflict (id) do nothing;

-- Hochladen in den eigenen Ordner. Das Büro darf auch in fremde Ordner, weil
-- es beim Bearbeiten eines Belegs ein Foto ergänzen kann.
create policy auslagen_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'auslagen'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );

create policy auslagen_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'auslagen'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );

-- Löschen nur, solange der Beleg nicht abgerechnet ist. Gefragt wird nach
-- „nicht abgerechnet“ statt nach „offen“: Beim Löschen eines Belegs verschwindet
-- erst die Zeile und dann die Fotos — die Zeile gibt es dann schon nicht mehr.
create policy auslagen_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'auslagen'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
    and not exists (
      select 1 from public.expense_receipts r
      where r.id::text = (storage.foldername(name))[2]
        and r.settlement_id is not null
    )
  );
