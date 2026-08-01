import { createGunzip } from 'zlib';
import { createInterface } from 'readline';
import { Readable } from 'stream';
import { db } from '../../db';
import { GameImporter, ImportOptions, ImportStats } from './types';
import { chunked, fetchJson, hashOf, recordPriceHistory } from './util';

// Datenquelle: Scryfall. Die Bulk-Datei "all_cards" (jede Ausgabe jeder Karte
// in JEDER Sprache — nicht nur Englisch wie bei "default_cards", s. u.) wird
// STREAMEND geparst, damit der Speicherbedarf auf der Synology begrenzt
// bleibt — es landen nur reduzierte Zeilen im RAM. Scryfall liefert sie als
// gzip-komprimierte JSONL-Datei (ein JSON-Objekt pro Zeile) unter
// `jsonl_download_uri` — das früher genutzte, unkomprimierte JSON-Array unter
// `download_uri` gibt es seit einem API-Umbau nicht mehr (Stand 2026-07-31,
// live gegen die echte Scryfall-API geprüft: das Feld fehlt seither komplett
// in der `/bulk-data`-Antwort).
//
// "all_cards" statt des kleineren "default_cards" (372 MB statt 74 MB
// komprimiert, Stand 2026-08-01), weil nur "all_cards" auch die deutschen
// Papier-Ausgaben enthält (`lang: "de"`, Felder `printed_name`/`printed_text`)
// — "default_cards" bevorzugt pro Karte+Set nur eine (meist englische)
// Sprache. Deutsche Zeilen werden nur für `name_de`/`card_text_de`
// ausgewertet, nicht als eigene Prints übernommen (derselbe physische Print
// existiert ja bereits über die englische Zeile).
const API_BASE = 'https://api.scryfall.com';

interface ScryfallSet {
  code: string;
  name: string;
  released_at?: string;
  card_count?: number;
  icon_svg_uri?: string;
}

interface ScryfallImageUris {
  small?: string;
  normal?: string;
  large?: string;
}

interface ScryfallCard {
  oracle_id?: string;
  name: string;
  lang?: string;
  set: string;
  set_name?: string;
  collector_number?: string;
  rarity?: string;
  type_line?: string;
  oracle_text?: string;
  cmc?: number;
  mana_cost?: string;
  colors?: string[];
  color_identity?: string[];
  image_uris?: ScryfallImageUris;
  card_faces?: { oracle_text?: string; image_uris?: ScryfallImageUris; printed_name?: string | null; printed_text?: string | null }[];
  prices?: { eur?: string | null; usd?: string | null };
  games?: string[];
  flavor_name?: string | null;
  // Nur bei lang != "en" gesetzt (übersetzter Name/Text der Druckausgabe;
  // bei mehrseitigen Karten stattdessen auf card_faces[]).
  printed_name?: string | null;
  printed_text?: string | null;
}

interface BulkDataEntry {
  type: string;
  updated_at: string;
  jsonl_download_uri: string;
}

