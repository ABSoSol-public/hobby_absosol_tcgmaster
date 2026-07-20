// Legt einen Login-Nutzer an bzw. setzt bei bestehendem Benutzernamen das
// Passwort neu (Upsert) — es gibt bewusst keine Selbstregistrierung im Frontend.
//   npm run user:create -- <username> <passwort>
import { db } from '../db';
import { hashPassword } from '../services/auth';

async function main() {
  const [username, password] = process.argv.slice(2);
  if (!username || !password) {
    console.error('Verwendung: npm run user:create -- <username> <passwort>');
    process.exit(1);
  }
  if (password.length < 8) {
    console.error('Das Passwort muss mindestens 8 Zeichen lang sein.');
    process.exit(1);
  }

  const password_hash = await hashPassword(password);
  const existing = await db('users').where({ username }).first();

  if (existing) {
    await db('users').where({ id: existing.id }).update({ password_hash });
    console.log(`Passwort für "${username}" aktualisiert.`);
  } else {
    await db('users').insert({ username, password_hash });
    console.log(`Nutzer "${username}" angelegt.`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
