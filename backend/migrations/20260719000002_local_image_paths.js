/**
 * Lokale Bildpfade: image_url/image_small_url bleiben die *Quell*-URLs
 * (die braucht das Download-Script weiterhin), aber ausgeliefert wird
 * ausschließlich die lokale Kopie. Die neuen Spalten enthalten den Pfad
 * relativ zu IMAGES_DIR (z. B. "yugioh/cards/123.jpg") und werden vom
 * Script images:download nach erfolgreichem Download gesetzt.
 * Die API gibt daraus /images/<pfad> zurück — externe Bild-URLs verlassen
 * das Backend nicht mehr (Hotlinking ist z. B. bei YGOPRODeck untersagt).
 */

/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  await knex.schema.alterTable('cards', (t) => {
    t.string('image_path', 255).nullable();
    t.string('image_small_path', 255).nullable();
  });
  await knex.schema.alterTable('card_sets', (t) => {
    t.string('image_path', 255).nullable();
  });
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  await knex.schema.alterTable('card_sets', (t) => {
    t.dropColumn('image_path');
  });
  await knex.schema.alterTable('cards', (t) => {
    t.dropColumn('image_small_path');
    t.dropColumn('image_path');
  });
};
