import path from 'path';
import dotenv from 'dotenv';

// .env im Projekt-Root laden (Entwicklung); in Docker kommen die Variablen aus dem Compose-Environment.
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config();

export const config = {
  apiPort: Number(process.env.API_PORT || 3001),
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:5173').split(','),
  // Optionaler API-Key für pokemontcg.io (kostenlos; ohne Key stark ratenlimitiert)
  pokemonApiKey: process.env.POKEMON_TCG_API_KEY || '',
  // Zielverzeichnis für lokal gespiegelte Kartenbilder (Script images:download).
  // Default: <projektroot>/data_images — auf der Synology per IMAGES_DIR übersteuern.
  imagesDir: process.env.IMAGES_DIR || path.resolve(__dirname, '../../data_images'),
  auth: {
    // Signiert die Login-Session (JWT im httpOnly-Cookie). Muss gesetzt sein —
    // siehe Startup-Check in server.ts. Erzeugen z. B. mit `openssl rand -hex 32`.
    jwtSecret: process.env.JWT_SECRET || '',
    // Cookie nur über HTTPS senden — Default aus, da nginx im Docker-Setup meist
    // ohne TLS im LAN läuft (ein "Secure"-Cookie würde der Browser dann sofort
    // verwerfen, Login wirkt kurz erfolgreich, fällt aber gleich zurück auf die
    // Anmeldemaske). Nur explizit auf 'true' setzen, wenn ein TLS-Reverse-Proxy
    // vorgeschaltet ist.
    cookieSecure: process.env.COOKIE_SECURE === 'true',
  },
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'tcg',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'tcg_collection',
  },
};
