import Fastify, { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import fastifyCookie from '@fastify/cookie';
import fastifyJwt from '@fastify/jwt';
import fastifyStatic from '@fastify/static';
import { config } from './config';
import { db } from './db';
import { authRoutes } from './routes/auth';
import { gameRoutes } from './routes/games';
import { cardRoutes } from './routes/cards';
import { setRoutes } from './routes/sets';
import { collectionRoutes } from './routes/collection';
import { deckRoutes } from './routes/decks';
import { importRoutes } from './routes/imports';
import { imageRoutes } from './routes/images';

export async function buildApp() {
  const app = Fastify({ logger: true });

  await app.register(cors, { origin: config.corsOrigins });

  await app.register(fastifyCookie);
  await app.register(fastifyJwt, {
    secret: config.auth.jwtSecret,
    cookie: { cookieName: 'token', signed: false },
  });
  app.decorate('requireAuth', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      await req.jwtVerify();
    } catch {
      reply.code(401).send({ error: { message: 'Nicht angemeldet', statusCode: 401 } });
    }
  });

  // Lokal gespiegelte Kartenbilder (images:download) — die API liefert nur noch
  // /images/<pfad>-URLs aus, externe Bildquellen werden nicht mehr verlinkt.
  // Bewusst ohne Login-Zwang: reine Kartengrafiken, kein Sammlungs-/Personenbezug.
  await app.register(fastifyStatic, {
    root: config.imagesDir,
    prefix: '/images/',
    maxAge: '7d', // Bilder ändern sich praktisch nie; Dateiname = interne DB-ID
    index: false,
    list: false,
  });

  // CSV-Import: Rohtext-Body akzeptieren
  app.addContentTypeParser(['text/csv', 'text/plain'], { parseAs: 'string' }, (_req, body, done) => {
    done(null, body);
  });

  // Healthcheck (auch für Docker-Healthchecks) — bewusst ohne Login, damit der
  // Container-Healthcheck funktioniert.
  app.get('/api/health', async () => {
    await db.raw('SELECT 1');
    return { status: 'ok' };
  });

  await app.register(
    async (v1) => {
      // Login/Logout/Session-Check laufen ohne Auth-Zwang (sonst käme man nie hinein).
      await v1.register(authRoutes);

      // Alles andere braucht eine gültige Session — verschachtelter Kontext,
      // damit der Hook nur die hier registrierten Routen trifft.
      await v1.register(async (protectedCtx) => {
        protectedCtx.addHook('onRequest', protectedCtx.requireAuth);
        await protectedCtx.register(gameRoutes);
        await protectedCtx.register(cardRoutes);
        await protectedCtx.register(setRoutes);
        await protectedCtx.register(collectionRoutes);
        await protectedCtx.register(deckRoutes);
        await protectedCtx.register(importRoutes);
        await protectedCtx.register(imageRoutes);
      });
    },
    { prefix: '/api/v1' }
  );

  app.setErrorHandler((err: FastifyError, _req: FastifyRequest, reply: FastifyReply) => {
    app.log.error(err);
    const statusCode = err.statusCode && err.statusCode >= 400 ? err.statusCode : 500;
    reply.code(statusCode).send({ error: { message: err.message, statusCode } });
  });

  return app;
}
