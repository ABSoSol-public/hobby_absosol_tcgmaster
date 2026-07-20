// CLI: Kartenbilder lokal spiegeln — lädt alle in der DB referenzierten Bilder
// (cards.image_url / cards.image_small_url / card_sets.image_url) in ein lokales
// Verzeichnis, damit sie auf der Synology liegen und nicht bei jedem Seitenaufruf
// von den externen Quellen (YGOPRODeck, Scryfall, pokemontcg.io, lorcanajson.org)
// geladen werden müssen. YGOPRODeck verlangt das sogar ausdrücklich (kein Hotlinking).
//
// Die eigentliche Download-/Sync-Logik steckt in services/imageDownload.ts und
// wird auch vom Update-Button im Frontend verwendet (POST /api/v1/images/download).
//
// Verwendung:
//   npm run images:download                        # alle Spiele, alle fehlenden Bilder
//   npm run images:download -- yugioh              # nur ein Spiel
//   npm run images:download -- --dry-run           # nur zählen, nichts laden
//   npm run images:download -- --limit 50          # Probelauf mit 50 Bildern
//   npm run images:download -- --concurrency 4 --delay-ms 100   # schneller (Quellen-Limits beachten!)
//   npm run images:download -- --sync-only         # nichts laden, nur DB-Pfade abgleichen
//
// Zielverzeichnis: IMAGES_DIR aus .env (Default: <projektroot>/data_images).
// Auf der Synology z. B. IMAGES_DIR=/volume1/docker/tcg/images setzen bzw. das
// Verzeichnis als Volume in den Backend-Container mounten.
//
// Ablage-Layout (deterministisch über die internen DB-IDs, dadurch idempotent):
//   <IMAGES_DIR>/<spielcode>/cards/<cardId>.<ext>          (großes Bild)
//   <IMAGES_DIR>/<spielcode>/cards/<cardId>_small.<ext>    (Vorschaubild)
//   <IMAGES_DIR>/<spielcode>/sets/<setId>.<ext>            (Set-Logo/-Icon)
//
// Das Skript ist wiederaufnehmbar: bereits vorhandene Dateien werden übersprungen,
// ein Abbruch (Strg+C, Netzwerkfehler) kann also jederzeit einfach neu gestartet
// werden. Downloads laufen erst in eine .part-Datei und werden dann umbenannt,
// damit keine halben Bilder als "fertig" gewertet werden.
import { db } from '../db';
import { config } from '../config';
import { runImageDownload } from '../services/imageDownload';

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== '--');
  const flagValue = (name: string): string | undefined => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const dryRun = args.includes('--dry-run');
  const syncOnly = args.includes('--sync-only');
  const limit = Number(flagValue('--limit') || 0);
  // Defaults bewusst höflich: max. ~10 Anfragen/s gesamt — unter den Limits
  // aller vier Quellen (Scryfall wünscht ≤10/s, YGOPRODeck erlaubt 20/s).
  const concurrency = Number(flagValue('--concurrency') || 2);
  const delayMs = Number(flagValue('--delay-ms') || 200);
  // Erster Positional-Parameter (Werte von --limit & Co. überspringen) = Spielcode
  const valueFlags = new Set(['--limit', '--concurrency', '--delay-ms']);
  let gameCode: string | undefined;
  for (let i = 0; i < args.length; i++) {
    if (valueFlags.has(args[i])) i++;
    else if (!args[i].startsWith('--')) {
      gameCode = args[i];
      break;
    }
  }

  console.log(`Bild-Spiegelung${gameCode ? ` für ${gameCode}` : ' für alle Spiele'} → ${config.imagesDir}`);

  const stats = await runImageDownload({ gameCode, limit, concurrency, delayMs, dryRun, syncOnly }, console.log);

  await db.destroy();
  process.exit(stats.failed > 0 ? 1 : 0);
}

main().catch(async (err) => {
  console.error(err.message);
  await db.destroy();
  process.exit(1);
});
