# Deployment on the Synology

*[Deutsche Version](DEPLOYMENT-SYNOLOGY.md)*

Prerequisites: Synology with **Container Manager** (DSM 7.2+) and a running **MariaDB** (e.g. via the "MariaDB 10" package or your own container).

## 1. Prepare the Database

Via phpMyAdmin (if installed) or SSH:

```sql
CREATE DATABASE tcg_collection CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'tcg'@'%' IDENTIFIED BY '<sicheres-passwort>';
GRANT ALL PRIVILEGES ON tcg_collection.* TO 'tcg'@'%';
FLUSH PRIVILEGES;
```

If MariaDB only listens on `localhost`, adjust `bind-address` in the MariaDB configuration, or make sure it's reachable within the same Docker network/LAN. Note down the IP and port of the DB host (the Synology MariaDB often runs on port **3307**, not 3306 — check under the "MariaDB 10" DSM package → Overview).

## 2. Transfer the Project to the Synology

Via Git (recommended, so updates are simply possible via `git pull`) or via `tar` over SSH.

**As long as no Git remote is set up** (current status: `git remote -v` is empty, only the local history exists): `rsync` does **not** work over SSH on this NAS (DSM blocks the `--server` mode of the bundled setuid `rsync` binary for security reasons — error `Permission denied, please try again.`, regardless of the rsync client/version). The most pragmatic alternative: `tar` piped over SSH:

```bash
ssh admin@<synology-lan-ip> "mkdir -p /volume1/docker/tcg-collection"

tar czf - \
  --exclude='node_modules' \
  --exclude='data_images' \
  --exclude='.git' \
  --exclude='.env' \
  . | ssh admin@<synology-lan-ip> "tar xzf - -C /volume1/docker/tcg-collection"
```

Important: use the NAS's **LAN IP**, not the DDNS address — otherwise the transfer runs over the internet instead of the local network. For updates, run the same command again (it re-transfers the entire tree, no delta like with rsync — uncritical for the project size here, see "Applying Updates" below).

Once a private Git repo exists (e.g. GitHub or the Synology Git Server package), the classic approach is preferable:

```bash
ssh admin@<synology-ip>
git clone <repo-url> tcg-collection
cd tcg-collection
```

## 3. Configuration

```bash
cp .env.example .env
nano .env
```

Important values:

```
DB_HOST=<Synology's LAN IP>
DB_PORT=3307
DB_USER=tcg
DB_PASSWORD=<the password set above>
DB_NAME=tcg_collection
IMAGES_DIR=/volume1/docker/tcg-collection/images
JWT_SECRET=<generate via `openssl rand -hex 32`>
FRONTEND_PORT=8080
```

