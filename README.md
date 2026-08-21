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
