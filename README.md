# Werkstatt

Digitaler Katalog für Jonathans Kellerwerkstatt. Web-App (React, Vite, TypeScript, PWA, three.js) im Look „Werkbank 98“.
Die Daten liegen auf dem Raspberry Pi in TESS; die App hält eine Offline-Kopie (IndexedDB) und eine Outbox und synchronisiert, sobald sie kann.
Sie ist eine reine statische Seite (kein eigener Server), damit sie später als .exe verpackt werden kann.

Design: `docs/design-handoff.md` (verbindlich), Prototyp siehe dort. Stand und offene Punkte: `docs/stand-v1.md`.

## Entwickeln

```bash
npm install
npm run dev          # http://localhost:5173, Demo-Modus
npm test             # Vitest (Parser, Suche mit Golden-Fällen, Sync-Motor, Bulk-Import, Kontraste)
npm run lint         # ESLint
npm run typecheck    # tsc
npm run build        # nach dist/ (inkl. Service Worker und Manifest)
npm run preview      # gebaute Version auf http://localhost:4173
```

Node 20 oder neuer.

## Demo-Modus (ohne Server)

Ist `VITE_TESS_URL` nicht gesetzt und in den Einstellungen keine Server-Adresse eingetragen, läuft die App allein: Ein `MockBackend`
(`src/data/mock.ts`) spielt den TESS-Server nach `docs/werkstatt-sync-protocol.md` (rev, Konflikte, Tombstones, 410) und liefert die
Beispieldaten des Prototyps (`src/data/seed.ts`). Der „Server“ lebt im localStorage des Browsers, die Kopie in IndexedDB.
In den Einstellungen lassen sich die Zustände Synchron, Offline, Konflikt und Fehler ansehen; „Demo zurücksetzen“ löscht alles.
Fotos des Demo-Servers liegen nur im Speicher.

## Konfiguration

| Was | Wie |
| --- | --- |
| Server-Adresse | `VITE_TESS_URL` beim Bauen (z. B. `.env.production`: `VITE_TESS_URL=https://tess.example.ts.net`), oder zur Laufzeit unter Einstellungen → Server |
| Anmeldung | Passkey (Windows Hello, Handy) oder Gerät koppeln mit Einmalcode vom Pi |
| Pi-Seite | `./tessctl werkstatt-passkey-code` bzw. `./tessctl werkstatt-pair`; die Herkunft der App muss in `TESS_WERKSTATT_WEB_ORIGINS` stehen (CORS und Passkey-Relying-Party) |

Wichtig: Passkeys gelten für genau eine Herkunft. Die App muss von derselben Herkunft ausgeliefert werden, die in
`TESS_WERKSTATT_WEB_RP_ID` / `TESS_WERKSTATT_WEB_ORIGINS` steht (z. B. GitHub Pages). Ein gekoppeltes Gerät (signierte Anfragen) hat diese
Einschränkung nicht, braucht aber trotzdem die Herkunft in der CORS-Liste.

## Bedienung

| Taste | Wirkung |
| --- | --- |
| `/` | Suche fokussieren |
| `Esc` | Suche leeren, Dialog schließen, Ausschneiden abbrechen |
| `N` | Schnell hinzufügen (`Strg+Enter` legt an) |
| `F1` bis `F7` | Suche, Eingang, Unterwegs, Maschinen, Explorer, Kategorien, Einstellungen |
| `↑` `↓` | in Listen und Bäumen bewegen (im Eingang: Zeile wählen, `Enter` = Ablegen) |
| `E` / `M` | im Detail: Bearbeiten / Verschieben |
| `Strg+X`, `Strg+V` | im Explorer: Ding oder Ort ausschneiden und auf einem Ort einfügen (auch Ziehen mit der Maus) |

Schnell hinzufügen erkennt `2x Name`, `Name ~200`, `Name 5 Stück`.

## Kiosk-Fenster auf dem Windows-Laptop

Die App muss über HTTP(S) laufen (Service Worker, Passkeys). Entweder die gehostete Adresse verwenden oder `dist/` lokal ausliefern
(`npx http-server dist -p 8080`). Dann Edge oder Chrome im Kiosk-Modus starten:

```bat
"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --kiosk "https://…/werkstatt/" --edge-kiosk-type=fullscreen --user-data-dir="%LOCALAPPDATA%\werkstatt-kiosk"
```

oder mit Chrome: `chrome.exe --kiosk --app=https://…/werkstatt/ --user-data-dir=...`. Eine Verknüpfung im Autostart-Ordner (`shell:startup`) startet es mit Windows.
Beenden mit `Alt+F4`. Mit `--user-data-dir` bleibt die Offline-Kopie in einem eigenen Profil. Alternativ die Seite im Browser öffnen und „Installieren“ wählen (PWA).

## Aufbau

```
src/data/   Typen (nach Sync-Vertrag), IndexedDB-Kopie + Outbox (repo.ts), Sync-Motor, HttpBackend, MockBackend, Suche, Parser, Bulk-Import
src/three/  3D-Ansicht (orthografisch, isometrisch)
src/ui/     Bereiche, Dialoge, Pixel-Icons, Farb-Tokens
tests/      Vitest; tests/fixtures/werkstatt_search_golden.json stammt unverändert aus TESS (tests/fixtures)
```
