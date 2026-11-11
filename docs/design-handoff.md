# Werkstatt: Übergabe Design

Für den Chat, der die Oberfläche baut (React, Vite, TypeScript, PWA, three.js, später .exe). Das Design ist entschieden. Backend und Sync macht eine andere Sitzung, dort nichts ändern.

## Quelle der Wahrheit

Klickbarer Prototyp: https://claude.ai/artifact/CUQBh561ofAZYCe1ezCJ1p
Look: **Werkbank 98**, hell, eigene Hommage an frühe Fenster-Oberflächen. Kein Logo, Icon oder Schrift eines echten Produkts kopieren. Abweichungen zwischen dieser Datei und dem Prototyp: der Prototyp gewinnt, bitte melden.
(Frühere Skizze mit drei Richtungen, nur zur Info: https://claude.ai/artifact/8mCHQJ5q5eet8APZGqJkBf. B und C sind verworfen.)

## Entscheidungen von Jonathan

- Look Werkbank 98, hell.
- Schriftgröße wie im Prototyp (12,5 px Laptop) reicht.
- Kisten-IDs im 3D-Bild immer sichtbar.
- Beim Start ist die Suche offen (Reiter Suche), nicht der Eingang.
- Sprache der Oberfläche: Deutsch. Kurze Texte, Verb auf dem Knopf ("Ablegen", "Anlegen", "Zurücklegen").
- Status immer mit Symbol, Wort und Farbe, nie nur Farbe.
- Alle Schriften lokal gebündelt, kein CDN zur Laufzeit (muss offline laufen).

## Layout

- Laptop: Hauptansicht links 3D, rechts Suche und Ergebnisse oder Detail. Ziel 1366×768 und 1920×1080, Vollbild im Kiosk-Fenster. Der Prototyp zeigt ein Fenster mit 1020×610 px als Skizze; in der App füllt das Fenster den Bildschirm, die rechte Spalte wächst mit.
- Aufbau von oben: Titelleiste, Reiterleiste (mit Knopf "＋ Schnell hinzufügen" rechts), zwei Felder (3D 1,12 : Rechts 1), Statusleiste.
- Reiter: Suche F1, Eingang F2 (Zähler), Unterwegs F3 (Zähler), Maschinen F4, Explorer F5, Kategorien F6, Einstellungen F7.
- Handy: gleiche Farben und Schriften, weniger Rahmenschmuck, untere Reiterleiste (Suche, Neu, Eingang), Tippflächen mindestens 46 px, Schnell-Hinzufügen mit Kamerafläche.

## Tastatur

`/` Suche fokussieren, `Esc` leeren oder Dialog schließen, `N` Schnell hinzufügen, `Strg+Enter` im Dialog anlegen, F1 bis F7 Reiter. Jonathan mag Tastaturkürzel: bei neuen Funktionen eines vorschlagen. Die Kürzel stehen in der Statusleiste und als `kbd` in den Reitern.

## Design-Tokens

### Farben (Hell, einziges Thema)

| Token | Wert | Verwendung |
| --- | --- | --- |
| bg2 | #c3c7cb | Fensterfläche, Knopfgrund |
| pane | #ffffff | Felder, Listen, Eingaben |
| ink | #15181a | Text |
| muted | #4b5359 | Nebentext |
| line | #7d848a | Trennlinien |
| title-gradient | linear-gradient(90deg, #0d3b66, #3c7aa8) | Titelleiste, Text #ffffff |
| select | #0d3b66 auf #ffffff | gewählte Zeile, primärer Knopf, markierter Reiter-Akzent, Suchtreffer-Markierung |
| ok | #175c28 auf #d7ecd9 | Eingelagert, Synchron |
| warn | #7a4e00 auf #f4e7c4 | Verliehen, In Nutzung, Offline, Konflikt |
| err | #a01818 auf #f3d3d3 | Eingang, Sync-Fehler |
| label | #f4f1e6 auf #15181a Rahmen | Etikett mit Kisten-ID |

Alle Textpaare erreichen mindestens 4,5:1 (vor dem Bauen mit einem Prüfer bestätigen).

### Schriften (frei, als woff2 bündeln)

- UI: Public Sans, 12,5 px, Zeilenhöhe 1,35, Gewichte 400/500/700.
- Daten und IDs: IBM Plex Mono, 11 bis 14 px (Suchfeld 14 px), Gewichte 400/500/600.
- Überschriften im Detail: Public Sans 700, 21,5 px.
- Kleinschrift Beschriftungen: 10,5 bis 11 px, Großbuchstaben, Buchstabenabstand 0,06 em.
- Ziffern in Tabellen: `font-variant-numeric: tabular-nums`.

### Abstände

Fensterrand 3 px, Feldabstand 3 px, Feldrand 2 px, Zeile 6 × 8 px, Knopf 5 × 11 px (min. Höhe 26 px Laptop, 46 px Handy), Detailfläche 10 × 12 px, Abstand zwischen Blöcken 10 px. Keine abgerundeten Ecken (0 px), Ausnahme Handy-Gehäuse nur im Mockup.

### Kanten (Bevel)

- erhaben (Knöpfe, Fenster, Reiter): `inset -1px -1px 0 #2b2f32, inset 1px 1px 0 #fff, inset -2px -2px 0 #848a90, inset 2px 2px 0 #e3e6e8`
- eingesunken (Felder, Listen, Statusfelder): `inset 1px 1px 0 #2b2f32, inset -1px -1px 0 #fff, inset 2px 2px 0 #848a90, inset -2px -2px 0 #e3e6e8`
- Knopf gedrückt: wechselt von erhaben auf eingesunken.
- Fokus: 2 px Rahmen in `select` innen im Feld, bei Knöpfen gepunkteter Rahmen innen.
- Modal: Hintergrund rgba(0,0,0,.35), Fensterkante erhaben.

## Komponenten

Window (Rahmen, erhaben) · TitleBar (Gradient, 3 Fensterknöpfe) · TabBar/Tab (gedrückt = aktiv, Zähler-Badge in err) · Button (normal, primär, Chip als Umschalter) · Input/Textarea/Select (eingesunken, Mono) · Pane (eingesunken, Kopfzeile in Versalien) · List/Row (Name, Menge, Pfad, Status; gewählt = select-Farbe) · Tree/TreeNode (Einrückung 16 px, ID-Etikett, Zähler, Ablageziel mit gestricheltem Rahmen beim Ziehen) · Table (Kopf klein in Versalien) · KeyValue (eingesunken, Mono-Werte) · Badge (Symbol + Wort, 1 px Rand in Statusfarbe) · Tag (gestrichelter Rand, `#name`) · IdLabel (Etikett mit ID und Platz für QR) · PhotoPlaceholder · Dialog (TitleBar, Inhalt, Knöpfe unten, Hauptaktion rechts) · StatusBar (Syncpunkt, Server, Anzahl, Kürzel) · Notice (Konflikt/Fehler, Hinweis mit Aktionsknöpfen) · LoginBox · PhoneNav.

### Status-Badge

| Status | Symbol | Wort | Farbe |
| --- | --- | --- | --- |
| stored | ■ | Eingelagert | ok |
| lent | ↗ | Verliehen | warn |
| in use | ⚙ | In Nutzung | warn |
| inbox | ▼ | Eingang | err |

Symbole im Prototyp sind Textzeichen. Für die App eigene Pixel-SVG-Icons zeichnen (original, nicht aus einem echten Produkt).

## Zustände

Jeder Bildschirm braucht diese Zustände. Im Prototyp gezeigt sind die fett markierten.

- **Normal:** alle.
- **Leer:** Suche ohne Treffer ("Nichts gefunden für …, vielleicht ist es noch im Eingang"), **leerer Eingang** ("Der Eingang ist leer. Alles hat einen Platz."), **leere Kiste** ("Diese Kiste ist leer."), Unterwegs leer, Explorer leere Kiste ("Zieh etwas auf diese Kiste").
- **Lädt:** nicht gezeichnet. Vorschlag: Zeilen als graue Balken, Text "Lade aus der Offline-Kopie …". Der Offline-Stand ist sofort da, Laden ist selten.
- **Offline:** **Statusleiste "Offline · N Änderungen warten"**, warn-Farbe. App bleibt voll nutzbar.
- **Sync-Konflikt:** **Notice in den Einstellungen und Statusleiste "Konflikt bei …"**, zeigt beide Werte, Knöpfe "Laptop behalten" und "Handy übernehmen".
- **Fehler:** **"Sync-Fehler · TESS nicht erreichbar", Notice mit "Erneut versuchen"**, Hinweis dass die Daten lokal sicher sind.
- **Login:** **Passkey-Bildschirm**, ein Knopf, Hinweis auf Fingerabdruck, Gesicht oder Handy.

## 3D-Ansicht

- Einfache Quader aus Messungen, Kamera isometrisch (Prototyp: festes Schrägbild). Später in three.js mit Orthografik-Kamera und gleichem Winkel, damit der Look gleich bleibt.
- Kisten: Deckel #e3c48b, linke Seite #b89256, rechte Seite #8f6e3a, Kante dunkel, 0,7 px.
- Möbel (Regalrahmen, Platten): Deckel #9aa3ab, links #737c84, rechts #555d64.
- Boden: #3b7e86 auf Szenenfarbe #2e6b72, helles Raster alle 35 Einheiten (rgba(255,255,255,.07)).
- Treffer der Suche: Deckel #ffe23d, links #d8b800, rechts #a58c00. Alle anderen Kisten auf 42 % Deckkraft.
- Ausgewählt: weißer Rand 2 px.
- Hover: weißer Rand 1,4 px und Beschriftung "ID · Name" in select-Farbe, Mono 11 px, folgt der Maus.
- ID auf dem Deckel jeder Kiste immer sichtbar, Mono 9 px. Auf hellem Deckel dunkel, auf Treffern dunkel.
- Kamerafahrt auf die gewählte Kiste: Zoom 1,7, 0,7 s, `cubic-bezier(.3,.7,.2,1)`. Bei "Bewegung reduzieren" ohne Fahrt.
- Hinweiszeile unten links: Name · ID der gewählten Kiste, oder "N Kisten leuchten", oder "Keller · alle Orte".
- Klick auf eine Kiste öffnet ihren Inhalt rechts (Platzdetail mit Etikett, Inhalt, Aktionen).
- Das 3D-Bild erzeugt Claude aus Messungen. Die App rendert nur und lässt Auswahl zu. Das Szenenformat legt die Backend-Sitzung fest, dort abstimmen.

## Verhalten

- Suche findet Wortteile ("lipo" in "LiPo-Akku"), toleriert einen Tippfehler ab 4 Buchstaben ("lypo" findet LiPo), kennt Synonyme (akku → lipo, kleber → heißkleber, fräser → schaftfräser, mikrocontroller → arduino/esp32), normalisiert ß und Umlaute, sucht in Name, Kategorie, Tags, Kistenname. Mehrere Wörter müssen alle passen. Das ist nur die Anzeige-Logik im Prototyp. Die echte Suche kommt vom Backend, die Oberfläche muss sie nur aufnehmen und Treffer an das 3D-Bild melden.
- Ergebniszeile: Name, Menge, Pfad `R2 › K2 › Fach 1`, Status-Badge.
- Detail minimal (Heißkleber: Name, Ort, Menge, Tags, "Details hinzufügen") und ausführlich (LiPo: Spezifikationen, Notiz, Foto, "Verbrauch buchen").
- Detail-Pfad: Klick auf die Kiste fährt die Kamera dorthin.
- Schnell hinzufügen: grobe Liste, getrennt durch Komma oder Zeilenumbruch; erkennt `2x Name`, `Name ~200`, `Name 5 Stück`; ohne Menge "1". Vorschau live, Ziel ist eine Kiste (Standard: aktuell gewählte, sonst zuletzt gewählte). Ohne Ort landet es im Eingang (Handy).
- Eingang: Zeile mit Vorschlag für den Ort (kommt vom Backend/Claude), "Ablegen" bucht um und fährt zur Kiste.
- Explorer: Ziehen eines Dings auf einen Ort im Baum verschiebt es. Auch per Tastatur ermöglichen (Auswahl, Ausschneiden/Einfügen), im Prototyp nicht gezeigt.
- Unterwegs: Tabelle mit Ding, Wo/bei wem, Seit, "Zurücklegen".

## Noch zu zeichnen

Detailformular, Bulk-Import mit Vorschau, Lade- und Leerzustände je Bereich, Handy-Ansichten für Maschinen, Explorer, Kategorien, Pixel-Icons, Druckvorlage für das Kisten-Etikett.

## Beispielinhalt

Der Prototyp enthält echte Beispieldaten (LiPo 3S/4S, M3-Schrauben, Heißkleber, Arduino Nano, ESP32, PLA/PETG, Schaftfräser, Multimeter bei Paul). Die Daten im Prototyp sind Platzhalter. Die App liest alles aus TESS.

## Grenzen

Kein Datenbankentwurf, kein Server- oder Sync-Code in diesem Strang. Datenform und Szenenformat werden mit der Backend-Sitzung abgestimmt.
