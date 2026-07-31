/**
 * Sprachspezifischer Sammelnummern-Präfix eines Sets, wo abweichend vom
 * naiven "EN"→"DE"-Muster — z. B. nutzte Yu-Gi-Oh! bei frühen Sets "-G" statt
 * "-DE" (Legend of Blue Eyes White Dragon: real "LOB-G001", nicht "LOB-DE001",
 * verifiziert gegen Yugipedia). YGOPRODeck liefert selbst keine deutschen
 * Sammelnummern — dieses Feld wird best-effort aus Yugipedia (Sekundärquelle,
 * nur für Lücken) befüllt und macht den bisherigen reinen Rate-Hinweis
 * (`frontend/src/cardNumbers.ts`) präziser. Spielagnostisch angelegt
 * (analog `marketplace_url`/`flavor_name`), aktuell nur von Yu-Gi-Oh! befüllt.
 */

/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  await knex.schema.alterTable('card_sets', (t) => {
    t.string('de_prefix', 20).nullable();
  });
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  await knex.schema.alterTable('card_sets', (t) => {
    t.dropColumn('de_prefix');
  });
};
