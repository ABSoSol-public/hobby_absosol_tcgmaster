# Architektur

## Überblick

Das System besteht aus drei klar getrennten Schichten, die ausschließlich über definierte Schnittstellen kommunizieren:

```
┌─────────────────────────────────────────────────────────┐
│  Frontend (React + TypeScript, Vite)                    │
│  Container: nginx, Port 8080                            │
│  - Karten-Browser, Sets, Sammlung, Statistiken          │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTP/JSON  (REST, /api/v1/*)
┌──────────────────────▼──────────────────────────────────┐
│  Backend (Node.js 22 + TypeScript, Fastify)             │
│  Container: node, Port 3001                             │
│  - REST-API, Validierung, Import-Jobs                   │
│  - Knex: Migrationen + Query-Builder                    │
└──────────────────────┬──────────────────────────────────┘
                       │ SQL (mysql2)
┌──────────────────────▼──────────────────────────────────┐
│  MariaDB (bestehende Instanz auf der Synology)          │
│  Schema: tcg_collection                                 │
└─────────────────────────────────────────────────────────┘

Externe Quellen (je ein Importer unter backend/src/services/importers/):
YGOPRODeck (yugioh), Scryfall (magic), pokemontcg.io (pokemon),
lorcanajson.org (lorcana), riftcodex.com (riftbound) — plus zwei
spielübergreifende Zusatzquellen: dotgg.gg (Cardmarket-Preise/-Links für
Lorcana/Riftbound, siehe DATENBANK.md) und api.frankfurter.app
(USD→EUR-Kurs für Sammlungswert-Summen, services/exchangeRate.ts).
→ werden ausschließlich vom Backend aufgerufen, nie vom Frontend.
```

## Technologie-Entscheidungen

| Entscheidung | Wahl | Begründung |
|---|---|---|
| Deployment | Docker (statt Joomla) | App-artige UI wie cardcluster ist mit einem CMS kaum sauber umsetzbar; Container sind auf der Synology (Container Manager) erstklassig unterstützt. |
| Backend | Node.js + TypeScript + Fastify | Ein Sprach-Ökosystem für Front- und Backend, schlanke Container, Fastify ist schnell und hat eingebaute Schema-Validierung. |
| DB-Zugriff | Knex (Query-Builder + Migrationen) | Reines JavaScript ohne native Binär-Engines → läuft auf jeder Synology-CPU (x86_64 und ARM). Migrationen sind versioniert und nachvollziehbar. |
| Frontend | React + Vite | Industriestandard, schneller Build, einfache Erweiterbarkeit. Ausgeliefert als statische Dateien über nginx. |
| API-Stil | REST + JSON, versioniert (`/api/v1`) | Einfach zu dokumentieren und zu testen; Frontend und zukünftige Clients (z. B. App) nutzen dieselbe Schnittstelle. |
| Kartendaten | je Spiel ein eigener Importer (YGOPRODeck, Scryfall, pokemontcg.io, riftcodex.com, lorcanajson.org) | Alle 5 unterstützten Spiele (Yu-Gi-Oh!, Magic, Pokémon, Riftbound, Lorcana) inkl. Sets, Rarities, Bilder und — wo verfügbar — Preisen; alle Quellen kostenlos, meist ohne API-Key nötig. Details je Quelle: [ROADMAP.md](ROADMAP.md#weitere-spiele). |

## Multi-TCG-Konzept

Die Datenbank ist **spielagnostisch** aufgebaut (Details in [DATENBANK.md](DATENBANK.md)):

- Jedes Spiel ist eine Zeile in `games` (`yugioh`, `pokemon`, `magic`, `riftbound`, `lorcana`).
- Gemeinsame Felder (Name, Text, Bild, Set, Seltenheit, Sammlungsdaten) liegen in generischen Tabellen.
- Spielspezifische Attribute (ATK/DEF, Level, Mana-Kosten, Ink-Farbe, …) liegen als JSON in `cards.game_data` — neue Spiele erfordern **keine Schemaänderung**, nur einen neuen Importer und Filter-Definitionen.
- Jeder Importer ist ein eigenes Modul unter `backend/src/services/importers/`. Für ein neues Spiel implementiert man das Interface `GameImporter` und registriert es.

## Kommunikationsregeln (Schnittstellen)

1. Das Frontend spricht **ausschließlich** `/api/v1/*` — niemals direkt die Datenbank.
2. Alle Antworten sind JSON mit einheitlicher Struktur:
   - Listen: `{ "data": [...], "pagination": { "page", "limit", "total", "totalPages" } }`
   - Einzelobjekte: `{ "data": {...} }`
   - Fehler: `{ "error": { "message", "statusCode" } }`
3. Im Docker-Setup proxyt nginx `/api/*` an den Backend-Container → keine CORS-Probleme, ein einziger öffentlicher Port (8080).
4. Schreiboperationen auf die Sammlung laufen über POST/PATCH/DELETE; der Katalog (Karten/Sets) ist aus Frontend-Sicht read-only und wird nur durch Import-Jobs verändert.

## Verzeichnisstruktur Backend

```
backend/
├── knexfile.js              # DB-Verbindung für Migrationen
├── migrations/              # versionierte Schemaänderungen
├── src/
│   ├── server.ts            # Einstiegspunkt
│   ├── app.ts               # Fastify-Instanz, Plugin-/Routen-Registrierung
│   ├── config.ts            # Konfiguration aus Umgebungsvariablen
│   ├── db.ts                # Knex-Instanz
│   ├── routes/              # ein Modul pro Ressource
│   │   ├── games.ts
│   │   ├── cards.ts
│   │   ├── sets.ts
│   │   ├── collection.ts
│   │   └── imports.ts
│   └── services/
│       └── importers/
│           └── yugioh.ts    # YGOPRODeck-Importer
└── Dockerfile
```

## Verzeichnisstruktur Frontend

```
frontend/
├── src/
│   ├── main.tsx / App.tsx   # Einstieg + Routing
│   ├── api.ts               # zentraler API-Client (einzige Stelle mit fetch)
│   ├── types.ts             # geteilte TypeScript-Typen der API
│   ├── pages/               # Dashboard, Karten, Kartendetail, Sets, Setdetail, Sammlung
│   └── components/          # Kartenraster, Suchleiste, Sammlungs-Dialog, …
├── nginx.conf.template      # statische Auslieferung + /api-Proxy (envsubst-Template, s. u.)
└── Dockerfile               # Multi-Stage: Vite-Build → nginx
```

**`nginx.conf.template`**: kein statisches `nginx.conf`, sondern ein Template, das das offizielle nginx-Image beim Container-Start per `envsubst` verarbeitet (`${FORCE_HTTPS}`-Platzhalter, siehe `docs/DEPLOYMENT-SYNOLOGY.md` Abschnitt 10) — echte nginx-Variablen wie `$host` bleiben dabei unangetastet, da sie keine echten Environment-Variablen sind. Zwei Cache-Regeln sind bewusst gesetzt: `index.html` bekommt `Cache-Control: no-cache` (wird bei jedem Laden neu geprüft, sonst können Browser sie über Wochen aus eigener Heuristik-Cache-Logik ungeprüft behalten und so veraltete JS-Bundle-Verweise ausliefern), die von Vite inhaltsbasiert benannten Dateien unter `/assets/` bekommen dagegen `Cache-Control: public, max-age=31536000, immutable` (der Dateiname ändert sich ja bei jeder inhaltlichen Änderung, unbegrenztes Caching ist daher gefahrlos).
