# REST API

*[Deutsche Version](API.md)*

Base URL: `/api/v1` (reachable in the Docker setup via nginx at `http://<synology-ip>:8080/api/v1`).

## Conventions

- Responses: lists `{ "data": [...], "pagination": {...} }`, single objects `{ "data": {...} }`, errors `{ "error": { "message", "statusCode" } }`.
- Pagination parameters: `page` (default 1), `limit` (default varies, max 100).
- All timestamps are UTC (`YYYY-MM-DD` or ISO-8601).
- The catalog (cards/sets/prints) is **read-only** from the frontend's point of view — it is only updated via the import endpoint. Writable are `collection_items` as well as your own price snapshots (`price_history` with `source: "manual"`, see below) — the latter additionally update `card_prints.market_price`.
- **Images**: `image_url`/`image_small_url` in all responses are **local** URLs of the form `/images/<game-code>/cards/<id>.jpg` (a static route on the backend, mirrored via `npm run images:download`). The external source URLs never leave the backend — hotlinking is not allowed at the sources (among others YGOPRODeck). If no local copy exists yet, the field is `null` and the frontend shows a placeholder.

## Health

`GET /api/health` → `{ "status": "ok" }` (also checks the DB connection). The only endpoint besides `/api/v1/auth/*` that is reachable without login.

## Authentication

All `/api/v1/*` routes (except `auth/login`) require a valid session. The session is a JWT in an **httpOnly cookie** `token` (valid for 30 days) — the frontend doesn't need to do anything for this, the browser sends it automatically as long as the frontend and API are same-origin (Vite proxy in development, nginx in the Docker setup). No public registration: accounts are created by an admin via CLI (`npm run user:create -- <username> <password> [admin|viewer]` in the `backend` directory, see [docs/DEPLOYMENT-SYNOLOGY.en.md](DEPLOYMENT-SYNOLOGY.en.md)).

**Roles** (since 2026-07-27): `admin` (default, full access) or `viewer` (read-only access). The role is embedded in the JWT and is checked on **every** non-read request (anything except `GET`/`HEAD`/`OPTIONS`) (`blockWriteForViewer` hook in `backend/src/app.ts`) — a `viewer` account consistently gets `403` there, regardless of the route. If a user's role changes, this only takes effect after logging in again (the role is frozen in the already-issued JWT).

`POST /api/v1/auth/login` — `{ "username", "password" }` → sets the session cookie, response `{ "data": { "id", "username", "role" } }`. `401` on incorrect credentials.

`POST /api/v1/auth/logout` — deletes the session cookie (`204`).

`GET /api/v1/auth/me` — returns the currently logged-in user (`{ "data": { "id", "username", "role" } }`) or `401` if there is no session or an expired one. Checked by the frontend on app startup.

`/images/...` (static card images, **not** under `/api/v1`) is deliberately left reachable without login — plain card artwork with no collection/personal reference.

## Games

`GET /api/v1/games`
List of all games including catalog/collection counters.

```json
{ "data": [{ "id": 1, "code": "yugioh", "name": "Yu-Gi-Oh!", "active": true, "cardCount": 13500, "collectedCount": 87 }] }
```

## Cards

`GET /api/v1/games/:code/cards` — catalog of a game.
Query: `search`, `set` (set code), `page`, `limit` (≤100), `sort` (`name`|`newest`) plus **game-specific filters** per `backend/src/services/gameConfig.ts` — e.g. `type`, `attribute`, `race` (Yu-Gi-Oh!), `element`, `rarity` (Pokémon), `color` (Magic), `ink`, `cost` (Lorcana).

```
GET /api/v1/games/yugioh/cards?search=dragon&attribute=LIGHT&page=1&limit=60
GET /api/v1/games/magic/cards?color=U&type=Instant
```

`GET /api/v1/games/:code/filters` — available filters together with their values for the filter UI, generated generically from the game configuration: `{ "data": { "filters": [{ "key": "attribute", "values": ["DARK", "LIGHT", …] }] } }`.

`GET /api/v1/cards/:id` — single card including all prints (`prints[]`) and the collection entries contained within them (`collectionItems[]`).

`GET /api/v1/prints/:id/prices` — price history of a print (`[{ id, price, currency, source, recorded_at }]`). Populated on every import whenever the market price has changed — the daily delta cron thus automatically produces a price curve.

