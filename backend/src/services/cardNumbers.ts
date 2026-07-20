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
