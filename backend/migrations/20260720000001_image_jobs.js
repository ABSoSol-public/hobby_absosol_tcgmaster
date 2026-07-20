/**
 * Protokolliert Bild-Download-Läufe, die über den "Bilder aktualisieren"-Button
 * im Frontend angestoßen werden (POST /api/v1/images/download) — analog zu
 * import_jobs für den Katalog-Import. game_id ist nullable, weil ein Lauf auch
 * ohne Spiel-Einschränkung über alle Spiele laufen kann.
 */

/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  await knex.schema.createTable('image_jobs', (t) => {
    t.increments('id').primary();
    t.integer('game_id').unsigned().nullable().references('games.id');
    t.enum('status', ['running', 'completed', 'failed']).notNullable().defaultTo('running');
    t.timestamp('started_at').notNullable().defaultTo(knex.fn.now());
    t.timestamp('finished_at').nullable();
    t.text('message').nullable();
    t.json('stats').nullable(); // { totalRefs, alreadyLocal, downloaded, failed, pathsSet, pathsCleared }
  });
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('image_jobs');
};
