/**
 * Unterstützung für Delta-Importe: Content-Hashes je Karte/Print,
 * damit unveränderte Datensätze bei einem erneuten Import übersprungen
 * werden können, sowie eine Tabelle, die die zuletzt gesehene
 * Quellversion je Spiel merkt (um komplette Re-Fetches zu vermeiden,
 * wenn sich an der Quelle gar nichts geändert hat).
 */

/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  await knex.schema.alterTable('cards', (t) => {
    t.string('content_hash', 32).nullable();
  });
  await knex.schema.alterTable('card_prints', (t) => {
    t.string('content_hash', 32).nullable();
  });

  await knex.schema.createTable('import_state', (t) => {
    t.increments('id').primary();
    t.integer('game_id').unsigned().notNullable().unique().references('games.id');
    t.string('source_version', 255).nullable(); // z. B. YGOPRODeck database_version|last_update
    t.timestamp('checked_at').notNullable().defaultTo(knex.fn.now());
  });
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('import_state');
  await knex.schema.alterTable('card_prints', (t) => {
    t.dropColumn('content_hash');
  });
  await knex.schema.alterTable('cards', (t) => {
    t.dropColumn('content_hash');
  });
};
