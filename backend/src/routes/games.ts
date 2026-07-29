import { FastifyInstance } from 'fastify';
import { db } from '../db';
import { Game } from '../types';

export async function gameRoutes(app: FastifyInstance) {
  // Alle Spiele inkl. Katalog-/Sammlungszählern (für Dashboard & Navigation)
  app.get('/games', async () => {
    const games = await db<Game>('games').orderBy('id');
    const cardCounts = await db('cards').select('game_id').count({ n: '*' }).groupBy('game_id');
    const collectionCounts = await db('collection_items')
      .join('card_prints', 'collection_items.print_id', 'card_prints.id')
      .join('cards', 'card_prints.card_id', 'cards.id')
      .select('cards.game_id')
      .sum({ n: 'collection_items.quantity' })
      .groupBy('cards.game_id');
    const collectionDistinctCounts = await db('collection_items')
      .join('card_prints', 'collection_items.print_id', 'card_prints.id')
      .join('cards', 'card_prints.card_id', 'cards.id')
      .select('cards.game_id')
      .countDistinct({ n: 'cards.id' })
      .groupBy('cards.game_id');

    const byGame = (rows: { game_id: number; n?: string | number }[]) =>
      Object.fromEntries(rows.map((r) => [r.game_id, Number(r.n || 0)]));
    const cardsBy = byGame(cardCounts as never);
    const collBy = byGame(collectionCounts as never);
    const collDistinctBy = byGame(collectionDistinctCounts as never);

    return {
      data: games.map((g) => ({
        ...g,
        active: Boolean(g.active),
        cardCount: cardsBy[g.id] || 0,
        collectedCount: collBy[g.id] || 0,
        collectedDistinctCount: collDistinctBy[g.id] || 0,
      })),
    };
  });
}
