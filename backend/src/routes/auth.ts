import { FastifyInstance } from 'fastify';
import { config } from '../config';
import { db } from '../db';
import { verifyPassword } from '../services/auth';

const COOKIE_NAME = 'token';
// Gültiger bcrypt-Hash (Kostenfaktor 12) eines Zufallswerts — nur Zeit-Angleichung.
const DUMMY_HASH = '$2b$12$K8ymDssSJOuBf.cigq2pb.JA6cRfrpcu1Mc3BXETBnhaYK.M9joUe';
const SESSION_SECONDS = 60 * 60 * 24 * 30; // 30 Tage

/**
 * Login/Logout/Session-Check. Bewusst keine Registrierungs-Route — Accounts
 * legt ein Admin per `npm run user:create -- <username> <passwort>` an
 * (siehe docs/DEPLOYMENT-SYNOLOGY.md), damit die App auch außerhalb des LAN
 * nicht offen für Selbstregistrierung ist.
 */
export async function authRoutes(app: FastifyInstance) {
  app.post<{ Body: { username?: string; password?: string } }>(
    '/auth/login',
    // Deutlich strenger als das globale Rate-Limit — bremst Brute-Force-Versuche
    // auf Nutzername/Passwort aus, ohne normale Logins zu behindern.
    { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const { username, password } = req.body || {};
      if (!username || !password) {
        return reply.code(400).send({ error: { message: 'Benutzername und Passwort erforderlich', statusCode: 400 } });
      }

      const user = await db('users').where({ username }).first();
      // Auch bei unbekanntem Nutzer einen bcrypt-Vergleich ausführen, damit die
      // Antwortzeit nicht verrät, ob der Benutzername existiert.
      const valid = await verifyPassword(password, user?.password_hash ?? DUMMY_HASH) && !!user;
      if (!valid) {
        return reply.code(401).send({ error: { message: 'Benutzername oder Passwort falsch', statusCode: 401 } });
      }

      const token = await reply.jwtSign(
        { sub: user.id, username: user.username, role: user.role },
        { expiresIn: SESSION_SECONDS }
      );
      reply.setCookie(COOKIE_NAME, token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: config.auth.cookieSecure,
        path: '/',
        maxAge: SESSION_SECONDS,
      });
      return { data: { id: user.id, username: user.username, role: user.role } };
    }
  );

  app.post('/auth/logout', async (_req, reply) => {
    reply.clearCookie(COOKIE_NAME, { path: '/' });
    return reply.code(204).send();
  });

  // Session-Check beim App-Start im Frontend (Cookie vorhanden & gültig?)
  app.get('/auth/me', { preHandler: [app.requireAuth] }, async (req) => {
    return { data: { id: req.user.sub, username: req.user.username, role: req.user.role } };
  });
}
