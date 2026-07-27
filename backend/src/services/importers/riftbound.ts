import { db } from '../../db';
import { GameImporter, ImportOptions, ImportStats } from './types';
import { chunked, fetchDotggCardmarketPrices, fetchJson, hashOf, recordPriceHistory, upsertSets } from './util';
import translationsJson from '../../data/riftbound.de.json';

// Datenquelle: riftcodex.com — offene REST-API ohne Key (v0.2.0, nur Englisch).
// Deutsche Namen/Texte kommen aus einer eigenen Übersetzungsdatei (riftbound.de.json),
// da die API keine Lokalisierung anbietet.
const API_BASE = 'https://api.riftcodex.com';
const PAGE_SIZE = 100;

/** Eigene Übersetzungen, gepflegt je Basiskarte (Name ohne Varianten-Suffix). */
const DE = translationsJson as Record<string, { name?: string | null; text?: string | null }>;

interface RiftSet {
  set_id: string;
  name: string;
  card_count?: number | null;
  published_on?: string | null;
}

interface RiftCard {
  id: string;
  name: string;
  riftbound_id?: string | null;
  tcgplayer_id?: string | null;
  collector_number?: number | null;
  attributes?: { energy?: number | null; might?: number | null; power?: number | null };
  classification?: { type?: string | null; supertype?: string | null; rarity?: string | null; domain?: string[] | null };
  text?: { rich?: string | null; plain?: string | null; flavour?: string | null };
  set?: { set_id?: string | null; label?: string | null };
  media?: { image_url?: string | null; artist?: string | null };
  tags?: string[] | null;
  metadata?: { alternate_art?: boolean; overnumbered?: boolean; signature?: boolean; updated_on?: string };
}

interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pages: number;
}

/** Der "plain"-Text der API enthält HTML-Entities (z. B. "[&gt;]" für das Erschöpfen-Symbol).
 *  Manche Prints tragen den Platzhalter "[NO TEXT]" statt eines leeren Textes. */
