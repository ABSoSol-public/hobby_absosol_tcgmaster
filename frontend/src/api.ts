// Zentraler API-Client — die einzige Stelle im Frontend, die HTTP spricht.
import type {
  AuthUser,
  Card,
  CardDetail,
  CardSet,
  CollectionItem,
  CollectionStats,
  Deck,
  DeckDetail,
  DeckZone,
  Filters,
  Game,
  ImageJob,
  ImportJob,
  Pagination,
  PriceHistoryEntry,
  Print,
  SetDetail,
} from './types';

const BASE = '/api/v1';

class ApiError extends Error {
  constructor(message: string, public statusCode: number) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  // Content-Type nur setzen, wenn wirklich ein Body mitgeschickt wird — sonst
  // lehnt Fastify die Anfrage mit FST_ERR_CTP_EMPTY_JSON_BODY (400) ab
  // (betrifft body-lose Aufrufe wie DELETE oder POST ohne Body).
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: init?.headers ?? (init?.body !== undefined ? { 'Content-Type': 'application/json' } : undefined),
  });
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    // Session abgelaufen/fehlt: AuthProvider hört auf dieses Event und zeigt den
    // Login wieder an, egal an welcher Stelle der App die Anfrage ausgelöst wurde.
    if (res.status === 401) window.dispatchEvent(new CustomEvent('auth:unauthorized'));
    throw new ApiError(body?.error?.message || `HTTP ${res.status}`, res.status);
  }
  return body as T;
}

function qs(params: Record<string, string | number | undefined>): string {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== '');
  if (!entries.length) return '';
  return '?' + new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString();
}

export interface ListResponse<T> {
  data: T[];
  pagination: Pagination;
}

export const api = {
  login: (username: string, password: string) =>
    request<{ data: AuthUser }>('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  logout: () => request<void>('/auth/logout', { method: 'POST' }),
  me: () => request<{ data: AuthUser }>('/auth/me'),

  games: () => request<{ data: Game[] }>('/games'),

  cards: (game: string, params: Record<string, string | number | undefined>) =>
    request<ListResponse<Card>>(`/games/${game}/cards${qs(params)}`),
  card: (id: number | string) => request<{ data: CardDetail }>(`/cards/${id}`),
  filters: (game: string) => request<{ data: Filters }>(`/games/${game}/filters`),
  scanCard: (game: string, text: string) => request<{ data: Print[] }>(`/games/${game}/scan${qs({ text })}`),

  sets: (game: string, search?: string) => request<{ data: CardSet[] }>(`/games/${game}/sets${qs({ search })}`),
  set: (id: number | string) => request<{ data: SetDetail }>(`/sets/${id}`),
  printPrices: (printId: number | string) => request<{ data: PriceHistoryEntry[] }>(`/prints/${printId}/prices`),
  addManualPrice: (printId: number | string, body: { price: number; currency?: string; recorded_at?: string }) =>
    request<{ data: PriceHistoryEntry }>(`/prints/${printId}/prices`, { method: 'POST', body: JSON.stringify(body) }),
  deletePriceEntry: (printId: number | string, priceId: number) =>
    request<void>(`/prints/${printId}/prices/${priceId}`, { method: 'DELETE' }),

  collection: (params: Record<string, string | number | undefined>) =>
    request<ListResponse<CollectionItem>>(`/collection${qs(params)}`),
  collectionStats: (game?: string) => request<{ data: CollectionStats }>(`/collection/stats${qs({ game })}`),
  addToCollection: (body: Record<string, unknown>) =>
    request<{ data: CollectionItem }>('/collection', { method: 'POST', body: JSON.stringify(body) }),
  updateCollectionItem: (id: number, body: Record<string, unknown>) =>
    request<{ data: CollectionItem }>(`/collection/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteCollectionItem: (id: number) => request<void>(`/collection/${id}`, { method: 'DELETE' }),

  startImport: (game: string) =>
    request<{ data: { jobId: number; status: string } }>(`/imports/${game}`, { method: 'POST' }),
  latestImport: (game?: string) => request<{ data: ImportJob | null }>(`/imports/latest${qs({ game })}`),

  startImageDownload: (game: string) =>
    request<{ data: { jobId: number; status: string } }>(`/images/download${qs({ game })}`, { method: 'POST' }),
  latestImageDownload: (game?: string) => request<{ data: ImageJob | null }>(`/images/latest${qs({ game })}`),

  decks: (game?: string) => request<{ data: Deck[] }>(`/decks${qs({ game })}`),
  createDeck: (game: string, name: string) =>
    request<{ data: Deck }>('/decks', { method: 'POST', body: JSON.stringify({ game, name }) }),
  deck: (id: number | string) => request<{ data: DeckDetail }>(`/decks/${id}`),
  updateDeck: (id: number, body: { name?: string; description?: string | null }) =>
    request<{ data: DeckDetail }>(`/decks/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteDeck: (id: number) => request<void>(`/decks/${id}`, { method: 'DELETE' }),
  setDeckCard: (deckId: number, body: { card_id: number; zone: DeckZone; quantity: number }) =>
    request<{ data: { card_id: number; zone: DeckZone; quantity: number } }>(`/decks/${deckId}/cards`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  deckExportUrl: (id: number) => `${BASE}/decks/${id}/export.ydk`,
  importDeckYdk: (game: string, name: string, ydk: string) =>
    request<{ data: Deck & { imported: number; unmatched: string[] } }>(
      `/decks/import${qs({ game, name })}`,
      { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: ydk }
    ),

  collectionExportUrl: (game?: string) => `${BASE}/collection/export${qs({ game })}`,
  importCollectionCsv: (csv: string) =>
    request<{ data: { created: number; updated: number; failed: number; errors: string[] } }>(
      '/collection/import',
      { method: 'POST', headers: { 'Content-Type': 'text/csv' }, body: csv }
    ),
};
