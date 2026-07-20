import { FastifyInstance } from 'fastify';
import { db } from '../db';
import { withLocalImages } from '../services/images';
import { parseGameData } from '../types';

const ZONES = ['main', 'extra', 'side'];

/** Besitzmengen je Karte (Summe über alle Prints und Sammlungseinträge). */
async function ownedByCardId(cardIds: number[]): Promise<Record<number, number>> {
  if (!cardIds.length) return {};
  const owned = await db('collection_items')
    .join('card_prints', 'collection_items.print_id', 'card_prints.id')
    .whereIn('card_prints.card_id', cardIds)
    .select('card_prints.card_id')
    .sum({ n: 'collection_items.quantity' })
    .groupBy('card_prints.card_id');
  return Object.fromEntries((owned as { card_id: number; n?: unknown }[]).map((o) => [o.card_id, Number(o.n || 0)]));
}

export async function deckRoutes(app: FastifyInstance) {
  // Alle Decks (optional je Spiel) inkl. Kartenzahl je Zone
  app.get<{ Querystring: { game?: string } }>('/decks', async (req) => {
    const query = db('decks').join('games', 'decks.game_id', 'games.id').select('decks.*', 'games.code as game_code');
    if (req.query.game) query.where('games.code', req.query.game);
    const decks = await query.orderBy('decks.updated_at', 'desc');

    const counts = await db('deck_cards')
      .whereIn('deck_id', decks.map((d: { id: number }) => d.id))
      .select('deck_id', 'zone')
      .sum({ n: 'quantity' })
      .groupBy('deck_id', 'zone');
    const byDeck: Record<number, Record<string, number>> = {};
    for (const c of counts as { deck_id: number; zone: string; n?: unknown }[]) {
      (byDeck[c.deck_id] ||= {})[c.zone] = Number(c.n || 0);
    }

    return {
      data: decks.map((d: { id: number }) => ({
        ...d,
        zoneCounts: byDeck[d.id] || {},
        cardCount: Object.values(byDeck[d.id] || {}).reduce((a, b) => a + b, 0),
      })),
    };
  });

  // Deck anlegen
  app.post<{ Body: { game: string; name: string; description?: string | null } }>('/decks', async (req, reply) => {
    const { game: gameCode, name, description } = req.body || ({} as never);
    if (!gameCode || !name?.trim()) {
      return reply.code(400).send({ error: { message: 'game und name sind erforderlich', statusCode: 400 } });
    }
    const game = await db('games').where({ code: gameCode }).first();
    if (!game) return reply.code(404).send({ error: { message: 'Spiel nicht gefunden', statusCode: 404 } });

    const [id] = await db('decks').insert({ game_id: game.id, name: name.trim(), description: description ?? null });
    const deck = await db('decks').where('id', id).first();
    return reply.code(201).send({ data: { ...deck, game_code: gameCode, zoneCounts: {}, cardCount: 0 } });
  });

  // Deck inkl. aller Karten (mit Karteninfos und Besitzmengen)
  app.get<{ Params: { id: string } }>('/decks/:id', async (req, reply) => {
    const deck = await db('decks')
      .join('games', 'decks.game_id', 'games.id')
      .where('decks.id', Number(req.params.id))
      .select('decks.*', 'games.code as game_code')
      .first();
    if (!deck) return reply.code(404).send({ error: { message: 'Deck nicht gefunden', statusCode: 404 } });

    const rows = await db('deck_cards')
      .join('cards', 'deck_cards.card_id', 'cards.id')
      .where('deck_cards.deck_id', deck.id)
      .select(
        'deck_cards.card_id',
        'deck_cards.zone',
        'deck_cards.quantity',
        'cards.name',
        'cards.name_de',
        'cards.card_type',
        'cards.image_small_path',
        'cards.image_path',
        'cards.game_data'
      )
      .orderBy('cards.name');

    const ownedBy = await ownedByCardId(rows.map((r: { card_id: number }) => r.card_id));

    return {
      data: {
        ...deck,
        cards: rows.map((r: { card_id: number; game_data: never }) =>
          withLocalImages({
            ...r,
            game_data: parseGameData(r.game_data),
            ownedQuantity: ownedBy[r.card_id] || 0,
          })
        ),
      },
    };
  });

  // Deck umbenennen / Beschreibung ändern
  app.patch<{ Params: { id: string }; Body: { name?: string; description?: string | null } }>(
    '/decks/:id',
    async (req, reply) => {
      const deck = await db('decks').where('id', Number(req.params.id)).first();
      if (!deck) return reply.code(404).send({ error: { message: 'Deck nicht gefunden', statusCode: 404 } });
      const patch: Record<string, unknown> = {};
      if (req.body?.name !== undefined) {
        if (!req.body.name.trim()) return reply.code(400).send({ error: { message: 'name darf nicht leer sein', statusCode: 400 } });
        patch.name = req.body.name.trim();
      }
      if (req.body?.description !== undefined) patch.description = req.body.description;
      if (!Object.keys(patch).length) return reply.code(400).send({ error: { message: 'Keine änderbaren Felder übergeben', statusCode: 400 } });
      patch.updated_at = db.fn.now();
      await db('decks').where('id', deck.id).update(patch);
      return { data: await db('decks').where('id', deck.id).first() };
    }
  );

  // Deck löschen (Karten via ON DELETE CASCADE)
  app.delete<{ Params: { id: string } }>('/decks/:id', async (req, reply) => {
    const deleted = await db('decks').where('id', Number(req.params.id)).del();
    if (!deleted) return reply.code(404).send({ error: { message: 'Deck nicht gefunden', statusCode: 404 } });
    return reply.code(204).send();
  });

  // Kartenmenge in einer Zone SETZEN (0 = entfernen) — idempotent, das Frontend
  // schickt immer den Zielzustand statt Deltas.
  app.put<{ Params: { id: string }; Body: { card_id: number; zone?: string; quantity: number } }>(
    '/decks/:id/cards',
    async (req, reply) => {
      const deck = await db('decks').where('id', Number(req.params.id)).first();
      if (!deck) return reply.code(404).send({ error: { message: 'Deck nicht gefunden', statusCode: 404 } });

      const { card_id, quantity } = req.body || ({} as never);
      const zone = req.body?.zone || 'main';
      if (!card_id || quantity == null || quantity < 0) {
        return reply.code(400).send({ error: { message: 'card_id und quantity (≥ 0) sind erforderlich', statusCode: 400 } });
      }
      if (!ZONES.includes(zone)) {
        return reply.code(400).send({ error: { message: `zone muss eines von ${ZONES.join(', ')} sein`, statusCode: 400 } });
      }
      const card = await db('cards').where({ id: card_id, game_id: deck.game_id }).first();
      if (!card) return reply.code(404).send({ error: { message: 'Karte nicht gefunden (oder falsches Spiel)', statusCode: 404 } });

      if (quantity === 0) {
        await db('deck_cards').where({ deck_id: deck.id, card_id, zone }).del();
      } else {
        await db('deck_cards')
          .insert({ deck_id: deck.id, card_id, zone, quantity })
          .onConflict(['deck_id', 'card_id', 'zone'])
          .merge(['quantity']);
      }
      await db('decks').where('id', deck.id).update({ updated_at: db.fn.now() });
      return { data: { card_id, zone, quantity } };
    }
  );

  // --- YDK-Export (YGOPro-/cardcluster-Format) ------------------------------
  // Eine Zeile je Kopie (external_id = Passcode bei Yu-Gi-Oh!),
  // Sektionen #main / #extra / !side.
  app.get<{ Params: { id: string } }>('/decks/:id/export.ydk', async (req, reply) => {
    const deck = await db('decks').where('id', Number(req.params.id)).first();
    if (!deck) return reply.code(404).send({ error: { message: 'Deck nicht gefunden', statusCode: 404 } });

    const rows = await db('deck_cards')
      .join('cards', 'deck_cards.card_id', 'cards.id')
      .where('deck_cards.deck_id', deck.id)
      .select('cards.external_id', 'deck_cards.zone', 'deck_cards.quantity')
      .orderBy('deck_cards.id');

    const codesFor = (zone: string) =>
      rows
        .filter((r: { zone: string }) => r.zone === zone)
        .flatMap((r: { external_id: string; quantity: number }) => Array(r.quantity).fill(r.external_id));

    const lines = [
      '#created by tcg-collection-manager',
      '#main',
      ...codesFor('main'),
      '#extra',
      ...codesFor('extra'),
      '!side',
      ...codesFor('side'),
    ];
    const safeName = String(deck.name).replace(/[^\wäöüÄÖÜß \-\[\]().]/g, '_');
    reply
      .header('Content-Type', 'text/plain; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="${safeName}.ydk"`);
    return reply.send(lines.join('\n') + '\n');
  });

  // --- YDK-Import ------------------------------------------------------------
  // Body: YDK-Rohtext (Content-Type text/plain). Erzeugt ein neues Deck;
  // Passcodes, die nicht im Katalog sind, werden als "unmatched" gemeldet.
  app.post<{ Querystring: { game?: string; name?: string } }>('/decks/import', async (req, reply) => {
    const gameCode = req.query.game || 'yugioh';
    const game = await db('games').where({ code: gameCode }).first();
    if (!game) return reply.code(404).send({ error: { message: 'Spiel nicht gefunden', statusCode: 404 } });

    const text = typeof req.body === 'string' ? req.body : '';
    if (!text.trim()) {
      return reply.code(400).send({ error: { message: 'YDK-Inhalt fehlt (Content-Type text/plain verwenden)', statusCode: 400 } });
    }

    // Parsen: Zone wechselt an den Sektionsmarkern, jede Passcode-Zeile zählt eine Kopie
    const counts = new Map<string, number>(); // "zone|external_id" → Anzahl
    let zone: 'main' | 'extra' | 'side' = 'main';
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line) continue;
      if (/^#main$/i.test(line)) { zone = 'main'; continue; }
      if (/^#extra$/i.test(line)) { zone = 'extra'; continue; }
      if (/^!side$/i.test(line)) { zone = 'side'; continue; }
      if (line.startsWith('#')) continue; // Kommentar (z. B. "#created by …")
      const code = line.replace(/^0+(?=\d)/, ''); // führende Nullen wie in external_id normalisieren
      const key = `${zone}|${code}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    if (!counts.size) {
      return reply.code(400).send({ error: { message: 'Keine Karten im YDK-Inhalt gefunden', statusCode: 400 } });
    }

    const externalIds = [...new Set([...counts.keys()].map((k) => k.split('|')[1]))];
    const cards = await db('cards').where('game_id', game.id).whereIn('external_id', externalIds).select('id', 'external_id');
    const idByExternal = new Map(cards.map((c: { id: number; external_id: string }) => [c.external_id, c.id]));
    let unmatched = externalIds.filter((e) => !idByExternal.has(e));

    // Yu-Gi-Oh!: YDK-Dateien (YGOPro/cardcluster) referenzieren teils Alias-IDs
    // alternativer Artworks (z. B. 18144506 statt 18144507). Die YGOPRODeck-API
    // löst solche Aliase auf — wir matchen dann über den kanonischen Namen.
    if (unmatched.length && gameCode === 'yugioh') {
      try {
        const res = await fetch(
          `https://db.ygoprodeck.com/api/v7/cardinfo.php?id=${unmatched.join(',')}`,
          { headers: { 'User-Agent': 'tcg-collection-manager' } }
        );
        if (res.ok) {
          const body = (await res.json()) as { data?: { id: number; name: string }[] };
          for (const apiCard of body.data || []) {
            const dbCard = await db('cards').where({ game_id: game.id, name: apiCard.name }).select('id').first();
            if (dbCard) idByExternal.set(String(apiCard.id), dbCard.id);
          }
          unmatched = externalIds.filter((e) => !idByExternal.has(e));
        }
      } catch {
        // Alias-Auflösung ist optional — ohne Netz bleiben die Codes unmatched
      }
    }

    const name = (req.query.name || '').trim() || `Import ${new Date().toISOString().slice(0, 10)}`;
    const [deckId] = await db('decks').insert({ game_id: game.id, name });

    const rows = [...counts.entries()]
      .map(([key, quantity]) => {
        const [z, code] = key.split('|');
        const cardId = idByExternal.get(code);
        return cardId ? { deck_id: deckId, card_id: cardId, zone: z, quantity } : null;
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);
    if (rows.length) await db('deck_cards').insert(rows);

    const deck = await db('decks').where('id', deckId).first();
    return reply.code(201).send({
      data: { ...deck, game_code: gameCode, imported: rows.length, unmatched },
    });
  });
}
