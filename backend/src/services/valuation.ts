// Gemeinsame SQL-Bausteine für Sammlungswert-Berechnungen — an einer Stelle
// gepflegt, damit "echter Wert" und "hypothetischer Wert" nicht in mehreren
// Routen (collection.ts, sets.ts) auseinanderdriften (genau das ist einmal
// passiert: die Set-Berechnung hatte Karten OHNE Preisdaten fälschlich wie
// Karten unter 1 € behandelt und auf 1 € angehoben).
//
// Erwartet in jeder Query die Tabellen `collection_items` und `card_prints`
// (verknüpft über `collection_items.print_id = card_prints.id`).

/** `quantity * market_price` (in EUR umgerechnet), 0 bei fehlendem Preis. */
export function marketValueSql(usdToEur: number): { sql: string; bindings: number[] } {
  return {
    sql: "collection_items.quantity * COALESCE(card_prints.market_price, 0) * IF(card_prints.currency = 'USD', ?, 1)",
    bindings: [usdToEur],
  };
}

/**
 * Hypothetischer Wert: Karten mit einem BEKANNTEN Preis unter 1 € werden auf
 * 1 € angehoben, Karten ab 1 € behalten ihren echten (umgerechneten) Preis —
 * Karten OHNE Preisdaten (`market_price IS NULL`) bleiben bewusst unbewertet
 * (0), genau wie bei `marketValueSql()`. Sie sind nicht "unter 1 €", sondern
 * schlicht unbekannt — ein fehlender Preis darf nicht wie ein niedriger Preis
 * behandelt werden.
 */
export function hypotheticalValueSql(usdToEur: number): { sql: string; bindings: number[] } {
  return {
    sql: "collection_items.quantity * IF(card_prints.market_price IS NULL, 0, GREATEST(card_prints.market_price * IF(card_prints.currency = 'USD', ?, 1), 1))",
    bindings: [usdToEur],
  };
}
