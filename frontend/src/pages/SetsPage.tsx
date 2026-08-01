import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useGame } from '../game';
import { useLanguage } from '../i18n';
import { CardSet } from '../types';

export default function SetsPage() {
  const { t, locale } = useLanguage();
  const { game } = useGame();
  const euro = (v: number) => v.toLocaleString(locale, { style: 'currency', currency: 'EUR' });
  const [sets, setSets] = useState<CardSet[]>([]);
  const [search, setSearch] = useState('');
  const [ownedFilter, setOwnedFilter] = useState<'all' | 'owned' | 'missing'>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setLoading(true);
      api
        .sets(game, search || undefined)
        .then((r) => { setSets(r.data); setError(null); })
        .catch((err) => setError(err.message))
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(t);
  }, [search, game]);

  const visibleSets = sets.filter((s) => {
    if (ownedFilter === 'owned') return s.ownedPrintCount > 0;
    if (ownedFilter === 'missing') return s.ownedPrintCount === 0;
    return true;
  });

  return (
    <>
      <h1>{t('sets_title')}</h1>
      {error && <div className="error-banner">{error}</div>}
      <div className="toolbar">
        <input type="search" placeholder={t('sets_search_placeholder')} value={search} onChange={(e) => setSearch(e.target.value)} />
        <select value={ownedFilter} onChange={(e) => setOwnedFilter(e.target.value as 'all' | 'owned' | 'missing')}>
          <option value="all">{t('sets_filter_all')}</option>
          <option value="owned">{t('sets_filter_owned')}</option>
          <option value="missing">{t('sets_filter_missing')}</option>
        </select>
      </div>

      {loading ? (
        <div className="empty">{t('sets_loading')}</div>
      ) : visibleSets.length === 0 ? (
        <div className="empty">{t('sets_empty')}</div>
      ) : (
        <div className="set-list">
          {visibleSets.map((s) => {
            const pct = s.printCount ? Math.round((s.ownedPrintCount / s.printCount) * 100) : 0;
            return (
              <Link key={s.id} to={`/sets/${s.id}`} className="set-row">
                <div>
                  <strong>{s.name}</strong> <span className="muted">({s.code})</span>
                  <div className="meta">
                    {s.release_date ? new Date(s.release_date).toLocaleDateString(locale) : t('sets_date_unknown')} ·{' '}
                    {s.printCount} {t('sets_prints')} · {s.ownedPrintCount} {t('sets_collected')} ({pct} %) ·{' '}
                    {t('sets_owned_value')} {euro(s.ownedMarketValue)} ({t('sets_owned_value_hypothetical')} {euro(s.ownedHypotheticalValue)})
                  </div>
                  <div className="progress" style={{ marginTop: 6 }}>
                    <div style={{ width: `${pct}%` }} />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
