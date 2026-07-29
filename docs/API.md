# REST-API

*[English version](API.en.md)*

Basis-URL: `/api/v1` (im Docker-Setup über nginx erreichbar unter `http://<synology-ip>:8080/api/v1`).

## Konventionen

- Antworten: Listen `{ "data": [...], "pagination": {...} }`, Einzelobjekte `{ "data": {...} }`, Fehler `{ "error": { "message", "statusCode" } }`.
- Pagination-Parameter: `page` (Default 1), `limit` (Default variiert, Max 100).
- Alle Zeitstempel sind UTC (`YYYY-MM-DD` bzw. ISO-8601).
- Der Katalog (Karten/Sets/Prints) ist aus Frontend-Sicht **read-only** — er wird nur über den Import-Endpunkt aktualisiert. Schreibbar sind `collection_items` sowie eigene Preis-Snapshots (`price_history` mit `source: "manual"`, siehe unten) — Letztere pflegen zusätzlich `card_prints.market_price` nach.
- **Bilder**: `image_url`/`image_small_url` in allen Antworten sind **lokale** URLs der Form `/images/<spielcode>/cards/<id>.jpg` (statische Route des Backends, gespiegelt per `npm run images:download`). Die externen Quell-URLs verlassen das Backend nie — Hotlinking ist bei den Quellen (u. a. YGOPRODeck) nicht erlaubt. Ist noch keine lokale Kopie vorhanden, ist das Feld `null` und das Frontend zeigt einen Platzhalter.

## Health

`GET /api/health` → `{ "status": "ok" }` (prüft auch die DB-Verbindung). Einziger Endpoint neben `/api/v1/auth/*`, der ohne Login erreichbar ist.

## Authentifizierung

Alle `/api/v1/*`-Routen (außer `auth/login`) verlangen eine gültige Session. Die Session ist ein JWT im **httpOnly-Cookie** `token` (30 Tage gültig) — das Frontend muss dafür nichts tun, der Browser sendet es automatisch mit, solange Frontend und API same-origin sind (Vite-Proxy in der Entwicklung, nginx im Docker-Setup). Keine öffentliche Registrierung: Accounts legt ein Admin per CLI an (`npm run user:create -- <username> <passwort> [admin|viewer]` im `backend`-Verzeichnis, siehe [docs/DEPLOYMENT-SYNOLOGY.md](DEPLOYMENT-SYNOLOGY.md)).

**Rollen** (seit 2026-07-27): `admin` (Standard, voller Zugriff) oder `viewer` (nur Lesezugriff). Die Rolle steckt im JWT und wird bei **jedem** nicht-lesenden Request (alles außer `GET`/`HEAD`/`OPTIONS`) geprüft (`blockWriteForViewer`-Hook in `backend/src/app.ts`) — ein `viewer`-Account bekommt dort durchgehend `403`, unabhängig von der Route. Ändert sich die Rolle eines Nutzers, greift das erst nach erneutem Login (die Rolle ist im bereits ausgestellten JWT eingefroren).

`POST /api/v1/auth/login` — `{ "username", "password" }` → setzt das Session-Cookie, Antwort `{ "data": { "id", "username", "role" } }`. `401` bei falschen Zugangsdaten.

`POST /api/v1/auth/logout` — löscht das Session-Cookie (`204`).

`GET /api/v1/auth/me` — liefert den aktuell angemeldeten User (`{ "data": { "id", "username", "role" } }`) oder `401`, falls keine/eine abgelaufene Session vorliegt. Prüft das Frontend beim App-Start.

`/images/...` (statische Kartenbilder, **nicht** unter `/api/v1`) bleibt bewusst ohne Login erreichbar — reine Kartengrafiken ohne Sammlungs-/Personenbezug.

## Spiele

`GET /api/v1/games`
Liste aller Spiele inkl. Katalog-/Sammlungszähler.

```json
{ "data": [{ "id": 1, "code": "yugioh", "name": "Yu-Gi-Oh!", "active": true, "cardCount": 13500, "collectedCount": 87 }] }
```

