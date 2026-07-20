// Knex-Konfiguration für Migrationen und Laufzeit.
// Liest die .env im Projekt-Root (eine Ebene über backend/) oder lokale Umgebungsvariablen.
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
require('dotenv').config(); // erlaubt zusätzlich backend/.env bzw. bereits gesetzte Variablen

module.exports = {
  client: 'mysql2',
  connection: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'tcg',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'tcg_collection',
    charset: 'utf8mb4',
  },
  pool: { min: 0, max: 10 },
  migrations: {
    directory: path.resolve(__dirname, 'migrations'),
    tableName: 'knex_migrations',
  },
};
