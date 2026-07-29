# Architecture

*[Deutsche Version](ARCHITEKTUR.md)*

## Overview

The system consists of three clearly separated layers that communicate exclusively through defined interfaces:

```
┌─────────────────────────────────────────────────────────┐
│  Frontend (React + TypeScript, Vite)                    │
│  Container: nginx, Port 8080                            │
│  - Card browser, sets, collection, statistics           │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTP/JSON  (REST, /api/v1/*)
┌──────────────────────▼──────────────────────────────────┐
│  Backend (Node.js 22 + TypeScript, Fastify)             │
│  Container: node, Port 3001                             │
│  - REST API, validation, import jobs                    │
│  - Knex: migrations + query builder                     │
└──────────────────────┬──────────────────────────────────┘
                       │ SQL (mysql2)
┌──────────────────────▼──────────────────────────────────┐
│  MariaDB (existing instance on the Synology)            │
│  Schema: tcg_collection                                 │
└─────────────────────────────────────────────────────────┘

External sources (one importer each under backend/src/services/importers/):
YGOPRODeck (yugioh), Scryfall (magic), pokemontcg.io (pokemon),
lorcanajson.org (lorcana), riftcodex.com (riftbound) — plus two
cross-game supplementary sources: dotgg.gg (Cardmarket prices/links for
Lorcana/Riftbound, see DATENBANK.en.md) and api.frankfurter.app
(USD→EUR exchange rate for collection value totals, services/exchangeRate.ts).
→ called exclusively by the backend, never by the frontend.
```

## Technology Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Deployment | Docker (instead of Joomla) | An app-like UI such as cardcluster can hardly be implemented cleanly with a CMS; containers are first-class supported on the Synology (Container Manager). |
| Backend | Node.js + TypeScript + Fastify | One language ecosystem for front- and backend, lean containers, Fastify is fast and has built-in schema validation. |
| DB access | Knex (query builder + migrations) | Pure JavaScript without native binary engines → runs on any Synology CPU (x86_64 and ARM). Migrations are versioned and traceable. |
| Frontend | React + Vite | Industry standard, fast build, easy extensibility. Shipped as static files via nginx. |
| API style | REST + JSON, versioned (`/api/v1`) | Easy to document and test; frontend and future clients (e.g. an app) use the same interface. |
| Card data | one dedicated importer per game (YGOPRODeck, Scryfall, pokemontcg.io, riftcodex.com, lorcanajson.org) | All 5 supported games (Yu-Gi-Oh!, Magic, Pokémon, Riftbound, Lorcana) including sets, rarities, images and — where available — prices; all sources free, mostly without an API key required. Details per source: [ROADMAP.md](ROADMAP.md#weitere-spiele). |

## Multi-TCG Concept

The database is built to be **game-agnostic** (details in [DATENBANK.en.md](DATENBANK.en.md)):

- Each game is a row in `games` (`yugioh`, `pokemon`, `magic`, `riftbound`, `lorcana`).
- Shared fields (name, text, image, set, rarity, collection data) live in generic tables.
- Game-specific attributes (ATK/DEF, level, mana cost, ink color, …) live as JSON in `cards.game_data` — new games require **no schema change**, only a new importer and filter definitions.
- Each importer is its own module under `backend/src/services/importers/`. To add a new game, implement the `GameImporter` interface and register it.

## Communication Rules (Interfaces)

1. The frontend speaks **exclusively** to `/api/v1/*` — never directly to the database.
2. All responses are JSON with a uniform structure:
   - Lists: `{ "data": [...], "pagination": { "page", "limit", "total", "totalPages" } }`
   - Single objects: `{ "data": {...} }`
   - Errors: `{ "error": { "message", "statusCode" } }`
3. In the Docker setup, nginx proxies `/api/*` to the backend container → no CORS issues, a single public port (8080).
4. Write operations on the collection go through POST/PATCH/DELETE; the catalog (cards/sets) is read-only from the frontend's perspective and is only changed by import jobs.

## Backend Directory Structure

```
backend/
├── knexfile.js              # DB connection for migrations
├── migrations/              # versioned schema changes
├── src/
│   ├── server.ts            # entry point
│   ├── app.ts               # Fastify instance, plugin/route registration
│   ├── config.ts            # configuration from environment variables
│   ├── db.ts                # Knex instance
│   ├── routes/              # one module per resource
│   │   ├── games.ts
│   │   ├── cards.ts
│   │   ├── sets.ts
│   │   ├── collection.ts
│   │   └── imports.ts
│   └── services/
│       └── importers/
│           └── yugioh.ts    # YGOPRODeck importer
└── Dockerfile
```

## Frontend Directory Structure

```
frontend/
├── src/
│   ├── main.tsx / App.tsx   # entry point + routing
│   ├── api.ts               # central API client (only place with fetch)
│   ├── types.ts             # shared TypeScript types for the API
│   ├── pages/               # dashboard, cards, card detail, sets, set detail, collection
│   └── components/          # card grid, search bar, collection dialog, …
├── nginx.conf.template      # static delivery + /api proxy (envsubst template, see below)
└── Dockerfile               # multi-stage: Vite build → nginx
```

**`nginx.conf.template`**: not a static `nginx.conf`, but a template that the official nginx image processes via `envsubst` at container start (`${FORCE_HTTPS}` placeholder, see `docs/DEPLOYMENT-SYNOLOGY.en.md` section 10) — real nginx variables such as `$host` remain untouched in this process, since they are not actual environment variables. Two cache rules were deliberately set: `index.html` gets `Cache-Control: no-cache` (it is re-checked on every load, otherwise browsers can hold onto it for weeks based on their own heuristic cache logic without checking, thereby serving outdated references to JS bundles), whereas the files under `/assets/` that Vite names based on content hashes get `Cache-Control: public, max-age=31536000, immutable` instead (the filename changes with every content change, so unlimited caching is safe).
