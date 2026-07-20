import { FastifyInstance } from 'fastify';
import { db } from '../db';
import { withLocalImages } from '../services/images';

export async function setRoutes(app: FastifyInstance) {
  // Alle Sets eines Spiels inkl. Fortschritt (gesammelte vs. vorhandene Prints)
  app.get<{ Params: { code: string }; Querystring: { search?: string } }>(
    '/games/:code/sets',
    async (req, reply) => {
      const game = await db('games').where({ code: req.params.code }).first();
      if (!game) return reply.code(404).send({ error: { message: 'Spiel nicht gefunden', statusCode: 404 } });

      const query = db('card_sets').where('game_id', game.id);
      if (req.query.search) {
        const term = req.query.search;
        query.where((qb) => {
          qb.where('name', 'like', `%${term}%`).orWhere('code', 'like', `%${term}%`);
        });
      }
      const sets = await query.orderBy('release_date', 'desc');

      const printCounts = await db('card_prints')
        .join('card_sets', 'card_prints.set_id', 'card_sets.id')
        .where('card_sets.game_id', game.id)
        .select('card_prints.set_id')
        .count({ n: '*' })
        .groupBy('card_prints.set_id');

      const ownedCounts = await db('card_prints')
        .join('card_sets', 'card_prints.set_id', 'card_sets.id')
        .where('card_sets.game_id', game.id)
        .whereIn('card_prints.id', db('collection_items').select('print_id'))
        .select('card_prints.set_id')
        .countDistinct({ n: 'card_prints.id' })
        .groupBy('card_prints.set_id');

      const toMap = (rows: { set_id: number; n?: unknown }[]) =>
        Object.fromEntries(rows.map((r) => [r.set_id, Number(r.n || 0)]));
      const printsBy = toMap(printCounts as never);
      const ownedBy = toMap(ownedCounts as never);

      return {
        data: sets.map((s) =>
          withLocalImages({
            ...s,
            printCount: printsBy[s.id] || 0,
            ownedPrintCount: ownedBy[s.id] || 0,
          })
        ),
      };
    }
  );

  // Einzelnes Set mit allen Prints, Karteninfos und Sammlungsmengen
  app.get<{ Params: { id: string } }>('/sets/:id', async (req, reply) => {
    const set = await db('card_sets').where('id', Number(req.params.id)).first();
    if (!set) return reply.code(404).send({ error: { message: 'Set nicht gefunden', statusCode: 404 } });

    const prints = await db('card_prints')
      .join('cards', 'card_prints.card_id', 'cards.id')
      .where('card_prints.set_id', set.id)
      .select(
        'card_prints.*',
        'cards.name as card_name',
        'cards.name_de as card_name_de',
        'cards.card_type',
        'cards.image_small_path',
        'cards.image_path'
      )
      .orderBy('card_prints.collector_number');

    const owned = await db('collection_items')
      .whereIn('print_id', prints.map((p: { id: number }) => p.id))
      .select('print_id')
      .sum({ n: 'quantity' })
      .groupBy('print_id');
    const ownedBy = Object.fromEntries(
      (owned as { print_id: number; n?: unknown }[]).map((o) => [o.print_id, Number(o.n || 0)])
    );

    return {
      data: withLocalImages({
        ...set,
        prints: prints.map((p: { id: number }) => withLocalImages({ ...p, ownedQuantity: ownedBy[p.id] || 0 })),
      }),
    };
  });
}
