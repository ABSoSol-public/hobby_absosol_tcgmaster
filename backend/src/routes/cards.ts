import { FastifyInstance } from 'fastify';
import { db } from '../db';
import { collectorNumberLikePatterns } from '../services/cardNumbers';
import { filtersFor } from '../services/gameConfig';
import { withLocalImages } from '../services/images';
import { PRICE_HISTORY_KEEP, pruneOldPriceHistory } from '../services/importers/util';
import { Card, parseGameData } from '../types';

interface CardListQuery {
  search?: string;
  set?: string; // Set-Code
  page?: string;
  limit?: string;
  sort?: 'name' | 'newest';
  lang?: string;
  // Spielspezifische Filter (siehe services/gameConfig.ts) kommen als
  // zusätzliche Query-Parameter, z. B. ?attribute=DARK oder ?color=W.
  [key: string]: string | undefined;
}

export async function cardRoutes(app: FastifyInstance) {
  // Kartenkatalog eines Spiels mit Suche, Filtern und Pagination
  app.get<{ Params: { code: string }; Querystring: CardListQuery }>(
    '/games/:code/cards',
    async (req, reply) => {
      const game = await db('games').where({ code: req.params.code }).first();
      if (!game) return reply.code(404).send({ error: { message: 'Spiel nicht gefunden', statusCode: 404 } });

      const page = Math.max(1, Number(req.query.page || 1));
      const limit = Math.min(100, Math.max(1, Number(req.query.limit || 60)));

      const query = db<Card>('cards').where('cards.game_id', game.id);

      const { search, set } = req.query;
      if (search) {
        const numberPatterns = collectorNumberLikePatterns(search);
        query.where((qb) => {
          qb.where('cards.name', 'like', `%${search}%`)
            .orWhere('cards.name_de', 'like', `%${search}%`)
            .orWhere('cards.card_text', 'like', `%${search}%`)
            .orWhere('cards.card_text_de', 'like', `%${search}%`)
            .orWhere('cards.external_id', search)
            .orWhereIn('cards.id', (sub) => {
              sub
                .select('card_prints.card_id')
                .from('card_prints')
                .where((pb) => {
                  for (const pattern of numberPatterns) pb.orWhere('card_prints.collector_number', 'like', pattern);
                });
            })
            // Manche Prints (v. a. Magic-Crossover-Sets wie "Final Fantasy: Through
            // the Ages") tragen auf der physischen Karte einen anderen Namen als den
            // eigentlichen Kartennamen (card_prints.flavor_name) — sonst über den
            // aufgedruckten Namen nicht auffindbar.
            .orWhereIn('cards.id', (sub) => {
              sub.select('card_prints.card_id').from('card_prints').where('card_prints.flavor_name', 'like', `%${search}%`);
            });
        });
      }
      // Spielspezifische Filter laut Konfiguration (card_type bzw. game_data)
      for (const def of filtersFor(game.code)) {
        const value = req.query[def.key];
        if (!value) continue;
        if (!def.path) {
          if (def.contains) query.where('cards.card_type', 'like', `%${value}%`);
          else query.where('cards.card_type', value);
        } else if (def.numeric) {
          query.whereRaw(`JSON_EXTRACT(cards.game_data, '${def.path}') = ?`, [Number(value)]);
        } else if (def.contains) {
          query.whereRaw(`JSON_UNQUOTE(JSON_EXTRACT(cards.game_data, '${def.path}')) LIKE ?`, [`%${value}%`]);
        } else {
          query.whereRaw(`JSON_UNQUOTE(JSON_EXTRACT(cards.game_data, '${def.path}')) = ?`, [value]);
        }
      }
      if (set) {
        query.whereIn('cards.id', (qb) => {
          qb.select('card_prints.card_id')
            .from('card_prints')
            .join('card_sets', 'card_prints.set_id', 'card_sets.id')
            .where('card_sets.code', set)
            .andWhere('card_sets.game_id', game.id);
        });
      }

      const [{ total }] = (await query.clone().clearSelect().count({ total: '*' })) as { total: number }[];

      // Bei deutscher UI-Sprache zeigt das Frontend name_de || name an
      // (s. cardName() in i18n.tsx) — sortiert werden muss nach demselben
      // angezeigten Wert, sonst passt die Reihenfolge nicht zur Beschriftung.
      if (req.query.sort === 'newest') query.orderBy('cards.id', 'desc');
      else if (req.query.lang === 'de') query.orderByRaw('COALESCE(cards.name_de, cards.name) asc');
      else query.orderBy('cards.name');

      const rows = await query
        .select('cards.*')
        .limit(limit)
        .offset((page - 1) * limit);

      // Besitz-Info: Gesamtmenge in der Sammlung je Karte
      const ids = rows.map((r) => r.id);
      const owned = ids.length
        ? await db('collection_items')
            .join('card_prints', 'collection_items.print_id', 'card_prints.id')
            .whereIn('card_prints.card_id', ids)
            .select('card_prints.card_id')
            .sum({ n: 'collection_items.quantity' })
            .groupBy('card_prints.card_id')
        : [];
      const ownedBy = Object.fromEntries(
        (owned as { card_id: number; n?: unknown }[]).map((o) => [o.card_id, Number(o.n || 0)])
      );

      return {
        data: rows.map((c) =>
          withLocalImages({ ...c, game_data: parseGameData(c.game_data), ownedQuantity: ownedBy[c.id] || 0 })
        ),
        pagination: { page, limit, total: Number(total), totalPages: Math.ceil(Number(total) / limit) },
      };
    }
  );

  // Banliste (aktuell nur Yu-Gi-Oh!/TCG gepflegt, s. game_data.banTcg aus dem
  // YGOPRODeck-Import). Zieht bei Statusänderungen automatisch über den
  // bestehenden Delta-Import nach (banTcg fließt in den content_hash der
  // Karte ein) — kein separater Aktualisierungsmechanismus nötig. Andere
  // Spiele liefern `supported: false`, damit das Frontend klar zwischen
  // "keine gesperrten Karten" und "wird für dieses Spiel gar nicht geführt"
  // unterscheiden kann.
  app.get<{ Params: { code: string } }>('/games/:code/banlist', async (req, reply) => {
    const game = await db('games').where({ code: req.params.code }).first();
    if (!game) return reply.code(404).send({ error: { message: 'Spiel nicht gefunden', statusCode: 404 } });

    if (game.code !== 'yugioh') {
      return { data: { supported: false, checkedAt: null, forbidden: [], limited: [], semiLimited: [] } };
    }

    const rows = await db('cards')
      .where('game_id', game.id)
      .whereRaw("JSON_UNQUOTE(JSON_EXTRACT(game_data, '$.banTcg')) IS NOT NULL")
      .select(
        'id',
        'name',
        'name_de',
        'card_type',
        'image_small_path',
        'image_path',
        db.raw("JSON_UNQUOTE(JSON_EXTRACT(game_data, '$.banTcg')) as ban_status")
      )
      .orderBy('name');

    const withImages = rows.map(withLocalImages) as (Card & { ban_status: string })[];
    const byStatus = (status: string) => withImages.filter((r) => r.ban_status === status);

    const importState = await db('import_state').where('game_id', game.id).first();

    return {
      data: {
        supported: true,
        // Zeitpunkt des letzten Abgleichs mit YGOPRODeck — nicht dasselbe wie
        // "letzte tatsächliche Änderung"; zeigt aber verlässlich, wie aktuell
        // unser Datenstand gegenüber der Quelle ist (zum Gegenprüfen).
        checkedAt: importState?.checked_at ?? null,
        forbidden: byStatus('Forbidden'),
        limited: byStatus('Limited'),
        semiLimited: byStatus('Semi-Limited'),
      },
    };
  });

  // Verfügbare Filter samt Werten (generisch aus der Spiel-Konfiguration)
  app.get<{ Params: { code: string } }>('/games/:code/filters', async (req, reply) => {
    const game = await db('games').where({ code: req.params.code }).first();
    if (!game) return reply.code(404).send({ error: { message: 'Spiel nicht gefunden', statusCode: 404 } });

    const distinct = async (expr: string) =>
      (
        await db('cards')
          .where('game_id', game.id)
          .select(db.raw(`DISTINCT ${expr} AS v`))
          .orderBy('v')
      )
        .map((r: { v: string | number | null }) => (r.v == null ? null : String(r.v)))
        .filter((v): v is string => v != null && v !== '');

    const filters = [];
    for (const def of filtersFor(game.code)) {
      const values = def.values
        ? def.values
        : await distinct(def.path ? `JSON_UNQUOTE(JSON_EXTRACT(game_data, '${def.path}'))` : 'card_type');
      if (def.numeric && !def.values) values.sort((a, b) => Number(a) - Number(b));
      filters.push({ key: def.key, values });
    }
    return { data: { filters } };
  });

  // Einzelne Karte inkl. aller Prints und Sammlungsbestand
  app.get<{ Params: { id: string } }>('/cards/:id', async (req, reply) => {
    const card = await db<Card>('cards').where('id', Number(req.params.id)).first();
    if (!card) return reply.code(404).send({ error: { message: 'Karte nicht gefunden', statusCode: 404 } });

    const prints = await db('card_prints')
      .join('card_sets', 'card_prints.set_id', 'card_sets.id')
      .where('card_prints.card_id', card.id)
      .select(
        'card_prints.*',
        'card_sets.name as set_name',
        'card_sets.code as set_code',
        'card_sets.release_date as set_release_date',
        'card_sets.de_prefix as set_de_prefix'
      )
      .orderBy('card_sets.release_date');

    const items = await db('collection_items').whereIn(
      'print_id',
      prints.map((p: { id: number }) => p.id)
    );

    return {
      data: withLocalImages({
        ...card,
        game_data: parseGameData(card.game_data),
        prints: prints.map((p: { id: number }) => ({
          ...p,
          collectionItems: items.filter((i) => i.print_id === p.id),
        })),
      }),
    };
  });

  // Foto-Scan: erkannten OCR-Text (Set-Code+Nummer wie "LOB-EN119" oder Zahl wie
  // "119/198") gegen die Sammelnummern des Spiels matchen. Läuft bewusst mit
  // derselben Auflösung wie der CSV-Import (Set-Code+Nummer bzw. reine Nummer) —
  // keine Bilderkennung, nur Text-Matching auf card_prints.collector_number.
  app.get<{ Params: { code: string }; Querystring: { text?: string } }>('/games/:code/scan', async (req, reply) => {
    const game = await db('games').where({ code: req.params.code }).first();
    if (!game) return reply.code(404).send({ error: { message: 'Spiel nicht gefunden', statusCode: 404 } });

    const raw = (req.query.text || '').trim();
    if (!raw) return reply.code(400).send({ error: { message: 'text fehlt', statusCode: 400 } });

    const candidates = new Set<string>();
    for (const rawLine of raw.split(/\n+/)) {
      const line = rawLine.trim().toUpperCase();
      if (!line) continue;
      // Yu-Gi-Oh!-/Magic-Stil: vollständiger Code inkl. Set-Präfix, z. B. "LOB-EN119"
      const codeMatch = line.match(/\b[A-Z0-9]{2,6}-[A-Z]{0,3}\d{1,4}\b/);
      if (codeMatch) candidates.add(codeMatch[0]);
      // Pokémon-/Lorcana-Stil: "119/198" — nur die Nummer vor dem Schrägstrich zählt
      const fractionMatch = line.match(/\b(\d{1,4})\s*\/\s*\d{1,4}\b/);
      if (fractionMatch) candidates.add(fractionMatch[1]);
      // Nackte Zahl als letzter Fallback (ganze Zeile, nichts drumherum)
      if (/^\d{1,4}$/.test(line)) candidates.add(line);
    }
    if (!candidates.size) return { data: [] };

    // Sprachkürzel im Set-Code (z. B. "MP24-DE174" auf einer deutschen Karte) als
    // Wildcard behandeln — die Quelle kennt nur den englischen Code ("MP24-EN174").
    const numberPatterns = [...candidates].flatMap((c) => collectorNumberLikePatterns(c));
    const prints = await db('card_prints')
      .join('cards', 'card_prints.card_id', 'cards.id')
      .join('card_sets', 'card_prints.set_id', 'card_sets.id')
      .where('cards.game_id', game.id)
      .where((qb) => {
        qb.whereRaw(
          `UPPER(card_prints.collector_number) IN (${[...candidates].map(() => '?').join(',')})`,
          [...candidates]
        );
        for (const pattern of numberPatterns) qb.orWhere('card_prints.collector_number', 'like', pattern);
      })
      .select(
        'card_prints.*',
        'cards.name as card_name',
        'cards.name_de as card_name_de',
        'cards.card_type',
        'cards.image_small_path',
        'cards.image_path',
        'card_sets.name as set_name',
        'card_sets.code as set_code',
        'card_sets.release_date as set_release_date',
        'card_sets.de_prefix as set_de_prefix'
      )
      .orderBy('cards.name')
      .limit(20);

    return { data: prints.map(withLocalImages) };
  });

  // Preis-Historie eines Prints (wird vom täglichen Delta-Import befüllt,
  // "manual"-Einträge kommen vom Nutzer selbst über den Endpoint unten).
  // Serverseitig auf die neuesten PRICE_HISTORY_KEEP Einträge begrenzt —
  // Inserts kürzen die Tabelle ohnehin darauf (pruneOldPriceHistory()),
  // das Limit hier ist nur ein defensives Zweites-Netz.
  app.get<{ Params: { id: string } }>('/prints/:id/prices', async (req, reply) => {
    const print = await db('card_prints').where('id', Number(req.params.id)).first();
    if (!print) return reply.code(404).send({ error: { message: 'Print nicht gefunden', statusCode: 404 } });

    const history = await db('price_history')
      .where('print_id', print.id)
      .orderBy('recorded_at', 'desc')
      .limit(PRICE_HISTORY_KEEP)
      .select('id', 'price', 'currency', 'source', 'recorded_at');
    return { data: history.reverse() };
  });

  // Eigenen Preis-Snapshot erfassen (z. B. eigene Marktbeobachtung, wenn die
  // importierte Quelle keinen/einen veralteten Preis liefert). Landet als
  // eigener Eintrag mit source "manual" in derselben Preis-Historie.
  app.post<{ Params: { id: string }; Body: { price: number; currency?: string; recorded_at?: string } }>(
    '/prints/:id/prices',
    { schema: { body: manualPriceSchema } },
    async (req, reply) => {
      const print = await db('card_prints').where('id', Number(req.params.id)).first();
      if (!print) return reply.code(404).send({ error: { message: 'Print nicht gefunden', statusCode: 404 } });

      const recordedAt = req.body.recorded_at ? new Date(req.body.recorded_at) : new Date();
      if (Number.isNaN(recordedAt.getTime())) {
        return reply.code(400).send({ error: { message: 'recorded_at ist kein gültiges Datum', statusCode: 400 } });
      }

      const [id] = await db('price_history').insert({
        print_id: print.id,
        source: 'manual',
        price: req.body.price,
        currency: (req.body.currency || 'EUR').toUpperCase(),
        recorded_at: recordedAt,
      });
      await pruneOldPriceHistory([print.id]);
      await syncMarketPrice(print.id);

      // Bei stark rückdatierten recorded_at-Werten kann der eigene Eintrag
      // durch das Kürzen auf die neuesten PRICE_HISTORY_KEEP direkt wieder
      // rausfallen — dann gibt es hier nichts zurückzugeben.
      const created = await db('price_history').where('id', id).first();
      if (!created) {
        return reply
          .code(201)
          .send({ data: null, message: `Preis gespeichert, aber älter als die ${PRICE_HISTORY_KEEP} zuletzt aufgehobenen Einträge und daher direkt wieder entfernt.` });
      }
      return reply.code(201).send({ data: created });
    }
  );

  // Eigenen Preis-Snapshot löschen — bewusst nur "manual"-Einträge, damit die
  // importierte Historie nicht versehentlich über diese Route gelöscht wird.
  app.delete<{ Params: { id: string; priceId: string } }>('/prints/:id/prices/:priceId', async (req, reply) => {
    const deleted = await db('price_history')
      .where({ id: Number(req.params.priceId), print_id: Number(req.params.id), source: 'manual' })
      .del();
    if (!deleted) return reply.code(404).send({ error: { message: 'Eintrag nicht gefunden', statusCode: 404 } });
    await syncMarketPrice(Number(req.params.id));
    return reply.code(204).send();
  });
}

const manualPriceSchema = {
  type: 'object',
  required: ['price'],
  properties: {
    price: { type: 'number', exclusiveMinimum: 0 },
    currency: { type: 'string', minLength: 3, maxLength: 3 },
    recorded_at: { type: 'string' },
  },
} as const;

/** Setzt card_prints.market_price auf den zeitlich jüngsten Preis-Historie-Eintrag
 * (unabhängig von der Quelle) — bleibt so nach manuellen Snapshots konsistent mit
 * dem "letzter bekannter Preis"-Verhalten der Importer. */
async function syncMarketPrice(printId: number): Promise<void> {
  const latest = await db('price_history').where('print_id', printId).orderBy('recorded_at', 'desc').first();
  await db('card_prints')
    .where('id', printId)
    .update({ market_price: latest ? latest.price : null });
}
