import { db } from '../../db';
import { GameImporter, ImportOptions, ImportStats } from './types';
import { chunked, fetchJson, hashOf } from './util';

// Datenquelle: lorcanajson.org — ein statisches JSON pro Sprache, kein API-Key nötig.
const FILES_BASE = 'https://lorcanajson.org/files/current';

interface LorcanaMetadata {
  formatVersion?: string;
  generatedOn?: string;
}

interface LorcanaSet {
  name: string;
  releaseDate?: string;
}

interface LorcanaCard {
  id: number;
  fullName: string;
  setCode?: string | number;
  number?: number | string;
  type?: string;
  color?: string;
  colors?: string[];
  cost?: number;
  rarity?: string;
  strength?: number;
  willpower?: number;
  lore?: number;
  inkwell?: boolean;
  story?: string;
  fullText?: string;
  images?: { full?: string; thumbnail?: string };
}

interface LorcanaFile {
  metadata?: LorcanaMetadata;
  sets: Record<string, LorcanaSet>;
  cards: LorcanaCard[];
}

export const lorcanaImporter: GameImporter = {
  gameCode: 'lorcana',

  async run(onProgress = () => {}, options: ImportOptions = {}): Promise<ImportStats> {
    const game = await db('games').where({ code: 'lorcana' }).first();
    if (!game) throw new Error('Spiel "lorcana" fehlt in der games-Tabelle (Migration ausführen).');

    // Versions-Kurzschluss über metadata.json (klein, schnell)
    let remoteVersion: string | null = null;
    try {
      const meta = await fetchJson<LorcanaMetadata>(`${FILES_BASE}/en/metadata.json`);
      remoteVersion = meta.generatedOn || null;
    } catch {
      // Versions-Check ist nur eine Abkürzung
    }
    if (!options.force && remoteVersion) {
      const state = await db('import_state').where({ game_id: game.id }).first();
      if (state && state.source_version === remoteVersion) {
        onProgress(`Katalog bereits aktuell (Stand ${remoteVersion}) — kein Import nötig.`);
        return { sets: 0, cards: 0, prints: 0, cardsChanged: 0, printsChanged: 0, skipped: true };
      }
    }

    onProgress('Lade Lorcana-Katalog (Englisch) …');
    const en = await fetchJson<LorcanaFile>(`${FILES_BASE}/en/allCards.json`);

    onProgress('Lade deutsche Kartennamen/-texte …');
    let deById = new Map<number, { name: string; text: string | null }>();
    try {
      const de = await fetchJson<LorcanaFile>(`${FILES_BASE}/de/allCards.json`);
      deById = new Map(de.cards.map((c) => [c.id, { name: c.fullName, text: c.fullText || null }]));
      onProgress(`${deById.size} deutsche Übersetzungen empfangen.`);
    } catch (err) {
      onProgress(`Warnung: deutsche Übersetzungen konnten nicht geladen werden (${(err as Error).message}) — importiere ohne.`);
    }

    // 1) Sets
    const cardsPerSet = new Map<string, number>();
    for (const c of en.cards) {
      const code = String(c.setCode ?? '');
      if (code) cardsPerSet.set(code, (cardsPerSet.get(code) || 0) + 1);
    }
    const setRows = Object.entries(en.sets).map(([code, s]) => ({
      game_id: game.id,
      code,
      name: s.name,
      release_date: s.releaseDate || null,
      card_count: cardsPerSet.get(code) || null,
      image_url: null,
    }));
    for (const chunk of chunked(setRows)) {
      await db('card_sets')
        .insert(chunk)
        .onConflict(['game_id', 'code'])
        .merge(['name', 'release_date', 'card_count']);
    }
    const setIdByCode = new Map(
      (await db('card_sets').where('game_id', game.id).select('id', 'code')).map((r) => [r.code, r.id])
    );
    onProgress(`${setRows.length} Sets übernommen.`);

    // 2) Karten (Delta über Content-Hash)
    const existingCardHashes = new Map(
      (await db('cards').where('game_id', game.id).select('external_id', 'content_hash')).map((r) => [
        r.external_id,
        r.content_hash,
      ])
    );

    const cardRowsAll = en.cards.map((c) => {
      const externalId = String(c.id);
      const de = deById.get(c.id);
      const content = {
        name: c.fullName,
        name_de: de?.name ?? null,
        card_type: c.type || null,
        card_text: c.fullText || null,
        card_text_de: de?.text ?? null,
        image_url: c.images?.full || null,
        image_small_url: c.images?.thumbnail || c.images?.full || null,
        game_data: JSON.stringify({
          ink: c.color || (c.colors ? c.colors.join('/') : null),
          cost: c.cost ?? null,
          lore: c.lore ?? null,
          strength: c.strength ?? null,
          willpower: c.willpower ?? null,
          inkwell: c.inkwell ?? null,
          rarity: c.rarity ?? null,
          story: c.story ?? null,
        }),
      };
      const contentHash = hashOf(content);
      return { externalId, contentHash, row: { game_id: game.id, external_id: externalId, ...content, content_hash: contentHash } };
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

    // 3) Prints (1 Print je Karte: Set + Nummer + Seltenheit; keine Preise in der Quelle)
    const cardIdByExternal = new Map(
      (await db('cards').where('game_id', game.id).select('id', 'external_id')).map((r) => [r.external_id, r.id])
    );
    const existingPrintHashes = new Map(
      (
        await db('card_prints')
          .join('cards', 'card_prints.card_id', 'cards.id')
          .where('cards.game_id', game.id)
          .select('card_prints.card_id', 'card_prints.set_id', 'card_prints.collector_number', 'card_prints.rarity', 'card_prints.content_hash')
      ).map((r) => [`${r.card_id}|${r.set_id}|${r.collector_number}|${r.rarity}`, r.content_hash])
    );

    const printRowsAll: { key: string; row: Record<string, unknown> }[] = [];
    for (const c of en.cards) {
      const cardId = cardIdByExternal.get(String(c.id));
      const setId = setIdByCode.get(String(c.setCode ?? ''));
      if (!cardId || !setId) continue;
      const collectorNumber = c.number != null ? String(c.number) : null;
      const rarity = c.rarity || null;
      const contentHash = hashOf({ rarity_code: null, market_price: null });
      printRowsAll.push({
        key: `${cardId}|${setId}|${collectorNumber}|${rarity}`,
        row: {
          card_id: cardId,
          set_id: setId,
          collector_number: collectorNumber,
          rarity,
          rarity_code: null,
          market_price: null,
          content_hash: contentHash,
        },
      });
    }
    const changedPrintRows = printRowsAll
      .filter((p) => existingPrintHashes.get(p.key) !== (p.row.content_hash as string))
      .map((p) => p.row);
    for (const chunk of chunked(changedPrintRows)) {
      await db('card_prints')
        .insert(chunk)
        .onConflict(['card_id', 'set_id', 'collector_number', 'rarity'])
        .merge(['rarity_code', 'market_price', 'content_hash']);
    }

    if (remoteVersion) {
      await db('import_state')
        .insert({ game_id: game.id, source_version: remoteVersion, checked_at: db.fn.now() })
        .onConflict('game_id')
        .merge(['source_version', 'checked_at']);
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
