import { useState } from 'react';
import { GLOSSARY } from '../glossaryData';
import { useGame } from '../game';
import { useLanguage } from '../i18n';

export default function GlossaryPage() {
  const { t, lang } = useLanguage();
  const { game } = useGame();
  const [active, setActive] = useState(() =>
    GLOSSARY.some((g) => g.code === game) ? game : GLOSSARY[0].code
  );
  const [search, setSearch] = useState('');

  const current = GLOSSARY.find((g) => g.code === active) || GLOSSARY[0];
  const term = search.trim().toLowerCase();
  const terms = term
    ? current.terms.filter(
        (e) => e.term.toLowerCase().includes(term) || e.de.toLowerCase().includes(term) || e.en.toLowerCase().includes(term)
      )
    : current.terms;

  return (
    <div>
      <h1>{t('glossary_heading')}</h1>
      <p className="muted">{t('glossary_intro')}</p>

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', margin: '1rem 0' }}>
        {GLOSSARY.map((g) => (
          <button
            key={g.code}
            className={`btn small${active === g.code ? ' primary' : ''}`}
            onClick={() => setActive(g.code)}
          >
            {g.label}
          </button>
        ))}
      </div>

      <input
        type="search"
        placeholder={t('glossary_search_placeholder')}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ marginBottom: '1rem', maxWidth: 320 }}
      />

      {terms.length === 0 && <div className="empty">{t('glossary_empty')}</div>}

      {terms.map((entry) => (
        <div key={entry.term} className="panel" style={{ padding: '0.75rem 1rem', marginBottom: '0.75rem' }}>
          <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>{entry.term}</div>
          <div className="muted">{lang === 'de' ? entry.de : entry.en}</div>
        </div>
      ))}
    </div>
  );
}
