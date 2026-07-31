/**
 * Aufgedruckter "Flavor-Name" eines Prints, wenn er vom echten Kartennamen
 * abweicht — v. a. Magic-Crossover-Sets ("Universes Beyond", z. B. Final
 * Fantasy: Through the Ages) drucken statt des echten Namens einen
 * themenpassenden Namen auf die physische Karte (Scryfall-Feld
 * `flavor_name`). Gefunden, weil eine physische Karte ("The Cloudsea Djinn",
 * FCA #16) im Katalog nicht unter diesem Namen auffindbar war — der Import
 * kannte bisher nur den echten Namen ("Nyxbloom Ancient"). Bewusst am Print
 * hängend (nicht an der Karte), da derselbe echte Name je nach Print einen
 * anderen oder gar keinen Flavor-Namen tragen kann.
 */

/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  await knex.schema.alterTable('card_prints', (t) => {
    t.string('flavor_name', 255).nullable();
  });
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  await knex.schema.alterTable('card_prints', (t) => {
    t.dropColumn('flavor_name');
  });
};
