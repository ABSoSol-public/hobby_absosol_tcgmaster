import { FastifyInstance } from 'fastify';
import { db } from '../db';
import { withLocalImages } from '../services/images';

const CONDITIONS = ['MT', 'NM', 'EX', 'GD', 'LP', 'PL', 'PO'];

interface CollectionBody {
  print_id: number;
  quantity?: number;
  condition?: string;
  language?: string;
  is_first_edition?: boolean;
  storage_location?: string | null;
  purchase_price?: number | null;
  acquired_at?: string | null;
  notes?: string | null;
}

const bodySchema = {
  type: 'object',
  required: ['print_id'],
  properties: {
    print_id: { type: 'integer' },
    quantity: { type: 'integer', minimum: 1 },
    condition: { type: 'string', enum: CONDITIONS },
    language: { type: 'string', minLength: 2, maxLength: 5 },
    is_first_edition: { type: 'boolean' },
    storage_location: { type: ['string', 'null'] },
    purchase_price: { type: ['number', 'null'] },
    acquired_at: { type: ['string', 'null'] },
    notes: { type: ['string', 'null'] },
  },
} as const;

export async function collectionRoutes(app: FastifyInstance) {
  // Sammlung auflisten (optional je Spiel, mit Suche und Pagination)
  app.get<{ Querystring: { game?: string; search?: string; page?: string; limit?: string } }>(
    '/collection',
    async (req) => {
      const page = Math.max(1, Number(req.query.page || 1));
      const limit = Math.min(100, Math.max(1, Number(req.query.limit || 50)));

      const query = db('collection_items')
        .join('card_prints', 'collection_items.print_id', 'card_prints.id')
        .join('cards', 'card_prints.card_id', 'cards.id')
        .join('card_sets', 'card_prints.set_id', 'card_sets.id')
        .join('games', 'cards.game_id', 'games.id');

      if (req.query.game) query.where('games.code', req.query.game);
      if (req.query.search) {
        query.where((qb) => {
          qb.where('cards.name', 'like', `%${req.query.search}%`).orWhere(
            'cards.name_de',
            'like',
            `%${req.query.search}%`
          );
        });
      }

      const [{ total }] = (await query.clone().clearSelect().count({ total: '*' })) as { total: number }[];

      const rows = await query
        .select(
          'collection_items.*',
          'cards.id as card_id',
          'cards.name as card_name',
          'cards.name_de as card_name_de',
          'cards.image_small_path',
          'cards.image_path',
          'card_prints.collector_number',
          'card_prints.rarity',
          'card_prints.market_price',
          'card_sets.name as set_name',
          'card_sets.code as set_code',
          'games.code as game_code'
        )
        .orderBy('collection_items.updated_at', 'desc')
        .limit(limit)
        .offset((page - 1) * limit);

      return {
        data: rows.map(withLocalImages),
        pagination: { page, limit, total: Number(total), totalPages: Math.ceil(Number(total) / limit) },
      };
    }
  );

  // Sammlungsstatistik (Dashboard)
  app.get<{ Querystring: { game?: string } }>('/collection/stats', async (req) => {
    const base = () => {
      const q = db('collection_items')
        .join('card_prints', 'collection_items.print_id', 'card_prints.id')
        .join('cards', 'card_prints.card_id', 'cards.id')
        .join('games', 'cards.game_id', 'games.id');
      if (req.query.game) q.where('games.code', req.query.game);
      return q;
    };

    const [totals] = await base()
      .sum({ totalCopies: 'collection_items.quantity' })
      .countDistinct({ distinctCards: 'cards.id' })
      .countDistinct({ distinctPrints: 'card_prints.id' })
      .sum({ purchaseValue: db.raw('collection_items.quantity * COALESCE(collection_items.purchase_price, 0)') as never })
      .sum({ marketValue: db.raw('collection_items.quantity * COALESCE(card_prints.market_price, 0)') as never });

    return {
      data: {
        totalCopies: Number(totals.totalCopies || 0),
        distinctCards: Number(totals.distinctCards || 0),
        distinctPrints: Number(totals.distinctPrints || 0),
        purchaseValue: Number(totals.purchaseValue || 0),
        marketValue: Number(totals.marketValue || 0),
      },
    };
  });

  // Print zur Sammlung hinzufügen; existiert derselbe Print in gleichem
  // Zustand/Sprache/Auflage bereits, wird die Menge erhöht.
  app.post<{ Body: CollectionBody }>('/collection', { schema: { body: bodySchema } }, async (req, reply) => {
    const b = req.body;
    const print = await db('card_prints').where('id', b.print_id).first();
    if (!print) return reply.code(404).send({ error: { message: 'Print nicht gefunden', statusCode: 404 } });

    const match = await db('collection_items')
      .where({
        print_id: b.print_id,
        condition: b.condition || 'NM',
        language: b.language || 'DE',
        is_first_edition: b.is_first_edition ? 1 : 0,
      })
      .first();

    if (match) {
      await db('collection_items')
        .where('id', match.id)
        .update({ quantity: match.quantity + (b.quantity || 1), updated_at: db.fn.now() });
      const updated = await db('collection_items').where('id', match.id).first();
      return reply.code(200).send({ data: updated });
    }

    const [id] = await db('collection_items').insert({
      print_id: b.print_id,
      quantity: b.quantity || 1,
      condition: b.condition || 'NM',
      language: b.language || 'DE',
      is_first_edition: b.is_first_edition ? 1 : 0,
      storage_location: b.storage_location ?? null,
      purchase_price: b.purchase_price ?? null,
      acquired_at: b.acquired_at ?? null,
      notes: b.notes ?? null,
    });
    const created = await db('collection_items').where('id', id).first();
    return reply.code(201).send({ data: created });
  });

  // Sammlungseintrag ändern
  app.patch<{ Params: { id: string }; Body: Partial<CollectionBody> }>('/collection/:id', async (req, reply) => {
    const item = await db('collection_items').where('id', Number(req.params.id)).first();
    if (!item) return reply.code(404).send({ error: { message: 'Eintrag nicht gefunden', statusCode: 404 } });

    const b = req.body || {};
    if (b.condition && !CONDITIONS.includes(b.condition)) {
      return reply.code(400).send({ error: { message: `condition muss eines von ${CONDITIONS.join(', ')} sein`, statusCode: 400 } });
    }
    if (b.quantity !== undefined && b.quantity < 1) {
      return reply.code(400).send({ error: { message: 'quantity muss mindestens 1 sein — zum Entfernen DELETE verwenden', statusCode: 400 } });
    }

    const patch: Record<string, unknown> = {};
    for (const key of ['quantity', 'condition', 'language', 'storage_location', 'purchase_price', 'acquired_at', 'notes'] as const) {
      if (b[key] !== undefined) patch[key] = b[key];
    }
    if (b.is_first_edition !== undefined) patch.is_first_edition = b.is_first_edition ? 1 : 0;
    if (Object.keys(patch).length === 0) {
      return reply.code(400).send({ error: { message: 'Keine änderbaren Felder übergeben', statusCode: 400 } });
    }
    patch.updated_at = db.fn.now();

    await db('collection_items').where('id', item.id).update(patch);
    const updated = await db('collection_items').where('id', item.id).first();
    return { data: updated };
  });

  // Sammlungseintrag löschen
  app.delete<{ Params: { id: string } }>('/collection/:id', async (req, reply) => {
    const deleted = await db('collection_items').where('id', Number(req.params.id)).del();
    if (!deleted) return reply.code(404).send({ error: { message: 'Eintrag nicht gefunden', statusCode: 404 } });
    return reply.code(204).send();
  });

  // --- CSV-Export der Sammlung ---------------------------------------------
  app.get<{ Querystring: { game?: string } }>('/collection/export', async (req, reply) => {
    const query = db('collection_items')
      .join('card_prints', 'collection_items.print_id', 'card_prints.id')
      .join('cards', 'card_prints.card_id', 'cards.id')
      .join('card_sets', 'card_prints.set_id', 'card_sets.id')
      .join('games', 'cards.game_id', 'games.id')
      .orderBy(['games.code', 'card_sets.code', 'card_prints.collector_number']);
    if (req.query.game) query.where('games.code', req.query.game);

    const rows = await query.select(
      'games.code as game',
      'card_sets.code as set_code',
      'card_prints.collector_number',
      'card_prints.rarity',
      'cards.name as card_name',
      'cards.external_id',
      'collection_items.quantity',
      'collection_items.condition',
      'collection_items.language',
      'collection_items.is_first_edition',
      'collection_items.storage_location',
      'collection_items.purchase_price',
      'collection_items.acquired_at',
      'collection_items.notes'
    );

    const esc = (v: unknown): string => {
      if (v == null) return '';
      const s = v instanceof Date ? v.toISOString().slice(0, 10) : String(v);
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = CSV_COLUMNS.join(',');
    const lines = rows.map((r: Record<string, unknown>) =>
      CSV_COLUMNS.map((c) => esc(c === 'is_first_edition' ? (r[c] ? 1 : 0) : r[c])).join(',')
    );
    // BOM, damit Excel Umlaute korrekt erkennt
    const csv = '\uFEFF' + [header, ...lines].join('\r\n') + '\r\n';

    reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="collection-${new Date().toISOString().slice(0, 10)}.csv"`);
    return reply.send(csv);
  });

  // --- CSV-Import der Sammlung ---------------------------------------------
  // Idempotent: existiert derselbe Print in gleichem Zustand/Sprache/Auflage
  // bereits, wird die Menge auf den CSV-Wert GESETZT (nicht addiert) —
  // ein Re-Import der eigenen Export-Datei verdoppelt also nichts.
  app.post('/collection/import', async (req, reply) => {
    const text = typeof req.body === 'string' ? req.body.replace(/^\uFEFF/, '') : '';
    if (!text.trim()) {
      return reply.code(400).send({ error: { message: 'CSV-Inhalt fehlt (Content-Type text/csv verwenden)', statusCode: 400 } });
    }

    const rows = parseCsv(text);
    if (rows.length < 2) {
      return reply.code(400).send({ error: { message: 'CSV enthält keine Datenzeilen', statusCode: 400 } });
    }
    const header = rows[0].map((h) => h.trim().toLowerCase());
    const col = (name: string, row: string[]): string => {
      const idx = header.indexOf(name);
      return idx >= 0 ? (row[idx] || '').trim() : '';
    };

    const games = await db('games').select('id', 'code');
    const gameByCode = new Map(games.map((g) => [g.code, g.id]));

    let created = 0;
    let updated = 0;
    const errors: string[] = [];

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const line = i + 1;
      try {
        const gameId = gameByCode.get(col('game', row));
        if (!gameId) throw new Error(`unbekanntes Spiel "${col('game', row)}"`);

        const setCode = col('set_code', row);
        const set = await db('card_sets').where({ game_id: gameId, code: setCode }).first();
        if (!set) throw new Error(`Set "${setCode}" nicht gefunden`);

        // Print auflösen: bevorzugt über external_id, sonst über Set + Nummer (+ Seltenheit)
        const externalId = col('external_id', row);
        const collectorNumber = col('collector_number', row);
        const rarity = col('rarity', row);
        const printQuery = db('card_prints')
          .join('cards', 'card_prints.card_id', 'cards.id')
          .where('card_prints.set_id', set.id)
          .select('card_prints.id');
        if (externalId) printQuery.where('cards.external_id', externalId);
        if (collectorNumber) printQuery.where('card_prints.collector_number', collectorNumber);
        if (rarity) printQuery.where('card_prints.rarity', rarity);
        const print = await printQuery.first();
        if (!print) throw new Error(`Print nicht gefunden (Set ${setCode}, Nummer "${collectorNumber}")`);

        const quantity = Math.max(1, Number(col('quantity', row) || 1));
        const condition = (col('condition', row) || 'NM').toUpperCase();
        if (!CONDITIONS.includes(condition)) throw new Error(`ungültiger Zustand "${condition}"`);
        const language = (col('language', row) || 'DE').toUpperCase();
        const firstEdition = ['1', 'true', 'ja', 'yes'].includes(col('is_first_edition', row).toLowerCase()) ? 1 : 0;
        const fields = {
          storage_location: col('storage_location', row) || null,
          purchase_price: col('purchase_price', row) ? Number(col('purchase_price', row).replace(',', '.')) : null,
          acquired_at: col('acquired_at', row) || null,
          notes: col('notes', row) || null,
        };

        const match = await db('collection_items')
          .where({ print_id: print.id, condition, language, is_first_edition: firstEdition })
          .first();
        if (match) {
          await db('collection_items').where('id', match.id).update({ quantity, ...fields, updated_at: db.fn.now() });
          updated++;
        } else {
          await db('collection_items').insert({
            print_id: print.id,
            quantity,
            condition,
            language,
            is_first_edition: firstEdition,
            ...fields,
          });
          created++;
        }
      } catch (err) {
        errors.push(`Zeile ${line}: ${(err as Error).message}`);
      }
    }

    return { data: { created, updated, failed: errors.length, errors: errors.slice(0, 50) } };
  });
}

const CSV_COLUMNS = [
  'game',
  'set_code',
  'collector_number',
  'rarity',
  'card_name',
  'external_id',
  'quantity',
  'condition',
  'language',
  'is_first_edition',
  'storage_location',
  'purchase_price',
  'acquired_at',
  'notes',
];

/** Minimaler CSV-Parser mit Quote-Unterstützung (RFC 4180). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (ch !== '\r') field += ch;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}
