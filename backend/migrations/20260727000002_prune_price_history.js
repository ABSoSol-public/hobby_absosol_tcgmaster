/**
 * Einmaliger Cleanup: price_history wird ab sofort je print_id auf die
 * neuesten 10 Einträge begrenzt (siehe pruneOldPriceHistory() in
 * backend/src/services/importers/util.ts, aufgerufen von recordPriceHistory()
 * und dem manuellen Preis-Snapshot-Endpoint). Diese Migration wendet die
 * Grenze einmalig auch auf bereits bestehende Bestandsdaten an, damit alte
 * Prints nicht erst auf die nächste Preisänderung warten müssen.
 */

/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  const rows = await knex('price_history').distinct('print_id');
  for (const { print_id: printId } of rows) {
    await knex.raw(
      `DELETE FROM price_history
       WHERE print_id = ?
         AND id NOT IN (
           SELECT id FROM (
             SELECT id FROM price_history
             WHERE print_id = ?
             ORDER BY recorded_at DESC, id DESC
             LIMIT 10
           ) AS keep_ids
         )`,
      [printId, printId]
    );
  }
};

/** @param {import('knex').Knex} knex */
exports.down = async function down() {
  // Gelöschte Historien-Einträge sind nicht rekonstruierbar — bewusst kein Rollback.
};