function decodeEntities(text: string | null | undefined): string | null {
  if (!text || text === '[NO TEXT]') return null;
  return text
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

/** Varianten-Suffix im Kartennamen ("Poppy - Paragon (Alternate Art)" → "Poppy - Paragon"). */
function baseName(name: string): string {
  return name.replace(/\s*\((Alternate Art|Overnumbered|Signature)\)\s*/g, '').trim();
}

/**
 * Gedruckte Sammlernummer aus der Riftbound-ID ("unl-116a-219" → "116a").
 * Fällt auf collector_number zurück, wenn die ID nicht dem Muster entspricht —
 * so bleiben Alt-Art-Prints (Suffix "a") vom Normal-Print unterscheidbar.
 */
function printedNumber(c: RiftCard): string | null {
  const parts = (c.riftbound_id || '').split('-');
  if (parts.length === 3 && parts[1]) return parts[1];
  return c.collector_number != null ? String(c.collector_number) : null;
}

/** Sanity-CDN des Riot-CMS: Thumbnail per Query-Parameter, spart ~75 % Transfer. */
function thumbnailUrl(imageUrl: string | null | undefined): string | null {
  if (!imageUrl) return null;
  return `${imageUrl}${imageUrl.includes('?') ? '&' : '?'}w=300`;
}

async function fetchAllCards(onProgress: (msg: string) => void): Promise<RiftCard[]> {
  const items: RiftCard[] = [];
  for (let page = 1, pages = 1; page <= pages; page++) {
    const res = await fetchJson<Paged<RiftCard>>(`${API_BASE}/cards?size=${PAGE_SIZE}&page=${page}`);
    pages = res.pages;
    items.push(...res.items);
    onProgress(`Karten geladen: ${items.length}/${res.total} …`);
  }
  return items;
}

export const riftboundImporter: GameImporter = {
  gameCode: 'riftbound',

  async run(onProgress = () => {}, options: ImportOptions = {}): Promise<ImportStats> {
    const game = await db('games').where({ code: 'riftbound' }).first();
    if (!game) throw new Error('Spiel "riftbound" fehlt in der games-Tabelle (Migration ausführen).');

    // Versions-Kurzschluss: Die API hat keinen Versions-Endpoint, aber die kleine
    // Set-Liste (inkl. card_count je Set) ändert sich bei jedem Kartenupdate der
    // Praxisfälle (neues Set, neue Promos). Reine Textkorrekturen ohne neue Karten
    // erwischt nur --force — akzeptierter Kompromiss.
    onProgress('Lade Set-Liste von Riftcodex …');
    const setsRes = await fetchJson<Paged<RiftSet>>(`${API_BASE}/sets?size=100`);
    // Die API liefert die Sets in instabiler Reihenfolge — für einen stabilen
    // Versions-Fingerabdruck sortieren und auf die relevanten Felder reduzieren.
    const versionBasis = setsRes.items
      .map((s) => ({ set_id: s.set_id, name: s.name, card_count: s.card_count ?? null, published_on: s.published_on ?? null }))
      .sort((a, b) => a.set_id.localeCompare(b.set_id));
    const remoteVersion = `riftcodex|${hashOf(versionBasis)}`;
    if (!options.force) {
      const state = await db('import_state').where({ game_id: game.id }).first();
      if (state && state.source_version === remoteVersion) {
        onProgress('Katalog bereits aktuell (Set-Liste unverändert) — kein Import nötig.');
        return { sets: 0, cards: 0, prints: 0, cardsChanged: 0, printsChanged: 0, skipped: true };
      }
    }

    // 1) Sets
    const setIdByCode = await upsertSets(
      game.id,
      setsRes.items.map((s) => ({
        code: s.set_id,
        name: s.name,
        release_date: s.published_on ? s.published_on.slice(0, 10) : null,
        card_count: s.card_count ?? null,
      }))
    );
    onProgress(`${setsRes.items.length} Sets übernommen.`);

    // 2) Alle Prints laden und zu logischen Karten gruppieren.
    //    Die API liefert jede Druckvariante (Alt Art, Promos, …) als eigenen Eintrag;
    //    unser Schema trennt Karte (cards) und Druck (card_prints).
    const apiCards = await fetchAllCards(onProgress);

    // Cardmarket-Preise/-Links über die freie dotgg.gg-API — riftcodex.com
    // selbst liefert keine Preise. Schlüssel dort: "{Set-Code}-{Sammelnummer}"
    // (z. B. "UNL-205"), unabhängig von riftcodex' eigenem Aufbau verifiziert.
    onProgress('Lade Cardmarket-Preise (dotgg.gg) …');
    const cmPrices = await fetchDotggCardmarketPrices('riftbound');
    onProgress(`${cmPrices.size} Cardmarket-Preise empfangen.`);

    const byBaseName = new Map<string, RiftCard[]>();
    for (const c of apiCards) {
      const key = baseName(c.name);
      const group = byBaseName.get(key);
      if (group) group.push(c);
      else byBaseName.set(key, [c]);
    }

    // Kanonischer Print je Karte: Hauptset vor Promo-/Lern-Sets, Normal-Print vor
    // Variante. Lern-/Promo-Prints tragen teils abweichenden Reminder-Text.
    const promoSetIds = new Set(
      setsRes.items.filter((s) => /promo|judge|proving/i.test(s.name)).map((s) => s.set_id)
    );
    const score = (c: RiftCard): number => {
      let s = 0;
      if (!promoSetIds.has(c.set?.set_id || '')) s += 100;
      const m = c.metadata;
      if (!m?.alternate_art && !m?.overnumbered && !m?.signature) s += 10;
      return s;
    };

    // 3) Karten (Delta über Content-Hash)
    const existingCardHashes = new Map(
      (await db('cards').where('game_id', game.id).select('external_id', 'content_hash')).map((r) => [
        r.external_id,
        r.content_hash,
      ])
    );

    const cardRowsAll = [...byBaseName.entries()].map(([name, group]) => {
      const canon = [...group].sort((a, b) => score(b) - score(a))[0];
      // Basisname als fachlicher Schlüssel; MD5 davon, weil external_id auf 50 Zeichen begrenzt ist.
      const externalId = hashOf(name);
      const de = DE[name];
      const content = {
        name,
        name_de: de?.name ?? null,
        card_type: canon.classification?.type || null,
        card_text: decodeEntities(canon.text?.plain),
        card_text_de: de?.text ?? null,
        image_url: canon.media?.image_url || null,
        image_small_url: thumbnailUrl(canon.media?.image_url),
        game_data: JSON.stringify({
          energy: canon.attributes?.energy ?? null,
          might: canon.attributes?.might ?? null,
          power: canon.attributes?.power ?? null,
          domain: canon.classification?.domain ?? [],
          supertype: canon.classification?.supertype ?? null,
          rarity: canon.classification?.rarity ?? null,
          tags: canon.tags ?? [],
          artist: canon.media?.artist ?? null,
          flavour: decodeEntities(canon.text?.flavour),
          riftbound_id: canon.riftbound_id ?? null,
        }),
      };
      const contentHash = hashOf(content);
      return {
        externalId,
        contentHash,
        row: { game_id: game.id, external_id: externalId, ...content, content_hash: contentHash },
      };
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

    // 4) Prints (jeder API-Eintrag ist ein Druck; Duplikate über den Unique-Key hinweg verwerfen)
    const cardIdByExternal = new Map(
      (await db('cards').where('game_id', game.id).select('id', 'external_id')).map((r) => [r.external_id, r.id])
    );
    const existingPrints = new Map(
      (
        await db('card_prints')
          .join('cards', 'card_prints.card_id', 'cards.id')
          .where('cards.game_id', game.id)
          .select(
            'card_prints.card_id',
            'card_prints.set_id',
            'card_prints.collector_number',
            'card_prints.rarity',
            'card_prints.content_hash',
            'card_prints.market_price'
          )
      ).map((r) => [
        `${r.card_id}|${r.set_id}|${r.collector_number}|${r.rarity}`,
        { hash: r.content_hash as string | null, price: r.market_price == null ? null : Number(r.market_price) },
      ])
    );

    const printRowsByKey = new Map<string, { row: Record<string, unknown>; hash: string }>();
    for (const c of apiCards) {
      const cardId = cardIdByExternal.get(hashOf(baseName(c.name)));
      const setId = setIdByCode.get(c.set?.set_id || '');
      if (!cardId || !setId) continue;
      const collectorNumber = printedNumber(c);
      const rarity = c.classification?.rarity || null;
      const cm = cmPrices.get(`${c.set?.set_id || ''}-${collectorNumber}`);
      const marketPrice = cm?.price ?? null;
      const marketplaceUrl = cm?.url ?? null;
      const contentHash = hashOf({ rarity_code: null, market_price: marketPrice, marketplace_url: marketplaceUrl, currency: 'EUR' });
      printRowsByKey.set(`${cardId}|${setId}|${collectorNumber}|${rarity}`, {
        hash: contentHash,
        row: {
          card_id: cardId,
          set_id: setId,
          collector_number: collectorNumber,
          rarity,
          rarity_code: null,
          market_price: marketPrice,
          currency: 'EUR',
          marketplace_url: marketplaceUrl,
          content_hash: contentHash,
        },
      });
    }
    const changedPrintRows = [...printRowsByKey.entries()]
      .filter(([key, p]) => existingPrints.get(key)?.hash !== p.hash)
      .map(([, p]) => p.row);
    for (const chunk of chunked(changedPrintRows)) {
      await db('card_prints')
        .insert(chunk)
        .onConflict(['card_id', 'set_id', 'collector_number', 'rarity'])
        .merge(['rarity_code', 'market_price', 'currency', 'marketplace_url', 'content_hash']);
    }

    // Preis-Historie: Snapshot für alle Prints, deren Preis neu ist oder sich geändert hat.
    const priceChangedKeys = [...printRowsByKey.entries()].filter(([key, p]) => {
      const newPrice = p.row.market_price as number | null;
      if (newPrice == null) return false;
      const before = existingPrints.get(key);
      return !before || before.price !== newPrice;
    });
    if (priceChangedKeys.length) {
      const idByKey = new Map(
        (
          await db('card_prints')
            .join('cards', 'card_prints.card_id', 'cards.id')
            .where('cards.game_id', game.id)
            .select('card_prints.id', 'card_prints.card_id', 'card_prints.set_id', 'card_prints.collector_number', 'card_prints.rarity')
        ).map((r) => [`${r.card_id}|${r.set_id}|${r.collector_number}|${r.rarity}`, r.id as number])
      );
      const written = await recordPriceHistory(
        priceChangedKeys.map(([key, p]) => ({ print_id: idByKey.get(key) || 0, price: p.row.market_price as number })),
        'dotgg',
        'EUR'
      );
      onProgress(`Preis-Historie: ${written} Snapshots geschrieben.`);
    }

    await db('import_state')
      .insert({ game_id: game.id, source_version: remoteVersion, checked_at: db.fn.now() })
      .onConflict('game_id')
      .merge(['source_version', 'checked_at']);

    const stats: ImportStats = {
      sets: setsRes.items.length,
      cards: cardRowsAll.length,
      prints: printRowsByKey.size,
      cardsChanged: changedCardRows.length,
      printsChanged: changedPrintRows.length,
      skipped: false,
    };
    onProgress(`Import abgeschlossen: ${stats.sets} Sets, ${stats.cardsChanged}/${stats.cards} Karten, ${stats.printsChanged}/${stats.prints} Prints.`);
    return stats;
  },
};
