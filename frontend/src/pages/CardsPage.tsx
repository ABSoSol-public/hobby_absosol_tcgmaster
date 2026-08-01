import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import CardImage from '../components/CardImage';
import Paginator from '../components/Paginator';
import { useGame } from '../game';
import { cardName, useLanguage } from '../i18n';
import { Card, CardNavState, CollectionStats, Filters, Pagination } from '../types';

export default function CardsPage() {
  const { lang, t, tf, locale } = useLanguage();
  const { game } = useGame();
  const [params, setParams] = useSearchParams();
  const [cards, setCards] = useState<Card[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [filters, setFilters] = useState<Filters | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState(params.get('search') || '');
  const [ownedStats, setOwnedStats] = useState<CollectionStats | null>(null);

  const get = (k: string) => params.get(k) || '';

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    setParams(next, { replace: true });
  }

  // Suche entprellen
  useEffect(() => {
    const t = setTimeout(() => {
      if (searchInput !== get('search')) setParam('search', searchInput);
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Beim Spielwechsel: Filterwerte neu laden und alte Filter-Parameter verwerfen
  const prevGame = useRef(game);
  useEffect(() => {
    if (prevGame.current !== game) {
      prevGame.current = game;
      setSearchInput('');
      setParams(new URLSearchParams(), { replace: true });
    }
    setFilters(null);
    api.filters(game).then((r) => setFilters(r.data)).catch(() => {});
    api.collectionStats(game).then((r) => setOwnedStats(r.data)).catch(() => setOwnedStats(null));
  }, [game]);

  useEffect(() => {
    setLoading(true);
    const filterParams = Object.fromEntries(
      (filters?.filters || []).map((f) => [f.key, get(f.key)]).filter(([, v]) => v)
    );
    api
      .cards(game, {
        search: get('search'),
        ...filterParams,
        page: get('page') || 1,
        limit: 60,
        lang,
      })
      .then((r) => {
        setCards(r.data);
        setPagination(r.pagination);
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [params, game, filters, lang]);

  return (
    <>
      <h1>{t('cards_title')}</h1>
      {error && <div className="error-banner">{error}</div>}

      <div className="toolbar">
        <input
          type="search"
          placeholder={t('cards_search_placeholder')}
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
        {filters?.filters.map((f) => (
          <select key={f.key} value={get(f.key)} onChange={(e) => setParam(f.key, e.target.value)}>
            <option value="">{tf(`filter_${f.key}`)} — {t('filter_all')}</option>
            {f.values.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        ))}
      </div>

      {loading ? (
        <div className="empty">{t('cards_loading')}</div>
      ) : cards.length === 0 ? (
        <div className="empty">
          {t('cards_empty')} {pagination?.total === 0 && !get('search') && t('cards_empty_hint')}
        </div>
      ) : (
        <div className="card-grid">
          {cards.map((c) => (
            <Link
              key={c.id}
              to={`/cards/${c.id}`}
              state={{
                back: { path: `/cards${params.toString() ? `?${params.toString()}` : ''}` },
                cardIds: cards.map((x) => x.id),
              } satisfies CardNavState}
              className="card-tile"
              title={cardName(c, lang)}
            >
              {(c.ownedQuantity || 0) > 0 && <span className="owned-badge">{c.ownedQuantity}×</span>}
              <CardImage src={c.image_small_url || c.image_url} alt={cardName(c, lang)} />
              <div className="name">{cardName(c, lang)}</div>
            </Link>
          ))}
        </div>
      )}

      {pagination && <Paginator p={pagination} onPage={(p) => setParam('page', String(p))} />}

      {ownedStats && ownedStats.totalCopies > 0 && (
        <div className="float-chip">
          {t('owned_overlay')}: <strong>{ownedStats.distinctCards.toLocaleString(locale)}</strong> {t('owned_cards')} ·{' '}
          <strong>{ownedStats.totalCopies.toLocaleString(locale)}</strong> {t('owned_copies')}
        </div>
      )}
    </>
  );
}
