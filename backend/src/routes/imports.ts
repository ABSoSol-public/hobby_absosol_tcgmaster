import { FastifyInstance } from 'fastify';
import { db } from '../db';
import { importers } from '../services/importers';

/** Führt einen Import als Hintergrund-Job aus und protokolliert ihn in import_jobs. */
export async function runImportJob(
  gameCode: string,
  log: (msg: string) => void = console.log,
  force = false
): Promise<number> {
  const importer = importers[gameCode];
  if (!importer) throw new Error(`Kein Importer für Spiel "${gameCode}" registriert.`);

  const game = await db('games').where({ code: gameCode }).first();
  if (!game) throw new Error(`Spiel "${gameCode}" nicht gefunden.`);

  const running = await db('import_jobs').where({ game_id: game.id, status: 'running' }).first();
  if (running) throw new Error('Es läuft bereits ein Import für dieses Spiel.');

  const [jobId] = await db('import_jobs').insert({ game_id: game.id, status: 'running' });

  // Bewusst nicht awaiten — der Job läuft im Hintergrund weiter,
  // der Status ist über GET /imports/latest abrufbar.
  importer
    .run(
      (msg) => {
        log(`[import:${gameCode}] ${msg}`);
        db('import_jobs').where('id', jobId).update({ message: msg }).catch(() => {});
      },
      { force }
    )
    .then(async (stats) => {
      const message = stats.skipped
        ? 'Katalog war bereits aktuell — kein Import nötig.'
        : `Fertig: ${stats.sets} Sets, ${stats.cardsChanged}/${stats.cards} Karten aktualisiert, ${stats.printsChanged}/${stats.prints} Prints aktualisiert`;
      // Spiel nach dem ersten erfolgreichen Import automatisch aktivieren —
      // bewusst VOR der Statusmeldung, damit niemand "completed" sieht,
      // bevor die Aktivierung geschrieben ist (CLI-Scripts beenden den
      // Prozess, sobald der Job nicht mehr "running" ist).
      await db('games').where('id', game.id).update({ active: 1 });
      await db('import_jobs').where('id', jobId).update({
        status: 'completed',
        finished_at: db.fn.now(),
        stats: JSON.stringify(stats),
        message,
      });
    })
    .catch(async (err) => {
      log(`[import:${gameCode}] FEHLER: ${err.message}`);
      await db('import_jobs').where('id', jobId).update({
        status: 'failed',
        finished_at: db.fn.now(),
        message: err.message,
      });
    });

  return jobId;
}

export async function importRoutes(app: FastifyInstance) {
  // Katalog-Import anstoßen (läuft asynchron).
  // ?force=true überspringt den Versions-Kurzschluss und vergleicht jede Karte/jeden Print neu.
  app.post<{ Params: { code: string }; Querystring: { force?: string } }>('/imports/:code', async (req, reply) => {
    try {
      const force = req.query.force === 'true';
      const jobId = await runImportJob(req.params.code, app.log.info.bind(app.log), force);
      return reply.code(202).send({ data: { jobId, status: 'running' } });
    } catch (err) {
      return reply.code(409).send({ error: { message: (err as Error).message, statusCode: 409 } });
    }
  });

  // Letzten Import-Job eines Spiels abfragen
  app.get<{ Querystring: { game?: string } }>('/imports/latest', async (req) => {
    const query = db('import_jobs')
      .join('games', 'import_jobs.game_id', 'games.id')
      .select('import_jobs.*', 'games.code as game_code')
      .orderBy('import_jobs.id', 'desc');
    if (req.query.game) query.where('games.code', req.query.game);
    const job = await query.first();
    return { data: job ?? null };
  });
}
