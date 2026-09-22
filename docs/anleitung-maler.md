---
titel: Anleitung für Maler
app: Malerprofis Uderstadt
rolle: worker
gilt_fuer: Alle Mitarbeiter mit der Rolle „Maler" (worker)
sprache: de
quelle: docs/anleitung-maler.md
pdf: docs/Anleitung-Maler.pdf
deckblatt_oben: Anleitung
deckblatt_unten: für Maler
einleitung: Wochenplanung, Wochenberichte, Abnahmeprotokolle, Urlaub und Auslagen — alles, was du in der App der Malerprofis Uderstadt brauchst.
hinweis_fuer_ki: >
  Diese Datei ist die einzige Quelle der Anleitung. Das PDF wird daraus mit
  `npm run anleitung` erzeugt und nie von Hand bearbeitet. Jedes Kapitel (##)
  beschreibt genau einen Reiter oder ein Thema der App, jeder Abschnitt (###)
  genau eine Aufgabe. Zahlen, Codes und Regeln stammen aus dem Quelltext der
  App — bei Änderungen dort muss diese Datei mitgezogen werden.
---

# Anleitung für Maler

## 1. Die App auf einen Blick

Die App ersetzt den Zettel auf dem Armaturenbrett: Sie zeigt dir, wo du diese
Woche eingeteilt bist, du schreibst deinen Wochenbericht hinein, machst
Abnahmen beim Kunden, beantragst Urlaub und reichst deine Auslagen ein. Alles,
was du eingibst, landet direkt im Büro — es gibt keinen Versand per Mail und
keine Papiere, die verloren gehen können.

### Deine sechs Reiter

Am großen Bildschirm stehen sie links, am Handy hinter dem Menü-Knopf oben
rechts.

| Reiter | Wofür |
| --- | --- |
| Wochenplanung | Wer ist diese Woche wo. Du liest nur mit, geplant wird im Büro. |
| Wochenberichte | Deine Arbeitszeit, Tag für Tag. Am Ende der Woche unterschreiben und abgeben. |
| Abnahme | Abnahmeprotokoll beim Kunden, mit Fotos und zwei Unterschriften. |
| Urlaub | Resturlaub sehen und Urlaub beantragen. |
| Auslagen | Belege fotografieren und einreichen. |
| Einstellungen | Benachrichtigungen, App-Info, Abmelden. |

Beim Start öffnet die App immer die **Wochenplanung** — das ist der Blick, den
man morgens braucht.

### Was das Büro sieht und was nicht

Das Büro sieht deine abgegebenen Wochenberichte, deine Abnahmen, deine
Urlaubsanträge und deine Belege. Es sieht **nicht**, was du auf dem Handy
tippst, solange du es nicht gespeichert oder abgegeben hast.

Umgekehrt siehst du die Einsatzplanung aller Kollegen und ihre genehmigten
Abwesenheiten — das muss so sein, damit jeder weiß, wer auf welcher Baustelle
ist. Fremde Wochenberichte, Unterschriften und Belege bleiben dir verborgen.

> **Gut zu wissen:** Diese Grenzen zieht die Datenbank, nicht die Oberfläche.
> Auch wer die App austrickst, kommt an nichts heran, was ihn nichts angeht.

## 2. Anmelden und einrichten

### Zum ersten Mal anmelden

1. Die Adresse der App im Browser öffnen — du bekommst sie vom Büro.
2. **E-Mail** und **Passwort** eingeben, die dir das Büro gegeben hat.
3. Auf **Anmelden** tippen.

Die Anmeldung hält monatelang. Du musst dich also nicht jeden Morgen neu
anmelden — nur wenn du dich ausdrücklich abmeldest oder den Browserspeicher
löschst.

Es gibt bewusst keine Selbstregistrierung: Konten legt ausschließlich das Büro
an.

> **Passwort vergessen?** Bitte im Büro melden. Dort wird es zurückgesetzt.

### Die App auf den Home-Bildschirm legen

Mach das einmal — danach startet die App wie eine richtige App, ohne
Adresszeile, und Benachrichtigungen funktionieren überhaupt erst.

1. Die App im Browser öffnen (iPhone: **Safari**, Android: **Chrome**).
2. Auf **Teilen** tippen (iPhone) bzw. auf die **drei Punkte** (Android).
3. **Zum Home-Bildschirm** wählen und bestätigen.

> **Wichtig am iPhone:** Push-Nachrichten gibt es nur in der so installierten
> App (ab iOS 16.4). Im normalen Safari-Tab existiert die Funktion nicht.

### Wenn kein Netz da ist

Auf der Baustelle im Keller oder im Neubau ohne Empfang läuft die App weiter.
Was du eingibst, wird auf dem Gerät gesichert und geht automatisch raus, sobald
wieder Netz da ist. Ein gelber Hinweisbalken oben sagt dir dann:

> Keine Verbindung — deine Eingaben sind auf dem Gerät gesichert und werden
> automatisch übertragen, sobald wieder Netz da ist.

Das gilt für den Wochenbericht, für Abnahmen und für Belege. Du musst nichts
wiederholen und nichts nachtragen.

## 3. Wochenplanung

Hier siehst du, wer diese Woche wo ist. **Ändern kann hier nur das Büro** — für
dich ist die Ansicht schreibgeschützt.

### Die Woche lesen

Links stehen die Namen, oben die Tage von Montag bis Samstag. Der Samstag
erscheint nur, wenn dort auch etwas steht.

- **Deine eigene Zeile ist hellblau hinterlegt** — so findest du dich sofort.
- Jeder Mitarbeiter hat eine eigene Farbe, damit sich die Kacheln über die
  Woche hinweg auseinanderhalten lassen.
- Eine Kachel zeigt **Baustellennummer, Adresse und Uhrzeiten**. Steht eine
  Notiz vom Büro dabei („Kunde ab 10 Uhr da"), wird sie vollständig angezeigt
  und nie abgeschnitten.
- Ganz oben läuft die Zeile **Hinweise** — sie gilt dem ganzen Tag, nicht einer
  einzelnen Person.
- Unter den Mitarbeitern stehen die **Fremdgewerke** (zum Beispiel Hebebühne
  oder Tischler), damit du weißt, wer sonst noch auf der Baustelle ist.

### Blättern und Vollbild

| Knopf | Wirkung |
| --- | --- |
| Pfeil nach links | eine Woche zurück |
| Pfeil nach rechts | eine Woche vor |
| Vollbild | Der Plan füllt den Bildschirm — gut fürs Handy im Querformat |

In der Mitte steht immer, welche Woche du gerade ansiehst: die Kalenderwoche
und das Datum von Montag bis Samstag.

### Abwesenheiten im Plan

Urlaub und Feiertage stehen mit im Raster, obwohl sie keine Einsätze sind. Sie
kommen aus dem genehmigten Antrag und aus dem Feiertagskalender und lassen sich
deshalb dort nicht löschen.

| Code | Bedeutung |
| --- | --- |
| 040-7 | Feiertag |
| 050-7 | Krank |
| 060-7 | Urlaub |
| 061-7 | Flexstunden minus |
| 070-7 | Lagerarbeiten |
| 073-7 | Mitarbeiterschulung |

### Wenn sich etwas ändert

Das Büro plant oft mehrere Änderungen hintereinander. Du bekommst deshalb
**nicht** bei jedem einzelnen Zug eine Nachricht, sondern erst, wenn das Büro
die Bearbeitung mit „Fertig" abschließt — dann eine Meldung je betroffener
Woche.

Kommt eine Planänderung, prüfe kurz deine Woche. Schau danach auch in den
Wochenbericht: Neue Einsätze werden dort automatisch ergänzt, aber nur an
Tagen, an denen du noch nichts eingetragen hast (siehe Kapitel 4).

## 4. Wochenberichte

Das ist der Reiter, in dem du am meisten arbeitest. Oben stehen die Woche und
die **Gesamtwochenstunden**, darunter eine Karte je Wochentag.

### Was die App schon für dich einträgt

Wenn du eine Woche öffnest, füllt die App sie so weit, wie sie kann:

1. **Geplante Einsätze** aus der Wochenplanung — mit Baustelle, Uhrzeiten und
   Pause, aber ohne Tätigkeitsbeschreibung.
2. **Genehmigter Urlaub** und **Feiertage** als eigene Zeilen mit den
   Soll-Stunden des Tages.

Ein blauer Hinweis nennt dir, wie viele Zeilen dazugekommen sind.

Dabei gelten zwei Regeln, die du kennen solltest:

- Ergänzt wird **nur an Tagen, die noch völlig leer sind**. Was du selbst
  eingetragen hast, ist die Wahrheit über deinen Tag — da schiebt sich nichts
  daneben.
- Eine Zeile, die du **löschst**, kommt nie wieder. Eine Zeile, die wegen eines
  schon gefüllten Tages *übersprungen* wurde, kommt dagegen doch noch, wenn du
  den Tag später leerräumst.

> **Die Notiz des Büros ist keine Tätigkeitsbeschreibung.** Sie bleibt bewusst
> in der Planung stehen. Was du gemacht hast, trägst du selbst ein.

### Eine Baustelle eintragen

Unter jedem Tag stehen die Eingabefelder. So fügst du eine Zeile hinzu:

1. **Baustellennummer** eingeben — die Adresse ergänzt sich von selbst. (Es
   geht auch andersherum: Adresse tippen, Nummer ergänzt sich.)
2. **Tätigkeitsbeschreibung** eintragen — was du dort gemacht hast.
3. **Startzeit** und **Endzeit** eingeben.
4. Auf **Baustelle hinzufügen** tippen.

Beide Felder schlagen dir beim Tippen die hinterlegten Baustellen vor. Steht
deine Baustelle nicht dabei, kannst du sie frei eintippen.

> **Die Tätigkeitsbeschreibung ist Pflicht.** Ohne sie lässt sich die Zeile
> nicht anlegen — und beim Abgeben prüft die App noch einmal alle Tage.

### Stunden und Pause

**Die Stunden rechnet die App, du gibst sie nicht ein.** Aus Start, Ende und
Pause ergibt sich die Netto-Arbeitszeit.

Die Pause wird auch nicht eingegeben. Sie liegt zu **festen Uhrzeiten**, und
abgezogen wird genau das, was dein Einsatz davon überdeckt:

| Wochentag | Pausenfenster |
| --- | --- |
| Montag bis Donnerstag | 10:00–10:30 und 13:00–13:30 |
| Freitag | nur 10:00–10:30 |

Daraus folgt zweierlei:

- Wer erst um 14 Uhr anfängt, arbeitet an beiden Fenstern vorbei und bekommt
  **nichts** abgezogen.
- Zwei Baustellen an einem Tag ziehen dieselbe Pause **nicht doppelt** ab —
  sie liegen zeitlich hintereinander, also kann jedes Fenster nur von einer der
  beiden überdeckt werden.

Die betrieblichen Soll-Stunden zum Vergleich: Montag bis Donnerstag **8,5
Stunden**, Freitag **6 Stunden**.

### Eine Zeile ändern oder löschen

Oben rechts auf jeder Zeile sitzen zwei kleine Symbole:

- **Stift** — die Zeile aufklappen und ändern. Baustelle, Beschreibung und
  Zeiten lassen sich korrigieren; Stunden und Pause rechnet die App neu.
- **Mülleimer** — die Zeile löschen.

Urlaubs-, Feiertags- und Lagerzeilen haben keinen Stift: Sie entstehen
automatisch und folgen eigenen Regeln. Löschen lassen sie sich trotzdem.

### Fehlt noch etwas?

Zeilen aus der Planung kommen ohne Beschreibung an. Damit dir das nicht
entgeht, steht bei ihnen ein gelber Hinweis:

> Tätigkeitsbeschreibung fehlt

Solange irgendwo dieser Hinweis steht, lässt sich der Bericht nicht abgeben.
Die App nennt dir beim Versuch, welche Tage es betrifft — **bevor** du
unterschreibst.

### Speichern und abgeben

Ganz unten stehen drei Knöpfe:

| Knopf | Wirkung |
| --- | --- |
| Woche leeren | Alle Zeilen der Woche entfernen. |
| Entwurf speichern | Den Stand ans Büro übertragen, aber noch nicht abgeben. |
| Bericht abgeben | Unterschreiben und endgültig einreichen. |

Beim Abgeben öffnet sich ein Feld zum Unterschreiben mit dem Finger. Darüber
steht: „Hiermit bestätige ich die Richtigkeit der Eingaben." Mit dem
Pfeil-Symbol oben rechts kannst du die Unterschrift zurücksetzen und neu
ansetzen.

> **Nach dem Abgeben ist die Woche gesperrt.** Kein Ändern, kein Löschen, kein
> Hinzufügen — jeder Tag trägt dann ein Schloss-Symbol. Ist doch noch etwas
> falsch, hilft nur das Büro.

Ein Versand per Mail entfällt: Das Büro sieht den Bericht direkt und druckt ihn
dort, wenn er gebraucht wird.

### Nebenbei: deine Eingaben sind sicher

Jede Änderung wird sofort auf dem Gerät gesichert. Auch wenn der Akku leer ist,
die Seite neu lädt oder das Netz wegbricht — die Woche steht beim nächsten
Öffnen wieder da.

## 5. Abnahmeprotokoll

Das Abnahmeprotokoll machst du beim Kunden, direkt vor Ort. Am Ende bekommst du
ein PDF auf dein Gerät, und dieselbe Datei geht ans Büro.

### Schritt 1: Projektdaten

1. **Baustellennummer** eingeben (zum Beispiel `040-7`) — die Adresse ergänzt
   sich von selbst.
2. Oder **Baustelle / Adresse** eingeben (zum Beispiel `Luisenweg 7, Hamburg`)
   — dann ergänzt sich die Nummer.

### Schritt 2: Teilnehmer

Namen eintippen und mit **Enter** bestätigen. Jeder Name erscheint als kleines
Feld darunter; mit dem **×** daneben nimmst du ihn wieder weg.

Trage alle ein, die bei der Abnahme dabei waren — auch dich selbst und den
Kunden.

### Schritt 3: Art und Mängelstatus

Zuerst die **Art der Abnahme**:

- **Teilabnahme** — ein Teil der Arbeiten wird abgenommen.
- **Gesamtabnahme** — alles.

Dann der **Mängelstatus**:

- **Ohne sichtbare Mängel** (grün) — fertig, hier bist du durch.
- **Mit Mängeln/Restarbeiten** (rot) — es klappen zwei weitere Felder auf.

### Schritt 4: Mängel festhalten

Nur bei „Mit Mängeln/Restarbeiten":

1. **Nacharbeiten bis** — das Datum, bis wann nachgebessert wird. Lässt du es
   leer, steht im Protokoll, dass der Termin noch festgelegt wird.
2. **Mängel/Kommentar** — jeden Mangel einzeln eintippen und mit **Enter**
   bestätigen, zum Beispiel „Sockelleiste im Flur nachbessern".
3. Zu jedem Mangel kannst du über das **Kamera-Symbol** ein Foto aufnehmen. Es
   erscheint als kleines Vorschaubild; mit dem **×** darauf nimmst du es wieder
   weg.

> **Fotos werden sofort verkleinert.** Ein volles Kamerabild ginge über eine
> Baustellenverbindung kaum hoch und würde das PDF unnötig aufblähen.

### Schritt 5: Vorschau und Unterschriften

1. Auf **Abnahme erstellen** tippen. Du siehst jetzt das fertige Protokoll mit
   dem Vermerk „Vorschau" — lies es dem Kunden gegenüber noch einmal durch.
2. Auf **Abnahme speichern** tippen.
3. Zuerst unterschreibst **du** („Unterschrift Mitarbeiter"), dann reichst du
   das Gerät weiter: der **Kunde** unterschreibt („Unterschrift Kunde").

Mit **Abbrechen** kommst du aus der Vorschau zurück ins Formular, ohne dass
etwas verloren geht.

### Was danach passiert

Das PDF wird **zuerst auf dein Gerät geladen** — darauf kannst du dich vor Ort
verlassen, auch ohne Netz. Anschließend geht dieselbe Datei ans Büro.

Ohne Verbindung meldet die App:

> Keine Verbindung. Die PDF liegt auf dem Gerät, die Abnahme wird automatisch
> ans Büro übertragen, sobald wieder Netz da ist.

Oben im Reiter steht dann, wie viele Abnahmen noch auf die Übertragung warten.
Diese Zahl verschwindet von selbst, sobald du wieder Empfang hast — du musst
nichts weiter tun.

## 6. Urlaub

### Dein Urlaubskonto

Ganz oben stehen zwei Zahlen:

- **Resturlaub** — wie viele Tage dir dieses Jahr noch zustehen.
- **Beantragt** — wie viele Tage in Anträgen stecken, über die das Büro noch
  nicht entschieden hat.

### Urlaub beantragen

1. Oben rechts auf **Antrag stellen** tippen.
2. **Von** und **Bis** wählen.
3. Die App rechnet sofort aus, wie viele Urlaubstage das sind — **Werktage ohne
   Feiertage** — und was danach übrig bleibt.
4. Auf **Antrag einreichen** tippen.

Die App lässt einen Antrag nicht durch, wenn

- das Enddatum vor dem Startdatum liegt,
- im Zeitraum kein einziger Werktag liegt,
- es für diesen Zeitraum schon einen Antrag gibt,
- oder mehr Tage beantragt werden, als Resturlaub da ist.

Das Büro bekommt sofort Bescheid.

### Deinen Anträgen zusehen

Darunter stehen alle deine Anträge, der neueste oben. Jeder zeigt den Zeitraum,
die Anzahl der Tage, wann du ihn eingereicht hast und wann entschieden wurde.

| Kennzeichnung | Bedeutung |
| --- | --- |
| Ausstehend (gelb) | Das Büro hat noch nicht entschieden. |
| Genehmigt (grün) | Der Urlaub steht. Er erscheint automatisch in Planung und Wochenbericht. |
| Abgelehnt (rot) | Der Antrag wurde nicht genehmigt. |

Solange ein Antrag **ausstehend** ist, kannst du ihn mit dem **Mülleimer**
wieder zurückziehen. Einen entschiedenen Antrag ändert nur noch das Büro.

Sobald entschieden ist, bekommst du eine Benachrichtigung — wenn du sie in den
Einstellungen eingeschaltet hast.

### Krankmeldung

**Krank meldest du dich wie immer: telefonisch im Büro.** Dafür gibt es in der
App kein Formular.

Das Büro trägt die Krankmeldung in der Wochenplanung unter dem Code `050-7`
ein. In deiner Liste hier taucht sie dann als „Krankmeldung" auf — dein
Urlaubskonto rührt sie nicht an.

## 7. Auslagen

Alles, was du für die Firma auslegst, reichst du hier ein: Tanken, Parken,
Werkzeug, Material, Bewirtung. Das Büro rechnet monatlich ab und erstattet dir
den Betrag.

### Was oben steht

Eine Karte zeigt dir, wie viele Belege gerade offen sind und was das zusammen
ergibt — das ist der Betrag, der mit der nächsten Abrechnung zu dir kommt.

### Einen Beleg erfassen

Auf **Beleg erfassen** tippen und ausfüllen:

1. **Datum des Belegs** — steht auf dem Bon. Ein Datum in der Zukunft nimmt die
   App nicht an.
2. **Name / Ort** — zum Beispiel `REWE Hamburg`.
3. **Art** — antippen oder selbst eintragen. Vorgeschlagen werden:
   Werkzeug/Baumaterial, Tanken, Parken, Büro Bedarf, Bewirtung.
4. **Brutto gesamt (€)** — der Endbetrag, zum Beispiel `34,99`.
5. **Mehrwertsteuer** — ohne MwSt, 7 %, 19 % oder „7 % + 19 %".
6. **Fotos vom Beleg** — mindestens eins. Über das Foto-Feld bietet dir das
   Handy Kamera **und** Galerie an; einen schon fotografierten Bon musst du
   also nicht neu aufnehmen.
7. Auf **Beleg speichern** tippen.

Bei einem einzelnen Steuersatz rechnet die App die enthaltene Steuer selbst aus
und zeigt sie unter dem Feld an. Nur bei **7 % + 19 %** tippst du beide Beträge
vom Bon ab — aus dem Bruttobetrag allein ergibt sich die Aufteilung nicht.

> **Ab 250,00 €** reicht ein Kassenbon nicht mehr: Dann muss eine **Rechnung
> mit Firmenanschrift** eingereicht werden. Die App weist dich darauf hin,
> sobald der Betrag erreicht ist.

### Bewirtung

Wählst du die Art **Bewirtung**, klappt ein zusätzlicher Block auf — dieselben
Angaben wie früher auf dem Papierformular:

1. **Bewirtete Personen** — alle Namen, auch dein eigener.
2. **Anlass der Bewirtung** — zum Beispiel „Baubesprechung mit Kunde".
3. **Unterschrift des Mitarbeiters** — mit dem Finger direkt im Formular.

Alle drei sind Pflicht. Unterschreiben kannst **nur du selbst**; bearbeitet das
Büro deinen Beleg, bleibt deine Unterschrift unangetastet.

### Offene und abgerechnete Belege

Unter **Offene Belege** stehen alle Belege, die noch nicht abgerechnet sind.
Solange ein Beleg dort steht, kannst du ihn mit dem **Stift** ändern oder mit
dem **Mülleimer** löschen — die Fotos werden dann mitgelöscht.

Unter **Abgerechnet** stehen die Monatsabrechnungen des Büros. Tippst du eine
an, klappt sie auf und zeigt dir, wie und wann ausgezahlt wurde (Überweisung,
bar oder Vorschuss) und welche Belege dazugehören.

> **Abgerechnete Belege sind gesperrt.** Sie tragen ein Schloss und lassen sich
> nicht mehr ändern — sonst würde eine bereits gezahlte Summe im Nachhinein
> nicht mehr stimmen.

### Ohne Netz

Ein Beleg ohne Verbindung wird samt Fotos auf dem Handy gesichert und geht
automatisch raus, sobald wieder Netz da ist. Er steht so lange mit einem
Wolken-Symbol in der Liste und zählt bei der offenen Summe schon mit. Verwerfen
kannst du ihn dort ebenfalls — dann wird er nie übertragen.

## 8. Einstellungen

### Berichtshistorie

Eine Liste dessen, was du auf **diesem Gerät** gespeichert oder abgegeben hast
— Wochenberichte und Abnahmeprotokolle mit Datum und Uhrzeit.

> **Sie hängt am Gerät, nicht an deinem Konto.** Auf einem zweiten Handy ist
> sie leer, auch wenn dort dieselbe Person angemeldet ist. Als Nachweis gilt
> immer das, was im Büro angekommen ist.

### App-Info

Hier stehen Version und Baudatum der App. Der Knopf **Nach Updates suchen** lädt
die Seite neu — mehr braucht es nicht, neue Fassungen kommen von selbst.

Wenn du im Büro einen Fehler meldest, nenne bitte die Versionsnummer von hier.

### Benachrichtigungen

Es gibt zwei Ebenen, die verschieden weit reichen:

- Der **obere Schalter** meldet **dieses Gerät** an oder ab. Anders geht es
  nicht — die Anmeldung gehört zum Browser, nicht zur Person. Auf jedem Gerät
  einmal einschalten.
- Die **Schalter darunter** gelten für **dich auf allen deinen Geräten**. Wer
  die Planänderung am Handy nicht will, will sie auch am Tablet nicht.

Für dich gibt es zwei Arten:

| Art | Wann sie kommt |
| --- | --- |
| Planänderung | Wenn das Büro einen deiner Einsätze anlegt, verschiebt oder streicht. |
| Urlaub entschieden | Wenn dein Urlaubsantrag genehmigt oder abgelehnt wurde. |

Die Erlaubnis fragt das Gerät erst beim Einschalten ab — nicht beim ersten
Start der App. Hast du sie einmal abgelehnt, lässt sie sich nur noch in den
Einstellungen des Geräts wieder erlauben; die App zeigt dir das dann an.

### Abmelden

Ganz unten. Danach fragt die App wieder nach E-Mail und Passwort. Im Alltag
brauchst du das nicht — die Anmeldung hält monatelang.

## 9. Wenn etwas nicht klappt

### Meldungen, die du sehen kannst

| Meldung | Was los ist | Was du tust |
| --- | --- | --- |
| Keine Verbindung — deine Eingaben sind auf dem Gerät gesichert | Kein Netz. | Nichts. Es geht automatisch raus, sobald du wieder Empfang hast. |
| Daten konnten nicht geladen werden | Die App kommt nicht an die Datenbank. | Auf **Erneut versuchen** tippen. Bleibt es dabei: im Büro melden. |
| Konto noch nicht freigeschaltet | Die Anmeldung hat geklappt, aber im Büro fehlen deine Mitarbeiterdaten. | Im Büro melden. |
| Bitte Tätigkeitsbeschreibung eingeben | An einer Zeile fehlt, was du dort gemacht hast. | Beschreibung ergänzen. |
| Es fehlt noch: Montag, Dienstag … | Beim Abgeben fehlen an diesen Tagen Beschreibungen. | Die genannten Tage ergänzen, dann erneut abgeben. |
| Nicht genug Resturlaub | Der Antrag ist länger als dein Konto hergibt. | Zeitraum kürzen oder im Büro fragen. |
| Ab einem Betrag von 250,00 € muss eine Rechnung … | Nur ein Hinweis. | Rechnung mit Firmenanschrift besorgen. Speichern darfst du den Beleg trotzdem. |

### Erste Hilfe

1. **Seite neu laden** — in den Einstellungen über **Nach Updates suchen** oder
   ganz normal im Browser.
2. **Prüfen, ob Netz da ist.** Sehr viele Merkwürdigkeiten sind in Wahrheit ein
   fehlender Balken.
3. **Ab- und wieder anmelden** — hilft, wenn die App Daten zeigt, die nicht zu
   dir passen.
4. **Im Büro melden** und dabei die Versionsnummer aus den Einstellungen
   nennen.

> **Deine Eingaben gehen dabei nicht verloren.** Der Wochenbericht liegt auf
> dem Gerät, Abnahmen und Belege warten im Puffer.

## 10. Spickzettel

### Der Wochenrhythmus

| Wann | Was |
| --- | --- |
| Morgens | Wochenplanung öffnen: Wo bin ich heute, gibt es Hinweise? |
| Nach Feierabend | Wochenbericht: Tätigkeitsbeschreibung zum Tag ergänzen. |
| Beim Kunden | Abnahme machen, zwei Unterschriften, fertig. |
| Wenn du etwas auslegst | Bon sofort fotografieren und als Beleg erfassen. |
| Freitag / Wochenende | Bericht prüfen, unterschreiben, **abgeben**. |
| Sobald du Urlaub planst | Antrag stellen — je früher, desto besser. |

### Die wichtigsten Regeln in einem Satz

- Die **Stunden** rechnet die App; du gibst nur Start und Ende ein.
- Die **Pause** liegt zu festen Uhrzeiten und wird nur abgezogen, wenn dein
  Einsatz sie überdeckt.
- Ohne **Tätigkeitsbeschreibung** geht kein Bericht raus.
- Ein **abgegebener Bericht** ist gesperrt — ab dann hilft nur das Büro.
- Ein **gelöschter Planeintrag** kommt nie wieder.
- Ein Beleg braucht **mindestens ein Foto**.
- **Krank** meldest du telefonisch, nicht in der App.
- **Ohne Netz** geht nichts verloren.