## Karten

`GET /api/v1/games/:code/cards` — Katalog eines Spiels.
Query: `search`, `set` (Set-Code), `page`, `limit` (≤100), `sort` (`name`|`newest`) plus **spielspezifische Filter** laut `backend/src/services/gameConfig.ts` — z. B. `type`, `attribute`, `race` (Yu-Gi-Oh!), `element`, `rarity` (Pokémon), `color` (Magic), `ink`, `cost` (Lorcana).

```
GET /api/v1/games/yugioh/cards?search=dragon&attribute=LIGHT&page=1&limit=60
GET /api/v1/games/magic/cards?color=U&type=Instant
```

`GET /api/v1/games/:code/filters` — verfügbare Filter samt Werten für die Filter-UI, generisch aus der Spiel-Konfiguration: `{ "data": { "filters": [{ "key": "attribute", "values": ["DARK", "LIGHT", …] }] } }`.

`GET /api/v1/cards/:id` — Einzelkarte inkl. aller Prints (`prints[]`) und darin enthaltener Sammlungseinträge (`collectionItems[]`).

`GET /api/v1/prints/:id/prices` — Preis-Historie eines Prints (`[{ id, price, currency, source, recorded_at }]`). Wird bei jedem Import befüllt, wenn sich der Marktpreis geändert hat — der tägliche Delta-Cron erzeugt so automatisch eine Preiskurve.

`POST /api/v1/prints/:id/prices` — eigenen Preis-Snapshot erfassen, `{ "price", "currency"? (Default EUR), "recorded_at"? (Default jetzt) }` → landet mit `source: "manual"` in derselben Historie. `card_prints.market_price` wird danach auf den zeitlich jüngsten Preis-Historie-Eintrag (egal welcher Quelle) synchronisiert.

`DELETE /api/v1/prints/:id/prices/:priceId` — eigenen Preis-Snapshot wieder löschen (nur `source: "manual"`-Einträge, importierte Historie bleibt darüber unantastbar; `market_price` wird danach neu synchronisiert). `404`, falls kein solcher eigener Eintrag existiert.

### Foto-Scan

`GET /api/v1/games/:code/scan?text=…` — matcht OCR-erkannten Text gegen `card_prints.collector_number` des Spiels und liefert passende Prints (gleiche Form wie `cards[].prints[]`, inkl. `card_name`/`set_name`/`set_code`). Erkennt zwei Muster je Zeile: einen vollständigen Set-Code+Nummer-String wie `LOB-EN119` (Yu-Gi-Oh!/Magic-Stil) sowie eine Nummer vor einem Schrägstrich wie `119/198` (Pokémon-/Lorcana-Stil). Reines Text-Matching, **keine Bilderkennung** des Kartenmotivs — die eigentliche OCR läuft clientseitig im Browser (`tesseract.js`, siehe `frontend/src/components/ScanCardModal.tsx`), dieser Endpunkt bekommt nur den bereits erkannten Text. Ohne Treffer: `{ "data": [] }` (kein 404 — kein Treffer ist ein normaler Fall).

## Sets

`GET /api/v1/games/:code/sets` — alle Sets eines Spiels inkl. Fortschritt (`printCount`, `ownedPrintCount`). Query: `search`.

`GET /api/v1/sets/:id` — Einzelnes Set mit allen Prints (`prints[]`), inkl. Kartenname, Bild und `ownedQuantity`.

## Sammlung

`GET /api/v1/collection` — Query: `game` (Spielcode), `search`, `page`, `limit`.

`GET /api/v1/collection/stats` — Query optional: `game`. Liefert `totalCopies`, `distinctCards`, `distinctPrints`, `purchaseValue`, `marketValue`. `marketValue` ist immer in EUR — Prints mit `currency: 'USD'` (aktuell nur Yu-Gi-Oh!) werden vor der Summierung per aktuellem Wechselkurs umgerechnet (`services/exchangeRate.ts`), sonst würde die Summe USD- und EUR-Beträge einfach addieren. `sort=value` bei `GET /collection` rechnet ebenso um.

