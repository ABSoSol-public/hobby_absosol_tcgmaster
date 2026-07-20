// CLI-Import: npm run import:yugioh [-- --force]
// Läuft denselben Job wie POST /api/v1/imports/yugioh, aber im Vordergrund mit Konsolenausgabe.
// Ohne --force: Delta-Import (nur geänderte/neue Karten & Prints, überspringt alles bei unveränderter Quelle).
// Mit --force: ignoriert den Versions-Kurzschluss und vergleicht jeden Datensatz neu.
import { db } from '../db';
import { runImportJob } from '../routes/imports';

async function main() {
  const force = process.argv.includes('--force');
  console.log(`Starte Yu-Gi-Oh!-Katalogimport${force ? ' (--force: vollständiger Neuvergleich)' : ' (Delta)'} …`);
  const jobId = await runImportJob('yugioh', console.log, force);

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
