-- Baustelle als Klartext in der Berichtszeile.
--
-- Bisher hing die Baustelle allein an site_id. Tippt ein Maler eine Baustelle,
-- die nicht im Stammdatenkatalog steht (neue Baustelle, Tippfehler, „Lager“),
-- blieb site_id leer und das Getippte war beim nächsten Laden verloren. Für den
-- eigenen Entwurf fiel das nicht auf — der lebt lokal weiter —, im Büro-PDF
-- wäre die Baustelle aber schlicht leer gewesen.
--
-- Deshalb schreibt der Bericht Nummer und Adresse ab jetzt immer zusätzlich als
-- Text mit. site_id bleibt als Verweis auf den Stamm bestehen, ist aber nicht
-- mehr die Quelle der Anzeige.

alter table public.report_entries
  add column site_number  text,
  add column site_address text;

-- Entsperren durch das Büro.
--
-- Bisher durfte ein Bericht nur von dem Mitarbeiter geändert werden, dem er
-- gehört. Ein Admin, der einen abgegebenen Bericht zur Korrektur freigibt,
-- wäre daran stillschweigend gescheitert: Die Regel hätte kein Recht verweigert,
-- sondern schlicht null Zeilen getroffen — ohne Fehlermeldung.
drop policy if exists weekly_reports_update on public.weekly_reports;
create policy weekly_reports_update on public.weekly_reports
  for update to authenticated
  using (employee_id = auth.uid() or public.is_admin())
  with check (employee_id = auth.uid() or public.is_admin());
