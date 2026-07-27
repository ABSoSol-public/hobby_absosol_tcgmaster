import Fastify, { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import fastifyCookie from '@fastify/cookie';
import fastifyHelmet from '@fastify/helmet';
import fastifyJwt from '@fastify/jwt';
import fastifyRateLimit from '@fastify/rate-limit';
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
  // trustProxy: die App läuft hinter einem Reverse Proxy (nginx-Container bzw.
  // im Deployment zusätzlich der DSM-Reverse-Proxy) — ohne das würde Rate-Limiting
  // (und jede andere IP-basierte Logik) immer nur die eine Proxy-IP sehen.
  //
  // disableRequestLogging: Fastifys eingebautes Zugriffslog (eine Zeile pro
  // eingehendem Request + eine pro Antwort) würde bei jedem einzelnen
  // Kartenbild-Request und jedem 15-Sekunden-Docker-Healthcheck mitlaufen —
  // in der Praxis mehrere tausend Log-Zeilen pro Tag ohne jeden Mehrwert.
  // Echte Fehler landen weiterhin im Log (expliziter `app.log.error()` im
  // Error-Handler unten), Import-/Bild-Download-Fortschritt ebenso (nutzt
  // `app.log.info()` gezielt in routes/imports.ts bzw. routes/images.ts).
  const app = Fastify({ logger: true, trustProxy: true, disableRequestLogging: true });

  // Security-Header (X-Content-Type-Options, Referrer-Policy, HSTS, …). Kein
  // eigenes CSP-Regelwerk nötig — dieser Prozess liefert nur JSON-API-Antworten
  // und statische Kartenbilder aus, keine HTML-Seiten mit Skripten/Styles.
  await app.register(fastifyHelmet, { contentSecurityPolicy: false });

  // Globales Rate-Limiting als Grundschutz gegen Abuse/DoS; die Login-Route
  // bekommt zusätzlich ihr eigenes, deutlich strengeres Limit (siehe routes/auth.ts).
  await app.register(fastifyRateLimit, { max: 300, timeWindow: '1 minute' });

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

  // Viewer-Rolle: darf alles einsehen (GET), aber nichts verändern. Greift erst
  // NACH requireAuth (braucht req.user aus dem verifizierten Token) — als
  // eigener Hook, damit die Route selbst nichts von Rollen wissen muss.
  app.decorate('blockWriteForViewer', async (req: FastifyRequest, reply: FastifyReply) => {
    const isMutating = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
    if (isMutating && req.user?.role === 'viewer') {
      reply.code(403).send({ error: { message: 'Nur Lesezugriff — dieser Account darf keine Änderungen vornehmen.', statusCode: 403 } });
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
        protectedCtx.addHook('onRequest', protectedCtx.blockWriteForViewer);
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
    // Bei 5xx nur eine generische Meldung nach außen geben — die echte
    // Fehlermeldung (kann DB-/Interna preisgeben) steht bereits im Server-Log.
    // 4xx-Meldungen (Validierung u. Ä.) sind bewusst für den Nutzer gedacht.
    const message = statusCode >= 500 ? 'Interner Serverfehler' : err.message;
    reply.code(statusCode).send({ error: { message, statusCode } });
  });

  return app;
}
