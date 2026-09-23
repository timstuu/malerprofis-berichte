---
titel: Anleitung fürs Büro
app: Malerprofis Uderstadt
rolle: admin
gilt_fuer: Alle Konten mit der Rolle „Büro" (admin)
sprache: de
quelle: docs/anleitung-buero.md
pdf: docs/Anleitung-Buero.pdf
deckblatt_oben: Anleitung
deckblatt_unten: fürs Büro
einleitung: Planen, prüfen, entscheiden, abrechnen und verwalten — die vollständige Anleitung für alle Büro-Konten der App der Malerprofis Uderstadt.
ergaenzt: docs/anleitung-maler.md
hinweis_fuer_ki: >
  Diese Datei ist die einzige Quelle der Büro-Anleitung. Das PDF wird daraus
  mit `npm run anleitung` erzeugt und nie von Hand bearbeitet. Jedes Kapitel
  (##) beschreibt genau einen Bereich der App, jeder Abschnitt (###) genau
  eine Aufgabe. Die Anleitung setzt docs/anleitung-maler.md voraus und
  wiederholt deren Inhalte nur dort, wo sie für Büro-Konten anders gelten.
  Zahlen, Codes und Regeln stammen aus dem Quelltext der App — bei Änderungen
  dort muss diese Datei mitgezogen werden.
---

# Anleitung fürs Büro

## 1. Das Büro-Konto

Ein Büro-Konto darf alles: die Wochenplanung ändern, Urlaub entscheiden,
Auslagen abrechnen, Berichte einsehen und Benutzer anlegen. Diese Anleitung
beschreibt genau das — was du als Büro **zusätzlich** zu einem Maler siehst
und kannst.

> **Die Anleitung für Maler gilt weiterhin.** Wochenbericht schreiben, Abnahme
> machen, Urlaub beantragen, Belege einreichen: Das funktioniert für dich
> genauso. Nachgelesen wird es dort, hier stehen nur die Unterschiede.

### Die drei Rollen

| Rolle | Sieht und darf |
| --- | --- |
| Maler (worker) | Die ganze Einsatzplanung, genehmigte Abwesenheiten aller, die eigenen Anträge, Berichte und Belege. |
| Büro (admin) | Alles, und darf Stammdaten, Planung und Entscheidungen ändern. |
| Anzeige (tv) | Nur lesen, für den Fernseher im Büro. Kommt an keine Berichte und keine Unterschriften. |

> **Wichtig: Diese Grenzen zieht die Datenbank, nicht die Oberfläche.** Dass
> ein Maler den Reiter „Verwaltung" nicht sieht, ist Bequemlichkeit. Dass er
> nichts darin ändern kann, ist die Sicherheitsregel darunter. Wer die
> Oberfläche umgeht, kommt trotzdem an nichts heran.

### Dein zusätzlicher Reiter

Zu den fünf Reitern der Maler kommt bei dir **Verwaltung** dazu. Dahinter
liegen sechs Bereiche, in der Reihenfolge, in der sie im Büro gebraucht
werden:

1. **Wochenberichte** — was die Maler abgegeben haben.
2. **Abnahmeprotokolle** — was von den Baustellen hereinkommt.
3. **Auslagen** — offene Belege und Monatsabschlüsse.
4. **Urlaubsanträge** — was zu entscheiden ist.
5. **Baustellen** — der Stamm, aus dem sich alle Felder speisen.
6. **Benutzer** — Konten, Rollen, Farben, Passwörter.

Oben stehen die laufenden Vorgänge, unten die Stammdaten. Was jeden Tag
gebraucht wird, steht also zuerst.

### Was nur du kannst

| Aufgabe | Wo |
| --- | --- |
| Einsätze planen, verschieben, löschen | Wochenplanung → Bearbeiten |
| Abgegebene Berichte lesen und als PDF ziehen | Verwaltung → Wochenberichte |
| Einen Bericht zur Korrektur wieder öffnen | Verwaltung → Wochenberichte → Entsperren |
| Abnahmeprotokolle einsehen | Verwaltung → Abnahmeprotokolle |
| Auslagen prüfen und monatlich abschließen | Verwaltung → Auslagen |
| Urlaub genehmigen oder ablehnen | Verwaltung → Urlaubsanträge |
| Resturlaub korrigieren | Verwaltung → Benutzer → Palmensymbol |
| Baustellen anlegen und ausblenden | Verwaltung → Baustellen |
| Konten anlegen, Rollen vergeben, Passwörter setzen | Verwaltung → Benutzer |
| Krankmeldung eintragen | Wochenplanung, Code 050-7 |

## 2. Anmelden und einrichten

Anmeldung, Installation auf dem Home-Bildschirm und das Verhalten ohne Netz
sind dieselben wie bei den Malern — nachzulesen in deren Anleitung.

### Was du zusätzlich einrichten solltest

1. **Benachrichtigungen einschalten** (Einstellungen). Sonst erfährst du von
   einem neuen Urlaubsantrag erst, wenn du nachschaust.
2. **Standard-Arbeitszeiten hinterlegen** (Einstellungen), falls du deine
   eigenen Stunden über die App führst — siehe Kapitel 11.

### Am Schreibtisch oder am Handy

Die App ist dieselbe. Am großen Bildschirm stehen die Reiter links, am Handy
hinter dem Menü-Knopf oben rechts.

> **Planen lässt sich beides.** Die Kacheln der Wochenplanung lassen sich mit
> der Maus **und** mit dem Finger ziehen. Am Schreibtisch ist es trotzdem
> angenehmer: Die Woche passt dort ohne Scrollen auf den Schirm.

## 3. Wochenplanung — die Übersicht

Die Wochenplanung ist das Herzstück. Was hier steht, sehen die Maler sofort,
und daraus füllt sich ihr Wochenbericht.

### Zuerst nur lesen

Auch du siehst die Planung zunächst **schreibgeschützt**. Geändert wird erst
nach einem Klick auf **Bearbeiten**.

> Das ist Absicht: Wer nur nachschauen wollte, wer heute wo ist, soll nicht
> mit einem verrutschten Finger die halbe Woche umplanen.

### Das Raster lesen

Links die Namen, oben Montag bis Samstag. Aufgeführt werden **nur aktive
Maler** — Büro-Konten stehen nicht im Raster (siehe Kapitel 11), deaktivierte
Konten ebenso wenig.

- Jeder Mitarbeiter hat eine **eigene Farbe**. Sie steckt an jeder seiner
  Kacheln, auch am Fernseher.
- Eine Kachel zeigt **Baustellennummer, Adresse, Uhrzeiten** und, wenn
  vorhanden, die **Notiz** fürs Team.
- Ganz oben läuft die Zeile **Hinweise** — sie gilt dem ganzen Tag, nicht
  einer Person.
- Unter den Malern stehen die **Fremdgewerke**.

### Der Samstag

Im Lesemodus erscheint die Samstagsspalte nur, wenn dort auch etwas steht: ein
Einsatz, eine Notiz oder ein Gewerk. In den meisten Wochen ist er leer und
nähme den fünf Arbeitstagen nur Breite weg.

**Beim Bearbeiten ist der Samstag immer da** — sonst gäbe es keine Zelle, in
die der erste Samstagseinsatz je gelegt werden könnte.

Ein Feiertag, der auf einen Samstag fällt, öffnet die Spalte übrigens nicht:
An dem Tag arbeitet ohnehin niemand.

### Abwesenheiten im Raster

Feiertage und genehmigter Urlaub stehen mit im Raster, sind aber **abgeleitet
und nicht gespeichert**: Sie kommen aus dem Feiertagskalender und aus dem
genehmigten Antrag. Wird ein Antrag zurückgezogen, verschwindet die Kachel von
selbst.

| Code | Bedeutung | Kommt woher |
| --- | --- | --- |
| 040-7 | Feiertag | Feiertagskalender (Hamburg, 2026–2032) |
| 050-7 | Krank | vom Büro von Hand geplant |
| 060-7 | Urlaub | genehmigter Antrag — oder von Hand geplant |
| 061-7 | Flexstunden minus | von Hand geplant |
| 070-7 | Lagerarbeiten | von Hand geplant |
| 073-7 | Mitarbeiterschulung | von Hand geplant |

> **Planen darfst du trotzdem.** Wer am Feiertag oder im Urlaub doch arbeitet,
> bekommt seinen Einsatz einfach daneben.

## 4. Wochenplanung — ändern

### Bearbeiten und Fertig

1. Auf **Bearbeiten** tippen. Der Knopf wird blau, die Zellen werden anklickbar.
2. Planen: anlegen, ziehen, ändern, löschen.
3. Auf **Fertig** tippen.

**Erst „Fertig" benachrichtigt die Maler** — und zwar eine Meldung je
betroffener Woche, nicht eine pro Zug. Danach steht kurz da, wie viele Maler
Bescheid bekommen haben.

> **Wichtig: Ohne „Fertig" weiß niemand Bescheid.** Die Änderung steht zwar
> sofort in der Datenbank und ist auch sofort in der App der Maler sichtbar —
> aber es klingelt bei niemandem. Deshalb am Ende einer Planungsrunde immer
> auf „Fertig" tippen.

Der Bearbeitungsmodus überlebt einen Wochenwechsel: Du kannst mehrere Wochen
hintereinander umplanen und ganz am Ende einmal abschließen.

### Einen Einsatz anlegen

1. In die leere Zelle tippen, in der der Einsatz stehen soll.
2. **Baustelle** aus der Liste wählen.
3. **Beginn** und **Ende** prüfen — sie sind schon vorbelegt:
   Montag bis Donnerstag `07:00–16:30`, Freitag `07:00–13:30`.
4. Eine **Notiz** eintragen, wenn der Maler etwas wissen muss
   („Kunde ab 10 Uhr da").
5. Auf **Speichern** tippen.

Mehr braucht die Planung nicht. Die **Pause rechnet die App** aus den festen
Pausenfenstern des Wochentags; sie wird gespeichert, aber bewusst nicht
angezeigt.

> Die vorbelegten Zeiten sind so gewählt, dass nach Abzug der Pausen genau die
> Soll-Stunden herauskommen: 8,5 Stunden von Montag bis Donnerstag, 6 Stunden
> am Freitag.

### Ganze Arbeitstage aus der Leiste ziehen

Für den Regelfall — ein Maler, ein ganzer Tag, eine Baustelle — geht es
schneller. Sobald du auf **Bearbeiten** getippt hast, erscheint **unter dem
Raster eine Leiste**: je Baustelle eine Spalte, darunter ein Stapel Blöcke.

Einen Block auf die Zelle ziehen, in der der Einsatz stehen soll — fertig. Die
Uhrzeiten setzt die App aus dem Wochentag, auf dem der Block landet: Montag bis
Donnerstag `07:00–16:30`, Freitag `07:00–13:30`.

**Der Stapel ist das, was noch übrig ist.** Über jeder Spalte steht der Rest in
Stunden, und darunter liegen so viele Blöcke, wie das an ganzen Tagen ergibt.
Jeder gezogene Block verschwindet aus dem Stapel; löschst du den Einsatz wieder,
kommt er zurück.

In der Leiste stehen **nur Baustellen, für die du Gesamtstunden hinterlegt
hast** (Verwaltung → Baustellen). Ist der Rest aufgebraucht, verschwindet die
Spalte.

> **Planen kannst du trotzdem weiter.** Die Leiste ist eine Abkürzung, keine
> Schranke. Halbe Tage, andere Uhrzeiten, Krank- und Urlaubscodes und alles, was
> über das Kontingent hinausgeht, läuft wie bisher über **„+ Einsatz"**.

### Eine Kachel ändern, ziehen, kopieren, löschen

| Was | Wie |
| --- | --- |
| Ändern | Auf den Stift an der Kachel tippen — sie wird zum Formular. |
| Verschieben | Die Kachel auf einen anderen Tag oder einen anderen Maler ziehen. Geht mit Maus und Finger. |
| Kopieren | Das Kopiersymbol legt eine zweite Kachel in dieselbe Zelle — von dort ziehst du sie hin, wo sie hin soll. |
| Notiz | Das Sprechblasensymbol an der Kachel. Blau heißt: Es steht schon eine Notiz drin. |
| Löschen | Der Mülleimer, mit Rückfrage. |

> **Wichtig beim Verschieben auf einen anderen Maler:** Hat der bisherige
> Kollege den Einsatz schon in seinen Wochenbericht übernommen, fragt die App
> nach. Nach dem Verschieben steht die Schicht in **beiden** Berichten — die
> Zeile im alten Bericht muss der Kollege von Hand löschen. Von hier aus geht
> das nicht, ohne in einen fremden Bericht zu schreiben.

### Die ganze Vorwoche übernehmen

**Vorwoche übernehmen** kopiert alle Einsätze der Vorwoche in die gerade
sichtbare — und die Gewerk-Zeilen gleich mit, damit der Gerüstbauer, der jeden
Montag kommt, nicht jede Woche neu eingetippt werden muss.

Vorher steht in der Rückfrage, wie viele Einsätze es sind. Ist die Vorwoche
leer, sagt die App das.

Danach wird nachgebessert: umgeplant, gelöscht, ergänzt. Für eine Woche, die
der vorigen ähnelt, ist das deutlich schneller als alles neu anzulegen.

### Hinweise für den Tag

Die Zeile **Hinweise** ganz oben gilt allen. Dort steht, was den ganzen Tag
betrifft — „Betriebsversammlung 14 Uhr", „Container kommt".

Antippen, schreiben, danebentippen: Der Text wird gespeichert, sobald das Feld
den Fokus verliert. Ein leeres Feld löscht den Hinweis.

### Fremdgewerke

Unter den Malern lassen sich Zeilen für alle anlegen, die nicht auf der
Gehaltsliste stehen — Gerüstbauer, Hebebühne, Tischler, Trockenbau.

1. Auf **Gewerk hinzufügen** tippen.
2. Den Namen eingeben („Hebebühne").
3. In die Tageszellen der neuen Zeile tippen und Baustelle plus Notiz
   eintragen.

Eine Gewerk-Zeile gilt **für ihre Woche**. Entfernst du sie, verschwinden ihre
Einträge mit — die Rückfrage sagt, wie viele es sind.

### Vollbild

Das Vollbildsymbol neben der Wochenauswahl zeigt den Plan bildschirmfüllend,
**nur zum Ansehen**. Praktisch für die Besprechung am Morgen oder zum Zeigen
auf dem Tablet.

## 5. Wochenberichte prüfen

**Verwaltung → Wochenberichte.** Dieselbe Wochenauswahl wie in der Planung.

### Was in der Liste steht

Aufgeführt wird, **was abgegeben und unterschrieben wurde** — Entwürfe stehen
bewusst nicht da. Zu beurteilen ist nur, wofür jemand geradesteht.

Sortiert ist nach Nachnamen, damit die Liste von Woche zu Woche gleich
aussieht. Je Bericht siehst du Name, Gesamtstunden und wann er abgegeben
wurde.

> **Eine Ampel gibt es nicht.** Wer nichts abgegeben hat, taucht hier nicht
> auf. Wer fehlt, sieht man, indem man die Liste mit der Mannschaft vergleicht.

### Als PDF sichern

Der blaue Knopf **PDF** erzeugt den Wochenbericht als Datei — Kopfangaben,
eine Tabelle mit Datum, Baustelle, Beschreibung, Zeiten, Pause und Stunden,
darunter die Unterschrift des Malers.

Das PDF entsteht erst beim Klick, aus den Daten. Deshalb trägt es immer die
aktuelle Gestaltung.

### Einen Bericht entsperren

Hat sich jemand vertan, gibst du den Bericht mit **Entsperren** zur Korrektur
frei.

> **Wichtig: Die Unterschrift wird dabei verworfen.** Der Bericht verschwindet
> aus dieser Liste, ist für den Mitarbeiter wieder bearbeitbar, und er muss
> **neu unterschreiben und neu abgeben**. Sag ihm Bescheid — die App tut es
> nicht.

## 6. Abnahmeprotokolle

**Verwaltung → Abnahmeprotokolle.** Eine durchgehende Liste, das jüngste
Protokoll oben.

> Bewusst ohne Wochennavigation: Eine Abnahme hängt an keiner Kalenderwoche.
> Gesucht wird nach Baustelle, und das jüngste Protokoll ist fast immer das
> gesuchte.

### Was in der Liste steht

Je Protokoll: Baustellennummer und Adresse, Zeitpunkt, der Mitarbeiter, der
sie gemacht hat, und ein Kennzeichen **Ohne Mängel** (grün) oder **Mit
Mängeln** (rot).

**Details** klappt die Einzelheiten auf: Art der Abnahme, Teilnehmer und — bei
Mängeln — die Frist für die Nacharbeiten und die Liste der Mängel.

### Das PDF

**PDF** öffnet die Datei, die der Kunde unterschrieben hat. Sie wird nicht neu
erzeugt.

> **Die Fotos der Mängel stecken ausschließlich in der PDF.** In der Liste
> daneben stehen nur die Texte. Wer die Bilder braucht, öffnet das Dokument.

Der Speicher ist privat; die Adresse, über die das PDF geöffnet wird, gilt nur
für kurze Zeit. Zum Ablegen also herunterladen, nicht den Link weitergeben.

## 7. Auslagen abrechnen

**Verwaltung → Auslagen.** Zwei Listen: oben die offenen Belege je
Mitarbeiter, darunter die fertigen Abrechnungen.

### Offene Belege prüfen

Aufgeführt wird **nur, wer offene Belege hat** — mit Anzahl und Summe. Ein
Klick auf den Namen klappt die Belege auf.

Jeden Beleg kannst du

- mit dem **Stift** ändern, etwa wenn ein Betrag vertippt ist, und
- mit dem **Mülleimer** löschen. Die Fotos gehen mit.

> **Die Unterschrift bei einer Bewirtung kann nur der Mitarbeiter selbst
> leisten.** Bearbeitest du einen fremden Beleg, bleibt seine Unterschrift
> unangetastet — und eine fehlende kann er nur selbst in seinem Reiter
> „Auslagen" nachholen.

### Der Monatsabschluss

Der Knopf **Monatsabschluss** neben einem Namen öffnet den Dialog. Er schließt
**alle offenen Belege dieser Person** in einer Abrechnung ab.

1. **Abrechnungsmonat** wählen — der Monat, in dem ausgezahlt wird.
2. **Datum** prüfen (voreingestellt heute).
3. Die Belegliste mit ihrer Summe kontrollieren.
4. Die **Auszahlung** aufteilen: Datum, Art (Überweisung, Bar oder Vorschuss)
   und Betrag. Voreingestellt ist eine Überweisung über die ganze Summe.
5. Bei Bedarf **Zeile hinzufügen** — die neue Zeile übernimmt automatisch den
   Rest, du teilst also nur noch auf.
6. Auf **Abschließen** tippen.

> **Wichtig: Abgeschlossen wird nur, wenn der Rest genau 0,00 € ist.** Die
> Anzeige unten ist grün, wenn es passt, und gelb, solange etwas fehlt oder zu
> viel ist. Die Datenbank prüft es beim Speichern ein zweites Mal — eine
> ausgezahlte Summe, die nicht zu den Belegen passt, soll gar nicht erst
> entstehen können.

> **Der Abrechnungsmonat ist nicht der Belegmonat.** Ein Bon vom 30. September,
> der im Oktober ausgezahlt wird, gehört in die Oktober-Abrechnung. Deshalb
> wird der Monat gewählt und nicht aus den Belegen abgeleitet.

Ist für diese Person der gewählte Monat schon abgerechnet, sagt die App das
und lässt den Abschluss nicht zu. Dann entweder einen anderen Monat wählen
oder die bestehende Abrechnung zurücknehmen.

### Die Abrechnung als PDF

In der Liste **Abrechnungen** liefert **PDF** das vollständige Dokument:
vorne die Tabelle wie in der bisherigen Excel-Vorlage, dahinter **je Beleg
eine Seite mit seinen Fotos**. So lässt sich jede Zeile der Tabelle zum Bild
zurückverfolgen.

Der Dateiname folgt den Blattnamen der Vorlage, etwa
`Auslagen_Stumpenhagen_09-2026.pdf`.

### Eine Abrechnung zurücknehmen

**Zurücknehmen** macht den Abschluss rückgängig: Die Belege sind danach wieder
offen und änderbar, die Abrechnung verschwindet, der Monat lässt sich neu
abschließen.

## 8. Urlaub entscheiden

**Verwaltung → Urlaubsanträge.** Oben die offenen, darunter der Verlauf.

> Beides in einer Liste, damit dieselbe Person nicht zweimal auftaucht und man
> zwischen zwei Blöcken vergleichen muss.

### Was bei einem offenen Antrag steht

- Name und Zeitraum, dazu die Anzahl der **Werktage ohne Feiertage**.
- Wann er eingereicht wurde.
- **Resturlaub danach** — was der Person nach einer Genehmigung bliebe.
- In Gelb: wie viele **geplante Einsätze** in diesem Zeitraum liegen.

### Genehmigen

Die Rückfrage nennt die Urlaubstage und — falls vorhanden — die Warnung, wie
viele geplante Einsätze dabei gelöscht werden.

> **Wichtig: Das Löschen der Einsätze lässt sich nicht rückgängig machen.**
> Genehmigen räumt den Zeitraum leer. Steht dort noch eine Baustelle, die
> jemand anders übernehmen muss, notiere sie dir **vorher**.

Status, Urlaubskonto und das Räumen der Einsätze passieren in einem Zug — als
Datenbankfunktion, damit nichts halb geschieht.

### Ablehnen

Ein Tipp, keine Rückfrage. Das Urlaubskonto bleibt unangetastet, der Antrag
steht als abgelehnter Vorgang im Verlauf.

### Genehmigten Urlaub zurückziehen

Wird doch umgeplant, steht bei einem genehmigten Urlaub im Verlauf der Knopf
**Zurückziehen**. Dabei

- kommen die Urlaubstage **aufs Konto zurück**,
- werden die Urlaubszeilen aus **noch nicht abgegebenen** Wochenberichten
  geräumt, und
- bleibt der Antrag als Vorgang stehen, damit nachvollziehbar ist, was wann
  entschieden wurde.

Die geplanten Einsätze, die beim Genehmigen gelöscht wurden, kommen **nicht**
zurück. Die Woche muss neu geplant werden.

### Krankmeldung eintragen

Krank meldet sich jeder telefonisch. In die App trägst du es so ein:

1. **Wochenplanung** öffnen, auf **Bearbeiten** tippen.
2. Für die betroffenen Tage den Code **050-7 Krank** als Einsatz anlegen.
3. Auf **Fertig** tippen.

> **Wichtig: Die geplanten Einsätze räumt dabei niemand weg.** Anders als beim
> Urlaub gibt es hier keine Automatik. Wer krank ist, hat seine Baustellen
> noch im Plan stehen — du musst sie selbst löschen oder auf einen Kollegen
> ziehen.

> **Und noch eine Falle: 060-7 Urlaub von Hand bucht kein Urlaubskonto ab.**
> Ein Urlaub, den du direkt in die Planung schreibst, statt einen Antrag zu
> genehmigen, zieht der Person keine Tage ab. Das ist bewusst so — aber es
> heißt, dass regulärer Urlaub über den Antrag laufen muss.

## 9. Baustellen

**Verwaltung → Baustellen.** Aus diesem Stamm speisen sich alle Felder: das
Auswahlfeld der Planung, die Vorschläge im Wochenbericht und in der Abnahme.

### Anlegen

Nummer, Adresse und — wenn gewünscht — der Kunde, dann **Anlegen**. Nummer und
Adresse sind Pflicht.

Die Nummer ist der Schlüssel, an dem im Wochenbericht die Adresse hängt und
umgekehrt. Es lohnt sich, beim Schema zu bleiben (`080-7`).

Das Feld **Std. gesamt** ist freiwillig: Es sind die Stunden, die für die
Baustelle veranschlagt sind. Leer heißt, die Baustelle taucht in der Leiste der
Wochenplanung nicht auf.

### Ändern und ausblenden

Der **Stift** fragt nacheinander nach Nummer und Adresse.

Das **Stundenfeld** in der Zeile lässt sich direkt ändern — eintippen, woanders
hintippen, gespeichert. Leeren nimmt die Baustelle aus der Leiste der
Wochenplanung; sie bleibt ansonsten unverändert nutzbar.

> **Was von den Stunden abgezogen wird:** alles, was in der Wochenplanung auf
> dieser Baustelle steht — vergangene und künftige Wochen, egal ob per Block
> oder über „+ Einsatz" eingetragen. Was die Maler später in ihren
> Wochenberichten abgeben, ändert die Zahl nicht.

Der **Mülleimer** blendet die Baustelle aus — er löscht sie nicht.

> **Das ist Absicht:** An einer Baustelle hängen Berichtszeilen vergangener
> Wochen. Würde sie verschwinden, wären alte Berichte unvollständig. Eine
> ausgeblendete Baustelle wird nur nicht mehr vorgeschlagen.

### Die Abwesenheitscodes

Die Zeilen `040-7` bis `073-7` haben **keine Knöpfe**. Ihre Nummern stecken
fest im Code der Planung und im Urlaubskonto — sie zu ändern oder auszublenden
würde beides zerreißen.

## 10. Benutzer verwalten

**Verwaltung → Benutzer.** Gruppiert nach Rolle, darin nach Nachnamen.

### Ein Konto anlegen

1. Auf **Benutzer anlegen** tippen.
2. **Vorname** und **Nachname** eintragen.
3. **E-Mail** für die Anmeldung eintragen.
4. Das vorgeschlagene **Startpasswort** übernehmen oder mit dem
   Kreis-Symbol ein anderes vorschlagen lassen.
5. Die **Rolle** wählen: Maler, Büro oder Anzeige für den Fernseher.
6. Bei einem Maler die **Urlaubstage** setzen (voreingestellt 30).
7. Auf **Anlegen** tippen.

Die Farbe für die Planung vergibt die App selbst — die nächste freie.

> **Wichtig: Die Zugangsdaten stehen danach genau einmal da.** Der grüne
> Kasten nennt E-Mail und Passwort. Bitte notieren und weitergeben — das
> Passwort wird nirgends gespeichert und lässt sich später **nicht mehr
> anzeigen**, nur neu setzen.

### Was du an einem Konto ändern kannst

| Knopf | Wirkung |
| --- | --- |
| Rollen-Auswahl | Maler, Büro oder Anzeige. |
| Farbfeld | Die Farbe in Planung und Fernseher. |
| Palme | Resturlaub korrigieren, etwa für Resttage aus dem Vorjahr. |
| Schlüssel | Neues Passwort setzen — es wird danach einmal angezeigt. |
| Deaktivieren | Aus Planung und Listen nehmen. Berichte bleiben erhalten. |
| Mülleimer | Konto löschen. |

> **Deaktivieren statt Löschen.** Wer nicht mehr im Betrieb ist, wird
> deaktiviert: Die Person verschwindet aus Planung und Listen, ihre Berichte
> bleiben. **Löschen nimmt die Wochenberichte mit** — das ist fast nie das,
> was gemeint ist.

Genehmigte Urlaube zieht die App selbst vom Konto ab. Über die Palme wird nur
nachgesteuert.

### Die eingebauten Sicherungen

Damit sich niemand aussperrt, sind zwei Dinge fest verdrahtet:

- **Die eigenen Büro-Rechte lassen sich nicht entziehen**, und das eigene
  Konto lässt sich nicht löschen.
- **Das letzte Büro-Konto** kann weder gelöscht noch herabgestuft werden.

Anlegen, Rechte ändern und Löschen prüft die Datenbank zusätzlich selbst —
auch wenn jemand die Oberfläche umgeht.

## 11. Deine eigenen Stunden

Büro-Konten stehen **nicht in der Wochenplanung**: Ein Admin hat keine
Baustelle, und eine Zeile im Raster, in der nie etwas steht, kostet nur Platz.
Deine Stunden entstehen stattdessen aus einer Vorgabe.

### Standard-Arbeitszeiten hinterlegen

**Einstellungen → Standard-Arbeitszeiten.** Je Wochentag Beginn und Ende
eintragen, dann **Speichern**.

- Neben jeder Zeile stehen die **Netto-Stunden** und die Pause — hier legst du
  eine Regel fest, die danach jede Woche unbesehen greift, also muss man
  sehen, was dabei herauskommt.
- Ein **leerer Wochentag** heißt „an dem Tag wird nicht gearbeitet". Ein
  Häkchen zum Abschalten gibt es deshalb nicht: Wer den Samstag leert, hat ihn
  abgeschaltet.
- Beginn und Ende gehören zusammen — halb ausgefüllt nimmt die App nicht an.
- Unten steht die Summe der Woche.

Diese Zeiten übernimmt dein Wochenbericht auf die Baustelle **001-7
Büroarbeit**, sobald du eine Woche öffnest. Feiertage und genehmigter Urlaub
gehen vor.

> **Jeder pflegt nur seine eigenen Zeiten.** Anders als bei Planung und
> Baustellen darf hier auch das Büro nicht in fremde Zeilen schreiben — wer
> sie ändern dürfte, änderte damit fremde Stundenzettel.

### Die Pause im Büro folgt einer anderen Regel

Die Maler rechnen nach **festen Pausenfenstern** (10:00–10:30 und 13:00–13:30,
freitags nur das erste). Für Büro-Konten gilt stattdessen die gesetzliche
Mindestpause nach **§ 4 ArbZG**, bemessen an der Anwesenheit:

| Anwesenheit | Pause |
| --- | --- |
| bis 6 Stunden | keine |
| über 6 bis 9 Stunden | 30 Minuten |
| über 9 Stunden | 45 Minuten |

> **Die beiden Regeln werden nie vermischt.** Ein Bürotag von 07:00 bis 16:30
> überdeckt zwar beide Pausenfenster der Maler, aber im Büro finden diese
> Pausen nicht statt: Fällig sind die gesetzlichen 45 Minuten, nicht 60.

An den Rändern gilt der Gesetzestext, nicht die Faustformel: Pause erst
**über** sechs bzw. **über** neun Stunden. Bei genau 6,0 oder genau 9,0
Stunden wird also weniger abgezogen — zugunsten des Mitarbeiters.

### Was in deinem Bericht sonst anders ist

- Die **Tätigkeitsbeschreibung ist freiwillig**. Beim Maler ist sie Pflicht.
- Es kommt nichts aus der Planung — nur deine Standardzeiten, Feiertage und
  genehmigter Urlaub.

## 12. Die Büroanzeige am Fernseher

Ein Bildschirm an der Bürowand, auf dem die Woche und der Urlaubsplan stehen.

### Einrichten

1. **Verwaltung → Benutzer → Benutzer anlegen**, Rolle **Anzeige (Fernseher)**.
2. An einem kleinen Rechner am HDMI-Anschluss Chrome im Kiosk-Modus auf die
   Adresse der App richten.
3. Einmal mit dem Anzeigekonto anmelden — die Sitzung hält monatelang.

> **Das Anzeigekonto darf ausschließlich lesen.** Es kommt an keine
> Wochenberichte und an keine Unterschriften und taucht in keiner
> Mitarbeiterliste und keiner Planung auf.

Zum Ausprobieren lässt sich die Anzeige auch mit deinem Büro-Konto öffnen:
`#tv` an die Adresse anhängen.

### Bedienen

Drei Seiten; die gewählte bleibt stehen.

| Taste | Wirkung |
| --- | --- |
| Pfeil rechts, Bild ab, Leertaste | eine Seite weiter |
| Pfeil links, Bild auf | eine Seite zurück |
| 1 / 2 / 3 | direkt zu Logo, Wochenplanung, Jahresübersicht |

Ein Funk-Presenter für etwa 15 € sendet genau diese Tasten und ersetzt die
Tastatur.

### Die drei Seiten

1. **Logo mit Uhrzeit** — die Startseite, damit im Ruhezustand nichts
   Personenbezogenes an der Wand hängt.
2. **Wochenplanung** — dasselbe Raster wie in der App, in den Farben der
   Mitarbeiter. Aktualisiert sich von selbst, sobald du etwas änderst.
3. **Jahresübersicht** — ein durchgehendes Jahresband je Mitarbeiter. Man
   erkennt auf einen Blick, wer wann weg ist und wo es eng wird.

> **Auf der Jahresübersicht steht nur Urlaub.** Krankheit gehört niemandem an
> die Bürowand.

## 13. Benachrichtigungen

**Einstellungen → Benachrichtigungen.** Zwei Ebenen, die verschieden weit
reichen:

- Der **obere Schalter** meldet **dieses Gerät** an oder ab. Auf jedem Gerät
  einmal einschalten.
- Die **Schalter darunter** gelten für dich auf **allen deinen Geräten**.

Für ein Büro-Konto gibt es zwei Arten:

| Art | Wann sie kommt |
| --- | --- |
| Neuer Urlaubsantrag | Wenn ein Mitarbeiter Urlaub beantragt. |
| Urlaub entschieden | Wenn über deinen eigenen Antrag entschieden wurde. |

> Die Art „Planänderung" gibt es für dich nicht: Im Planungsraster stehen nur
> Maler, ein Büro-Konto bekäme sie also nie.

Am iPhone funktionieren Push-Nachrichten nur in der über „Teilen → Zum
Home-Bildschirm" installierten App.

## 14. Wenn etwas nicht klappt

### Meldungen, die du sehen kannst

| Meldung | Was los ist | Was du tust |
| --- | --- | --- |
| Daten konnten nicht geladen werden | Die App kommt nicht an die Datenbank. | Auf **Erneut versuchen** tippen. Bleibt es dabei: Datenbank prüfen. |
| In der Vorwoche ist nichts geplant | „Vorwoche übernehmen" findet nichts zum Kopieren. | Die Woche von Hand planen. |
| Für … ist dieser Monat schon abgerechnet | Doppelter Monatsabschluss. | Anderen Monat wählen oder die bestehende Abrechnung zurücknehmen. |
| Rest ist nicht 0,00 € | Die Auszahlungszeilen ergeben nicht die Belegsumme. | Beträge anpassen oder eine Zeile hinzufügen. |
| Bericht konnte nicht entsperrt werden | Keine Berechtigung, oder der Bericht ist weg. | Anmeldung prüfen, Seite neu laden. |
| Kein geheimer Schlüssel in der Umgebung gefunden | Beim Anlegen eines Benutzers: In Supabase fehlt ein Schlüssel. | Siehe README, Abschnitt „Benutzerverwaltung freischalten". |
| Der Reiter „Auslagen" zeigt einen Fehler | Die Migration für die Auslagen fehlt. | `0014_expenses.sql` ausführen. |

### Erste Hilfe

1. **Seite neu laden** — in den Einstellungen über **Nach Updates suchen**.
2. **Prüfen, ob Netz da ist.**
3. **Ab- und wieder anmelden.**
4. Bleibt es dabei: In der **README** des Projekts stehen die Einrichtung der
   Datenbank, der Edge Functions und der Benachrichtigungen.

> **Was Maler dir melden, prüfst du zuerst hier:** Kommen keine Nachrichten
> an, fehlt meist der zweite Datenbank-Webhook oder die App wurde nicht über
> „Zum Home-Bildschirm" installiert.

## 15. Spickzettel

### Der Rhythmus

| Wann | Was |
| --- | --- |
| Laufend | Wochenplanung pflegen — und jede Runde mit **Fertig** abschließen. |
| Bei einer Krankmeldung | 050-7 eintragen **und** die geplanten Einsätze selbst umräumen. |
| Bei einem Urlaubsantrag | Entscheiden. Vor dem Genehmigen die betroffenen Einsätze notieren. |
| Montags | Wochenberichte der Vorwoche prüfen und als PDF ablegen. |
| Laufend | Abnahmeprotokolle sichten, bei Mängeln die Frist im Blick behalten. |
| Monatlich | Auslagen je Mitarbeiter abschließen und das PDF ablegen. |
| Jahreswechsel | Resturlaub über die Palme nachziehen. |

### Die wichtigsten Regeln in einem Satz

- **Ohne „Fertig"** erfährt kein Maler von der Planänderung.
- **Genehmigter Urlaub löscht die geplanten Einsätze** — unwiderruflich.
- **050-7 räumt nichts weg**, das machst du selbst.
- **060-7 von Hand bucht kein Urlaubskonto ab.**
- **Entsperren verwirft die Unterschrift** — der Maler muss neu abgeben.
- **Abgeschlossen wird nur bei Rest 0,00 €.**
- **Der Abrechnungsmonat ist nicht der Belegmonat.**
- **Baustellen werden ausgeblendet, nicht gelöscht.**
- **Mitarbeiter werden deaktiviert, nicht gelöscht.**
- **Das Passwort steht genau einmal da.**
