/**
 * Deck-Builder: Decks je Spiel mit Karten in Zonen (main/extra/side).
 * Die Zonen-/Größenregeln (40–60 Main bei Yu-Gi-Oh! usw.) prüft das Frontend —
 * die Datenbank speichert bewusst regelfrei, damit auch unfertige Decks
 * jederzeit gespeichert werden können.
 */

/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  await knex.schema.createTable('decks', (t) => {
    t.increments('id').primary();
    t.integer('game_id').unsigned().notNullable().references('games.id');
    t.string('name', 100).notNullable();
    t.text('description').nullable();
    t.timestamps(true, true); // created_at / updated_at
    t.index('game_id');
  });

  await knex.schema.createTable('deck_cards', (t) => {
    t.increments('id').primary();
    t.integer('deck_id').unsigned().notNullable().references('decks.id').onDelete('CASCADE');
    t.integer('card_id').unsigned().notNullable().references('cards.id').onDelete('CASCADE');
    t.enum('zone', ['main', 'extra', 'side']).notNullable().defaultTo('main');
    t.integer('quantity').unsigned().notNullable().defaultTo(1);
    t.unique(['deck_id', 'card_id', 'zone']);
    t.index('deck_id');
  });
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('deck_cards');
  await knex.schema.dropTableIfExists('decks');
};
