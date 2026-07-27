// Legt einen Login-Nutzer an bzw. setzt bei bestehendem Benutzernamen das
// Passwort (und optional die Rolle) neu (Upsert) — es gibt bewusst keine
// Selbstregistrierung im Frontend.
//   npm run user:create -- <username> <passwort> [admin|viewer]
// Rolle weggelassen → "admin" bei Neuanlage; bei einem bestehenden Nutzer
// bleibt die Rolle unverändert, wenn hier nichts angegeben wird.
import { db } from '../db';
import { hashPassword } from '../services/auth';

const ROLES = ['admin', 'viewer'];

async function main() {
  const [username, password, role] = process.argv.slice(2);
  if (!username || !password) {
    console.error('Verwendung: npm run user:create -- <username> <passwort> [admin|viewer]');
    process.exit(1);
  }
  if (password.length < 8) {
    console.error('Das Passwort muss mindestens 8 Zeichen lang sein.');
    process.exit(1);
  }
  if (role && !ROLES.includes(role)) {
    console.error(`Ungültige Rolle "${role}" — erlaubt: ${ROLES.join(', ')}`);
    process.exit(1);
  }

  const password_hash = await hashPassword(password);
  const existing = await db('users').where({ username }).first();

  if (existing) {
    const patch: Record<string, unknown> = { password_hash };
    if (role) patch.role = role;
    await db('users').where({ id: existing.id }).update(patch);
    console.log(`Passwort für "${username}" aktualisiert${role ? ` (Rolle: ${role})` : ''}.`);
  } else {
    await db('users').insert({ username, password_hash, role: role || 'admin' });
    console.log(`Nutzer "${username}" angelegt (Rolle: ${role || 'admin'}).`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
