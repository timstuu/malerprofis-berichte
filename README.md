# Malerprofis Uderstadt — App

Progressive Web App für Wochenberichte, Abnahmeprotokolle, Einsatzplanung und
Urlaubsanträge. Läuft als statische Seite auf GitHub Pages und spricht Supabase
direkt aus dem Browser. Einen eigenen Server gibt es nicht — der Schutz der
Daten liegt vollständig in den Row-Level-Security-Regeln der Datenbank.

## Einrichtung

### 1. Supabase-Projekt

1. Projekt in der **Region EU (Frankfurt)** anlegen.
2. Im SQL-Editor `supabase/migrations/0001_init.sql` ausführen. Das legt alle
   Tabellen, die Sicherheitsregeln, die Feiertage Hamburgs (2026–2032) und die
   sechs Abwesenheits-Baustellen (`040-7 Feiertag` … `073-7 Mitarbeiterschulung`) an.
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

## Aufbau

```
src/
  lib/         supabase-Client, Anmeldung, Datenzugriff, Arbeitszeit-Berechnung
  components/  Anmeldebildschirm, Logo
  features/    Büro-Bereich
  App.tsx      Dashboard, Wochenbericht, Abnahme, Urlaub, Einstellungen
supabase/
  migrations/  Datenbankschema und Sicherheitsregeln
```

## Rollen und Sichtbarkeit

| Rolle | Sieht |
|---|---|
| `worker` (Maler) | die gesamte Einsatzplanung, genehmigte Abwesenheiten aller, eigene Anträge und eigene Berichte |
| `admin` (Büro) | alles, und darf Stammdaten, Planung und Urlaubsentscheidungen ändern |
| `tv` | nur lesend, für die Anzeige im Büro |

Diese Grenzen erzwingt die Datenbank, nicht die Oberfläche.
