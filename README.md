# Malerprofis Uderstadt — App

Progressive Web App für Wochenberichte, Abnahmeprotokolle, Einsatzplanung und
Urlaubsanträge. Läuft als statische Seite auf GitHub Pages und spricht Supabase
direkt aus dem Browser. Einen eigenen Server gibt es nicht — der Schutz der
Daten liegt vollständig in den Row-Level-Security-Regeln der Datenbank.

## Einrichtung

### 1. Supabase-Projekt

1. Projekt in der **Region EU (Frankfurt)** anlegen.
2. Im SQL-Editor die Migrationen aus `supabase/migrations/` **der Reihe nach**
   ausführen:
   - `0001_init.sql` — Tabellen, Sicherheitsregeln, Feiertage Hamburgs
     (2026–2032) und die sechs Abwesenheits-Baustellen
     (`040-7 Feiertag` … `073-7 Mitarbeiterschulung`)
   - `0002_leave.sql` — Genehmigen und Ablehnen als Datenbankfunktionen, damit
     Urlaubskonto und Einsatzplanung nicht auseinanderlaufen können. Enthält
     auch `record_sick_leave`; die Funktion wird nicht mehr aufgerufen, die
     bereits erfassten Krankmeldungen hängen aber an ihr
   - `0003_realtime.sql` — Live-Aktualisierung für die Büroanzeige
   - `0004_week_notes.sql` — die Hinweiszeile der Wochenplanung. Fehlt sie,
     zeigt die App einfach keine Hinweise an; sie geht davon nicht kaputt
   - `0005_employee_colors_and_breaks.sql` — Farbe je Mitarbeiter und die
     Pausenregel nach festen Fenstern (10:00–10:30 und 13:00–13:30, freitags
     nur die erste). Rechnet die Pause aller bestehenden Einsätze einmalig neu;
     gespeicherte Wochenberichte bleiben unangetastet
   - `0006_trade_rows.sql` — Zeilen für Fremdgewerke (Hebebühne, Tischler) in
     der Wochenplanung. Fehlt sie, zeigt die App einfach keine Gewerke an
   - `0007_admin_default_hours.sql` — Standard-Arbeitszeiten der Büro-Konten,
     die deren Wochenbericht auf `001-7 Büroarbeit` vorbefüllen. Löscht dabei
     die ab dieser Woche auf Büro-Konten gebuchten Einsätze und meldet vorher
     unter „Messages", wie viele es sind. Fehlt sie, gibt es eben keine
     Standardzeiten; die App geht davon nicht kaputt
3. Unter **Project Settings → API** die Projekt-URL und den `anon`-Key notieren.

### 2. Zugangsdaten hinterlegen

Lokal eine Datei `.env.local` anlegen (Vorlage: `.env.example`):

```
VITE_SUPABASE_URL="https://xxxx.supabase.co"
VITE_SUPABASE_ANON_KEY="eyJhbGciOi..."
```

Für das Deployment dieselben beiden Werte als GitHub-Repository-Secrets
hinterlegen (**Settings → Secrets and variables → Actions**). Ohne sie baut die
Action eine App ohne Datenbankzugang.

### 3. Benutzerverwaltung freischalten

Alle weiteren Benutzer werden **in der App** angelegt — dafür braucht es einmalig
eine Edge Function. Konten anzulegen erfordert erhöhte Rechte, die im Browser
nichts zu suchen haben; die Funktion prüft bei jedem Aufruf, ob der Angemeldete
wirklich ein Büro-Konto ist.

**Edge Functions → Deploy a new function → Via Editor:**

- Name exakt `manage-users`
- Inhalt von `supabase/functions/manage-users/index.ts` einfügen
- **Verify JWT eingeschaltet lassen** (anders als bei `send-push` — hier ruft die
  angemeldete Person selbst auf)
- *Deploy function*

Normalerweise sind keine Secrets nötig — die Funktion nutzt die von Supabase
bereitgestellten Werte.

**Falls beim Anlegen eines Benutzers „Kein geheimer Schlüssel in der Umgebung
gefunden" erscheint:** Supabase hat die Schlüsselnamen umgestellt, und in
neueren Projekten steht der geheime Schlüssel nicht mehr automatisch unter dem
gewohnten Namen bereit. Dann unter **Project Settings → API Keys** den geheimen
Schlüssel kopieren und ihn unter **Edge Functions → Secrets** als
`SUPABASE_SECRET_KEY` hinterlegen. Dieser Schlüssel umgeht alle
Sicherheitsregeln — er gehört ausschließlich hierhin, niemals in die App oder
ins Repository.

