import { config } from '../../config';
import { db } from '../../db';
import { fetchTcgdexCardTranslation, fetchTcgdexGermanIds } from './tcgdex';
import { GameImporter, ImportOptions, ImportStats } from './types';
import { chunked, hashOf, mapWithConcurrency, recordPriceHistory } from './util';

// Datenquelle: pokemontcg.io v2. Funktioniert ohne API-Key (streng ratenlimitiert);
// mit kostenlosem Key (POKEMON_TCG_API_KEY in .env) deutlich schneller.
const API_BASE = 'https://api.pokemontcg.io/v2';
const PAGE_SIZE = 250;

interface PokemonSet {
  id: string;
  name: string;
  releaseDate?: string;
  total?: number;
  images?: { logo?: string; symbol?: string };
}

interface PokemonCard {
  id: string; // z. B. "base1-4"
  name: string;
  supertype?: string; // Pokémon / Trainer / Energy
  subtypes?: string[];
  hp?: string;
  types?: string[];
  evolvesFrom?: string;
  rarity?: string;
  number?: string;
  set: { id: string };
  images?: { small?: string; large?: string };
  cardmarket?: { prices?: { trendPrice?: number; averageSellPrice?: number } };
  flavorText?: string;
  rules?: string[];
  attacks?: { name: string; cost?: string[]; damage?: string; text?: string }[];
}

/** Fetch mit Retry bei Rate-Limit (429) und Serverfehlern. */
async function fetchPage<T>(url: string): Promise<T> {
  const headers: Record<string, string> = { 'User-Agent': 'tcg-collection-manager' };
  if (config.pokemonApiKey) headers['X-Api-Key'] = config.pokemonApiKey;

  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { headers });
    if (res.ok) return res.json() as Promise<T>;
    // 404 ebenfalls retryen: die API liefert unter Last sporadisch 404 für gültige Seiten
    if ((res.status === 429 || res.status === 404 || res.status >= 500) && attempt < 5) {
      const wait = attempt * 15000; // 15/30/45/60 s — ohne Key limitiert die API auf 30 Anfragen/min
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    throw new Error(`pokemontcg.io-Anfrage fehlgeschlagen: ${res.status} ${url}`);
  }
}

async function fetchAll<T>(path: string, onProgress: (msg: string) => void, label: string): Promise<T[]> {
  const out: T[] = [];
  for (let page = 1; ; page++) {
    let body: { data: T[]; totalCount?: number };
    try {
      body = await fetchPage(`${API_BASE}${path}?page=${page}&pageSize=${PAGE_SIZE}`);
    } catch (err) {
      // Ist die Gesamtzahl ein exaktes Vielfaches der Seitengröße, antwortet die
      // API auf die Seite HINTER dem Ende mit 404 statt mit einer leeren Liste.
      if (out.length > 0 && (err as Error).message.includes(': 404 ')) return out;
      throw err;
    }
    out.push(...body.data);
    onProgress(`${label}: ${out.length} geladen …`);
    if (body.data.length < PAGE_SIZE) return out;
    if (body.totalCount != null && out.length >= body.totalCount) return out;
  }
}

