import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import CardImage from '../components/CardImage';
import { deckRulesFor, legalCopiesFor } from '../deckRules';
import { cardName, useLanguage } from '../i18n';
import { Card, CardNavState, DeckCardEntry, DeckDetail, DeckZone } from '../types';

const GRAY_KEY = 'tcg-deck-gray-unowned';

export default function DeckBuilderPage() {
  const { id } = useParams();
  const { lang, t, tf } = useLanguage();
  const [deck, setDeck] = useState<DeckDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<Card[]>([]);
  const [searching, setSearching] = useState(false);
  const [grayUnowned, setGrayUnowned] = useState(() => localStorage.getItem(GRAY_KEY) === '1');

  useEffect(() => {
    localStorage.setItem(GRAY_KEY, grayUnowned ? '1' : '0');
  }, [grayUnowned]);

  const load = useCallback(() => {
    api.deck(id!).then((r) => setDeck(r.data)).catch((err) => setError(err.message));
  }, [id]);
  useEffect(load, [load]);

  // Kartensuche (entprellt, ab 2 Zeichen)
  useEffect(() => {
    if (!deck || search.trim().length < 2) { setResults([]); return; }
    const timer = setTimeout(() => {
      setSearching(true);
      api
        .cards(deck.game_code, { search: search.trim(), limit: 20 })
        .then((r) => setResults(r.data))
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [search, deck?.game_code]);

  if (error) return <div className="error-banner">{error}</div>;
  if (!deck) return <div className="empty">…</div>;

  const rules = deckRulesFor(deck.game_code);
  const entries = (zone: DeckZone) => deck.cards.filter((c) => c.zone === zone);
  const zoneCount = (zone: DeckZone) => entries(zone).reduce((s, c) => s + c.quantity, 0);

  // Kopien über Main + Side + Extra (Banlist gilt fürs ganze Deck zusammen)
  const copiesByCard = new Map<number, number>();
  for (const c of deck.cards) copiesByCard.set(c.card_id, (copiesByCard.get(c.card_id) || 0) + c.quantity);
  const nameOf = (cardId: number) => {
    const c = deck.cards.find((x) => x.card_id === cardId);
    return c ? cardName(c, lang) : String(cardId);
  };
  // Legalitätscheck: normales Kopienlimit, für Yu-Gi-Oh! zusätzlich per Karte durch die Banlist begrenzt
  // (game_data.banTcg aus dem YGOPRODeck-Import: "Forbidden"/"Limited"/"Semi-Limited").
  const overLimit = [...copiesByCard.entries()]
    .map(([cardId, n]) => [cardId, n, legalCopiesFor(deck.game_code, deck.cards.find((c) => c.card_id === cardId)!, rules)] as const)
    .filter(([, n, limit]) => n > limit);

  // Besitz-Abdeckung: wie viele der benötigten Kopien sind in der Sammlung?
  const totalNeeded = deck.cards.reduce((s, c) => s + c.quantity, 0);
  const totalOwned = deck.cards.reduce((s, c) => s + Math.min(c.quantity, c.ownedQuantity), 0);

  // Typaufteilung (cardcluster-artig) für Yu-Gi-Oh!
  const mainCards = entries('main');
  const typeStats =
    deck.game_code === 'yugioh'
      ? [
          ['deck_stat_monsters', mainCards.filter((c) => /monster/i.test(c.card_type || '')).reduce((s, c) => s + c.quantity, 0)],
          ['deck_stat_spells', mainCards.filter((c) => /spell/i.test(c.card_type || '')).reduce((s, c) => s + c.quantity, 0)],
          ['deck_stat_traps', mainCards.filter((c) => /trap/i.test(c.card_type || '')).reduce((s, c) => s + c.quantity, 0)],
        ] as const
      : null;

  const navState: CardNavState = {
    back: { path: `/decks/${deck.id}`, name: deck.name },
    cardIds: deck.cards.map((c) => c.card_id),
  };

  async function setQty(cardId: number, zone: DeckZone, quantity: number) {
    try {
      await api.setDeckCard(deck!.id, { card_id: cardId, zone, quantity: Math.max(0, quantity) });
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  function currentQty(cardId: number, zone: DeckZone): number {
    return deck!.cards.find((c) => c.card_id === cardId && c.zone === zone)?.quantity || 0;
  }

  const addCard = (card: Card, zone?: DeckZone) => {
    const target = zone || rules.zoneFor(card);
    return setQty(card.id, target, currentQty(card.id, target) + 1);
  };

  async function rename() {
    const name = prompt(t('deck_rename_prompt'), deck!.name);
    if (!name?.trim() || name.trim() === deck!.name) return;
    try {
      await api.updateDeck(deck!.id, { name: name.trim() });
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const hasSide = rules.zones.some((z) => z.zone === 'side');

  return (
    <>
      <div className="card-nav">
        <Link to="/decks" className="muted">{t('deck_back')}</Link>
      </div>

      <div className="deck-header">
        <h1>{deck.name}</h1>
        <button className="btn small" onClick={rename}>{t('deck_rename')}</button>
        <a className="btn small" href={api.deckExportUrl(deck.id)} download>{t('deck_export_ydk')}</a>
        <button className="btn small" onClick={() => window.print()}>{t('deck_export_pdf')}</button>
        <label className="switch">
          <input type="checkbox" checked={grayUnowned} onChange={(e) => setGrayUnowned(e.target.checked)} />
          <span className="track" />
          {t('deck_gray_unowned')}
        </label>
      </div>

      <p className="muted" style={{ marginBottom: 6 }}>
        {totalNeeded} {t('deck_cards_label')} · {totalOwned}/{totalNeeded} {t('deck_owned_coverage')}
        {typeStats && (
          <> · {typeStats.map(([key, n]) => `${t(key)} ${n}`).join(' · ')}</>
        )}
      </p>
      <div className="progress" style={{ maxWidth: 420, marginBottom: 16 }}>
        <div style={{ width: `${totalNeeded ? Math.round((totalOwned / totalNeeded) * 100) : 0}%` }} />
      </div>

      {overLimit.length > 0 && (
        <div className="error-banner">
          {t('deck_warn_copies')}: {overLimit.map(([cid, n, limit]) => `${nameOf(cid)} (${n}/${limit})`).join(', ')}
        </div>
      )}

      <div className="deck-builder">
        {/* Linke Spalte: Kartensuche */}
        <div className="panel deck-search">
          <input
            type="search"
            placeholder={t('deck_search_placeholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: '100%', padding: '9px 12px', background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 8, marginBottom: 10 }}
          />
          {search.trim().length < 2 ? (
            <p className="muted" style={{ fontSize: 13 }}>{t('deck_search_hint')}</p>
          ) : searching ? (
            <p className="muted" style={{ fontSize: 13 }}>…</p>
          ) : results.length === 0 ? (
            <p className="muted" style={{ fontSize: 13 }}>{t('deck_no_results')}</p>
          ) : (
            results.map((c) => (
              <div key={c.id} className="deck-row">
                <Link to={`/cards/${c.id}`} state={navState}>
                  <CardImage className="thumb" src={c.image_small_url || c.image_url} alt="" />
                </Link>
                <div className="grow">
                  <div className="rowname">{cardName(c, lang)}</div>
                  <div className="muted" style={{ fontSize: 12 }}>{c.card_type}</div>
                </div>
                <button className="btn small primary" onClick={() => addCard(c)}>{t('deck_add')}</button>
                {hasSide && <button className="btn small" onClick={() => addCard(c, 'side')}>{t('deck_add_side')}</button>}
              </div>
            ))
          )}
        </div>

        {/* Rechte Spalte: Zonen */}
        <div className="deck-zones">
          {rules.zones.map((zr) => {
            const list = entries(zr.zone);
            const count = zoneCount(zr.zone);
            const invalid = count < zr.min || count > zr.max;
            return (
              <div key={zr.zone} className="panel" style={{ marginBottom: 16 }}>
                <div className="zone-head">
                  <h2 style={{ margin: 0 }}>{tf(`deck_zone_${zr.zone}`)}</h2>
                  <span className={invalid ? 'zone-count invalid' : 'zone-count'}>
                    {count} / {zr.min > 0 ? `${zr.min}–` : ''}{zr.max}
                  </span>
                </div>
                {list.length === 0 ? (
                  <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>{t('deck_zone_empty')}</p>
                ) : (
                  list.map((entry) => (
                    <DeckCardRow
                      key={`${entry.card_id}-${entry.zone}`}
                      entry={entry}
                      gray={grayUnowned && entry.ownedQuantity === 0}
                      navState={navState}
                      onQty={(q) => setQty(entry.card_id, entry.zone, q)}
                    />
                  ))
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Nur beim Drucken sichtbar (siehe styles.css @media print) — dient als
          druckbare Deckliste; "als PDF exportieren" ist im Browser der Drucken-Dialog
          mit Ziel "Als PDF speichern". */}
      <div className="deck-print">
        <h1>{deck.name}</h1>
        {rules.zones.map((zr) => {
          const list = entries(zr.zone);
          if (!list.length) return null;
          return (
            <div key={zr.zone}>
              <h2>{tf(`deck_zone_${zr.zone}`)} ({zoneCount(zr.zone)})</h2>
              <ul>
                {list.map((entry) => (
                  <li key={`${entry.card_id}-${entry.zone}`}>{entry.quantity}× {cardName(entry, lang)}</li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </>
  );
}

function DeckCardRow({
  entry,
  gray,
  navState,
  onQty,
}: {
  entry: DeckCardEntry;
  gray: boolean;
  navState: CardNavState;
  onQty: (quantity: number) => void;
}) {
  const { lang } = useLanguage();
  const ownedEnough = entry.ownedQuantity >= entry.quantity;
  return (
    <div className={gray ? 'deck-row unowned' : 'deck-row'}>
      <Link to={`/cards/${entry.card_id}`} state={navState}>
        <CardImage className="thumb" src={entry.image_small_url || entry.image_url} alt="" />
      </Link>
      <div className="grow">
        <Link to={`/cards/${entry.card_id}`} state={navState} className="rowname">{cardName(entry, lang)}</Link>
        <div className="muted" style={{ fontSize: 12 }}>{entry.card_type}</div>
      </div>
      <span
        className="owned-mark"
        style={{ color: ownedEnough ? 'var(--green)' : 'var(--red)' }}
        title={`${entry.ownedQuantity}× vorhanden`}
      >
        {ownedEnough ? '✓' : `${Math.min(entry.ownedQuantity, entry.quantity)}/${entry.quantity}`}
      </span>
      <div className="qty-controls">
        <button className="btn small" onClick={() => onQty(entry.quantity - 1)}>−</button>
        <span>{entry.quantity}</span>
        <button className="btn small" onClick={() => onQty(entry.quantity + 1)}>+</button>
      </div>
    </div>
  );
}
