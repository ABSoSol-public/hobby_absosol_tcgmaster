import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useGame } from '../game';
import { useLanguage } from '../i18n';
import { CardSet } from '../types';

export default function SetsPage() {
  const { t, locale } = useLanguage();
  const { game } = useGame();
  const [sets, setSets] = useState<CardSet[]>([]);
  const [search, setSearch] = useState('');
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

  return (
    <>
      <h1>{t('sets_title')}</h1>
      {error && <div className="error-banner">{error}</div>}
      <div className="toolbar">
        <input type="search" placeholder={t('sets_search_placeholder')} value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {loading ? (
        <div className="empty">{t('sets_loading')}</div>
      ) : sets.length === 0 ? (
        <div className="empty">{t('sets_empty')}</div>
      ) : (
        <div className="set-list">
          {sets.map((s) => {
            const pct = s.printCount ? Math.round((s.ownedPrintCount / s.printCount) * 100) : 0;
            return (
              <Link key={s.id} to={`/sets/${s.id}`} className="set-row">
                <div>
                  <strong>{s.name}</strong> <span className="muted">({s.code})</span>
                  <div className="meta">
                    {s.release_date ? new Date(s.release_date).toLocaleDateString(locale) : t('sets_date_unknown')} ·{' '}
                    {s.printCount} {t('sets_prints')} · {s.ownedPrintCount} {t('sets_collected')} ({pct} %)
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
