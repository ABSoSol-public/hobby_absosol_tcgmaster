/**
 * Direktlink zur Marktplatz-Produktseite eines Prints (z. B. Cardmarket) —
 * spielspezifisch mal vorhanden (Lorcana liefert cardmarketUrl je Karte),
 * mal nicht. Kein Preis, nur ein Link — daher bewusst getrennt von
 * market_price, das aus einer anderen Quelle stammen kann oder ganz fehlt.
 */

/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  await knex.schema.alterTable('card_prints', (t) => {
    t.string('marketplace_url', 500).nullable();
  });
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  await knex.schema.alterTable('card_prints', (t) => {
    t.dropColumn('marketplace_url');
  });
};
