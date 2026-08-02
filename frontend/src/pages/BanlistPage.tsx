import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import CardImage from '../components/CardImage';
import { useGame } from '../game';
import { cardName, useLanguage } from '../i18n';
import { Banlist, BanlistCard } from '../types';

function Section({ title, cards, badgeClass }: { title: string; cards: BanlistCard[]; badgeClass: string }) {
  const { lang } = useLanguage();
  if (cards.length === 0) return null;
  return (
    <div className="panel" style={{ marginBottom: 16 }}>
      <h2 style={{ marginTop: 0 }}>
        {title} <span className={`banlist-count ${badgeClass}`}>{cards.length}</span>
      </h2>
      <div className="banlist-grid">
        {cards.map((c) => (
          <Link key={c.id} to={`/cards/${c.id}`} className="banlist-card">
            <CardImage className="thumb" src={c.image_small_url} alt="" />
            <span>{cardName(c, lang)}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

export default function BanlistPage() {
  const { t, locale } = useLanguage();
  const { game } = useGame();
  const [banlist, setBanlist] = useState<Banlist | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api
      .banlist(game)
      .then((r) => { setBanlist(r.data); setError(null); })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [game]);

  return (
    <>
      <h1>{t('banlist_title')}</h1>
      {error && <div className="error-banner">{error}</div>}

      {loading ? (
        <div className="empty">…</div>
      ) : !banlist?.supported ? (
        <div className="empty">{t('banlist_not_supported')}</div>
      ) : (
        <>
          <p className="muted" style={{ marginBottom: 16 }}>
            {t('banlist_intro')}
            {banlist.checkedAt && (
              <> · {t('banlist_checked_at')} {new Date(banlist.checkedAt).toLocaleString(locale)}</>
            )}
          </p>
          {banlist.forbidden.length === 0 && banlist.limited.length === 0 && banlist.semiLimited.length === 0 ? (
            <div className="empty">{t('banlist_empty')}</div>
          ) : (
            <>
              <Section title={t('banlist_forbidden')} cards={banlist.forbidden} badgeClass="banlist-forbidden" />
              <Section title={t('banlist_limited')} cards={banlist.limited} badgeClass="banlist-limited" />
              <Section title={t('banlist_semi_limited')} cards={banlist.semiLimited} badgeClass="banlist-semi" />
            </>
          )}
        </>
      )}
    </>
  );
}
