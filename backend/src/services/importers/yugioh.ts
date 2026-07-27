import { db } from '../../db';
import { GameImporter, ImportOptions, ImportStats } from './types';
import { CHUNK, chunked, fetchJson, hashOf, recordPriceHistory } from './util';

const API_BASE = 'https://db.ygoprodeck.com/api/v7';

interface YgoSet {
  set_name: string;
  set_code: string;
  num_of_cards: number;
  tcg_date?: string;
  set_image?: string;
}

interface YgoCard {
  id: number;
  name: string;
  type: string;
  frameType?: string;
  desc: string;
  race?: string;
  attribute?: string;
  atk?: number;
  def?: number;
  level?: number;
  archetype?: string;
  linkval?: number;
  scale?: number;
  banlist_info?: { ban_tcg?: string };
  card_sets?: {
    set_name: string;
    set_code: string; // vollständige Set-Nummer, z. B. "LOB-EN001"
    set_rarity: string;
    set_rarity_code?: string; // z. B. "(UR)"
    set_price?: string;
  }[];
  card_images?: { image_url: string; image_url_small: string }[];
}

interface YgoDbVersion {
  database_version?: string;
  last_update?: string;
}

interface YgoCardDe {
  id: number;
  name: string;
  desc: string;
}

/** Aktuelle Version des YGOPRODeck-Datenbestands; null, wenn die Anfrage fehlschlägt. */
async function fetchRemoteVersion(): Promise<string | null> {
  try {
    const [info] = await fetchJson<YgoDbVersion[]>(`${API_BASE}/checkDBVer.php`);
    if (!info) return null;
    return `${info.database_version || ''}|${info.last_update || ''}`;
  } catch {
    return null; // Versions-Check ist nur eine Abkürzung — bei Fehlern normal weiterimportieren
  }
}

