-- ---------------------------------------------------------------------------
-- Bewirtungsbelege
--
-- Für eine Bewirtung reicht der Kassenbon allein nicht: Das Büro braucht die
-- bewirteten Personen, den Anlass und die Unterschrift des Mitarbeiters.
-- Bisher stand das auf einem eigenen Papierformular, jetzt am Beleg selbst.
--
-- Die Felder bleiben bei allen anderen Arten leer. Pflicht sind sie nur bei
-- der Art „Bewirtung“ — das prüft die App. Eine Prüfregel in der Datenbank
-- gibt es bewusst nicht: Sie würde auch beim Abschluss greifen, der jede
-- Belegzeile anfasst, und ein früher frei als „Bewirtung“ getippter Beleg
-- ohne diese Angaben ließe sich dann nicht mehr abrechnen.
-- ---------------------------------------------------------------------------

alter table public.expense_receipts
  add column if not exists entertainment_guests    text,
  add column if not exists entertainment_occasion  text,
  -- Unterschrift als base64-PNG, wie beim Wochenbericht.
  add column if not exists entertainment_signature text;
