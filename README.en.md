# TCG Collection Manager

*[Deutsche Version](README.md)*

**Version 1.11** — planned next steps in [docs/ROADMAP.md](docs/ROADMAP.md) (German only for now).

Self-hosted trading card collection manager in the style of **cardcluster** — for **Yu-Gi-Oh!, Pokémon TCG, Magic: The Gathering, Riftbound and Disney Lorcana**.

Built for self-hosting (e.g. on a Synology NAS): **MariaDB** as the database, **Docker** for backend (REST API) and frontend (web app), login required, HTTPS-capable.

## Features

- **5 trading card games** via automatic catalog import: Yu-Gi-Oh! ([YGOPRODeck](https://ygoprodeck.com/api-guide/)), Pokémon TCG ([pokemontcg.io](https://pokemontcg.io/)), Magic: The Gathering ([Scryfall](https://scryfall.com/docs/api)), Riftbound ([riftcodex.com](https://riftcodex.com)), Disney Lorcana ([lorcanajson.org](https://lorcanajson.org)) — including German card names/text where the source provides them
- **Delta import**: daily catalog sync via version check + content hash, instead of rewriting everything every time (cron-capable)
- **Card browser**: search by name, card text and collector number (including language-code wildcards), generic filters per game, set overview with progress indicator
- **Collection management**: quantity, condition, language, 1st edition, storage location, purchase price, CSV import/export
- **Price history**: automatic price snapshots from the import plus your own manual entries, history chart in the frontend — real Cardmarket EUR prices for Magic/Pokémon/Lorcana/Riftbound (for Lorcana/Riftbound via the free `dotgg.gg` API, some with a direct link to the Cardmarket product page); Yu-Gi-Oh! deliberately uses TCGPlayer USD instead of Cardmarket, since that's the only way to get prices per rarity instead of just per card (details in [docs/DATENBANK.md](docs/DATENBANK.md), German only for now). Collection value totals automatically convert USD to EUR.
- **Deck builder**: zones (main/extra/side), rules per game, ownership coverage, banlist check (Yu-Gi-Oh!), YDK import/export, PDF export
- **Photo scan**: photograph a card (phone camera or webcam), recognize set code/number via OCR and add it straight to the collection
- **Local image mirroring**: card images are mirrored and served locally instead of linked externally (no hotlinking)
- **Glossary**: community jargon/keywords per game as a reference page, including an explanation of each rarity tier and how to recognize it on the physical card (foil/symbol/frame)
- **Authentication**: login required (JWT in an httpOnly cookie), no public registration, roles `admin`/`viewer` (viewer can see everything but can't change anything), rate limiting against brute force, security headers (Helmet), optional forced HTTPS behind a reverse proxy
- **Multilingual** (DE/EN) and **mobile-friendly** (installable as a home-screen app)
- Clean REST API — frontend and backend are fully decoupled

## Architecture (short version)

```
Browser ──► Frontend (React, nginx container, port 8080)
                │  /api/* (proxy)
                ▼
            Backend (Node.js/TypeScript + Fastify, container, port 3001)
                │  SQL (mysql2/knex)
                ▼
            MariaDB (run independently, e.g. on the NAS)
                ▲
            Catalog importers (YGOPRODeck, Scryfall, pokemontcg.io, …)
```

Details: [docs/ARCHITEKTUR.md](docs/ARCHITEKTUR.en.md)

## Project structure

| Path | Contents |
|---|---|
| `backend/` | REST API (Node.js, TypeScript, Fastify, Knex migrations) |
| `frontend/` | Web app (React, TypeScript, Vite) |
| `docs/` | Architecture, database, API and deployment documentation |
| `docker-compose.yml` | Deployment configuration |

## Quick start (local development)

Requirements: Node.js ≥ 20, a reachable MariaDB ≥ 10.5.

```bash
cp .env.example .env        # fill in DB credentials
./start.sh                  # installs dependencies, migrates, starts backend + frontend
```

`start.sh` starts backend (http://localhost:3001) and frontend (http://localhost:5173) in parallel and shuts both down cleanly with Ctrl+C. Afterwards, click **"Import catalog"** per game in the dashboard, or directly:

```bash
cd backend
npm run import:game -- yugioh       # initial import (or delta, if already imported)
```

Create the first login user (no public registration):

```bash
./create-user.sh <username> <password>              # role "admin" (full access)
./create-user.sh <username> <password> viewer        # role "viewer" (read-only)
```

## Deployment (e.g. Synology NAS)

See [docs/DEPLOYMENT-SYNOLOGY.md](docs/DEPLOYMENT-SYNOLOGY.en.md) — short version:

```bash
cp .env.example .env        # fill in DB credentials
docker compose up -d --build
# App: http://<host>:8080
```

The docs are tailored to a Synology NAS setup (including known pitfalls with `rsync`, `docker-compose` and HTTPS via DSM reverse proxy + Let's Encrypt), but the Docker Compose setup itself runs on any Docker host with access to a MariaDB instance.

## Keeping the catalog up to date (delta import)

A repeated import doesn't reload the entire catalog every time. Before the actual sync, a version check against the source first determines whether anything has changed at all; if not, the import stops immediately. If something did change, every card/print is compared via content hash — only what actually changed gets written.

```bash
cd backend
npm run import:game -- yugioh          # delta import (default: the dashboard button does the same)
npm run import:game -- yugioh --force  # forces a full re-comparison, ignoring the version check
npm run import:delta                   # delta import across all active games — intended for cron/task scheduler
```

For automatic, regular updates: set up `cron-delta-import.sh` as a cron/task scheduler job (details in [docs/DEPLOYMENT-SYNOLOGY.md](docs/DEPLOYMENT-SYNOLOGY.en.md)).

## Login users & database backup

The app requires a login (no public registration). Both tasks run through small wrapper scripts in the project root that work directly against the database configured in `.env`:

```bash
./create-user.sh <username> <password> [admin|viewer]   # create user or reset password
./backup-db.sh                                          # back up the DB to backups/*.sql.gz (gzip, with cleanup of old backups)
```

Details (cron setup, restore, required DB client tool) in [docs/DEPLOYMENT-SYNOLOGY.md](docs/DEPLOYMENT-SYNOLOGY.en.md).

## Documentation

- [docs/ARCHITEKTUR.md](docs/ARCHITEKTUR.en.md) — system design, technology decisions
- [docs/DATENBANK.md](docs/DATENBANK.en.md) — schema, multi-TCG concept, ER diagram
- [docs/API.md](docs/API.en.md) — all REST endpoints with examples
- [docs/DEPLOYMENT-SYNOLOGY.md](docs/DEPLOYMENT-SYNOLOGY.en.md) — step-by-step guide including HTTPS
- [docs/ROADMAP.md](docs/ROADMAP.md) — current status & planned milestones (German only for now)

## Contributing

Issues and pull requests are welcome — deliberately, for a hobby project, there is no formal contribution process. For larger changes, please open an issue first.

## License

[MIT](LICENSE)