- **`DB_HOST`**: Since MariaDB runs as a standalone Synology package (not in the same Docker Compose network), the backend container must access it via the NAS's regular network address. `localhost`/`127.0.0.1` inside the container points to itself, not to the host — so enter the NAS's LAN IP, not `localhost`, and not necessarily the DDNS address either (NAT loopback to itself doesn't work reliably everywhere).
- **`IMAGES_DIR`**: Must be set explicitly, otherwise Docker mounts the empty default directory `./data_images`. Set it to the target path from the "Transferring Card Images" section below.
- **`BACKEND_UID`/`BACKEND_GID`**: By default the backend container runs as an unprivileged user (UID/GID 1000, not root). If `IMAGES_DIR` is located on a dedicated Synology shared folder with its own ACL, set UID/GID here — otherwise `/images/...` will consistently return `500 EACCES` instead of the images. **Important**: Synology ACLs (`synoacltool -get <path>`, or the "+" after the permissions in `ls -la`) completely override the visible Unix permissions and often grant access **not** to the file owner shown, but only to explicitly listed users/groups (e.g. `administrators` or a dedicated shared-folder user) — so the owner's UID according to `ls -la` is not necessarily sufficient. Use `synoacltool -get <path>` to check which user/group actually has `allow` entries, and enter that user's UID/GID (`id <user>`).
- **`JWT_SECRET`**: Required — the backend immediately aborts startup without this value (with a corresponding log message). It signs the login session; if lost or changed, all existing sessions become invalid (just log in again).

## 4. Transferring Card Images

The locally mirrored card images (`npm run images:download`, several GB) live in the git-ignored directory `data_images/` and must be transferred to the NAS separately — not via Git/project transfer, since they're deliberately excluded (Section 2).

For one-off/smaller transfers via SSH: `tar` as in Section 2 (no delta, but `rsync` doesn't work here anyway, see the note there). For repeated transfers of many GB, the simplest approach is to set up a **network share via SMB/AFP** directly in DSM and copy over that (Finder/Explorer) — no delta rsync needed, and no `--server` blocker either.

**Active since 2026-07-20:** Dedicated Synology shared folder `tcg_master_drive` with its own shared-folder user `tcg_master` (credentials live locally in `.env`, not here — passwords don't belong in versioned files). Containers run directly on the Synology; `IMAGES_DIR` points to the share's local path: `/volume1/tcg_master_drive/data_images`.

## 5. Building and Starting Containers

**Synology quirk** (tested on DSM 7.1.1, Docker package 20.10.3): The bundled `docker`/`docker-compose` is a **setuid-root binary with no group access** for regular users — commands require `sudo`. In addition, only the older, standalone `docker-compose` (with a hyphen) is available here, **not** the newer `docker compose` subcommand (no CLI plugin installed). On top of that: **no SSH-based `rsync`** is possible (the `--server` mode is blocked by DSM for security reasons, `Permission denied, please try again.` regardless of the client) — transfer code via `tar` over SSH or Git.

**DSM 7.2+ update**: On a DSM upgrade, the "Docker" package is automatically renamed/migrated to **"Container Manager"** (`/var/packages/ContainerManager/...` instead of `/var/packages/Docker/...`). The paths `/usr/local/bin/docker` and `/usr/local/bin/docker-compose` remain in place as symlinks and automatically point to the new location — all commands in this document continue to work unchanged, no adjustment needed after a DSM update. After a larger DSM jump (e.g. 7.1 → 7.4, as experienced here once), it's still worth briefly testing `curl <host>/api/health` and the login — certificate, reverse proxy rule, and Task Scheduler jobs have reliably survived updates in practice, but better safe than sorry.

In Container Manager via project (select docker-compose.yml) **or** via SSH:

```bash
cd /volume1/docker/tcg-collection
sudo /usr/local/bin/docker-compose --env-file .env up -d --build
```

The backend container automatically runs `knex migrate:latest` on startup — so the tables get created on first start (or pending migrations get applied, if the DB is already at an older state).

## 6. Checking Status

```bash
sudo /usr/local/bin/docker-compose ps
sudo /usr/local/bin/docker-compose logs -f backend
curl http://localhost:8080/api/health   # {"status":"ok"}
```

App in the browser: `http://<synology-ip>:8080` — initially shows the login, see the next section.

## 7. Creating the First Login User

Without a user, nobody gets past the login (there is deliberately no registration in the frontend, see [docs/API.en.md](API.en.md#authentication)). Creating one is handled by `create-user.sh` in the project root — it installs the backend dependencies if needed and writes directly against the database configured in `.env` (`DB_HOST`/`DB_PORT`), from a machine with network access to it (e.g. the development machine, not necessarily the Synology itself):

```bash
chmod +x create-user.sh   # einmalig
./create-user.sh <username> <passwort>
```

Calling it again with the same `<username>` resets that user's password (useful if a password is lost). Create additional users accordingly with a different username.

**Roles** (since 2026-07-27): Every user has a role, either `admin` (full access, default) or `viewer` (read-only — sees everything, but can't change anything in the collection/decks/catalog; every write request gets a `403` from the backend). Optional third parameter:

```bash
./create-user.sh <username> <passwort> viewer
```

Omitted → `admin` on new creation; for an already-existing user the role stays unchanged if nothing is specified here (only the password gets reset in that case).

## 8. Importing Catalogs

If the target database is already populated (e.g. because migration + import already ran locally against the same MariaDB beforehand), this step is already done — after step 5/6, cards/sets should be immediately visible without needing to do anything here.

For a fresh catalog: either click **"Import Catalog"** per game in the app's dashboard (supported: `yugioh`, `magic`, `pokemon`, `lorcana`, `riftbound`), or via the API — since login became mandatory (Section 7), a `curl` call for this needs the session cookie:

```bash
curl -c cookies.txt -X POST http://<synology-ip>:8080/api/v1/auth/login \
  -H 'Content-Type: application/json' -d '{"username":"<username>","password":"<passwort>"}'
curl -b cookies.txt -X POST http://<synology-ip>:8080/api/v1/imports/yugioh
```

Replace `yugioh` with the respective game code. The import downloads cards, sets, and prices from the respective source (YGOPRODeck, Scryfall, pokemontcg.io, lorcanajson.org, riftcodex.com — takes anywhere from a few minutes to over an hour depending on the game and connection). Progress is visible in the dashboard or can be queried via `GET /api/v1/imports/latest?game=<code>`. A game is automatically activated after its first successful import and subsequently appears in the game selector as well as in the delta cron (Section 9).

Card images can be fetched afterwards via the dashboard's "Update Images" button (or `POST /api/v1/images/download?game=<code>`), if new cards without an image path were added after Section 4.

## 9. Keeping the Catalog Automatically Up to Date (Scheduled Delta Import)

Every repeat import is a **delta import**: it first checks via a version check whether anything at the source has changed at all, and only then writes cards/prints that actually changed or are new (details: [docs/DATENBANK.en.md](DATENBANK.en.md#delta-import-content_hash-import_state)). This means it can safely run on a regular automated schedule without rewriting the entire catalog on every run.

The repo includes `cron-delta-import.sh` for this — it invokes the delta import for all active games inside the running backend container:

```bash
chmod +x cron-delta-import.sh   # einmalig
./cron-delta-import.sh          # manual test run
```

Setting it up as a schedule in DSM:

1. **Control Panel → Task Scheduler → Create → Scheduled Task → User-defined script**
2. Schedule, e.g. daily at 04:00
3. Task Settings → Run command:
   ```bash
   bash /volume1/docker/tcg-collection/cron-delta-import.sh
   ```
   (Adjust the path to the actual project folder on the Synology.)

If the source is unchanged, the run finishes in a few seconds with no write load on the database at all; if there are changes, only the affected rows get updated.

## 10. HTTPS (Let's Encrypt + DSM Reverse Proxy)

For access from outside without a browser warning. Runs entirely through DSM's built-in tools, no additional container needed.

1. **Certificate**: Control Panel → Security → Certificate → Add → "Get a certificate from Let's Encrypt" → domain (your own `*.myds.me` DDNS address or your own domain), email. Prerequisite: port 80 forwarded externally to the NAS (for the HTTP-01 check).
2. **Reverse Proxy**: Control Panel → Login Portal → Advanced → Reverse Proxy → Create.
   - Source: Protocol HTTPS, Hostname = your own DDNS address, **Port 8443** (not 443!)
   - Destination: Protocol HTTP, Hostname = **fixed container IP `172.28.0.10`** (the project's own `tcgnet` Docker network from `docker-compose.yml` — not `localhost` and not the LAN IP/published port, see the warning below), Port **80** (the container-internal nginx port, not `FRONTEND_PORT`/8080)
3. **Assign the certificate**: Control Panel → Security → Certificate → Settings → switch the new reverse proxy service to the Let's Encrypt certificate.
4. **Router**: port forwarding from external **443** → internal **8443** (target IP = the NAS's LAN IP), TCP. Externally, the address remains without a port number (`https://<domain>/`).
5. **`.env`**: set `COOKIE_SECURE=true` **and** `FORCE_HTTPS=true` — the former ensures the login cookie is only sent over HTTPS, the latter closes off the otherwise still-open, unencrypted direct access to `FRONTEND_PORT` (without it, login/session via `http://<lan-ip>:<FRONTEND_PORT>` would remain possible in plaintext, even though HTTPS has long since been set up via the reverse proxy!). Then rebuild (the frontend image changes): `sudo /usr/local/bin/docker-compose --env-file .env up -d --build`.

**Four pitfalls that have actually occurred in practice:**
- **Don't use port 443 as the reverse proxy source when the source is your own DDNS address (`*.myds.me`).** DSM's own QuickConnect/login portal registers this combination in the main `nginx.conf` first — a custom reverse proxy rule for the same hostname+port is then silently ignored (no error, the DSM login page just keeps responding). Hence port 8443 internally + port translation on the router.
- **Don't use `localhost` as the reverse proxy destination** — DSM's nginx process doesn't reliably reach the Docker container that way (same pattern as with `DB_HOST`, see Section 3).
- **Don't use the LAN IP + published port (`192.168.x.x:8080`) as the reverse proxy destination** — on some systems (observed after a major DSM update, 7.1 → 7.4) exactly this path via Docker's port publishing (`-p 8080:80`, iptables NAT) is intermittently broken: individual image requests get stuck after about 60 seconds with `HTTP/2 ... INTERNAL_ERROR`, while purely Docker-internal container traffic runs reliably. That's why the reverse proxy rule points to the **fixed container IP** (`172.28.0.10`, port 80) from the `tcgnet` network in `docker-compose.yml` — this bypasses the port-publishing path entirely.
- **Don't forget `FORCE_HTTPS`** — without this variable, `FRONTEND_PORT` remains directly reachable unencrypted, alongside the HTTPS access via the reverse proxy. The login (including the password) would then travel over the network in plaintext on direct access to `http://<lan-ip>:<FRONTEND_PORT>`, even though HTTPS is "technically" set up.

## 11. Multiple Apps on the Same NAS (Subdomain Pattern)

For anyone wanting to host additional web apps on the same NAS alongside this project: DSM's built-in reverse proxy only distinguishes by **hostname**, not by URL path — a rule like "`<domain>/tcg` → Container A" isn't supported (confirmed across the community, not a native feature, not even in current DSM versions). The approach DSM actually supports is a **dedicated subdomain per app**:

1. Synology's DDNS (`*.myds.me` or `*.synology.me`) supports wildcard subdomains — `app.<your-domain>.myds.me` already resolves automatically to the same NAS, with no additional DDNS registration needed at all.
2. Get a **separate** Let's Encrypt certificate per app (step 1 above, but with `app.<your-domain>.myds.me` as the domain name instead of the bare DDNS address).
3. A **separate** reverse proxy rule per app (step 2 above): source `app.<your-domain>.myds.me:8443`, destination the fixed container IP of the respective app in the matching Docker network, port 80.
4. Certificate assignment (step 3 above) — set each rule to its corresponding subdomain certificate.
5. Router/port forwarding stays unchanged — still a single external port 443→8443 shared by **all** subdomains, no new port needed per app.

No code changes needed in the respective project, as long as the domain isn't hardcoded anywhere in it — checked for this project: not the case anywhere (nor does `CORS_ORIGINS` come into play here, since frontend and backend run under the same origin and the reverse proxy turns those into same-origin requests).

## Applying Updates

**Pitfall**: `docker-compose ... up -d --build` does **not** pull the base image (`node:22-alpine`) again by default if one with a matching tag already exists locally — even if the local image is already weeks old. This can lead to cryptic `npm ERR! EBADENGINE` failures in the middle of the build, if a (transitive) dependency now requires a newer Node version than what's in the old cached base image. Check with `sudo docker inspect node:22-alpine --format '{{.Created}}'`; if it's old, pull it fresh once:
```bash
sudo docker rmi node:22-alpine
sudo docker pull node:22-alpine
sudo /usr/local/bin/docker-compose --env-file .env build --no-cache
```

As long as deployment happens via `tar` (Section 2): run the `tar` command from Section 2 again, then rebuild on the NAS (see the Synology quirk in Section 5 regarding `sudo`/`docker-compose`):

```bash
ssh synology-tcg
cd /volume1/docker/tcg-collection
sudo /usr/local/bin/docker-compose --env-file .env up -d --build
```

Once cloned via Git:

```bash
cd tcg-collection
git pull
sudo /usr/local/bin/docker-compose --env-file .env up -d --build
```

New database migrations run automatically when the backend container restarts.

## Backup

The application itself is stateless — the only relevant data is the MariaDB database `tcg_collection`. In addition to a MariaDB backup that's already available on the Synology anyway (e.g. Hyper Backup), the repo includes `backup-db.sh` — a wrapper around `mysqldump`/`mariadb-dump` that backs up the DB using the `.env` credentials, stores it gzip-compressed under `backups/`, and automatically cleans up backups older than 14 days (configurable):

```bash
chmod +x backup-db.sh   # einmalig
./backup-db.sh          # manual test run → backups/tcg_collection_<timestamp>.sql.gz
```

Prerequisite: a DB client tool in the `PATH` of the machine running it (not included in the lightweight backend container). **`mariadb-dump` is recommended** (on macOS, e.g. `brew install mariadb`) over the Oracle `mysqldump` client (`mysql-client`) — its newer versions (≥8.0.34) unpromptedly try to dump MySQL Enterprise data-masking policies when using `--routines`, which fails against MariaDB with a privilege error and produces an incomplete backup. The script automatically detects `mariadb-dump` if it's available.

Restore in case of failure:

```bash
gunzip -c backups/tcg_collection_<timestamp>.sql.gz | mariadb -h <DB_HOST> -P <DB_PORT> -u tcg -p tcg_collection
```

The same approach as the delta-import cron (Section 9) works for automated backups: set up `backup-db.sh` as its own Task Scheduler job on a machine with network access to the DB (e.g. nightly, on the Synology itself only if a suitable DB client package is available there — otherwise via cron from the development machine or another always-on host).

## Ports & Firewall

| Port | Purpose |
|---|---|
| 8080 (host, configurable) | Frontend / only public access point |
| 3001 (internal only, Docker network) | Backend API |
| Synology MariaDB's DB port | keep reachable internally only, do not forward to the internet |

Only port `FRONTEND_PORT` needs to be opened (if desired) in the router/reverse proxy — the backend API is only reachable via the frontend's nginx proxy.

**Outbound connections**: the backend container needs unrestricted outbound HTTPS access (port 443) to the catalog sources (YGOPRODeck, Scryfall, pokemontcg.io, lorcanajson.org, riftcodex.com), and since 2026-07-21 additionally to `api.dotgg.gg` (Cardmarket prices/links for Lorcana/Riftbound) and `api.frankfurter.app` (exchange rate for collection value totals) — on a standard Synology without restrictive outbound firewall rules this is given without further action; otherwise, allow these hosts.