### 4. Erstes Büro-Konto anlegen

Einmalig von Hand, weil noch niemand da ist, der es in der App tun könnte:

1. **Authentication → Users → Add user**, E-Mail und Passwort vergeben, die
   angezeigte UUID kopieren.
2. Im SQL-Editor:

```sql
insert into public.employees (id, first_name, last_name, role)
values ('<UUID aus Schritt 1>', 'Vorname', 'Nachname', 'admin');
```

Ab jetzt läuft alles Weitere über **Büro → Benutzer** in der App: Konten anlegen,
Rollen vergeben, Passwörter zurücksetzen, Konten deaktivieren oder löschen. Das
gilt auch für das Anzeigekonto des Fernsehers (Rolle *Anzeige*).

### 5. Benachrichtigungen einrichten (optional)

Ohne diese Schritte funktioniert die App vollständig — es kommen lediglich keine
Push-Nachrichten an, und der Schalter in den Einstellungen erklärt das.

Alles läuft im Browser — **weder die Supabase CLI noch Docker werden gebraucht.**

**1. Schlüsselpaar erzeugen** (im Terminal, im Projektordner):

```bash
node scripts/generate-vapid-keys.mjs
```

Die Ausgabe enthält zwei Schlüssel. Fenster offen lassen; sie werden gleich
gebraucht und nirgends gespeichert. Der private Schlüssel gehört **nicht** ins
Repository.

**2. Edge Function anlegen** (Supabase → Edge Functions → *Deploy a new function*
→ *Via Editor*):

- Name exakt `send-push`
- Den Inhalt von `supabase/functions/send-push/index.ts` vollständig
  hineinkopieren
- Die JWT-Prüfung ausschalten (*Verify JWT*), sonst weist die Funktion den
  Aufruf des Webhooks ab. Den Zugangsschutz übernimmt Schritt 3.
- *Deploy function*

**3. Secrets hinterlegen** (Supabase → Edge Functions → *Secrets*):

| Name | Wert |
|---|---|
| `VAPID_PUBLIC_KEY` | öffentlicher Schlüssel aus Schritt 1 |
| `VAPID_PRIVATE_KEY` | privater Schlüssel aus Schritt 1 |
| `VAPID_SUBJECT` | `mailto:` + eure Büro-Mailadresse |
| `WEBHOOK_SECRET` | ein selbst ausgedachtes langes Passwort |
| `APP_URL` | `https://timstuu.github.io/malerprofis-berichte/` |

`SUPABASE_URL` und `SUPABASE_SERVICE_ROLE_KEY` stehen automatisch zur Verfügung
und müssen nicht eingetragen werden.

**4. Database Webhook anlegen** (Supabase → Database → Webhooks → *Create a new hook*):

- Tabelle `leave_requests`, Ereignisse **Insert** und **Update**
- Typ *Supabase Edge Functions*, Funktion `send-push`, Methode `POST`
- HTTP-Header hinzufügen: `x-webhook-secret` mit dem Wert aus Schritt 3

**5. Öffentlichen Schlüssel in die App bringen:**

- in `.env.local`: `VITE_VAPID_PUBLIC_KEY="…"`
- als GitHub-Repository-Secret gleichen Namens (Settings → Secrets and variables
  → Actions)
- in `.github/workflows/deploy.yml` ist er bereits eingetragen; die Action einmal
  neu starten, damit der Schlüssel in den Build gelangt

**6. Einschalten:** Jeder Mitarbeiter aktiviert Benachrichtigungen einmalig in den
**Einstellungen** der App. Auf dem iPhone geht das nur in der über
„Teilen → Zum Home-Bildschirm" installierten App (ab iOS 16.4) — im Safari-Tab
existiert die Push-Funktion nicht.

### 6. Büroanzeige (Fernseher) einrichten

**Anzeigekonto anlegen** — in der App unter **Büro → Benutzer → Benutzer anlegen**,
Rolle *Anzeige (Fernseher)*. Das Konto darf ausschließlich lesen, kommt nirgends
an Wochenberichte oder Unterschriften und taucht in keiner Mitarbeiterliste und
keiner Planung auf.

