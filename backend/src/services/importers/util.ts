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

/** Wie viele Preis-Historie-Einträge pro Print maximal aufgehoben werden. */
export const PRICE_HISTORY_KEEP = 10;

/**
 * Kürzt price_history je print_id auf die `keep` neuesten Einträge — die
 * volle Kurve ist nur ein nettes Goodie, für den praktischen Gebrauch
 * (Trend erkennen) reichen die letzten paar Preisänderungen. Nutzt einen
 * abgeleiteten Tabellen-Trick (`SELECT ... FROM (SELECT ...) AS x`), weil
 * MySQL/MariaDB nicht erlaubt, in derselben DELETE-Anweisung direkt aus der
 * Zieltabelle zu selektieren.
 */
export async function pruneOldPriceHistory(printIds: number[], keep: number = PRICE_HISTORY_KEEP): Promise<void> {
  const unique = [...new Set(printIds)].filter((id) => Number.isInteger(id) && id > 0);
  for (const printId of unique) {
    await db.raw(
      `DELETE FROM price_history
       WHERE print_id = ?
         AND id NOT IN (
           SELECT id FROM (
             SELECT id FROM price_history
             WHERE print_id = ?
             ORDER BY recorded_at DESC, id DESC
             LIMIT ?
           ) AS keep_ids
         )`,
      [printId, printId, keep]
    );
  }
}

/**
 * Schreibt Preis-Snapshots in price_history.
 * Die Importer rufen das nur für Prints auf, deren Preis sich tatsächlich
 * geändert hat (oder die neu sind) — so bleibt die Historie kompakt und
 * der tägliche Delta-Cron erzeugt automatisch eine Preiskurve.
 * Kürzt anschließend je betroffenem Print auf die letzten `PRICE_HISTORY_KEEP`
 * Einträge (siehe `pruneOldPriceHistory()`).
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
  await pruneOldPriceHistory(valid.map((r) => r.print_id));
  return valid.length;
}

export interface DotggPriceInfo {
  /** Cardmarket-Preis (EUR), null wenn 0/unbekannt */
  price: number | null;
  /** Direktlink zur Cardmarket-Produktseite */
  url: string | null;
}

/**
 * Cardmarket-Preise/-Links über die freie, öffentlich dokumentierte dotgg.gg-
 * API (https://dotgg.gg/api/, kein Key nötig) — deckt u. a. Lorcana und
 * Riftbound ab, für die es sonst keine Cardmarket-Anbindung gibt. Liefert je
 * Karten-ID (`{Set-Code}-{Sammelnummer}`, spielabhängig formatiert — die
 * Zuordnung zu unseren eigenen Prints übernimmt der jeweilige Importer) den
 * `cmPrice`/`cmurl`.
 *
 * Bewusst best-effort: die API selbst ist "as-is" ohne Uptime-Garantie
 * dokumentiert. Schlägt der Abruf fehl, liefert diese Funktion eine leere
 * Map statt zu werfen — der Katalog-Import läuft dann normal weiter, nur
 * ohne Cardmarket-Daten für diesen Lauf (holt sie sich beim nächsten
 * Delta-Import automatisch nach).
 */
export async function fetchDotggCardmarketPrices(gameSlug: string): Promise<Map<string, DotggPriceInfo>> {
  const map = new Map<string, DotggPriceInfo>();
  try {
    const cards = await fetchJson<{ id?: string; cmPrice?: string; cmurl?: string }[]>(
      `https://api.dotgg.gg/cgfw/getcards?game=${gameSlug}`
    );
    for (const c of cards) {
      if (!c.id) continue;
      const price = c.cmPrice ? Number(c.cmPrice) : null;
      map.set(c.id, { price: price && price > 0 ? price : null, url: c.cmurl || null });
    }
  } catch {
    // dotgg ist nur eine Zusatzquelle für Cardmarket-Daten, kein Kernbestandteil
    // des Imports — bei Fehlern (Downtime, Formatänderung) einfach ohne weitermachen.
  }
  return map;
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
