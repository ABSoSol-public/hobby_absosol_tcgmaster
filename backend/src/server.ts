import { buildApp } from './app';
import { config } from './config';

async function main() {
  if (!config.auth.jwtSecret) {
    console.error('JWT_SECRET fehlt in der .env — Login-Sessions können nicht signiert werden. Erzeugen z. B. mit `openssl rand -hex 32`.');
    process.exit(1);
  }

  const app = await buildApp();

  // Ohne eigenen Handler beendet Node.js den kompletten Prozess bei jeder
  // unbehandelten Promise-Rejection (Standardverhalten seit Node 15) bzw. bei
  // jeder unabgefangenen Exception — meist ohne aussagekräftige Log-Zeile im
  // strukturierten Log, nur eine knappe Warnung auf stderr. Damit im Log klar
  // steht, WARUM der Container neu gestartet ist (Docker übernimmt den Neustart
  // ohnehin über `restart: unless-stopped`), hier explizit loggen und danach
  // bewusst beenden — der Prozess läuft nach einem unerwarteten Fehler
  // grundsätzlich nicht kontrolliert weiter, nur die Fehlerursache wird sichtbar.
  process.on('unhandledRejection', (reason) => {
    app.log.fatal({ err: reason }, 'Unbehandelte Promise-Rejection — Prozess wird beendet');
    process.exit(1);
  });
  process.on('uncaughtException', (err) => {
    app.log.fatal({ err }, 'Unabgefangene Exception — Prozess wird beendet');
    process.exit(1);
  });

  try {
    await app.listen({ port: config.apiPort, host: '0.0.0.0' });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
