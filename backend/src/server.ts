import { buildApp } from './app';
import { config } from './config';

async function main() {
  if (!config.auth.jwtSecret) {
    console.error('JWT_SECRET fehlt in der .env — Login-Sessions können nicht signiert werden. Erzeugen z. B. mit `openssl rand -hex 32`.');
    process.exit(1);
  }

  const app = await buildApp();
  try {
    await app.listen({ port: config.apiPort, host: '0.0.0.0' });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
