// Hilfsfunktion für die Suche nach Sammelnummern (card_prints.collector_number).
//
// YGOPRODeck (und andere Quellen) liefern Sets-Codes ausschließlich mit dem
// englischen Sprachkürzel (z. B. "MP24-EN174"), auch wenn die physische
// deutsche Ausgabe der Karte einen eigenen Code mit "-DE" trägt (hier
// "MP24-DE174") — diese sprachspezifischen Codes sind in der Quelle schlicht
// nicht enthalten. Damit die Suche/der Foto-Scan trotzdem funktioniert, wenn
// jemand die auf der deutschen Karte aufgedruckte Nummer eingibt bzw.
// fotografiert, wird das Sprachkürzel beim Abgleich als Wildcard behandelt.
export function collectorNumberLikePatterns(raw: string): string[] {
  const value = raw.trim().toUpperCase();
  if (!value) return [];
  const patterns = new Set<string>([`%${value}%`]);
  const match = value.match(/^([A-Z0-9]{2,6})-([A-Z]{1,3})(\d{1,4}[A-Z]?)$/);
  if (match) {
    const [, prefix, lang, number] = match;
    patterns.add(`${prefix}-${'_'.repeat(lang.length)}${number}`);
  }
  return [...patterns];
}

/**
 * Natürlicher Vergleich für Sammelnummern ("SDY-002" vor "SDY-010", "4/102"
 * vor "25/102") — eine reine String-/SQL-Sortierung würde nach "1" alphabetisch
 * "10", "11", … vor "2" einordnen, da jede Ziffer einzeln verglichen wird.
 * `{ numeric: true }` lässt `localeCompare` zusammenhängende Ziffernfolgen
 * stattdessen als Zahl vergleichen, auch innerhalb von Präfix/Suffix-Text.
 * Fehlende Nummern (`null`) landen zuletzt.
 */
export function compareCollectorNumbers(a: string | null | undefined, b: string | null | undefined): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}
