// Typen der REST-API (Spiegel von backend/src/types.ts + Routen-Antworten)

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface Game {
  id: number;
  code: string;
  name: string;
  active: boolean;
  cardCount: number;
  collectedCount: number;
}

export interface GameData {
  frameType?: string | null;
  race?: string | null;
  attribute?: string | null;
  level?: number | null;
  atk?: number | null;
  def?: number | null;
  archetype?: string | null;
  linkval?: number | null;
  scale?: number | null;
  /** Banlist-Status TCG (Yu-Gi-Oh!): "Forbidden" | "Limited" | "Semi-Limited", sonst nicht gesetzt. */
  banTcg?: string | null;
  [key: string]: unknown;
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
  image_url: string | null;
  image_small_url: string | null;
  game_data: GameData | null;
  ownedQuantity?: number;
}

export interface Print {
  id: number;
  card_id: number;
  set_id: number;
  collector_number: string | null;
  rarity: string | null;
  rarity_code: string | null;
  market_price: string | null;
  set_name?: string;
  set_code?: string;
  set_release_date?: string | null;
  card_name?: string;
  card_name_de?: string | null;
  card_type?: string | null;
  image_small_url?: string | null;
  image_url?: string | null;
  ownedQuantity?: number;
  collectionItems?: CollectionItem[];
}

export interface CardDetail extends Card {
  prints: Print[];
}

export interface AuthUser {
  id: number;
  username: string;
}

export interface PriceHistoryEntry {
  id: number;
  price: string;
  currency: string;
  source: string;
  recorded_at: string;
}

export interface CardSet {
  id: number;
  game_id: number;
  code: string;
  name: string;
  release_date: string | null;
  card_count: number | null;
  image_url: string | null;
  printCount: number;
  ownedPrintCount: number;
}

export interface SetDetail extends Omit<CardSet, 'printCount' | 'ownedPrintCount'> {
  prints: Print[];
}

export type Condition = 'MT' | 'NM' | 'EX' | 'GD' | 'LP' | 'PL' | 'PO';

export interface CollectionItem {
  id: number;
  print_id: number;
  quantity: number;
  condition: Condition;
  language: string;
  is_first_edition: number;
  storage_location: string | null;
  purchase_price: string | null;
  acquired_at: string | null;
  notes: string | null;
  card_id?: number;
  card_name?: string;
  card_name_de?: string | null;
  image_small_url?: string | null;
  image_url?: string | null;
  collector_number?: string | null;
  rarity?: string | null;
  market_price?: string | null;
  set_name?: string;
  set_code?: string;
  game_code?: string;
}

export interface CollectionStats {
  totalCopies: number;
  distinctCards: number;
  distinctPrints: number;
  purchaseValue: number;
  marketValue: number;
}

/** Navigationskontext, der beim Öffnen einer Karte per location.state mitgegeben wird. */
export interface CardNavState {
  /** Wohin „Zurück" führen soll (inkl. Query-Parametern), z. B. /sets/12 oder /cards?attribute=DARK */
  back?: { path: string; name?: string };
  /** Reihenfolge der Karten der Herkunftsliste — ermöglicht Vor/Zurück-Blättern. */
  cardIds?: number[];
}

export interface FilterGroup {
  key: string;
  values: string[];
}

export interface Filters {
  filters: FilterGroup[];
}

export type DeckZone = 'main' | 'extra' | 'side';

export interface Deck {
  id: number;
  game_id: number;
  game_code: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
  zoneCounts: Partial<Record<DeckZone, number>>;
  cardCount: number;
}

export interface DeckCardEntry {
  card_id: number;
  zone: DeckZone;
  quantity: number;
  name: string;
  name_de: string | null;
  card_type: string | null;
  image_small_url: string | null;
  image_url: string | null;
  game_data: GameData | null;
  ownedQuantity: number;
}

export interface DeckDetail extends Omit<Deck, 'zoneCounts' | 'cardCount'> {
  cards: DeckCardEntry[];
}

export interface ImportJob {
  id: number;
  game_code: string;
  status: 'running' | 'completed' | 'failed';
  started_at: string;
  finished_at: string | null;
  message: string | null;
}

export interface ImageJob {
  id: number;
  game_code: string | null;
  status: 'running' | 'completed' | 'failed';
  started_at: string;
  finished_at: string | null;
  message: string | null;
}

export const CONDITION_LABELS: Record<Condition, string> = {
  MT: 'Mint',
  NM: 'Near Mint',
  EX: 'Excellent',
  GD: 'Good',
  LP: 'Light Played',
  PL: 'Played',
  PO: 'Poor',
};

export const LANGUAGES = ['DE', 'EN', 'FR', 'IT', 'ES', 'PT', 'JA', 'KO'];