Außerdem muss `supabase/migrations/0003_realtime.sql` ausgeführt sein, sonst wird
der Fernseher erst beim nächsten Neuladen aktuell.

**Gerät einrichten.** Empfohlen ist ein kleiner Rechner (Mini-PC oder Raspberry Pi,
einmalig ca. 100–200 €) am HDMI-Anschluss mit Chrome im Kiosk-Modus:

```
chrome --kiosk --app=https://timstuu.github.io/malerprofis-berichte/
```

Einmal mit dem Anzeigekonto anmelden — die Sitzung hält monatelang. Danach
erscheint automatisch die Büroanzeige.

**Bedienung.** Drei Seiten, die gewählte bleibt stehen:

| Taste | Wirkung |
|---|---|
| → / Bild ab / Leertaste | eine Seite weiter |
| ← / Bild auf | eine Seite zurück |
| 1 / 2 / 3 | direkt zu Logo / Wochenplanung / Jahresübersicht |

Ein Funk-Presenter für ca. 15 € sendet genau diese Tasten und ersetzt die
Tastatur. Startseite ist das Logo mit Uhrzeit, damit im Ruhezustand nichts
Personenbezogenes an der Wand hängt.

Zum Ausprobieren lässt sich die Anzeige auch mit einem Büro-Konto öffnen: an die
Adresse `#tv` anhängen.

## Entwicklung

```bash
npm install
npm run dev
```

| Befehl | Zweck |
|---|---|
| `npm run dev` | Entwicklungsserver (Vite) |
| `npm run build` | Produktionsbuild nach `dist/` |
| `npm run lint` | Typprüfung (`tsc --noEmit`) |
| `npm run test` | Prüft die Übernahme der Planung und die Urlaubsberechnung |
| `npm run version:patch` | Version erhöhen — `:minor` und `:major` ebenso |

### Version

Die Version steht **nur** in `package.json`. Beim Bauen setzt Vite sie als
`__APP_VERSION__` ein, dazu das Baudatum als `__BUILD_DATE__` (siehe `define`
in `vite.config.ts`). Beide erscheinen unter Einstellungen → App-Info und
hängen als `?v=` am Logo, damit ein neues Logo nicht aus dem Cache kommt.

Nirgends im Quelltext steht also eine Versionsnummer. Zuvor lag sie an vier
Stellen von Hand gepflegt herum und war entsprechend auseinandergelaufen.

Die Version gehört zu jeder fertigen Etappe dazu:

```bash
npm run version:minor
```

`patch` für Korrekturen, `minor` für neue Funktionen, `major`, wenn sich ein
Arbeitsablauf grundlegend ändert. Die Skripte setzen bewusst keinen Git-Tag —
die Änderung an `package.json` geht mit dem Commit der Etappe mit.

## Aufbau

```
src/
  lib/         supabase-Client, Anmeldung, Datenzugriff, Push
               prefill.ts / leave-rules.ts / hours.ts enthalten die fachlichen
               Regeln — bewusst ohne Datenbankzugriff, damit sie ohne laufende
               Umgebung nachvollziehbar und prüfbar sind (*.test.ts daneben)
  components/  Anmeldebildschirm, Logo
  features/    Büro-Bereich, Einsatzplanung, Urlaub, Büroanzeige (tv/)
  App.tsx      Dashboard, Wochenbericht, Abnahme, Urlaub, Einstellungen
supabase/
  migrations/  Datenbankschema, Sicherheitsregeln, Genehmigungslogik
  functions/   send-push (Deno) — läuft nicht im Browser und wird deshalb von
               der Typprüfung der App ausgenommen
scripts/       VAPID-Schlüssel erzeugen
```

## Rollen und Sichtbarkeit

| Rolle | Sieht |
|---|---|
| `worker` (Maler) | die gesamte Einsatzplanung, genehmigte Abwesenheiten aller, eigene Anträge und eigene Berichte |
| `admin` (Büro) | alles, und darf Stammdaten, Planung und Urlaubsentscheidungen ändern |
| `tv` | nur lesend, für die Anzeige im Büro |

Diese Grenzen erzwingt die Datenbank, nicht die Oberfläche.

Rollen vergibt das Büro unter **Büro → Benutzer**. Zwei Sicherungen sind fest
eingebaut, damit sich niemand aussperrt: Die eigenen Büro-Rechte lassen sich
nicht entziehen, und das letzte Büro-Konto kann weder gelöscht noch
herabgestuft werden.
