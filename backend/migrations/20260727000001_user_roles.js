/**
 * Rollen für Nutzer-Accounts: "admin" (voller Zugriff, bisheriges Verhalten)
 * und "viewer" (nur Lesezugriff — kann alles einsehen, aber nichts an der
 * Sammlung/den Decks/dem Katalog ändern). Bestehende Accounts werden auf
 * "admin" gesetzt, damit sich am bisherigen Verhalten nichts ändert.
 */

/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  await knex.schema.alterTable('users', (t) => {
    t.enum('role', ['admin', 'viewer']).notNullable().defaultTo('admin');
  });
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  await knex.schema.alterTable('users', (t) => {
    t.dropColumn('role');
  });
};