export const pokemonImporter: GameImporter = {
  gameCode: 'pokemon',

  async run(onProgress = () => {}, options: ImportOptions = {}): Promise<ImportStats> {
    const game = await db('games').where({ code: 'pokemon' }).first();
    if (!game) throw new Error('Spiel "pokemon" fehlt in der games-Tabelle (Migration ausführen).');
    if (!config.pokemonApiKey) {
      onProgress('Hinweis: kein POKEMON_TCG_API_KEY gesetzt — Import läuft mit strengem Rate-Limit (deutlich langsamer).');
    }

    // 1) Sets
    onProgress('Lade Set-Liste von pokemontcg.io …');
    const sets = await fetchAll<PokemonSet>('/sets', onProgress, 'Sets');
    const setRows = sets.map((s) => ({
      game_id: game.id,
      code: s.id,
      name: s.name,
      release_date: s.releaseDate ? s.releaseDate.replace(/\//g, '-') : null,
      card_count: s.total || null,
      image_url: s.images?.logo || s.images?.symbol || null,
    }));
    for (const chunk of chunked(setRows)) {
      await db('card_sets')
        .insert(chunk)
        .onConflict(['game_id', 'code'])
        .merge(['name', 'release_date', 'card_count', 'image_url']);
    }
    const setIdByCode = new Map(
      (await db('card_sets').where('game_id', game.id).select('id', 'code')).map((r) => [r.code, r.id])
    );
    onProgress(`${setRows.length} Sets übernommen.`);

    // 2) Karten (paginiert; das dauert ohne API-Key eine Weile)
    onProgress('Lade Kartenkatalog (paginiert) …');
    const cards = await fetchAll<PokemonCard>('/cards', onProgress, 'Karten');

    const existingCardHashes = new Map(
      (await db('cards').where('game_id', game.id).select('external_id', 'content_hash')).map((r) => [
        r.external_id,
        r.content_hash,
      ])
    );

    // Sekundärquelle TCGdex (tcgdex.dev): pokemontcg.io (Primärquelle) liefert
    // grundsätzlich nur Englisch. Bereits vorhandene Übersetzungen zuerst aus
    // der DB übernehmen (nie überschreiben, nie unnötig neu abfragen), dann
    // bei --force die noch fehlenden ergänzen — sonst würde jeder tägliche
    // Delta-Import erneut Tausende Einzel-Requests gegen TCGdex auslösen.
    const deByExternalId = new Map<string, { name: string; text: string | null }>(
      (await db('cards').where('game_id', game.id).whereNotNull('name_de').select('external_id', 'name_de', 'card_text_de')).map(
        (r) => [r.external_id, { name: r.name_de as string, text: r.card_text_de as string | null }]
      )
    );
    if (options.force) {
      onProgress('Sekundärquelle TCGdex: lade deutschen Karten-Index …');
      const deIds = await fetchTcgdexGermanIds();
      const missingIds = cards.map((c) => c.id).filter((id) => deIds.has(id) && !deByExternalId.has(id));
      onProgress(`TCGdex: prüfe ${missingIds.length} Karten ohne deutsche Übersetzung …`);
      let checked = 0;
      const results = await mapWithConcurrency(missingIds, 10, async (id) => {
        const t = await fetchTcgdexCardTranslation(id);
        checked++;
        if (checked % 500 === 0) onProgress(`TCGdex Übersetzungen: ${checked}/${missingIds.length} geprüft …`);
        return { id, t };
      });
      let found = 0;
      for (const r of results) {
        if (r.t) {
          deByExternalId.set(r.id, r.t);
          found++;
        }
      }
      onProgress(`TCGdex: ${found} deutsche Übersetzungen gefunden und ergänzt.`);
    }

    const cardRowsAll = cards.map((c) => {
      const textParts = [
        ...(c.rules || []),
        ...(c.attacks || []).map((a) => `${a.name}${a.damage ? ` (${a.damage})` : ''}${a.text ? `: ${a.text}` : ''}`),
        c.flavorText || '',
      ].filter(Boolean);
      const de = deByExternalId.get(c.id);
      const content = {
        name: c.name,
        name_de: de?.name ?? null,
        card_type: c.supertype || null,
        card_text: textParts.join('\n') || null,
        card_text_de: de?.text ?? null,
        image_url: c.images?.large || null,
        image_small_url: c.images?.small || null,
        game_data: JSON.stringify({
          type: c.types?.[0] ?? null,
          types: c.types?.join('/') ?? null,
          subtypes: c.subtypes?.join('/') ?? null,
          hp: c.hp ? Number(c.hp) || null : null,
          evolvesFrom: c.evolvesFrom ?? null,
          rarity: c.rarity ?? null,
        }),
      };
      const contentHash = hashOf(content);
      return { externalId: c.id, contentHash, row: { game_id: game.id, external_id: c.id, ...content, content_hash: contentHash } };
    });

    const changedCardRows = cardRowsAll
      .filter((c) => existingCardHashes.get(c.externalId) !== c.contentHash)
      .map((c) => ({ ...c.row, updated_at: db.fn.now() }));
    for (const chunk of chunked(changedCardRows)) {
      await db('cards')
        .insert(chunk)
        .onConflict(['game_id', 'external_id'])
        .merge(['name', 'name_de', 'card_type', 'card_text', 'card_text_de', 'image_url', 'image_small_url', 'game_data', 'content_hash', 'updated_at']);
    }
    onProgress(`Karten: ${changedCardRows.length} von ${cardRowsAll.length} geändert/neu.`);

    // 3) Prints (1 Print je Karte; Preis = Cardmarket-Trendpreis in EUR)
    const cardIdByExternal = new Map(
      (await db('cards').where('game_id', game.id).select('id', 'external_id')).map((r) => [r.external_id, r.id])
    );
    const existingPrints = new Map(
      (
        await db('card_prints')
          .join('cards', 'card_prints.card_id', 'cards.id')
          .where('cards.game_id', game.id)
          .select('card_prints.card_id', 'card_prints.set_id', 'card_prints.collector_number', 'card_prints.rarity', 'card_prints.content_hash', 'card_prints.market_price')
      ).map((r) => [
        `${r.card_id}|${r.set_id}|${r.collector_number}|${r.rarity}`,
        { hash: r.content_hash as string | null, price: r.market_price == null ? null : Number(r.market_price) },
      ])
    );

    const printRowsAll: { key: string; row: Record<string, unknown> }[] = [];
    for (const c of cards) {
      const cardId = cardIdByExternal.get(c.id);
      const setId = setIdByCode.get(c.set.id);
      if (!cardId || !setId) continue;
      const price = c.cardmarket?.prices?.trendPrice ?? c.cardmarket?.prices?.averageSellPrice ?? null;
      const marketPrice = price && price > 0 ? Math.round(price * 100) / 100 : null;
      const collectorNumber = c.number || null;
      const rarity = c.rarity || null;
      printRowsAll.push({
        key: `${cardId}|${setId}|${collectorNumber}|${rarity}`,
        row: {
          card_id: cardId,
          set_id: setId,
          collector_number: collectorNumber,
          rarity,
          rarity_code: null,
          market_price: marketPrice,
          currency: 'EUR',
          content_hash: hashOf({ rarity_code: null, market_price: marketPrice, currency: 'EUR' }),
        },
      });
    }
    const changedPrintRows = printRowsAll
      .filter((p) => existingPrints.get(p.key)?.hash !== (p.row.content_hash as string))
      .map((p) => p.row);
    for (const chunk of chunked(changedPrintRows)) {
      await db('card_prints')
        .insert(chunk)
        .onConflict(['card_id', 'set_id', 'collector_number', 'rarity'])
        .merge(['rarity_code', 'market_price', 'currency', 'content_hash']);
    }

    // 4) Preis-Historie für neue/geänderte Preise
    const priceChanged = printRowsAll.filter((p) => {
      const newPrice = p.row.market_price as number | null;
      if (newPrice == null) return false;
      const before = existingPrints.get(p.key);
      return !before || before.price !== newPrice;
    });
    if (priceChanged.length) {
      const idByKey = new Map(
        (
          await db('card_prints')
            .join('cards', 'card_prints.card_id', 'cards.id')
            .where('cards.game_id', game.id)
            .select('card_prints.id', 'card_prints.card_id', 'card_prints.set_id', 'card_prints.collector_number', 'card_prints.rarity')
        ).map((r) => [`${r.card_id}|${r.set_id}|${r.collector_number}|${r.rarity}`, r.id as number])
      );
      const written = await recordPriceHistory(
        priceChanged.map((p) => ({ print_id: idByKey.get(p.key) || 0, price: p.row.market_price as number })),
        'cardmarket',
        'EUR'
      );
      onProgress(`Preis-Historie: ${written} Snapshots geschrieben.`);
    }

    const stats: ImportStats = {
      sets: setRows.length,
      cards: cardRowsAll.length,
      prints: printRowsAll.length,
      cardsChanged: changedCardRows.length,
      printsChanged: changedPrintRows.length,
      skipped: false,
    };
    onProgress(`Import abgeschlossen: ${stats.sets} Sets, ${stats.cardsChanged}/${stats.cards} Karten, ${stats.printsChanged}/${stats.prints} Prints.`);
    return stats;
  },
};
