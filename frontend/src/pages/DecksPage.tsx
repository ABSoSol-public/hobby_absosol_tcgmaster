import { FormEvent, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useGame } from '../game';
import { useLanguage } from '../i18n';
import { Deck } from '../types';

export default function DecksPage() {
  const { t, tf, locale } = useLanguage();
  const { game } = useGame();
  const navigate = useNavigate();
  const [decks, setDecks] = useState<Deck[]>([]);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  function load() {
    setLoading(true);
    api
      .decks(game)
      .then((r) => { setDecks(r.data); setError(null); })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(load, [game]);

  async function create(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      const { data } = await api.createDeck(game, name.trim());
      setName('');
      navigate(`/decks/${data.id}`);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function remove(deck: Deck) {
    if (!confirm(`"${deck.name}" — ${t('deck_delete_confirm')}`)) return;
    try {
      await api.deleteDeck(deck.id);
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function importYdk(file: File) {
    setImporting(true);
    setImportResult(null);
    try {
      const text = await file.text();
      const deckName = file.name.replace(/\.ydk$/i, '');
      const { data } = await api.importDeckYdk(game, deckName, text);
      setImportResult(
        `${data.name}: ${data.imported} ${t('deck_cards_label')}` +
          (data.unmatched.length ? ` — ${data.unmatched.length} ${t('deck_import_unmatched')} (${data.unmatched.slice(0, 5).join(', ')}${data.unmatched.length > 5 ? ', …' : ''})` : '')
      );
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setImporting(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  return (
    <>
      <h1>{t('decks_title')}</h1>
      {error && <div className="error-banner">{error}</div>}

      <div className="toolbar">
        <form onSubmit={create} style={{ display: 'flex', gap: 10, flex: '1 1 320px' }}>
          <input
            type="text"
            placeholder={t('deck_new_placeholder')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ flex: 1, padding: '9px 14px', background: 'var(--bg-panel)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 8 }}
          />
          <button type="submit" className="btn primary" disabled={!name.trim()}>{t('deck_create')}</button>
        </form>
        <button className="btn" disabled={importing} onClick={() => fileInput.current?.click()}>
          {importing ? t('deck_importing') : t('deck_import_ydk')}
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".ydk,text/plain"
          style={{ display: 'none' }}
          onChange={(e) => e.target.files?.[0] && importYdk(e.target.files[0])}
        />
      </div>
      {importResult && <div className="panel" style={{ marginBottom: 16 }}>{importResult}</div>}

      {loading ? (
        <div className="empty">…</div>
      ) : decks.length === 0 ? (
        <div className="empty">{t('decks_empty')}</div>
      ) : (
        <div className="set-list">
          {decks.map((d) => (
            <Link key={d.id} to={`/decks/${d.id}`} className="set-row">
              <div>
                <strong>{d.name}</strong>
                <div className="meta">
                  {(['main', 'extra', 'side'] as const)
                    .filter((z) => (d.zoneCounts[z] || 0) > 0 || z === 'main')
                    .map((z) => `${tf(`deck_zone_${z}`)} ${d.zoneCounts[z] || 0}`)
                    .join(' · ')}{' '}
                  · {new Date(d.updated_at).toLocaleDateString(locale)}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button
                  className="btn small danger"
                  onClick={(e) => { e.preventDefault(); remove(d); }}
                >
                  {t('coll_delete')}
                </button>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
