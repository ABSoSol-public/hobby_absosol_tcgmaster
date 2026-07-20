// Gemeinsame Helfer aller Katalog-Importer.
import { createHash } from 'crypto';
import { db } from '../../db';

export const CHUNK = 500;

export async function fetchJson<T>(url: string, headers: Record<string, string> = {}): Promise<T> {
  const res = await fetch(url, { headers: { 'User-Agent': 'tcg-collection-manager', ...headers } });
  if (!res.ok) throw new Error(`Anfrage fehlgeschlagen: ${res.status} ${url}`);
  return res.json() as Promise<T>;
}

export function chunked<T>(arr: T[], size: number = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Stabiler Fingerabdruck eines Inhalts — dient nur dem Vergleich, nicht der Kryptografie. */
export function hashOf(value: unknown): string {
  return createHash('md5').update(JSON.stringify(value)).digest('hex');
}

/**
 * Schreibt Preis-Snapshots in price_history.
 * Die Importer rufen das nur für Prints auf, deren Preis sich tatsächlich
 * geändert hat (oder die neu sind) — so bleibt die Historie kompakt und
 * der tägliche Delta-Cron erzeugt automatisch eine Preiskurve.
 */
export async function recordPriceHistory(
  rows: { print_id: number; price: number }[],
  source: string,
  currency: string
): Promise<number> {
  const valid = rows.filter((r) => r.print_id && r.price > 0);
  for (const chunk of chunked(valid)) {
    await db('price_history').insert(
      chunk.map((r) => ({ print_id: r.print_id, source, price: r.price, currency }))
    );
  }
  return valid.length;
}

/**
 * Upsert-Helfer für Sets: legt Sets an bzw. aktualisiert sie und liefert
 * die Zuordnung Set-Code → id zurück.
 */
export async function upsertSets(
  gameId: number,
  rows: { code: string; name: string; release_date?: string | null; card_count?: number | null; image_url?: string | null }[]
): Promise<Map<string, number>> {
  const withGame = rows.map((r) => ({
    game_id: gameId,
    code: r.code,
    name: r.name,
    release_date: r.release_date ?? null,
    card_count: r.card_count ?? null,
    image_url: r.image_url ?? null,
  }));
  for (const chunk of chunked(withGame)) {
    await db('card_sets')
      .insert(chunk)
      .onConflict(['game_id', 'code'])
      .merge(['name', 'release_date', 'card_count', 'image_url']);
  }
  return new Map(
    (await db('card_sets').where('game_id', gameId).select('id', 'code')).map((r) => [r.code, r.id])
  );
}
