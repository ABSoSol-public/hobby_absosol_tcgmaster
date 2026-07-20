# Roadmap

## v1 — Yu-Gi-Oh! (aktuell in Umsetzung)

- [x] Multi-TCG-Datenbankschema
- [x] REST-API (Karten, Sets, Prints, Sammlung, Statistiken)
- [x] YGOPRODeck-Importer (Karten, Sets, Rarities, Bilder-URLs, Preise)
- [x] Frontend: Karten-Browser, Kartendetail, Sets, Sammlung, Dashboard
- [x] Docker-Deployment für Synology
- [x] Live-Gang: Container laufen produktiv auf einer Synology (`docker compose up -d --build`, Health-Check + Login end-to-end verifiziert). Bekannte Synology-Stolpersteine (setuid-`rsync` blockiert den `--server`-Modus, `sudo`/`docker-compose`-Eigenheit älterer DSM-Docker-Pakete) sind in [docs/DEPLOYMENT-SYNOLOGY.md](DEPLOYMENT-SYNOLOGY.md) dokumentiert.

## v1.x — Komfort

- [x] Delta-Import (Versions-Check + Content-Hash je Karte/Print, `npm run import:delta`, Cron-fähig über `cron-delta-import.sh`)
- [x] Deutschsprachige Kartennamen/-texte (YGOPRODeck `language=de`-Import, befüllt `name_de`/`card_text_de`; Frontend zeigt sie automatisch bevorzugt an. Nicht jede Karte hat eine deutsche TCG-Ausgabe — dann bleibt das Feld `null` und die englische Version wird angezeigt.)
- [x] Sprachumschaltung DE/EN im Frontend (UI-Texte + Kartendaten, `frontend/src/i18n.tsx`)
- [x] Entfernen aus der Sammlung direkt an Karte/Set (−-Button + Dialog)
- [x] Preis-Historie: Importer schreiben bei Preisänderung `price_history`-Snapshots; der tägliche Delta-Cron erzeugt so die Kurve. Abfrage: `GET /prints/:id/prices`
- [x] Set-Vervollständigungsansicht (Checkbox „Nur fehlende Karten" auf der Set-Detailseite)
- [x] CSV-Export/-Import der Sammlung (Buttons auf der Sammlungsseite; Import ist idempotent, s. `docs/API.md`)
- [x] Deck-Builder (cardcluster-artig: Kartensuche + Zonen Main/Extra/Side, Regeln je Spiel in `frontend/src/deckRules.ts`, Besitz-Abdeckung, Graustufen-Toggle für nicht besessene Karten, YDK-Import/-Export inkl. Alias-Passcode-Auflösung)
- [x] Preisverlauf-Diagramm im Frontend (SVG-Chart pro Print, ein-/ausklappbar über „Verlauf"-Button in der Print-Tabelle der Kartendetailseite, `frontend/src/components/PriceHistoryChart.tsx`)
- [x] Authentifizierung: Login-Pflicht für die gesamte App (JWT im httpOnly-Cookie), Nutzer in eigener `users`-Tabelle (bcrypt-Hash), Accounts per CLI (`npm run user:create`), keine öffentliche Registrierung. `backend/src/routes/auth.ts`, `frontend/src/auth.tsx`.
- [x] Lokale Bild-Spiegelung: Karten-/Set-Bilder werden auf Wunsch (Dashboard-Button oder CLI `npm run images:download`) nach `IMAGES_DIR` heruntergeladen und per `/images/<pfad>` ausgeliefert statt extern verlinkt — wiederaufnehmbar, Fortschritt/Status über `image_jobs` (`GET /images/latest`). `backend/src/services/imageDownload.ts`, `backend/src/routes/images.ts`, `frontend/src/components/CardImage.tsx`.
- [x] Deck-Legalitätscheck gegen die Banlist (Yu-Gi-Oh!, TCG): YGOPRODeck-Importer schreibt `banlist_info.ban_tcg` (`Forbidden`/`Limited`/`Semi-Limited`) in `game_data.banTcg`, zieht bei Statusänderung automatisch über den bestehenden Delta-Import nach. Der Deck-Builder prüft das Kopienlimit je Karte dagegen (`frontend/src/deckRules.ts` → `legalCopiesFor()`) und zeigt Verstöße als Banner. Andere Spiele: keine Banlist gepflegt, unverändertes festes Kopienlimit.
- [x] Deck-Export als PDF: „Als PDF exportieren"-Button im Deck-Builder nutzt den Browser-Druckdialog auf eine eigens ausgeblendete Deckliste (`@media print` in `frontend/src/styles.css`) — kein zusätzlicher Dependency.
- [x] Responsives Layout fürs Handy: Topbar klappt unter ~780px hinter ein Hamburger-Menü (`App.tsx`, `.topbar-collapse`), Formulare (`.form-grid`) stapeln unter ~480px einspaltig, Tabellen werden auf schmalen Screens kompakter.
- [x] Installierbar als Home-Bildschirm-App: Web-App-Manifest + Hexagon-Icons (192/512/Apple-Touch) unter `frontend/public/`, in `index.html` verlinkt inkl. iOS-Metatags (`apple-mobile-web-app-*`). Bewusst ohne Service Worker/Offline-Cache — die App braucht ohnehin durchgehend die API.
- [x] Ablaufskripte für Betrieb: `create-user.sh` (Login-Nutzer anlegen/Passwort zurücksetzen, Wrapper um `npm run user:create`) und `backup-db.sh` (DB-Sicherung per `mariadb-dump`/`mysqldump` nach `backups/*.sql.gz`, automatisches Aufräumen alter Backups, Cron-fähig analog `cron-delta-import.sh`). Details in `docs/DEPLOYMENT-SYNOLOGY.md`.
- [x] Eigene Preis-Snapshots: Formular unter dem Preisverlauf-Chart (`PriceHistoryChart.tsx`) zum Erfassen eigener Preisbeobachtungen (`POST /prints/:id/prices`, `source: "manual"`) inkl. Löschen einzelner eigener Einträge; `card_prints.market_price` wird danach immer auf den zeitlich jüngsten Preis-Historie-Eintrag (egal welcher Quelle) synchronisiert.
- [x] Foto-Scan beim Erfassen: „📷 Scannen"-Button auf der Sammlungsseite fotografiert die Karte (Handy-Kamera per Datei-Input **oder** Webcam am Rechner per `getUserMedia`, `frontend/src/components/ScanCardModal.tsx`), erkennt Set-Code/Sammelnummer clientseitig per OCR (`tesseract.js`) und matcht sie gegen `card_prints.collector_number` (`GET /games/:code/scan`, s. `docs/API.md`). Bei eindeutigem Treffer direkt weiter zu „Zur Sammlung hinzufügen", bei mehreren Treffern Auswahlliste. Reines Text-Matching (kein Bild-Ähnlichkeitsindex) — funktioniert am besten bei Spielen mit gedrucktem Set-Code (Yu-Gi-Oh!, Magic); bei reiner Nummer (Pokémon, Lorcana, Riftbound) ggf. mehrdeutig. **Achtung Synology-Deployment:** `getUserMedia` (Webcam-Option) funktioniert nur in sicheren Kontexten (HTTPS oder `localhost`) — läuft die App wie aktuell dokumentiert über einfaches HTTP, bleibt nur die Datei-Input-Variante (Handy-Kamera-App) nutzbar, der Webcam-Button blendet sich dann automatisch aus. Für Webcam-Nutzung am Rechner bräuchte es HTTPS vor dem nginx (z. B. Reverse Proxy mit Zertifikat).
  - **Nachgezogen**: Bildausschnitt vor der OCR markierbar — nach der Aufnahme zieht man ein Rechteck eng um Set-Code/Sammelnummer, nur dieser (hochskalierte) Ausschnitt geht in die Texterkennung; deutlich bessere Trefferquote als OCR über das ganze Kartenfoto. Voreingestellte Auswahl im unteren Kartenrand, frei verschiebbar/neu aufziehbar (Pointer-Events, klappt mit Maus und Touch), „Ausschnitt zurücksetzen". Schlägt die Erkennung fehl, bleibt Foto+Ausschnitt erhalten statt komplett neu beginnen zu müssen („Ausschnitt anpassen").
  - **Nachgezogen**: manuelle Eingabe als Fallback — Set-Code/Nummer lässt sich auch direkt eintippen (nutzt denselben `GET /games/:code/scan`-Abgleich, kein OCR nötig), erreichbar in jeder Scan-Phase über „Set-Code/Nummer manuell eingeben".
  - **Nachgezogen**: Hinweistext vor der Aufnahme präzisiert, worauf es ankommt (scharf, gut ausgeleuchtet, ohne Spiegelungen, ganze Ecke im Bild).
- [x] Glossar-Seite (`/glossary`, `frontend/src/pages/GlossaryPage.tsx`): Community-Jargon/Schlüsselwörter je Spiel (statische Daten in `frontend/src/glossaryData.ts`, DE/EN), umschaltbar zwischen allen 5 Spielen, mit Suchfeld.

## v2 — Weitere Spiele

Prinzip: pro Spiel ein Importer-Modul + Filter-Konfiguration, **keine Schemaänderung** nötig.
Frontend hat einen Spielumschalter in der Topbar; Filter kommen generisch aus `backend/src/services/gameConfig.ts`.
Nach dem ersten erfolgreichen Import wird ein Spiel automatisch `active`.

| Spiel | Datenquelle | Status |
|---|---|---|
| Pokémon TCG | pokemontcg.io v2 (optionaler API-Key `POKEMON_TCG_API_KEY`, kostenlos) | ✅ implementiert (Filter: Typ, Element, Seltenheit; Cardmarket-Preise EUR) |
| Magic: The Gathering | Scryfall Bulk Data (`default_cards`, streamend geparst) | ✅ implementiert (Filter: Typ, Farbe; EUR-Preise; nur Papier-Prints; keine DE-Texte — dafür wäre die 2,5-GB-`all_cards`-Datei nötig) |
| Lorcana | lorcanajson.org (DE + EN) | ✅ implementiert (Filter: Typ, Tinte, Kosten; keine Preisquelle) |
| Riftbound | riftcodex.com (offene REST-API, kein Key nötig) | ✅ implementiert (Filter: Typ, Domain, Seltenheit; DE-Texte über eigene Übersetzungsdatei `riftbound.de.json`, da die API nur Englisch liefert; keine Preisquelle) |

Vorgehen für ein weiteres Spiel:
1. Importer unter `backend/src/services/importers/<spiel>.ts` implementieren (Interface `GameImporter`) und in `index.ts` registrieren.
2. Filter-Definition in `backend/src/services/gameConfig.ts` ergänzen (`game_data`-Felder → Filter-UI kommt automatisch).
3. Spielcode in `IMPORTABLE` in `frontend/src/pages/Dashboard.tsx` eintragen.
4. Import über das Dashboard laufen lassen — Aktivierung, Sammlung, Sets und Statistiken funktionieren automatisch.

## Ideen / Backlog (noch nicht geplant)

Unsortierte Ideen für spätere Versionen — kein Anspruch auf Vollständigkeit oder Reihenfolge.

### Sammlung & Nutzung
- [ ] Wunschliste getrennt von der Sammlung (Karten, die man sucht/kaufen will, mit eigener Ansicht statt Notiz nebenher)
- [ ] Tauschbörse: Karten als „abzugeben" markieren, ggf. mit einer teilbaren Read-only-Ansicht für andere
- [ ] Mehrbenutzer-Sammlungen: aktuell haben Logins (`users`-Tabelle) getrennte Accounts, aber eine gemeinsame Sammlung — optional pro Nutzer trennbar machen, falls das gewünscht ist
- [ ] Sammlungs-Statistiken erweitern: Verteilung nach Rarity/Set/Farbe als Diagramm auf dem Dashboard

### Deck-Builder
- [ ] Mana-/Kosten-Kurve und Farb-/Element-Verteilung als kleines Chart im Deck-Builder

### Daten & Preise
- [ ] Preis-Alarm: Benachrichtigung (z. B. E-Mail), wenn eine besessene Karte einen Schwellwert über-/unterschreitet
- [ ] Preisquelle für Lorcana/Riftbound ergänzen, sobald eine verlässliche EUR-Quelle verfügbar ist
- [ ] Cron-Job für Bild-Downloads analog zum bestehenden Delta-Import-Cron (`cron-delta-import.sh`), damit neue Karten automatisch Bilder bekommen

### Betrieb
- [x] HTTPS vor dem nginx: DSM-eigener Reverse Proxy + Let's-Encrypt-Zertifikat (Systemsteuerung → Sicherheit/Anmeldeportal), `COOKIE_SECURE=true` gesetzt. Details inkl. zweier Synology-Fallstricke (Port-443-Konflikt mit QuickConnect, `localhost` als Proxy-Ziel) in [docs/DEPLOYMENT-SYNOLOGY.md](DEPLOYMENT-SYNOLOGY.md) Abschnitt 10. Schaltet nebenbei die Webcam-Option des Foto-Scans frei (`getUserMedia`, siehe v1.x-Eintrag oben).
- [x] Delta-Import-Cron (`cron-delta-import.sh`) als täglicher Zeitplan im DSM-Aufgabenplaner eingerichtet (Nutzer `root`).
