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
   - `0002_leave.sql` — Genehmigen, Ablehnen und Krankmeldung als
     Datenbankfunktionen, damit Urlaubskonto und Einsatzplanung nicht
     auseinanderlaufen können
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

### 3. Erstes Büro-Konto anlegen

Es gibt bewusst keine Selbstregistrierung — Konten legt ausschließlich das Büro an.

1. In Supabase unter **Authentication → Users → Add user** ein Konto mit E-Mail
   und Passwort anlegen und die angezeigte User-UUID kopieren.
2. Im SQL-Editor die zugehörigen Stammdaten anlegen:

```sql
insert into public.employees (id, first_name, last_name, role)
values ('<UUID aus Schritt 1>', 'Vorname', 'Nachname', 'admin');
```

Ab dann können weitere Mitarbeiter im Büro-Bereich der App gepflegt werden; ihre
Anmeldekonten entstehen weiterhin unter **Authentication → Users**.

### 4. Benachrichtigungen einrichten (optional)

Ohne diese Schritte funktioniert die App vollständig — es kommen lediglich keine
Push-Nachrichten an, und der Schalter in den Einstellungen erklärt das.

1. **Schlüsselpaar erzeugen.** Es entsteht auf deinem Rechner und wird nirgends
   gespeichert:

   ```bash
   node scripts/generate-vapid-keys.mjs
   ```

2. **Öffentlichen Schlüssel** als `VITE_VAPID_PUBLIC_KEY` in `.env.local` und als
   GitHub-Repository-Secret hinterlegen (er ist für den Browser bestimmt und darf
   öffentlich sein).

3. **Privaten Schlüssel** nur in Supabase hinterlegen — niemals ins Repository:

   ```bash
   supabase functions deploy send-push --no-verify-jwt
   supabase secrets set VAPID_PRIVATE_KEY=... VAPID_PUBLIC_KEY=... VAPID_SUBJECT=mailto:buero@…
   ```

4. **Database Webhook anlegen** (Supabase → Database → Webhooks):
   Tabelle `leave_requests`, Ereignisse **Insert** und **Update**, Ziel die
   Edge Function `send-push`.

5. Jeder Mitarbeiter schaltet Benachrichtigungen einmalig in den **Einstellungen**
   der App ein. Auf dem iPhone geht das nur in der über „Zum Home-Bildschirm"
   installierten App (ab iOS 16.4) — im Safari-Tab existiert die Push-Funktion nicht.

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

## Aufbau

```
src/
  lib/         supabase-Client, Anmeldung, Datenzugriff, Push
               prefill.ts / leave-rules.ts / hours.ts enthalten die fachlichen
               Regeln — bewusst ohne Datenbankzugriff, damit sie ohne laufende
               Umgebung nachvollziehbar und prüfbar sind (*.test.ts daneben)
  components/  Anmeldebildschirm, Logo
  features/    Büro-Bereich, Einsatzplanung, Urlaub
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
