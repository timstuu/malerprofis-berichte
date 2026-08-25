-- ---------------------------------------------------------------------------
-- Abnahmeprotokolle
--
-- Bisher blieb die Abnahme auf dem Gerät: PDF herunterladen, per Mail
-- verschicken. Der Mailweg fällt weg, die Abnahme geht denselben Weg wie der
-- Wochenbericht — als Daten ins Büro.
--
-- Anders als beim Wochenbericht wird die PDF aber nicht im Büro neu erzeugt,
-- sondern hochgeladen. Der Kunde unterschreibt ein bestimmtes Dokument; genau
-- dieses muss das Büro später herunterladen können und kein nachgebautes.
-- Die Textfelder daneben sind nur zum Ansehen auf dem Bildschirm — die Fotos
-- der Mängel stecken ausschließlich in der PDF.
--
-- Ein gespeichertes Protokoll ist unterschrieben und damit endgültig: Es gibt
-- bewusst keine update- und keine delete-Regel, auch nicht fürs Büro.
-- ---------------------------------------------------------------------------

create table if not exists public.abnahme_protocols (
  id            uuid primary key default gen_random_uuid(),
  employee_id   uuid not null references public.employees(id) on delete cascade,
  -- Zeitpunkt des Speicherns. Das ist zugleich das Datum der Abnahme; ein
  -- eigenes Feld dafür gibt es bewusst nicht.
  created_at    timestamptz not null default now(),
  -- Baustelle als Text, nicht als Verweis: Der Maler darf eine Adresse von Hand
  -- eintragen, die (noch) nicht in den Stammdaten steht. Und selbst wenn eine
  -- Baustelle später umbenannt wird, muss im Protokoll stehen bleiben, was zum
  -- Zeitpunkt der Unterschrift galt.
  site_number   text not null default '',
  site_address  text not null default '',
  participants  text[] not null default '{}',
  type          text not null check (type in ('teil', 'gesamt')),
  status        text not null check (status in ('ohne', 'mit')),
  -- Die Mängeltexte in ihrer Reihenfolge. Ohne Fotos — die sind in der PDF.
  defects       text[] not null default '{}',
  -- Pfad der hochgeladenen PDF im Bucket `abnahmen`.
  pdf_path      text not null
);

create index if not exists abnahme_protocols_created_idx
  on public.abnahme_protocols (created_at desc);

alter table public.abnahme_protocols enable row level security;

-- Anlegen darf jeder für sich selbst, lesen der eigene Maler und das Büro.
-- Kein update, kein delete: siehe oben.
create policy abnahme_protocols_insert on public.abnahme_protocols
  for insert to authenticated with check (employee_id = auth.uid());

create policy abnahme_protocols_select on public.abnahme_protocols
  for select to authenticated using (employee_id = auth.uid() or public.is_admin());

-- ---------------------------------------------------------------------------
-- Ablage der PDFs
--
-- Privater Bucket — die Dateien werden nur über eine kurzlebige signierte URL
-- ausgeliefert. Ein Protokoll trägt Namen, Adresse und Unterschriften; es darf
-- nicht über einen geratenen Link im Netz stehen.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('abnahmen', 'abnahmen', false)
on conflict (id) do nothing;

-- Jeder Maler lädt in seinen eigenen Ordner (erstes Pfadsegment = seine Id).
-- Damit kann niemand die PDF eines anderen überschreiben.
create policy abnahmen_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'abnahmen'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy abnahmen_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'abnahmen'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );
