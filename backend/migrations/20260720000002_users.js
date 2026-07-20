/**
 * Nutzer-Login: Zugänge werden in der DB gehalten statt fest im Code/ENV,
 * damit mehrere Personen eigene Logins bekommen können. Es gibt bewusst
 * keine öffentliche Registrierung — Accounts legt ein Admin per
 * `npm run user:create -- <username> <passwort>` an (siehe README/Deployment-Doku).
 */

/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  await knex.schema.createTable('users', (t) => {
    t.increments('id').primary();
    t.string('username', 60).notNullable().unique();
    t.string('password_hash', 100).notNullable();
    t.timestamps(true, true); // created_at / updated_at
  });
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('users');
};
