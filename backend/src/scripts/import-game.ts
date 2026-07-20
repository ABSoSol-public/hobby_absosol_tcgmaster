// CLI-Import für ein beliebiges Spiel: npm run import:game -- <spielcode> [--force]
// z. B.: npm run import:game -- lorcana
// Läuft denselben Job wie POST /api/v1/imports/:code, aber im Vordergrund mit Konsolenausgabe.
import { db } from '../db';
import { importers } from '../services/importers';
import { runImportJob } from '../routes/imports';

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== '--');
  const force = args.includes('--force');
  const gameCode = args.find((a) => !a.startsWith('--'));
  if (!gameCode || !importers[gameCode]) {
    console.error(`Verwendung: npm run import:game -- <spielcode> [--force]`);
    console.error(`Verfügbare Spiele: ${Object.keys(importers).join(', ')}`);
    process.exit(1);
  }

  console.log(`Starte ${gameCode}-Katalogimport${force ? ' (--force: vollständiger Neuvergleich)' : ' (Delta)'} …`);
  const jobId = await runImportJob(gameCode, console.log, force);

  // Auf Abschluss des Hintergrund-Jobs warten
  for (;;) {
    await new Promise((r) => setTimeout(r, 2000));
    const job = await db('import_jobs').where('id', jobId).first();
    if (job.status !== 'running') {
      console.log(`Job ${jobId}: ${job.status} — ${job.message}`);
      await db.destroy();
      process.exit(job.status === 'completed' ? 0 : 1);
    }
  }
}

main().catch(async (err) => {
  console.error(err.message);
  await db.destroy();
  process.exit(1);
});
