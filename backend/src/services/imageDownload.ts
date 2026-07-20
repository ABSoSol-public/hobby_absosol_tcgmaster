// Kern-Logik der Bild-Spiegelung — von backend/src/scripts/download-images.ts (CLI)
// und backend/src/routes/images.ts (Update-Button im Frontend) gemeinsam genutzt.
//
// Lädt alle in der DB referenzierten Bilder (cards.image_url/image_small_url,
// card_sets.image_url), die lokal noch fehlen, nach IMAGES_DIR und gleicht
// danach cards.image_path/image_small_path/card_sets.image_path mit dem
// Dateisystem ab. Wiederaufnehmbar: vorhandene Dateien werden übersprungen,
// Downloads laufen erst in eine .part-Datei und werden dann umbenannt.
import { mkdir, rename, stat, unlink, writeFile } from 'fs/promises';
import path from 'path';
import { config } from '../config';
import { db } from '../db';

interface Task {
  url: string;
  dest: string; // absoluter Zielpfad
  rel: string; // Pfad relativ zu IMAGES_DIR (Wert für die DB, mit "/")
  table: 'cards' | 'card_sets';
  rowId: number;
  column: 'image_path' | 'image_small_path';
  currentPath: string | null; // aktueller DB-Wert (vermeidet unnötige Updates)
}

export interface ImageDownloadOptions {
  gameCode?: string;
  limit?: number;
  concurrency?: number;
  delayMs?: number;
  dryRun?: boolean;
  syncOnly?: boolean;
}

export interface ImageDownloadStats {
  totalRefs: number;
  alreadyLocal: number;
  downloaded: number;
  failed: number;
  pathsSet: number;
  pathsCleared: number;
  /** true, wenn nichts heruntergeladen werden musste (Bilder waren bereits aktuell) */
  noopDownload: boolean;
  errors: { url: string; message: string }[];
}

const KNOWN_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif', '.svg']);

/** Dateiendung aus der Quell-URL ableiten (Query-Strings wie bei Scryfall ignorieren). */
function extFromUrl(url: string): string {
  try {
    const ext = path.extname(new URL(url).pathname).toLowerCase();
    return KNOWN_EXTENSIONS.has(ext) ? ext : '.jpg';
  } catch {
    return '.jpg';
  }
}