export const yugiohImporter: GameImporter = {
  gameCode: 'yugioh',

  async run(onProgress = () => {}, options: ImportOptions = {}): Promise<ImportStats> {
    const game = await db('games').where({ code: 'yugioh' }).first();
    if (!game) throw new Error('Spiel "yugioh" fehlt in der games-Tabelle (Migration ausführen).');

    // 0) Kurzschluss: Wenn sich die Quelle seit dem letzten Lauf nicht geändert hat,
    //    lohnt sich der komplette Fetch+Vergleich nicht — das spart die größte Arbeit.
    const remoteVersion = await fetchRemoteVersion();
    if (!options.force && remoteVersion) {
      const state = await db('import_state').where({ game_id: game.id }).first();
      if (state && state.source_version === remoteVersion) {
        onProgress(`Katalog bereits aktuell (Quellversion ${remoteVersion.split('|')[0] || remoteVersion}) — kein Import nötig.`);
        return { sets: 0, cards: 0, prints: 0, cardsChanged: 0, printsChanged: 0, skipped: true };
      }
    }

    // 1) Sets importieren (kleine Tabelle, immer vollständig aktualisiert) ----
    onProgress('Lade Set-Liste von YGOPRODeck …');
    const sets = await fetchJson<YgoSet[]>(`${API_BASE}/cardsets.php`);
    const setRows = sets
      .filter((s) => s.set_code)
      .map((s) => ({
        game_id: game.id,
        code: s.set_code.trim(),
        name: s.set_name,
        release_date: s.tcg_date || null,
        card_count: s.num_of_cards || null,
        image_url: s.set_image || null,
      }));
    for (const chunk of chunked(setRows, CHUNK)) {
      await db('card_sets')
        .insert(chunk)
        .onConflict(['game_id', 'code'])
        .merge(['name', 'release_date', 'card_count', 'image_url']);
    }
    onProgress(`${setRows.length} Sets übernommen.`);

    // 2) Karten laden und per Content-Hash mit dem bestehenden Bestand vergleichen —
    //    nur tatsächlich geänderte oder neue Karten werden geschrieben. -------------
    onProgress('Lade vollständigen Kartenkatalog (das dauert einen Moment) …');
    const { data: cards } = await fetchJson<{ data: YgoCard[] }>(`${API_BASE}/cardinfo.php`);

    onProgress('Lade deutsche Kartennamen/-texte …');
    let deByExternalId = new Map<string, { name: string; desc: string }>();
    try {
      const { data: cardsDe } = await fetchJson<{ data: YgoCardDe[] }>(`${API_BASE}/cardinfo.php?language=de`);
      deByExternalId = new Map(cardsDe.map((c) => [String(c.id), { name: c.name, desc: c.desc }]));
      onProgress(`${deByExternalId.size} deutsche Übersetzungen empfangen (nicht jede Karte hat eine deutsche TCG-Ausgabe).`);
    } catch (err) {
      onProgress(`Warnung: deutsche Übersetzungen konnten nicht geladen werden (${(err as Error).message}) — importiere ohne.`);
    }

    onProgress(`${cards.length} Karten empfangen, vergleiche mit vorhandenem Bestand …`);

    const existingCardHashes = new Map(
      (await db('cards').where('game_id', game.id).select('external_id', 'content_hash')).map((r) => [
        r.external_id,
        r.content_hash,
      ])
    );

    const cardRowsAll = cards.map((c) => {
      const externalId = String(c.id);
      const de = deByExternalId.get(externalId);
      const content = {
        name: c.name,
        name_de: de?.name ?? null,
        card_type: c.type || null,
        card_text: c.desc || null,
        card_text_de: de?.desc ?? null,
        image_url: c.card_images?.[0]?.image_url || null,
        image_small_url: c.card_images?.[0]?.image_url_small || null,
        game_data: JSON.stringify({
          frameType: c.frameType ?? null,
          race: c.race ?? null,
          attribute: c.attribute ?? null,
          level: c.level ?? null,
          atk: c.atk ?? null,
          def: c.def ?? null,
          archetype: c.archetype ?? null,
          linkval: c.linkval ?? null,
          scale: c.scale ?? null,
          // Banlist-Status (TCG) — "Forbidden"/"Limited"/"Semi-Limited", sonst nicht gesetzt.
          // Ändert sich der Status, ändert sich der Content-Hash, der nächste Delta-Import zieht ihn also nach.
          banTcg: c.banlist_info?.ban_tcg ?? null,
        }),
      };
      const contentHash = hashOf(content);
      return { externalId, contentHash, row: { game_id: game.id, external_id: externalId, ...content, content_hash: contentHash } };
    });

    const changedCardRows = cardRowsAll
      .filter((c) => existingCardHashes.get(c.externalId) !== c.contentHash)
      .map((c) => ({ ...c.row, updated_at: db.fn.now() }));

    let done = 0;
    for (const chunk of chunked(changedCardRows, CHUNK)) {
      await db('cards')
        .insert(chunk)
        .onConflict(['game_id', 'external_id'])
        .merge([
          'name',
          'name_de',
          'card_type',
          'card_text',
          'card_text_de',
          'image_url',
          'image_small_url',
          'game_data',
          'content_hash',
          'updated_at',
        ]);
      done += chunk.length;
      if (done % 5000 < CHUNK) onProgress(`Karten aktualisiert: ${done}/${changedCardRows.length}`);
    }
    onProgress(`Karten: ${changedCardRows.length} von ${cardRowsAll.length} geändert/neu, Rest unverändert übersprungen.`);

    // 3) Prints verknüpfen — ebenfalls nur geänderte/neue Zeilen schreiben. --------
    onProgress('Verknüpfe Prints (Karte ↔ Set ↔ Seltenheit) …');
    const idRows = await db('cards').where('game_id', game.id).select('id', 'external_id');
    const cardIdByExternal = new Map(idRows.map((r) => [r.external_id, r.id]));
    const setIdByCode = new Map(
      (await db('card_sets').where('game_id', game.id).select('id', 'code')).map((r) => [r.code, r.id])
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

    const printRowsAll: { key: string; row: Record<string, unknown> }[] = [];
    const seen = new Set<string>();
    for (const c of cards) {
      const cardId = cardIdByExternal.get(String(c.id));
      if (!cardId || !c.card_sets) continue;
      for (const p of c.card_sets) {
        // "LOB-EN001" → Set-Code "LOB"; manche Nummern haben keinen Bindestrich
        const setCode = (p.set_code || '').split('-')[0].trim();
        let setId = setIdByCode.get(setCode);
        if (!setId) {
          // Set fehlt in der offiziellen Set-Liste → Stub anlegen
          await db('card_sets')
            .insert({ game_id: game.id, code: setCode || p.set_code, name: p.set_name })
            .onConflict(['game_id', 'code'])
            .merge(['name']);
          setId = (await db('card_sets').where({ game_id: game.id, code: setCode || p.set_code }).first())?.id;
          if (!setId) continue;
          setIdByCode.set(setCode, setId);
        }
        const rarity = p.set_rarity || null;
        const dedupeKey = `${cardId}|${setId}|${p.set_code}|${rarity}`;
        if (seen.has(dedupeKey)) continue; // Duplikate innerhalb der Quelle überspringen
        seen.add(dedupeKey);

        // set_price ist der TCGPlayer-Preis in USD (keine Cardmarket-EUR-Quelle
        // liefert Preise je Print/Rarität, siehe PROGRESS.md 2026-07-21 — daher
        // bewusst USD statt eines fälschlich als EUR beschrifteten oder auf
        // "ein Preis für alle Raritäten" verflachten Werts). currency wird
        // deshalb explizit mitgeführt statt implizit EUR anzunehmen.
        const price = p.set_price ? Number(p.set_price) : null;
        const marketPrice = price && price > 0 ? price : null;
        const rarityCode = p.set_rarity_code ? p.set_rarity_code.replace(/[()]/g, '') : null;
        const contentHash = hashOf({ rarity_code: rarityCode, market_price: marketPrice, currency: 'USD' });
        const hashKey = `${cardId}|${setId}|${p.set_code}|${rarity}`;

        printRowsAll.push({
          key: hashKey,
          row: {
            card_id: cardId,
            set_id: setId,
            collector_number: p.set_code || null,
            rarity,
            rarity_code: rarityCode,
            market_price: marketPrice,
            currency: 'USD',
            content_hash: contentHash,
          },
        });
      }
    }

    const changedPrintRows = printRowsAll
      .filter((p) => existingPrints.get(p.key)?.hash !== (p.row.content_hash as string))
      .map((p) => p.row);

    done = 0;
    for (const chunk of chunked(changedPrintRows, CHUNK)) {
      await db('card_prints')
        .insert(chunk)
        .onConflict(['card_id', 'set_id', 'collector_number', 'rarity'])
        .merge(['rarity_code', 'market_price', 'currency', 'content_hash']);
      done += chunk.length;
      if (done % 20000 < CHUNK) onProgress(`Prints aktualisiert: ${done}/${changedPrintRows.length}`);
    }

    // 4) Preis-Historie: Snapshot für alle Prints, deren Preis neu ist oder sich geändert hat.
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
        'ygoprodeck',
        'USD'
      );
      onProgress(`Preis-Historie: ${written} Snapshots geschrieben.`);
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
    onProgress(
      `Import abgeschlossen: ${stats.sets} Sets, ${stats.cardsChanged}/${stats.cards} Karten aktualisiert, ${stats.printsChanged}/${stats.prints} Prints aktualisiert.`
    );
    return stats;
  },
};
