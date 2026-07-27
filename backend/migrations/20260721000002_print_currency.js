/**
 * card_prints.market_price wurde bisher überall implizit als EUR behandelt
 * (Frontend formatiert hart mit currency: 'EUR') — das stimmte für 4 der 5
 * Spiele, aber Yu-Gi-Oh!s einzige Quelle mit Preis je Print/Rarität
 * (YGOPRODeck card_sets[].set_price) ist tatsächlich USD (TCGPlayer). Eine
 * echte Cardmarket-EUR-Alternative existiert nur auf Kartenebene (ein Preis
 * für alle Raritäten gemeinsam), was Sammlungswerte verfälscht — deshalb
 * bewusst bei USD je Print geblieben, jetzt aber korrekt beschriftet statt
 * fälschlich als "€" angezeigt.
 */

/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  await knex.schema.alterTable('card_prints', (t) => {
    t.string('currency', 3).notNullable().defaultTo('EUR');
  });
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  await knex.schema.alterTable('card_prints', (t) => {
    t.dropColumn('currency');
  });
};
