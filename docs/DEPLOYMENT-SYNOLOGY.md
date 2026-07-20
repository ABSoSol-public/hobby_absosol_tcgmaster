# Deployment auf der Synology

Voraussetzungen: Synology mit **Container Manager** (DSM 7.2+) und einer laufenden **MariaDB** (z. B. via Paket "MariaDB 10" oder eigener Container).

## 1. Datenbank vorbereiten

Per phpMyAdmin (falls installiert) oder SSH:

```sql
CREATE DATABASE tcg_collection CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'tcg'@'%' IDENTIFIED BY '<sicheres-passwort>';
GRANT ALL PRIVILEGES ON tcg_collection.* TO 'tcg'@'%';
FLUSH PRIVILEGES;
```

Falls die MariaDB nur auf `localhost` lauscht, in der MariaDB-Konfiguration `bind-address` anpassen bzw. sicherstellen, dass sie im gleichen Docker-Netz/LAN erreichbar ist. Notiere IP und Port des DB-Hosts (Synology-MariaDB läuft oft auf Port **3307**, nicht 3306 — im DSM-Paket unter "MariaDB 10" → Übersicht prüfen).

## 2. Projekt auf die Synology bringen

Per Git (empfohlen, damit Updates einfach per `git pull` möglich sind) oder per `tar` über SSH.

**Solange kein Git-Remote eingerichtet ist** (Stand jetzt: `git remote -v` ist leer, es existiert nur die lokale Historie): `rsync` funktioniert auf dieser NAS **nicht** per SSH (DSM blockiert den `--server`-Modus des mitgelieferten setuid-`rsync`-Binaries aus Sicherheitsgründen — Fehler `Permission denied, please try again.`, unabhängig vom rsync-Client/-Version). Pragmatischste Alternative: `tar` gepiped über SSH:

```bash
ssh admin@<synology-lan-ip> "mkdir -p /volume1/docker/tcg-collection"

tar czf - \
  --exclude='node_modules' \
  --exclude='data_images' \
  --exclude='.git' \
  --exclude='.env' \
  . | ssh admin@<synology-lan-ip> "tar xzf - -C /volume1/docker/tcg-collection"
```

