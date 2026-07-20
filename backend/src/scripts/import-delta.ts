// Delta-Import für alle aktiven Spiele: npm run import:delta
// Gedacht für regelmäßige, automatisierte Läufe (Cron / Synology Task Scheduler).
// Prüft je Spiel zuerst, ob sich die Rohdaten-Quelle überhaupt geändert hat
// (siehe services/importers/*.ts), und schreibt danach nur tatsächlich
// geänderte oder neue Karten/Prints — nie force, nie ungefragt alles neu laden.
import { db } from '../db';
import { importers } from '../services/importers';
import { runImportJob } from '../routes/imports';

async function waitForJob(jobId: number): Promise<void> {
  for (;;) {
    await new Promise((r) => setTimeout(r, 2000));
    const job = await db('import_jobs').where('id', jobId).first();
    if (job.status !== 'running') {
      console.log(`  → ${job.status}: ${job.message}`);
      if (job.status === 'failed') throw new Error(job.message || 'Import fehlgeschlagen');
      return;
    }
  }
}

async function main() {
  const games = await db('games').where('active', true);
  let failures = 0;

  for (const game of games) {
    if (!importers[game.code]) continue; // Spiel aktiv, aber (noch) kein Importer implementiert
    console.log(`\n[${game.code}] Prüfe auf Aktualisierungen …`);
    try {
      const jobId = await runImportJob(game.code, console.log, false);
      await waitForJob(jobId);
    } catch (err) {
      failures += 1;
      console.error(`[${game.code}] Fehler: ${(err as Error).message}`);
    }
  }

  await db.destroy();
  process.exit(failures > 0 ? 1 : 0);
}

main().catch(async (err) => {
  console.error(err.message);
  await db.destroy();
  process.exit(1);
});
