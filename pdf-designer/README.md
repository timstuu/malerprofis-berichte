# PDF-Designer

Die Gestaltung aller PDFs der App (Wochenbericht, Auslagen-Abrechnung,
Abnahmeprotokoll) steht in [`src/lib/pdf/design.json`](../src/lib/pdf/design.json).
Bearbeitet wird sie im PDF-Designer, einem Artifact auf claude.ai:

**https://claude.ai/artifact/9ZDF8yiaDY5zxUsVzZ9f23**

Der Designer zeichnet die Vorschau mit genau dem Code, den die App benutzt
(`src/lib/pdf/designer-entry.ts`, gebündelt mit esbuild), und mit Beispieldaten.

## Ablauf

1. Im Designer gestalten. Der Entwurf wird laufend in der Datenbank des
   Artifacts gesichert (`designer/draft`).
2. **„In den Code übernehmen“** legt die Freigabe unter `designer/request`
   ab (`status: "offen"`) und schickt Claude einen Kommentar.
3. Claude übernimmt die Freigabe (siehe unten) und setzt danach
   `status: "übernommen"` mit der neuen App-Version. Der Designer zeigt dann
   „Im Code“.

Ist gerade keine Claude-Sitzung verbunden, genügt in Claude Code im Projekt
der Satz **„PDF-Design übernehmen“**.

## Für Claude: „PDF-Design übernehmen“

1. Freigabe lesen: `ArtifactData` → `get` auf `designer/request` des
   Artifacts oben. Nur `status: "offen"` übernehmen.
2. `design` daraus nach `src/lib/pdf/design.json` schreiben (2 Leerzeichen
   Einrückung, Schlüsselreihenfolge wie bisher, Zeilenumbruch am Ende).
   Unbekannte Schlüssel nicht übernehmen, fehlende aus dem Code behalten.
3. `npm run lint`, `npm test`, `npm run build`.
4. `npm run version:patch`, committen, pushen.
5. `npm run pdf-designer` und das Artifact mit
   `pdf-designer/dist/pdf-designer.html` an dieselbe URL neu veröffentlichen —
   sonst zeigt der Designer weiter den alten Code-Stand.
6. `designer/request` auf `status: "übernommen"`, `version`, `appliedAt`
   setzen und im Kommentar-Thread kurz antworten.

## Schriften

Helvetica, Times und Courier bringt jsPDF mit. „Arial“ ist **Arimo**
(`src/lib/pdf/fonts/`, SIL Open Font License): gleich breit wie Arial, die
echte Arial darf die App nicht ausliefern. Die App lädt Arimo erst, wenn das
Design sie verlangt (`loadPdfFonts`); eine weitere Schrift braucht normal und
fett als TTF, einen Eintrag in `loadPdfFonts` und in `PdfFont`.

## Wenn sich der PDF-Code ändert

Neue Gestaltungswerte gehören in `design.json`, in `PdfDesign`
(`src/lib/pdf/design.ts`) und in die Liste `SECTIONS` in
`pdf-designer/template.html`. Danach neu bauen und veröffentlichen.

Lokal ansehen: `npm run pdf-designer`, dann die Startkonfiguration
`pdf-designer` (statischer Server auf Port 5190) und
`http://localhost:5190/pdf-designer.html` öffnen.