`POST /api/v1/prints/:id/prices` — record your own price snapshot, `{ "price", "currency"? (default EUR), "recorded_at"? (default now) }` → ends up in the same history with `source: "manual"`. `card_prints.market_price` is then synced to the chronologically most recent price history entry (regardless of source).

`DELETE /api/v1/prints/:id/prices/:priceId` — delete your own price snapshot again (only `source: "manual"` entries; imported history remains untouched by this; `market_price` is then re-synced). `404` if no such own entry exists.

### Photo Scan

`GET /api/v1/games/:code/scan?text=…` — matches OCR-recognized text against `card_prints.collector_number` of the game and returns matching prints (same shape as `cards[].prints[]`, including `card_name`/`set_name`/`set_code`). Recognizes two patterns per line: a full set-code+number string like `LOB-EN119` (Yu-Gi-Oh!/Magic style) as well as a number before a slash like `119/198` (Pokémon/Lorcana style). Pure text matching, **no image recognition** of the card artwork — the actual OCR runs client-side in the browser (`tesseract.js`, see `frontend/src/components/ScanCardModal.tsx`), this endpoint only receives the text that has already been recognized. Without a match: `{ "data": [] }` (no 404 — no match is a normal case).

## Sets

`GET /api/v1/games/:code/sets` — all sets of a game including progress (`printCount`, `ownedPrintCount`). Query: `search`.

`GET /api/v1/sets/:id` — a single set with all prints (`prints[]`), including card name, image, and `ownedQuantity`.

## Collection

`GET /api/v1/collection` — Query: `game` (game code), `search`, `page`, `limit`.

`GET /api/v1/collection/stats` — Query optional: `game`. Returns `totalCopies`, `distinctCards`, `distinctPrints`, `purchaseValue`, `marketValue`, `hypotheticalValue`. `marketValue` is always in EUR — prints with `currency: 'USD'` (currently only Yu-Gi-Oh!) are converted using the current exchange rate before summation (`services/exchangeRate.ts`), otherwise the sum would simply add up USD and EUR amounts. `sort=value` on `GET /collection` performs the same conversion. `hypotheticalValue` is a purely informational variant of the same sum where every print counts as at least €1 (`GREATEST(price, 1)` per copy) — cards worth €1 or more count at their real (converted) price; `card_prints.market_price` itself is left untouched.

`POST /api/v1/collection` — add a print to the collection (increases the quantity if the same print in the same condition/language/edition already exists).

```json
{
  "print_id": 1234,
  "quantity": 1,
  "condition": "NM",
  "language": "DE",
  "is_first_edition": false,
  "storage_location": "Folder 2, Page 5",
  "purchase_price": 3.5,
  "acquired_at": "2026-07-01",
  "notes": null
}
```

`condition` ∈ `MT, NM, EX, GD, LP, PL, PO` (Cardmarket scale).

`PATCH /api/v1/collection/:id` — partial update of any fields (except `print_id`).

`DELETE /api/v1/collection/:id` — remove an entry (204 No Content).

### CSV Export/Import

`GET /api/v1/collection/export` — the complete collection as a CSV download (UTF-8 with BOM, Excel-compatible). Query optional: `game`.
Columns: `game, set_code, collector_number, rarity, card_name, external_id, quantity, condition, language, is_first_edition, storage_location, purchase_price, acquired_at, notes`.

`POST /api/v1/collection/import` — CSV in the request body (`Content-Type: text/csv`). Prints are resolved via `set_code` + `collector_number`/`external_id` (+ `rarity`). **Idempotent**: if the same print in the same condition/language/edition already exists, the quantity is *set* to the CSV value (not added) — re-importing your own export file does not duplicate anything. Response: `{ "data": { "created", "updated", "failed", "errors": [] } }`.

## Decks

`GET /api/v1/decks?game=yugioh` — deck list including `zoneCounts` (`main`/`extra`/`side`) and `cardCount`.

`POST /api/v1/decks` — `{ "game": "yugioh", "name": "…" }` → new deck.

`GET /api/v1/decks/:id` — deck including `cards[]` (card info, `zone`, `quantity`, `ownedQuantity` = ownership across all prints).

`PATCH /api/v1/decks/:id` — change `name`/`description`. `DELETE /api/v1/decks/:id` — delete.

`PUT /api/v1/decks/:id/cards` — `{ "card_id", "zone", "quantity" }` **sets** the quantity (0 = remove); idempotent.

