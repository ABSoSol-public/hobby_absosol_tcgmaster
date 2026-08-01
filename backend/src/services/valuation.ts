// Gemeinsame SQL-Bausteine für Sammlungswert-Berechnungen — an einer Stelle
// gepflegt, damit "echter Wert" und "hypothetischer Wert" nicht in mehreren
// Routen (collection.ts, sets.ts) auseinanderdriften.
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
 * Hypothetischer Wert: Karten OHNE Preis (`market_price IS NULL`) ODER mit
 * einem Preis unter 1 € werden mit 1 € eingerechnet, Karten ab 1 € mit ihrem
 * echten (umgerechneten) Preis — `GREATEST(COALESCE(price, 0), 1)` deckt
 * beide Fälle ab, da `COALESCE(NULL, 0)` genau wie ein echter Preis unter 1 €
 * auf den Mindestwert 1 angehoben wird. Nutzerentscheidung (2026-08-01,
 * explizit bestätigt nach einem Fehlversuch, der NULL-Preise stattdessen auf
 * 0 gesetzt hatte — das war falsch, hier korrigiert): "wenn eine Karte
 * keinen Preis hat ODER unter einem Euro liegt, soll 1 Euro genommen werden".
 */
export function hypotheticalValueSql(usdToEur: number): { sql: string; bindings: number[] } {
  return {
    sql: "collection_items.quantity * GREATEST(COALESCE(card_prints.market_price, 0) * IF(card_prints.currency = 'USD', ?, 1), 1)",
    bindings: [usdToEur],
  };
}
