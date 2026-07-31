// Zentrale Typen der API — Spiegelbild der Datenbanktabellen.

export interface Game {
  id: number;
  code: string;
  name: string;
  active: number; // MariaDB liefert 0/1
}

export interface CardSet {
  id: number;
  game_id: number;
  code: string;
  name: string;
  release_date: string | null;
  card_count: number | null;
  image_url: string | null; // Quell-URL (nur intern, wird nie ausgeliefert)
  image_path: string | null; // lokale Kopie relativ zu IMAGES_DIR
  de_prefix: string | null; // deutscher Sammelnummern-Präfix, falls von Yugipedia bekannt (aktuell nur Yu-Gi-Oh!)
}

export interface Card {
  id: number;
  game_id: number;
  external_id: string;
  name: string;
  name_de: string | null;
  card_type: string | null;
  card_text: string | null;
  card_text_de: string | null;
  image_url: string | null; // Quell-URL (nur intern, wird nie ausgeliefert)
  image_small_url: string | null; // Quell-URL (nur intern)
  image_path: string | null; // lokale Kopie relativ zu IMAGES_DIR
  image_small_path: string | null;
  game_data: string | Record<string, unknown> | null;
}

export interface CardPrint {
  id: number;
  card_id: number;
  set_id: number;
  collector_number: string | null;
  rarity: string | null;
  rarity_code: string | null;
  market_price: string | null;
  currency: string;
  marketplace_url: string | null;
  flavor_name: string | null;
}

export interface CollectionItem {
  id: number;
  print_id: number;
  quantity: number;
  condition: 'MT' | 'NM' | 'EX' | 'GD' | 'LP' | 'PL' | 'PO';
  language: string;
  is_first_edition: number;
  storage_location: string | null;
  purchase_price: string | null;
  acquired_at: string | null;
  notes: string | null;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/** JSON-Spalte robust parsen (mysql2 liefert je nach Version String oder Objekt). */
export function parseGameData(value: Card['game_data']): Record<string, unknown> | null {
  if (value == null) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
