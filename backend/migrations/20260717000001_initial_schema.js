/**
 * Initiales Multi-TCG-Schema.
 * Spielspezifische Attribute liegen in cards.game_data (JSON) —
 * neue Spiele benötigen daher keine Schemaänderung.
 */

/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  // --- Spiele -------------------------------------------------------------
  await knex.schema.createTable('games', (t) => {
    t.increments('id').primary();
    t.string('code', 20).notNullable().unique(); // yugioh, pokemon, magic, riftbound, lorcana
    t.string('name', 100).notNullable();
    t.boolean('active').notNullable().defaultTo(false);
  });

  // --- Sets / Erweiterungen ----------------------------------------------
  await knex.schema.createTable('card_sets', (t) => {
    t.increments('id').primary();
    t.integer('game_id').unsigned().notNullable().references('games.id');
    t.string('code', 50).notNullable(); // z. B. LOB
    t.string('name', 255).notNullable();
    t.date('release_date').nullable();
    t.integer('card_count').nullable(); // Anzahl Karten laut Quelle
    t.string('image_url', 500).nullable();
    t.unique(['game_id', 'code']);
    t.index('name');
  });

  // --- Karten (logische Karte, unabhängig vom Druck) ----------------------
  await knex.schema.createTable('cards', (t) => {
    t.increments('id').primary();
    t.integer('game_id').unsigned().notNullable().references('games.id');
    t.string('external_id', 50).notNullable(); // ID der Datenquelle (z. B. YGOPRODeck/Konami-Passcode)
    t.string('name', 255).notNullable();
    t.string('name_de', 255).nullable();
    t.string('card_type', 100).nullable(); // z. B. "Effect Monster", "Spell Card"
    t.text('card_text').nullable();
    t.text('card_text_de').nullable();
    t.string('image_url', 500).nullable();
    t.string('image_small_url', 500).nullable();
    t.json('game_data').nullable(); // spielspezifisch: atk/def/level/attribute/race/archetype/…
    t.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    t.unique(['game_id', 'external_id']);
    t.index('name');
    t.index(['game_id', 'card_type']);
  });

  // --- Prints (konkreter Druck einer Karte in einem Set) -------------------
  await knex.schema.createTable('card_prints', (t) => {
    t.increments('id').primary();
    t.integer('card_id').unsigned().notNullable().references('cards.id').onDelete('CASCADE');
    t.integer('set_id').unsigned().notNullable().references('card_sets.id').onDelete('CASCADE');
    t.string('collector_number', 50).nullable(); // z. B. LOB-DE001
    t.string('rarity', 100).nullable(); // z. B. Ultra Rare
    t.string('rarity_code', 20).nullable(); // z. B. UR
    t.decimal('market_price', 10, 2).nullable(); // letzter bekannter Preis (EUR/USD lt. Quelle)
    t.unique(['card_id', 'set_id', 'collector_number', 'rarity']);
    t.index('set_id');
    t.index('collector_number');
  });

  // --- Sammlung ------------------------------------------------------------
  await knex.schema.createTable('collection_items', (t) => {
    t.increments('id').primary();
    t.integer('print_id').unsigned().notNullable().references('card_prints.id').onDelete('CASCADE');
    t.integer('quantity').unsigned().notNullable().defaultTo(1);
    // Zustandsskala nach Cardmarket: Mint … Poor
    t.enum('condition', ['MT', 'NM', 'EX', 'GD', 'LP', 'PL', 'PO']).notNullable().defaultTo('NM');
    t.string('language', 5).notNullable().defaultTo('DE'); // DE, EN, FR, IT, ES, PT, JA, KO
    t.boolean('is_first_edition').notNullable().defaultTo(false);
    t.string('storage_location', 255).nullable(); // z. B. "Ordner 3, Seite 12"
    t.decimal('purchase_price', 10, 2).nullable();
    t.date('acquired_at').nullable();
    t.text('notes').nullable();
    t.timestamps(true, true); // created_at / updated_at
    t.index('print_id');
  });

  // --- Preis-Historie -------------------------------------------------------
  await knex.schema.createTable('price_history', (t) => {
    t.increments('id').primary();
    t.integer('print_id').unsigned().notNullable().references('card_prints.id').onDelete('CASCADE');
    t.string('source', 50).notNullable(); // z. B. cardmarket, tcgplayer
    t.decimal('price', 10, 2).notNullable();
    t.string('currency', 3).notNullable().defaultTo('EUR');
    t.timestamp('recorded_at').notNullable().defaultTo(knex.fn.now());
    t.index(['print_id', 'recorded_at']);
  });

  // --- Import-Jobs (Status/Protokoll der Katalog-Importe) -------------------
  await knex.schema.createTable('import_jobs', (t) => {
    t.increments('id').primary();
    t.integer('game_id').unsigned().notNullable().references('games.id');
    t.enum('status', ['running', 'completed', 'failed']).notNullable().defaultTo('running');
    t.timestamp('started_at').notNullable().defaultTo(knex.fn.now());
    t.timestamp('finished_at').nullable();
    t.text('message').nullable();
    t.json('stats').nullable(); // { sets, cards, prints }
  });

  // --- Stammdaten: die fünf geplanten Spiele --------------------------------
  await knex('games').insert([
    { code: 'yugioh', name: 'Yu-Gi-Oh!', active: true },
    { code: 'pokemon', name: 'Pokémon TCG', active: false },
    { code: 'magic', name: 'Magic: The Gathering', active: false },
    { code: 'riftbound', name: 'Riftbound', active: false },
    { code: 'lorcana', name: 'Disney Lorcana', active: false },
  ]);
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('import_jobs');
  await knex.schema.dropTableIfExists('price_history');
  await knex.schema.dropTableIfExists('collection_items');
  await knex.schema.dropTableIfExists('card_prints');
  await knex.schema.dropTableIfExists('cards');
  await knex.schema.dropTableIfExists('card_sets');
  await knex.schema.dropTableIfExists('games');
};
