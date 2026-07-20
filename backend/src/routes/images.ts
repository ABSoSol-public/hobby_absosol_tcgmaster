import { FastifyInstance } from 'fastify';
import { db } from '../db';
import { runImageDownload } from '../services/imageDownload';

/** Führt einen Bild-Download als Hintergrund-Job aus und protokolliert ihn in image_jobs. */
export async function runImageDownloadJob(
  gameCode: string | undefined,
  log: (msg: string) => void = console.log
): Promise<number> {
  let gameId: number | null = null;
  if (gameCode) {
    const game = await db('games').where({ code: gameCode }).first();
    if (!game) throw new Error(`Spiel "${gameCode}" nicht gefunden.`);
    gameId = game.id;
  }

  const running = await db('image_jobs')
    .where('status', 'running')
    .modify((q) => (gameId === null ? q.whereNull('game_id') : q.where('game_id', gameId)))
    .first();
  if (running) throw new Error('Es läuft bereits eine Bild-Aktualisierung für diesen Bereich.');

  const [jobId] = await db('image_jobs').insert({ game_id: gameId, status: 'running' });

  // Zwischenstand-Updates strikt nacheinander verketten: da runImageDownload
  // seine letzte Fortschrittsmeldung (DB-Sync-Ergebnis) ungeawaited kurz vor
  // dem Rückgabewert schreibt, würde sie sonst nebenläufig mit dem finalen
  // Abschluss-Update um die Zeile konkurrieren und diese ggf. überschreiben.
  let messageQueue: Promise<unknown> = Promise.resolve();
  const setMessage = (msg: string) => {
    messageQueue = messageQueue.then(() => db('image_jobs').where('id', jobId).update({ message: msg })).catch(() => {});
  };

  // Bewusst nicht awaiten — der Job läuft im Hintergrund weiter,
  // der Status ist über GET /images/latest abrufbar.
  runImageDownload({ gameCode }, (msg) => {
    log(`[images:${gameCode || 'alle'}] ${msg}`);
    setMessage(msg);
  })
    .then(async (stats) => {
      const message = stats.noopDownload
        ? 'Bilder waren bereits aktuell — kein Download nötig.'
        : `Fertig: ${stats.downloaded} geladen, ${stats.failed} fehlgeschlagen, ${stats.pathsSet} Pfade aktualisiert.`;
      await messageQueue; // sicherstellen, dass kein Zwischenstand mehr nachläuft
      await db('image_jobs').where('id', jobId).update({
        status: stats.failed > 0 && stats.downloaded === 0 ? 'failed' : 'completed',
        finished_at: db.fn.now(),
        stats: JSON.stringify(stats),
        message,
      });
    })
    .catch(async (err) => {
      log(`[images:${gameCode || 'alle'}] FEHLER: ${err.message}`);
      await messageQueue;
      await db('image_jobs').where('id', jobId).update({
        status: 'failed',
        finished_at: db.fn.now(),
        message: err.message,
      });
    });

  return jobId;
}

export async function imageRoutes(app: FastifyInstance) {
  // Bild-Update anstoßen (läuft asynchron). Ohne ?game=... über alle Spiele.
  app.post<{ Querystring: { game?: string } }>('/images/download', async (req, reply) => {
    try {
      const jobId = await runImageDownloadJob(req.query.game, app.log.info.bind(app.log));
      return reply.code(202).send({ data: { jobId, status: 'running' } });
    } catch (err) {
      return reply.code(409).send({ error: { message: (err as Error).message, statusCode: 409 } });
    }
  });

  // Letzten Bild-Job abfragen (optional je Spiel)
  app.get<{ Querystring: { game?: string } }>('/images/latest', async (req) => {
    const query = db('image_jobs')
      .leftJoin('games', 'image_jobs.game_id', 'games.id')
      .select('image_jobs.*', 'games.code as game_code')
      .orderBy('image_jobs.id', 'desc');
    if (req.query.game) query.where('games.code', req.query.game);
    else query.whereNull('image_jobs.game_id');
    const job = await query.first();
    return { data: job ?? null };
  });
}
