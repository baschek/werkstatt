# Werkstatt v1: Stand

## Gebaut
- Hauptansicht: 3D links (three.js, orthografisch, gleicher Winkel wie der Prototyp), rechts Suche, Ergebnisse, Detail (minimal und ausführlich), Platzdetail mit Etikett.
- Bereiche F1 bis F7: Suche, Eingang („Ablegen“), Unterwegs („Zurücklegen“), Maschinen (Liste und Seite), Explorer (Ziehen und Strg+X/Strg+V), Kategorien und Tags (mit Spezifikationsfeldern), Einstellungen.
- Schnell hinzufügen mit Live-Vorschau, Detailformular (Anlegen, Bearbeiten, Spezifikationen nach Kategorie, Fotos), Bulk-Import (CSV oder eingefügte Tabelle, Vorschau).
- Alle Zustände: leer, lädt (nur Gerüst, Offline-Kopie ist sofort da), offline, Konflikt, Fehler, Login.
- Handy: untere Leiste (Suche, Neu, Eingang), 46-px-Tippflächen, Foto per Kamera (`capture`), Fotos werden in der Outbox vorgehalten und per `PUT /photos/<id>` hochgeladen.
- Daten: IndexedDB-Kopie, Outbox mit Zusammenfassen ungesendeter Änderungen, Sync-Motor (Push, Fotos, Pull, Snapshot bei 410), HttpBackend (Gerät mit ECDSA-Signatur, Passkey-Sitzung), MockBackend.
- Lokale Suche als Port von `werkstatt_search.py`, besteht die Golden-Fälle.
- PWA (Manifest, Service Worker), Schriften lokal gebündelt (Public Sans, IBM Plex Mono).

## Offen
- Detailformular und Bulk-Import: Gestaltung ist von mir nach dem Look abgeleitet, nicht vom Prototyp vorgegeben.
- Geometrie von Orten (Position, Größe) kann die App nicht bearbeiten; sie kommt aus dem Backend (Claude, `layout`).
- Kein Verlauf („Wo war das vorher?“, `GET /history`), keine Wiederherstellung unterlegener Konfliktversionen aus dem Server-Verlauf (nur beide Werte im Hinweis).
- QR-Code im Etikett fehlt (Platz ist da), Druckvorlage ist ein einfacher Seitendruck.
- Fotos: Originale werden bei Bedarf geholt und zwischengespeichert; keine Aufräumregel für den Cache.
- Passkey-Anmeldung und Gerätekopplung sind nur gegen die Beschreibung im Sync-Vertrag gebaut, nicht gegen einen laufenden TESS getestet.
- .exe-Verpackung, Handy-Installation (PWA) nicht ausprobiert.
- Nicht auf echter Hardware geprüft (1366×768 nur im Headless-Browser).

## Mit dem Backend abzustimmen
- `geometry.position` ist hier die Mitte der Grundfläche, `y` oben, `size = [Breite, Höhe, Tiefe]`; Raumecke bei (0, 0, 0), `layout.room.size = [x, Höhe, z]`. Der Vertrag lässt das offen.
- Zusätzliche Felder, die die App schreibt und der Server durchreicht: `item.quantity_approx` (bool, „~200“), `item.suggested_place_id` (Ortsvorschlag im Eingang; wer ihn setzt, ist offen: Claude oder App), `category.spec_fields[].required` (Pflichtfeld).
- Eingang: ein Ding ohne Ort bekommt vom Client `status: "inbox"`, „Ablegen“ setzt `status: "stored"`. Der Server leitet den Status ohnehin aus dem Ort ab.
- „Verbraucht/In Nutzung“ behält `place_id` (wie im Vertrag), `machine_id` verknüpft die Maschine.
- Konfliktanzeige: der Server entscheidet nach Zeit, die App zeigt beide Werte und kann die unterlegene Version erneut senden (neuer Zeitstempel).
- Suche in der App: nur lokal, keine Anfrage an einen Such-Endpunkt (gibt es im Vertrag nicht).
- Ort-Codes (`human_id`) werden zusätzlich lokal auf Eindeutigkeit geprüft; der Server lehnt Doppelte mit `human_id_taken` ab.
- Abmelden löscht nur die Sitzung (`POST /webauthn/logout`), nicht die Offline-Kopie.
