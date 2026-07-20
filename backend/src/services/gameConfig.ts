// Spielspezifische Filter-Konfiguration.
// Jedes Spiel definiert, welche Felder als Filter angeboten werden —
// das Frontend rendert daraus generisch seine Filter-Selects, die
// cards-Route wendet sie generisch auf card_type bzw. game_data an.

export interface FilterDef {
  /** Query-Parameter und UI-Schlüssel (Frontend übersetzt über filter_<key>). */
  key: string;
  /** JSON-Pfad in game_data (z. B. '$.attribute'); fehlt er, wird die Spalte card_type gefiltert. */
  path?: string;
  /** Substring-Vergleich (LIKE %wert%) statt Gleichheit — z. B. Magic-Farben "WU" oder Typzeilen. */
  contains?: boolean;
  /** Zahlwert vergleichen statt String. */
  numeric?: boolean;
  /** Statische Werteliste statt DISTINCT-Abfrage (nötig bei contains-Filtern). */
  values?: string[];
}

export const GAME_FILTERS: Record<string, FilterDef[]> = {
  yugioh: [
    { key: 'type', contains: true },
    { key: 'attribute', path: '$.attribute' },
    { key: 'race', path: '$.race' },
  ],
  pokemon: [
    { key: 'type', contains: true },
    { key: 'element', path: '$.type' },
    { key: 'rarity', path: '$.rarity' },
  ],
  magic: [
    {
      key: 'type',
      contains: true,
      values: ['Creature', 'Instant', 'Sorcery', 'Enchantment', 'Artifact', 'Planeswalker', 'Land', 'Battle'],
    },
    {
      key: 'color',
      path: '$.colors',
      contains: true,
      values: ['W', 'U', 'B', 'R', 'G', 'C'],
    },
  ],
  lorcana: [
    { key: 'type', contains: true },
    { key: 'ink', path: '$.ink' },
    { key: 'cost', path: '$.cost', numeric: true },
  ],
  riftbound: [
    { key: 'type' },
    {
      key: 'domain',
      path: '$.domain',
      contains: true,
      values: ['Body', 'Calm', 'Chaos', 'Fury', 'Mind', 'Order', 'Colorless'],
    },
    { key: 'rarity', path: '$.rarity' },
  ],
};

export function filtersFor(gameCode: string): FilterDef[] {
  return GAME_FILTERS[gameCode] || [{ key: 'type', contains: true }];
}