`POST /api/v1/collection` — Print zur Sammlung hinzufügen (erhöht die Menge, falls derselbe Print in gleichem Zustand/Sprache/Auflage bereits existiert).

```json
{
  "print_id": 1234,
  "quantity": 1,
  "condition": "NM",
  "language": "DE",
  "is_first_edition": false,
  "storage_location": "Ordner 2, Seite 5",
  "purchase_price": 3.5,
  "acquired_at": "2026-07-01",
  "notes": null
}
```

`condition` ∈ `MT, NM, EX, GD, LP, PL, PO` (Cardmarket-Skala).

`PATCH /api/v1/collection/:id` — Teilupdate beliebiger Felder (außer `print_id`).

`DELETE /api/v1/collection/:id` — Eintrag entfernen (204 No Content).

### CSV-Export/-Import

`GET /api/v1/collection/export` — komplette Sammlung als CSV-Download (UTF-8 mit BOM, Excel-kompatibel). Query optional: `game`.
Spalten: `game, set_code, collector_number, rarity, card_name, external_id, quantity, condition, language, is_first_edition, storage_location, purchase_price, acquired_at, notes`.

`POST /api/v1/collection/import` — CSV im Request-Body (`Content-Type: text/csv`). Prints werden über `set_code` + `collector_number`/`external_id` (+ `rarity`) aufgelöst. **Idempotent**: existiert derselbe Print in gleichem Zustand/Sprache/Auflage bereits, wird die Menge auf den CSV-Wert *gesetzt* (nicht addiert) — ein Re-Import der eigenen Export-Datei verdoppelt nichts. Antwort: `{ "data": { "created", "updated", "failed", "errors": [] } }`.

## Decks

`GET /api/v1/decks?game=yugioh` — Deck-Liste inkl. `zoneCounts` (`main`/`extra`/`side`) und `cardCount`.

`POST /api/v1/decks` — `{ "game": "yugioh", "name": "…" }` → neues Deck.

`GET /api/v1/decks/:id` — Deck inkl. `cards[]` (Karteninfos, `zone`, `quantity`, `ownedQuantity` = Besitz über alle Prints).

`PATCH /api/v1/decks/:id` — `name`/`description` ändern. `DELETE /api/v1/decks/:id` — löschen.

`PUT /api/v1/decks/:id/cards` — `{ "card_id", "zone", "quantity" }` **setzt** die Menge (0 = entfernen); idempotent.

Deck-Regeln (Zonengrößen, Kopienlimit, Extra-Deck-Zuordnung, Banlist-Legalität) prüft das Frontend (`frontend/src/deckRules.ts`) — die API speichert bewusst regelfrei, damit unfertige Decks speicherbar sind.

Bei Yu-Gi-Oh! liefert `cards[].game_data.banTcg` den TCG-Banlist-Status einer Karte (`"Forbidden"`/`"Limited"`/`"Semi-Limited"`, sonst nicht gesetzt) — kommt direkt aus `banlist_info.ban_tcg` der YGOPRODeck-API und wird beim Delta-Import automatisch aktualisiert, sobald sich der Status ändert. Das Frontend vergleicht damit die vorhandene Kopienzahl je Karte (`legalCopiesFor()` in `deckRules.ts`) und markiert Verstöße im Deck-Builder.

### YDK-Import/-Export (YGOPro-/cardcluster-Format)

`GET /api/v1/decks/:id/export.ydk` — Download im YDK-Format (`#main`/`#extra`/`!side`, eine Zeile je Kopie, `external_id` = Passcode).

`POST /api/v1/decks/import?game=yugioh&name=…` — YDK-Rohtext im Body (`Content-Type: text/plain`) → neues Deck. Antwort enthält `imported` und `unmatched[]`. Bei Yu-Gi-Oh! werden Alias-Passcodes alternativer Artworks (z. B. `18144506` → `18144507`) automatisch über die YGOPRODeck-API aufgelöst.