async function fileExists(p: string): Promise<boolean> {
  try {
    const s = await stat(p);
    return s.isFile() && s.size > 0;
  } catch {
    return false;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Ein Bild mit Retry/Backoff laden; erst .part schreiben, dann umbenennen. */
async function download(task: Task, attempts = 3): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(task.url, {
        headers: { 'User-Agent': 'tcg-collection-manager (Bild-Spiegelung fuer Privatsammlung)' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length === 0) throw new Error('leere Antwort');
      const part = `${task.dest}.part`;
      await writeFile(part, buf);
      await rename(part, task.dest);
      return;
    } catch (err) {
      await unlink(`${task.dest}.part`).catch(() => {});
      if (attempt >= attempts) throw err;
      // 429/5xx bzw. Netzwerkfehler: kurz warten und erneut versuchen
      await sleep(attempt * 2000);
    }
  }
}

/** Alle Bild-Aufgaben aus der DB einsammeln (nur Zeilen mit gesetzter URL). */
async function collectTasks(baseDir: string, gameCode?: string): Promise<Task[]> {
  const tasks: Task[] = [];
  const add = (
    table: Task['table'],
    rowId: number,
    column: Task['column'],
    currentPath: string | null,
    url: string,
    ...rel: string[]
  ) => {
    tasks.push({
      url,
      dest: path.join(baseDir, ...rel),
      rel: rel.join('/'),
      table,
      rowId,
      column,
      currentPath,
    });
  };

  const cards = await db('cards')
    .join('games', 'games.id', 'cards.game_id')
    .modify((q) => {
      if (gameCode) q.where('games.code', gameCode);
    })
    .select(
      'cards.id',
      'games.code as game',
      'cards.image_url',
      'cards.image_small_url',
      'cards.image_path',
      'cards.image_small_path'
    );
  for (const c of cards) {
    if (c.image_url)
      add('cards', c.id, 'image_path', c.image_path, c.image_url, c.game, 'cards', `${c.id}${extFromUrl(c.image_url)}`);
    if (c.image_small_url)
      add(
        'cards',
        c.id,
        'image_small_path',
        c.image_small_path,
        c.image_small_url,
        c.game,
        'cards',
        `${c.id}_small${extFromUrl(c.image_small_url)}`
      );
  }

  const sets = await db('card_sets')
    .join('games', 'games.id', 'card_sets.game_id')
    .modify((q) => {
      if (gameCode) q.where('games.code', gameCode);
    })
    .whereNotNull('card_sets.image_url')
    .select('card_sets.id', 'games.code as game', 'card_sets.image_url', 'card_sets.image_path');
  for (const s of sets) {
    add('card_sets', s.id, 'image_path', s.image_path, s.image_url, s.game, 'sets', `${s.id}${extFromUrl(s.image_url)}`);
  }

  return tasks;
}

/**
 * DB-Spalten image_path/image_small_path mit dem Dateisystem abgleichen:
 * Datei vorhanden → relativer Pfad, Datei fehlt → NULL. Nur geänderte
 * Zeilen werden geschrieben, in kleinen Parallel-Batches.
 */
async function syncDbPaths(tasks: Task[], log: (msg: string) => void): Promise<{ set: number; cleared: number }> {
  const updates: { task: Task; value: string | null }[] = [];
  for (const t of tasks) {
    const value = (await fileExists(t.dest)) ? t.rel : null;
    if (value !== t.currentPath) updates.push({ task: t, value });
  }

  const result = { set: 0, cleared: 0 };
  const batchSize = 25;
  for (let i = 0; i < updates.length; i += batchSize) {
    await Promise.all(
      updates.slice(i, i + batchSize).map(({ task, value }) =>
        db(task.table)
          .where('id', task.rowId)
          .update({ [task.column]: value })
      )
    );
    for (const u of updates.slice(i, i + batchSize)) {
      if (u.value) result.set++;
      else result.cleared++;
    }
    const done = Math.min(i + batchSize, updates.length);
    if (done % 5000 < batchSize && done < updates.length) log(`  DB-Sync: ${done}/${updates.length} …`);
  }
  return result;
}

/**
 * Fehlende Bilder herunterladen (sofern nicht --sync-only/--dry-run) und die
 * lokalen Pfade in der DB nachziehen. Wirft nicht bei Download-Fehlern
 * einzelner Bilder — die zählen als "failed" in den Stats.
 */
export async function runImageDownload(
  opts: ImageDownloadOptions,
  log: (msg: string) => void = console.log
): Promise<ImageDownloadStats> {
  const baseDir = config.imagesDir;
  const concurrency = opts.concurrency ?? 2;
  const delayMs = opts.delayMs ?? 200;

  if (opts.gameCode) {
    const game = await db('games').where('code', opts.gameCode).first();
    if (!game) {
      const known = (await db('games').select('code')).map((g) => g.code).join(', ');
      throw new Error(`Unbekanntes Spiel "${opts.gameCode}". Verfügbar: ${known}`);
    }
  }

  const allTasks = await collectTasks(baseDir, opts.gameCode);
  log(`${allTasks.length} Bild-Referenzen in der DB gefunden. Prüfe, was schon vorhanden ist …`);

  let downloaded = 0;
  let failed = 0;
  let alreadyLocal = 0;
  let tasks: Task[] = [];
  const errors: { url: string; message: string }[] = [];

  if (!opts.syncOnly) {
    const pending: Task[] = [];
    for (const t of allTasks) {
      if (await fileExists(t.dest)) alreadyLocal++;
      else pending.push(t);
    }
    tasks = opts.limit && opts.limit > 0 ? pending.slice(0, opts.limit) : pending;
    log(`${alreadyLocal} bereits vorhanden, ${tasks.length} zu laden${opts.limit ? ` (--limit ${opts.limit})` : ''}.`);
  }

  if (opts.dryRun) {
    log('--dry-run: es wird nichts geladen und nichts in die DB geschrieben.');
    return {
      totalRefs: allTasks.length,
      alreadyLocal,
      downloaded: 0,
      failed: 0,
      pathsSet: 0,
      pathsCleared: 0,
      noopDownload: true,
      errors: [],
    };
  }

  if (!opts.syncOnly && tasks.length > 0) {
    const dirs = new Set(tasks.map((t) => path.dirname(t.dest)));
    for (const d of dirs) await mkdir(d, { recursive: true });

    let cursor = 0;
    const started = Date.now();
    const worker = async () => {
      for (;;) {
        const i = cursor++;
        if (i >= tasks.length) return;
        const t = tasks[i];
        try {
          await download(t);
          downloaded++;
        } catch (err) {
          failed++;
          errors.push({ url: t.url, message: (err as Error).message });
        }
        const done = downloaded + failed;
        if (done % 250 === 0) {
          const rate = done / ((Date.now() - started) / 1000);
          const etaMin = Math.round((tasks.length - done) / rate / 60);
          log(`  ${done}/${tasks.length} (${failed} Fehler, ~${etaMin} min verbleibend)`);
        }
        await sleep(delayMs);
      }
    };
    await Promise.all(Array.from({ length: concurrency }, worker));

    log(`Fertig: ${downloaded} geladen, ${alreadyLocal} übersprungen (schon vorhanden), ${failed} fehlgeschlagen.`);
    if (errors.length > 0) {
      log('Fehlgeschlagene Downloads (erneuter Lauf versucht nur diese noch einmal):');
      for (const e of errors.slice(0, 20)) log(`  ${e.url} — ${e.message}`);
      if (errors.length > 20) log(`  … und ${errors.length - 20} weitere`);
    }
  }

  log('Gleiche lokale Pfade mit der DB ab …');
  const sync = await syncDbPaths(allTasks, log);
  log(`DB-Sync: ${sync.set} Pfade gesetzt/aktualisiert, ${sync.cleared} entfernt (Datei fehlt).`);

  return {
    totalRefs: allTasks.length,
    alreadyLocal,
    downloaded,
    failed,
    pathsSet: sync.set,
    pathsCleared: sync.cleared,
    noopDownload: !opts.syncOnly && tasks.length === 0,
    errors,
  };
}