export const magicImporter: GameImporter = {
  gameCode: 'magic',

  async run(onProgress = () => {}, options: ImportOptions = {}): Promise<ImportStats> {
    const game = await db('games').where({ code: 'magic' }).first();
    if (!game) throw new Error('Spiel "magic" fehlt in der games-Tabelle (Migration ausführen).');

    // Bulk-Data-Katalog abfragen: liefert Download-URL + Stand der Daten
    const bulk = await fetchJson<{ data: BulkDataEntry[] }>(`${API_BASE}/bulk-data`);
    const entry = bulk.data.find((b) => b.type === 'all_cards');
    if (!entry) throw new Error('Scryfall-Bulk-Eintrag "all_cards" nicht gefunden.');

    const remoteVersion = entry.updated_at;
    if (!options.force && remoteVersion) {
      const state = await db('import_state').where({ game_id: game.id }).first();
      if (state && state.source_version === remoteVersion) {
        onProgress(`Katalog bereits aktuell (Stand ${remoteVersion}) — kein Import nötig.`);
        return { sets: 0, cards: 0, prints: 0, cardsChanged: 0, printsChanged: 0, skipped: true };
      }
    }

    // 1) Sets (paginiert über next_page)
    onProgress('Lade Set-Liste von Scryfall …');
    const sets: ScryfallSet[] = [];
    let url: string | null = `${API_BASE}/sets`;
    while (url) {
      const page: { data: ScryfallSet[]; has_more?: boolean; next_page?: string } = await fetchJson(url);
      sets.push(...page.data);
      url = page.has_more && page.next_page ? page.next_page : null;
    }
    const setRows = sets.map((s) => ({
      game_id: game.id,
      code: s.code,
      name: s.name,
      release_date: s.released_at || null,
      card_count: s.card_count || null,
      image_url: s.icon_svg_uri || null,
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

    // 2) Bulk-Datei streamen und auf reduzierte Zeilen eindampfen.
    //    Logische Karte = Oracle-ID (Regeltext-Identität), Print = konkrete Ausgabe.
    if (!entry.jsonl_download_uri) throw new Error('Scryfall-Bulk-Eintrag "all_cards" hat keine jsonl_download_uri.');
    onProgress(`Lade und streame Bulk-Datei (${entry.jsonl_download_uri.split('/').pop()}, das dauert einige Minuten) …`);
    const res = await fetch(entry.jsonl_download_uri, { headers: { 'User-Agent': 'tcg-collection-manager' } });
    if (!res.ok || !res.body) throw new Error(`Scryfall-Bulk-Download fehlgeschlagen: ${res.status}`);

    interface CardContent {
      name: string;
      card_type: string | null;
      card_text: string | null;
      image_url: string | null;
      image_small_url: string | null;
      game_data: string;
    }
    const cardByOracle = new Map<string, CardContent>();
    const deByOracle = new Map<string, { name: string | null; text: string | null }>();
    const printTuples: {
      oracleId: string;
      setCode: string;
      collectorNumber: string | null;
      rarity: string | null;
      price: number | null;
      flavorName: string | null;
    }[] = [];

    // Datei ist gzip-komprimiert und JSONL (ein JSON-Objekt pro Zeile) —
    // Node dekomprimiert nicht automatisch, da der Server keinen
    // Content-Encoding-Header setzt (`.gz` ist der eigentliche Dateiinhalt).
    const lines = createInterface({ input: Readable.fromWeb(res.body as never).pipe(createGunzip()), crlfDelay: Infinity });

    let seen = 0;
    for await (const line of lines) {
      if (!line) continue;
      const c = JSON.parse(line) as ScryfallCard;
      seen++;
      if (seen % 50000 === 0) onProgress(`Bulk-Datei: ${seen} Einträge verarbeitet …`);
      if (!c.oracle_id) continue;
      if (c.games && !c.games.includes('paper')) continue; // nur physisch erhältliche Prints
      if (c.lang !== 'en' && c.lang !== 'de') continue; // andere Sprachen tragen aktuell keine Übersetzung bei

      if (c.lang === 'de') {
        if (!deByOracle.has(c.oracle_id)) {
          const name = c.printed_name || (c.card_faces || []).map((f) => f.printed_name).filter(Boolean).join(' // ') || null;
          const text = c.printed_text || (c.card_faces || []).map((f) => f.printed_text).filter(Boolean).join('\n//\n') || null;
          if (name || text) deByOracle.set(c.oracle_id, { name, text });
        }
        continue; // deutsche Zeile trägt nur zur Übersetzung bei, nicht zu Prints (derselbe physische Print existiert schon über die englische Zeile)
      }

      if (!cardByOracle.has(c.oracle_id)) {
        const faceImages = c.image_uris || c.card_faces?.[0]?.image_uris;
        const text = c.oracle_text || (c.card_faces || []).map((f) => f.oracle_text).filter(Boolean).join('\n//\n') || null;
        const colors = (c.colors && c.colors.length ? c.colors : c.color_identity) || [];
        cardByOracle.set(c.oracle_id, {
          name: c.name,
          card_type: c.type_line || null,
          card_text: text,
          image_url: faceImages?.normal || faceImages?.large || null,
          image_small_url: faceImages?.small || null,
          game_data: JSON.stringify({
            colors: colors.length ? colors.join('') : 'C',
            cmc: c.cmc ?? null,
            mana_cost: c.mana_cost ?? null,
          }),
        });
      }
      const eur = c.prices?.eur ? Number(c.prices.eur) : null;
      printTuples.push({
        oracleId: c.oracle_id,
        setCode: c.set,
        collectorNumber: c.collector_number || null,
        rarity: c.rarity || null,
        price: eur && eur > 0 ? eur : null,
        flavorName: c.flavor_name || null,
      });
    }
    onProgress(`Bulk-Datei fertig: ${cardByOracle.size} Karten, ${printTuples.length} Papier-Prints, ${deByOracle.size} deutsche Übersetzungen.`);

    // 3) Karten-Delta schreiben
    const existingCardHashes = new Map(
      (await db('cards').where('game_id', game.id).select('external_id', 'content_hash')).map((r) => [
        r.external_id,
        r.content_hash,
      ])
    );
    const cardRowsAll = [...cardByOracle.entries()].map(([oracleId, content]) => {
      const de = deByOracle.get(oracleId);
      const full = { ...content, name_de: de?.name ?? null, card_text_de: de?.text ?? null };
      const contentHash = hashOf(full);
      return { externalId: oracleId, contentHash, row: { game_id: game.id, external_id: oracleId, ...full, content_hash: contentHash } };
    });
    const changedCardRows = cardRowsAll
      .filter((c) => existingCardHashes.get(c.externalId) !== c.contentHash)
      .map((c) => ({ ...c.row, updated_at: db.fn.now() }));
    let done = 0;
    for (const chunk of chunked(changedCardRows)) {
      await db('cards')
        .insert(chunk)
        .onConflict(['game_id', 'external_id'])
        .merge(['name', 'name_de', 'card_type', 'card_text', 'card_text_de', 'image_url', 'image_small_url', 'game_data', 'content_hash', 'updated_at']);
      done += chunk.length;
      if (done % 5000 < 500) onProgress(`Karten aktualisiert: ${done}/${changedCardRows.length}`);
    }
    onProgress(`Karten: ${changedCardRows.length} von ${cardRowsAll.length} geändert/neu.`);

    // 4) Print-Delta schreiben (inkl. Preis-Historie bei Preisänderung)
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
    const dedupe = new Set<string>();
    for (const p of printTuples) {
      const cardId = cardIdByExternal.get(p.oracleId);
      const setId = setIdByCode.get(p.setCode);
      if (!cardId || !setId) continue;
      const key = `${cardId}|${setId}|${p.collectorNumber}|${p.rarity}`;
      if (dedupe.has(key)) continue;
      dedupe.add(key);
      printRowsAll.push({
        key,
        row: {
          card_id: cardId,
          set_id: setId,
          collector_number: p.collectorNumber,
          rarity: p.rarity,
          rarity_code: p.rarity ? p.rarity[0].toUpperCase() : null,
          market_price: p.price,
          currency: 'EUR',
          flavor_name: p.flavorName,
          content_hash: hashOf({
            rarity_code: p.rarity ? p.rarity[0].toUpperCase() : null,
            market_price: p.price,
            currency: 'EUR',
            flavor_name: p.flavorName,
          }),
        },
      });
    }
    const changedPrintRows = printRowsAll
      .filter((p) => existingPrints.get(p.key)?.hash !== (p.row.content_hash as string))
      .map((p) => p.row);
    done = 0;
    for (const chunk of chunked(changedPrintRows)) {
      await db('card_prints')
        .insert(chunk)
        .onConflict(['card_id', 'set_id', 'collector_number', 'rarity'])
        .merge(['rarity_code', 'market_price', 'currency', 'flavor_name', 'content_hash']);
      done += chunk.length;
      if (done % 20000 < 500) onProgress(`Prints aktualisiert: ${done}/${changedPrintRows.length}`);
    }

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
        'scryfall',
        'EUR'
      );
      onProgress(`Preis-Historie: ${written} Snapshots geschrieben.`);
    }

    await db('import_state')
      .insert({ game_id: game.id, source_version: remoteVersion, checked_at: db.fn.now() })
      .onConflict('game_id')
      .merge(['source_version', 'checked_at']);

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