Wichtig: die **LAN-IP** der NAS verwenden, nicht die DDNS-Adresse — sonst läuft die Übertragung über das Internet statt im lokalen Netz. Für Updates denselben Befehl erneut ausführen (überträgt den kompletten Baum neu, kein Delta wie bei rsync — für den Projektumfang hier unkritisch, siehe „Updates einspielen" unten).

Sobald ein privates Git-Repo existiert (z. B. GitHub oder das Synology-Git-Server-Paket), ist der klassische Weg vorzuziehen:

```bash
ssh admin@<synology-ip>
git clone <repo-url> tcg-collection
cd tcg-collection
```

## 3. Konfiguration

```bash
cp .env.example .env
nano .env
```

Wichtige Werte:

```
DB_HOST=<LAN-IP der Synology>
DB_PORT=3307
DB_USER=tcg
DB_PASSWORD=<das oben vergebene Passwort>
DB_NAME=tcg_collection
IMAGES_DIR=/volume1/docker/tcg-collection/images
JWT_SECRET=<per `openssl rand -hex 32` erzeugen>
FRONTEND_PORT=8080
```

- **`DB_HOST`**: Da MariaDB als eigenständiges Synology-Paket läuft (nicht im selben Docker-Compose-Netz), muss der Backend-Container über die normale Netzwerkadresse der NAS zugreifen. `localhost`/`127.0.0.1` zeigt im Container auf sich selbst, nicht auf den Host — deshalb die LAN-IP der NAS eintragen, nicht `localhost` und nicht zwingend die DDNS-Adresse (NAT-Loopback auf sich selbst funktioniert nicht überall zuverlässig).
- **`IMAGES_DIR`**: Muss explizit gesetzt werden, sonst mountet Docker das leere Default-Verzeichnis `./data_images`. Auf den Zielpfad aus Abschnitt „Kartenbilder übertragen" unten setzen.
- **`JWT_SECRET`**: Pflichtfeld — das Backend bricht den Start ohne diesen Wert sofort ab (Log-Meldung dazu). Signiert die Login-Session; bei Verlust/Änderung werden alle bestehenden Sessions ungültig (einfach neu einloggen).

## 4. Kartenbilder übertragen

Die lokal gespiegelten Kartenbilder (`npm run images:download`, mehrere GB) liegen im git-ignorierten Verzeichnis `data_images/` und müssen separat auf die NAS — nicht über Git/Projekttransfer, da bewusst ausgeschlossen (Abschnitt 2).

Für einmalige/kleinere Transfers per SSH: `tar` wie in Abschnitt 2 (kein Delta, aber `rsync` funktioniert hier ohnehin nicht, siehe dortige Anmerkung). Für wiederholte Transfers vieler GB ist der einfachste Weg eine **Netzwerkfreigabe per SMB/AFP** direkt in DSM anlegen und darüber kopieren (Finder/Explorer) — kein Delta-Rsync nötig, dafür kein `--server`-Blocker.

**Aktiv seit 2026-07-20:** Eigene Synology-Freigabe `tcg_master_drive` mit eigenem Freigabe-User `tcg_master` (Zugangsdaten liegen lokal in `.env`, nicht hier — Passwörter gehören nicht in versionierte Dateien). Container laufen direkt auf der Synology, `IMAGES_DIR` zeigt auf den lokalen Pfad der Freigabe: `/volume1/tcg_master_drive/data_images`.

## 5. Container bauen und starten

**Synology-Besonderheit** (getestet auf DSM 7.1.1, Docker-Paket 20.10.3): Das mitgelieferte `docker`/`docker-compose` ist ein **setuid-root-Binary ohne Gruppenzugriff** für normale Nutzer — Befehle brauchen `sudo`. Außerdem gibt es hier nur das ältere, eigenständige `docker-compose` (Bindestrich), **nicht** das neuere `docker compose`-Subcommand (kein CLI-Plugin installiert). Zusätzlich: **kein SSH-basiertes `rsync`** möglich (der `--server`-Modus wird von DSM aus Sicherheitsgründen blockiert, `Permission denied, please try again.` unabhängig vom Client) — Code-Transfer per `tar` über SSH oder Git.

Im Container Manager per Projekt (docker-compose.yml auswählen) **oder** per SSH:

```bash
cd /volume1/docker/tcg-collection
sudo /usr/local/bin/docker-compose --env-file .env up -d --build
```

Der Backend-Container führt beim Start automatisch `knex migrate:latest` aus — die Tabellen werden also beim ersten Start angelegt (bzw. offene Migrationen nachgezogen, falls die DB schon älteren Stands ist).

## 6. Status prüfen

```bash
sudo /usr/local/bin/docker-compose ps
sudo /usr/local/bin/docker-compose logs -f backend
curl http://localhost:8080/api/health   # {"status":"ok"}
```

App im Browser: `http://<synology-ip>:8080` — zeigt zunächst den Login, siehe nächster Abschnitt.

## 7. Ersten Login-Nutzer anlegen

Ohne Nutzer kommt niemand über den Login hinaus (es gibt bewusst keine Registrierung im Frontend, siehe [docs/API.md](API.md#authentifizierung)). Das Anlegen übernimmt `create-user.sh` im Projekt-Root — es installiert bei Bedarf die Backend-Abhängigkeiten und schreibt direkt gegen die in `.env` konfigurierte Datenbank (`DB_HOST`/`DB_PORT`), von einem Rechner mit Netzwerkzugriff darauf (z. B. dem Entwicklungsrechner, nicht zwingend die Synology selbst):

```bash
chmod +x create-user.sh   # einmalig
./create-user.sh <username> <passwort>
```

Erneuter Aufruf mit demselben `<username>` setzt dessen Passwort neu (nützlich bei Passwort-Verlust). Weitere Nutzer entsprechend mit anderem Usernamen anlegen.

## 8. Kataloge importieren

Falls die Ziel-Datenbank bereits befüllt ist (z. B. weil Migration + Import vorher schon lokal gegen dieselbe MariaDB gelaufen sind), ist dieser Schritt bereits erledigt — nach Schritt 5/6 sollten Karten/Sets sofort sichtbar sein, ohne dass hier etwas getan werden muss.

Für einen frischen Katalog: Entweder im Dashboard der App auf **„Katalog importieren"** je Spiel klicken (unterstützt: `yugioh`, `magic`, `pokemon`, `lorcana`, `riftbound`), oder per API — seit der Login-Pflicht (Abschnitt 7) braucht ein `curl`-Aufruf dafür das Session-Cookie:

```bash
curl -c cookies.txt -X POST http://<synology-ip>:8080/api/v1/auth/login \
  -H 'Content-Type: application/json' -d '{"username":"<username>","password":"<passwort>"}'
curl -b cookies.txt -X POST http://<synology-ip>:8080/api/v1/imports/yugioh
```

`yugioh` durch den jeweiligen Spielcode ersetzen. Der Import lädt Karten, Sets und Preise von der jeweiligen Quelle (YGOPRODeck, Scryfall, pokemontcg.io, lorcanajson.org, riftcodex.com — dauert je nach Spiel und Verbindung einige Minuten bis über eine Stunde). Fortschritt ist im Dashboard sichtbar oder per `GET /api/v1/imports/latest?game=<code>` abfragbar. Ein Spiel wird nach dem ersten erfolgreichen Import automatisch aktiviert und erscheint danach in der Spielauswahl sowie im Delta-Cron (Abschnitt 9).

Kartenbilder sind über den Dashboard-Button „Bilder aktualisieren" (bzw. `POST /api/v1/images/download?game=<code>`) nachziehbar, falls nach Abschnitt 4 neue Karten ohne Bild-Pfad hinzugekommen sind.

## 9. Katalog automatisch aktuell halten (Delta-Import per Zeitplan)

Jeder erneute Import ist ein **Delta-Import**: Er prüft zuerst per Versions-Check, ob sich an der Quelle überhaupt etwas geändert hat, und schreibt danach nur tatsächlich geänderte oder neue Karten/Prints (Details: [docs/DATENBANK.md](DATENBANK.md#delta-import-content_hash-import_state)). Dadurch lässt er sich gefahrlos regelmäßig automatisiert laufen lassen, ohne bei jedem Lauf den kompletten Katalog neu zu schreiben.

Im Repo liegt dafür `cron-delta-import.sh` — es ruft im laufenden Backend-Container den Delta-Import für alle aktiven Spiele auf:

```bash
chmod +x cron-delta-import.sh   # einmalig
./cron-delta-import.sh          # manueller Testlauf
```

Einrichtung als Zeitplan im DSM:

1. **Systemsteuerung → Aufgabenplaner → Erstellen → Geplante Aufgabe → Benutzerdefiniertes Skript**
2. Zeitplan z. B. täglich um 04:00 Uhr
3. Aufgabeneinstellungen → Skript ausführen:
   ```bash
   bash /volume1/docker/tcg-collection/cron-delta-import.sh
   ```
   (Pfad an den tatsächlichen Projektordner auf der Synology anpassen.)

Bei unveränderter Quelle endet der Lauf in wenigen Sekunden ohne jede Schreiblast auf die Datenbank; bei Änderungen werden nur die betroffenen Zeilen aktualisiert.

## 10. HTTPS (Let's Encrypt + DSM-Reverse-Proxy)

Für Zugriff von außen ohne Browser-Warnung. Läuft komplett über DSM-Bordmittel, kein zusätzlicher Container nötig.

1. **Zertifikat**: Systemsteuerung → Sicherheit → Zertifikat → Hinzufügen → „Ein Zertifikat von Let's Encrypt holen" → Domain (die eigene `*.myds.me`-DDNS-Adresse oder eigene Domain), E-Mail. Voraussetzung: Port 80 extern auf die NAS weitergeleitet (für den HTTP-01-Check).
2. **Reverse Proxy**: Systemsteuerung → Anmeldeportal → Erweitert → Reverse Proxy → Erstellen.
   - Quelle: Protokoll HTTPS, Hostname = die eigene DDNS-Adresse, **Port 8443** (nicht 443!)
   - Ziel: Protokoll HTTP, Hostname = **LAN-IP der NAS** (nicht `localhost` — siehe Warnung unten), Port = `FRONTEND_PORT` aus der `.env` (Default 8080)
3. **Zertifikat zuweisen**: Systemsteuerung → Sicherheit → Zertifikat → Einstellungen → den neuen Reverse-Proxy-Dienst auf das Let's-Encrypt-Zertifikat umstellen.
4. **Router**: Portweiterleitung extern **443** → intern **8443** (Ziel-IP = LAN-IP der NAS), TCP. Nach außen bleibt die Adresse ohne Portangabe (`https://<domain>/`).
5. **`.env`**: `COOKIE_SECURE=true` setzen (Login-Cookie nur noch über HTTPS gesendet), danach Backend neu starten: `sudo /usr/local/bin/docker-compose --env-file .env up -d backend`.

**Zwei Fallstricke, die in der Praxis schon einmal aufgetreten sind:**
- **Nicht Port 443 als Reverse-Proxy-Quelle verwenden, wenn die Quelle die eigene DDNS-Adresse (`*.myds.me`) ist.** DSMs eigenes QuickConnect-/Anmeldeportal registriert diese Kombination in der Haupt-`nginx.conf` zuerst — eine eigene Reverse-Proxy-Regel für denselben Hostnamen+Port wird dann stillschweigend ignoriert (kein Fehler, es antwortet einfach weiter die DSM-Login-Seite). Deshalb Port 8443 intern + Portumsetzung im Router.
- **Nicht `localhost` als Reverse-Proxy-Ziel verwenden** — DSMs nginx-Prozess erreicht darüber den Docker-Container nicht zuverlässig (gleiches Muster wie bei `DB_HOST`, siehe Abschnitt 3). Immer die LAN-IP der NAS eintragen.

## Updates einspielen

Solange per `tar` deployt wird (Abschnitt 2): den `tar`-Befehl aus Abschnitt 2 erneut ausführen, dann auf der NAS neu bauen (siehe Synology-Besonderheit in Abschnitt 5 zu `sudo`/`docker-compose`):

```bash
ssh synology-tcg
cd /volume1/docker/tcg-collection
sudo /usr/local/bin/docker-compose --env-file .env up -d --build
```

Sobald über Git geklont wurde:

```bash
cd tcg-collection
git pull
sudo /usr/local/bin/docker-compose --env-file .env up -d --build
```

Neue Datenbankmigrationen laufen beim Neustart des Backend-Containers automatisch mit.

## Backup

Die Anwendung selbst ist zustandslos — der einzig relevante Datenbestand ist die MariaDB-Datenbank `tcg_collection`. Ergänzend zu einer ohnehin auf der Synology vorhandenen MariaDB-Sicherung (z. B. Hyper Backup) liegt im Repo `backup-db.sh` — ein Wrapper um `mysqldump`/`mariadb-dump`, der die DB per `.env`-Zugangsdaten sichert, gzip-komprimiert unter `backups/` ablegt und Backups älter als 14 Tage automatisch aufräumt (konfigurierbar):

```bash
chmod +x backup-db.sh   # einmalig
./backup-db.sh          # manueller Testlauf → backups/tcg_collection_<timestamp>.sql.gz
```

Voraussetzung: ein DB-Client-Tool im `PATH` des ausführenden Rechners (nicht im schlanken Backend-Container enthalten). **Empfohlen ist `mariadb-dump`** (macOS z. B. `brew install mariadb`) statt des Oracle-`mysqldump`-Clients (`mysql-client`) — dessen neuere Versionen (≥8.0.34) versuchen bei `--routines` unaufgefordert, MySQL-Enterprise-Data-Masking-Policies zu dumpen, was gegen MariaDB mit einem Privilegien-Fehler abbricht und ein unvollständiges Backup erzeugt. Das Skript erkennt `mariadb-dump` automatisch, wenn vorhanden.

Restore im Fehlerfall:

```bash
gunzip -c backups/tcg_collection_<timestamp>.sql.gz | mariadb -h <DB_HOST> -P <DB_PORT> -u tcg -p tcg_collection
```

Für automatisierte Backups eignet sich derselbe Weg wie beim Delta-Import-Cron (Abschnitt 9): `backup-db.sh` als eigenen Task-Scheduler-Job auf einem Rechner mit Netzwerkzugriff auf die DB einrichten (z. B. täglich nachts, auf der Synology selbst nur, wenn dort ein passendes DB-Client-Paket verfügbar ist — sonst vom Entwicklungsrechner oder einem anderen Dauerbetrieb-Host aus per Cron).

## Ports & Firewall

| Port | Zweck |
|---|---|
| 8080 (Host, konfigurierbar) | Frontend / einziger öffentlicher Zugang |
| 3001 (nur intern, Docker-Netz) | Backend-API |
| DB-Port der Synology-MariaDB | nur intern erreichbar halten, nicht ins Internet weiterleiten |

Nur Port `FRONTEND_PORT` muss (falls gewünscht) im Router/Reverse Proxy freigegeben werden — die Backend-API ist ausschließlich über den nginx-Proxy des Frontends erreichbar.