Der „Als PDF exportieren"-Button im Deck-Builder ist reines Frontend (kein eigener Endpunkt): Er öffnet den Browser-Druckdialog auf eine ausgeblendete Deckliste (`@media print` in `frontend/src/styles.css`), aus der sich per „Als PDF speichern" ein PDF erzeugen lässt.

## Import

`POST /api/v1/imports/:code` — startet einen Katalog-Import asynchron (z. B. `POST /api/v1/imports/yugioh`). Antwort `202` mit `jobId`. Schlägt mit `409` fehl, wenn bereits ein Import für dieses Spiel läuft.

Standardmäßig ist das ein **Delta-Import**: Zuerst wird per Versions-Check der Quelle geprüft, ob sich seit dem letzten Lauf überhaupt etwas geändert hat (falls nicht, endet der Job sofort mit `skipped: true` in den Stats). Andernfalls wird jede Karte/jeder Print per Inhalts-Hash verglichen und nur geänderte oder neue Datensätze werden geschrieben.

Query-Parameter `force=true` (z. B. `POST /api/v1/imports/yugioh?force=true`) überspringt den Versions-Check und vergleicht jeden Datensatz neu — sinnvoll, wenn der Verdacht besteht, dass Daten inkonsistent sind.

`GET /api/v1/imports/latest?game=yugioh` — Status des letzten Import-Jobs (`running`, `completed`, `failed`) inkl. Fortschrittsnachricht und `stats` (`{ sets, cards, prints, cardsChanged, printsChanged, skipped }`).

Verfügbare Importer und ihre Quellen:

| Spiel | Quelle | Besonderheiten |
|---|---|---|
| `yugioh` | YGOPRODeck API | DE-Namen/-Texte, TCGPlayer-Preise (**USD**, `card_sets[].set_price`, je Print/Seltenheit) — bewusst nicht auf Cardmarket-EUR umgestellt, da diese Quelle Cardmarket-Preise nur einmal je Karte liefert (keine Rarität-Granularität), was den Sammlungswert verfälschen würde; `card_prints.currency` markiert das korrekt als `USD` statt es fälschlich als „€" zu zeigen |
| `pokemon` | pokemontcg.io v2 | optionaler `POKEMON_TCG_API_KEY` in `.env` (ohne Key stark ratenlimitiert), Cardmarket-Preise (EUR) |
| `magic` | Scryfall Bulk Data (`default_cards`) | ~550 MB, wird streamend geparst; nur Papier-Prints; Preise (EUR) |
| `lorcana` | lorcanajson.org | DE-Namen/-Texte; Cardmarket-Preise (EUR) zusätzlich über die freie `dotgg.gg`-API (`api.dotgg.gg/cgfw/getcards?game=lorcana`), Marktplatz-Direktlink primär aus `externalLinks.cardmarketUrl` |
| `riftbound` | riftcodex.com | DE-Namen/-Texte aus eigener Übersetzungsdatei (`backend/src/data/riftbound.de.json`); Cardmarket-Preise (EUR) zusätzlich über `api.dotgg.gg/cgfw/getcards?game=riftbound` (riftcodex selbst liefert keine Preise); Varianten (Alt Art/Overnumbered/Signature) werden als Prints derselben Karte geführt |

Nach dem ersten erfolgreichen Import wird das Spiel automatisch auf `active` gesetzt und taucht im Frontend-Spielumschalter auf. Der Delta-Cron (`npm run import:delta` bzw. `cron-delta-import.sh`) aktualisiert alle aktiven Spiele.

## Fehlercodes

| Code | Bedeutung |
|---|---|
| 400 | Ungültiger Request-Body (z. B. unbekannter `condition`-Wert) |
| 401 | Keine/ungültige Session (Login-Cookie fehlt oder abgelaufen) |
| 403 | Eingeloggt, aber Rolle `viewer` versucht einen schreibenden Request (alles außer GET/HEAD/OPTIONS) |
| 404 | Ressource nicht gefunden |
| 409 | Konflikt (z. B. Import läuft bereits) |
| 500 | Serverfehler (siehe Backend-Logs) |