Deck rules (zone sizes, copy limits, extra-deck assignment, banlist legality) are checked by the frontend (`frontend/src/deckRules.ts`) — the API deliberately stores data rule-free, so that unfinished decks can be saved.

For Yu-Gi-Oh!, `cards[].game_data.banTcg` returns the TCG banlist status of a card (`"Forbidden"`/`"Limited"`/`"Semi-Limited"`, otherwise not set) — this comes directly from `banlist_info.ban_tcg` of the YGOPRODeck API and is automatically updated during the delta import as soon as the status changes. The frontend uses this to compare the existing copy count per card (`legalCopiesFor()` in `deckRules.ts`) and flags violations in the deck builder.

### YDK Import/Export (YGOPro/cardcluster format)

`GET /api/v1/decks/:id/export.ydk` — download in YDK format (`#main`/`#extra`/`!side`, one line per copy, `external_id` = passcode).

`POST /api/v1/decks/import?game=yugioh&name=…` — raw YDK text in the body (`Content-Type: text/plain`) → new deck. The response contains `imported` and `unmatched[]`. For Yu-Gi-Oh!, alias passcodes of alternate artworks (e.g. `18144506` → `18144507`) are automatically resolved via the YGOPRODeck API.

The "Export as PDF" button in the deck builder is purely frontend (no dedicated endpoint): it opens the browser's print dialog on a hidden deck list (`@media print` in `frontend/src/styles.css`), from which a PDF can be produced via "Save as PDF."

## Import

`POST /api/v1/imports/:code` — starts a catalog import asynchronously (e.g. `POST /api/v1/imports/yugioh`). Response `202` with `jobId`. Fails with `409` if an import for this game is already running.

By default this is a **delta import**: first, a version check against the source determines whether anything has changed at all since the last run (if not, the job ends immediately with `skipped: true` in the stats). Otherwise, every card/print is compared via a content hash and only changed or new records are written.

The query parameter `force=true` (e.g. `POST /api/v1/imports/yugioh?force=true`) skips the version check and re-compares every record — useful if there is a suspicion that the data is inconsistent.

`GET /api/v1/imports/latest?game=yugioh` — status of the last import job (`running`, `completed`, `failed`) including a progress message and `stats` (`{ sets, cards, prints, cardsChanged, printsChanged, skipped }`).

Available importers and their sources:

| Game | Source | Notes |
|---|---|---|
| `yugioh` | YGOPRODeck API | DE names/texts, TCGPlayer prices (**USD**, `card_sets[].set_price`, per print/rarity) — deliberately not switched to Cardmarket EUR, since this source only provides Cardmarket prices once per card (no rarity granularity), which would distort the collection value; `card_prints.currency` correctly marks this as `USD` instead of falsely showing it as "€" |
| `pokemon` | pokemontcg.io v2 | optional `POKEMON_TCG_API_KEY` in `.env` (heavily rate-limited without a key), Cardmarket prices (EUR) |
| `magic` | Scryfall Bulk Data (`default_cards`) | ~550 MB, parsed via streaming; paper prints only; prices (EUR) |
| `lorcana` | lorcanajson.org | DE names/texts; Cardmarket prices (EUR) additionally via the free `dotgg.gg` API (`api.dotgg.gg/cgfw/getcards?game=lorcana`), marketplace direct link primarily from `externalLinks.cardmarketUrl` |
| `riftbound` | riftcodex.com | DE names/texts from a dedicated translation file (`backend/src/data/riftbound.de.json`); Cardmarket prices (EUR) additionally via `api.dotgg.gg/cgfw/getcards?game=riftbound` (riftcodex itself provides no prices); variants (Alt Art/Overnumbered/Signature) are managed as prints of the same card |

After the first successful import, the game is automatically set to `active` and appears in the frontend game switcher. The delta cron (`npm run import:delta` or `cron-delta-import.sh`) updates all active games.

## Error Codes

| Code | Meaning |
|---|---|
| 400 | Invalid request body (e.g. unknown `condition` value) |
| 401 | No/invalid session (login cookie missing or expired) |
| 403 | Logged in, but role `viewer` attempted a write request (anything except GET/HEAD/OPTIONS) |
| 404 | Resource not found |
| 409 | Conflict (e.g. an import is already running) |
| 500 | Server error (see backend logs) |
