import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { useGame } from '../game';
import { useLanguage } from '../i18n';
import { CollectionStats, ImageJob, ImportJob } from '../types';

// Spiele, für die das Backend einen Importer registriert hat
// (siehe backend/src/services/importers/index.ts).
const IMPORTABLE = new Set(['yugioh', 'pokemon', 'magic', 'lorcana', 'riftbound']);

export default function Dashboard() {
  const { canEdit } = useAuth();
  const { t, locale } = useLanguage();
  const { game, games, reloadGames } = useGame();
  const euro = (n: number) => n.toLocaleString(locale, { style: 'currency', currency: 'EUR' });
  const [stats, setStats] = useState<CollectionStats | null>(null);
  const [job, setJob] = useState<ImportJob | null>(null);
  const [imageJob, setImageJob] = useState<ImageJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState<string | null>(null);
  const [downloadingImages, setDownloadingImages] = useState(false);

  async function load() {
    reloadGames();
    try {
      const s = await api.collectionStats();
      setStats(s.data);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
    try {
      const j = await api.latestImport(game);
      setJob(j.data);
    } catch (err) {
      setError((err as Error).message);
    }
    try {
      const ij = await api.latestImageDownload(game);
      setImageJob(ij.data);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  useEffect(() => {
    load();
  }, [game]);

  // Läuft ein Import, alle 5 s den Status aktualisieren
  useEffect(() => {
    if (job?.status !== 'running') return;
    const timer = setInterval(async () => {
      try {
        const j = await api.latestImport(job.game_code);
        setJob(j.data);
        if (j.data?.status !== 'running') load();
      } catch { /* ignorieren */ }
    }, 5000);
    return () => clearInterval(timer);
  }, [job?.status, job?.game_code]);

  // Läuft ein Bild-Update, alle 5 s den Status aktualisieren
  useEffect(() => {
    if (imageJob?.status !== 'running') return;
    const timer = setInterval(async () => {
      try {
        const ij = await api.latestImageDownload(imageJob.game_code || undefined);
        setImageJob(ij.data);
      } catch { /* ignorieren */ }
    }, 5000);
    return () => clearInterval(timer);
  }, [imageJob?.status, imageJob?.game_code]);

  async function startImageDownload(code: string) {
    setDownloadingImages(true);
    try {
      await api.startImageDownload(code);
      const ij = await api.latestImageDownload(code);
      setImageJob(ij.data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setDownloadingImages(false);
    }
  }

  async function startImport(code: string) {
    setImporting(code);
    try {
      await api.startImport(code);
      const j = await api.latestImport(code);
      setJob(j.data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setImporting(null);
    }
  }

  const activeGame = games.find((g) => g.code === game);

  return (
    <>
      <h1>{t('dash_title')}</h1>
      {error && <div className="error-banner">{error}</div>}

      {stats && (
        <div className="stat-row">
          <div className="stat-tile"><div className="value">{stats.totalCopies.toLocaleString(locale)}</div><div className="label">{t('dash_stat_copies')}</div></div>
          <div className="stat-tile"><div className="value">{stats.distinctCards.toLocaleString(locale)}</div><div className="label">{t('dash_stat_distinct_cards')}</div></div>
          <div className="stat-tile"><div className="value">{stats.distinctPrints.toLocaleString(locale)}</div><div className="label">{t('dash_stat_distinct_prints')}</div></div>
          <div className="stat-tile"><div className="value">{euro(stats.marketValue)}</div><div className="label">{t('dash_stat_market_value')}</div></div>
          <div className="stat-tile"><div className="value">{euro(stats.purchaseValue)}</div><div className="label">{t('dash_stat_purchase_value')}</div></div>
          <div className="stat-tile"><div className="value">{euro(stats.hypotheticalValue)}</div><div className="label">{t('dash_stat_hypothetical_value')}</div></div>
        </div>
      )}

      <h2>{t('dash_catalog_heading')}</h2>
      <div className="panel">
        {activeGame && activeGame.cardCount > 0 ? (
          <p>
            <strong>{activeGame.name}</strong>: {activeGame.cardCount.toLocaleString(locale)} {t('dash_catalog_summary')}{' '}
            <Link to="/cards" style={{ color: 'var(--accent)' }}>{t('dash_catalog_browse')}</Link>
          </p>
        ) : (
          <p className="muted">{t('dash_catalog_empty')}</p>
        )}
        <div style={{ marginTop: 12, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          {canEdit && (
            <button
              className="btn primary"
              onClick={() => startImport(game)}
              disabled={!IMPORTABLE.has(game) || importing !== null || job?.status === 'running'}
            >
              {job?.status === 'running' ? t('dash_import_running') : t('dash_import_start')}
            </button>
          )}
          {job && (
            <span className="muted">
              {t('dash_import_last')} {job.status === 'running' ? '⏳' : job.status === 'completed' ? '✅' : '❌'}{' '}
              {job.message || job.status}
            </span>
          )}
        </div>
      </div>

      <h2>{t('dash_images_heading')}</h2>
      <div className="panel">
        <p className="muted">{t('dash_images_hint')}</p>
        <div style={{ marginTop: 12, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          {canEdit && (
            <button
              className="btn primary"
              onClick={() => startImageDownload(game)}
              disabled={downloadingImages || imageJob?.status === 'running'}
            >
              {imageJob?.status === 'running' ? t('dash_images_running') : t('dash_images_start')}
            </button>
          )}
          {imageJob && (
            <span className="muted">
              {t('dash_images_last')}{' '}
              {imageJob.status === 'running' ? '⏳' : imageJob.status === 'completed' ? '✅' : '❌'}{' '}
              {imageJob.message || imageJob.status}
            </span>
          )}
        </div>
      </div>

      <h2>{t('dash_games_heading')}</h2>
      <div className="table-wrap panel" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr><th>{t('dash_games_game')}</th><th>{t('dash_games_status')}</th><th>{t('dash_games_catalog_count')}</th><th>{t('dash_games_collected')}</th><th>{t('dash_games_collected_unique')}</th><th></th></tr>
          </thead>
          <tbody>
            {games.map((g) => (
              <tr key={g.id}>
                <td>{g.name}</td>
                <td>{g.active ? <span style={{ color: 'var(--green)' }}>{t('dash_games_active')}</span> : <span className="muted">{t('dash_games_planned')}</span>}</td>
                <td>{g.cardCount.toLocaleString(locale)}</td>
                <td>{g.collectedCount.toLocaleString(locale)}</td>
                <td>{g.collectedDistinctCount.toLocaleString(locale)}</td>
                <td style={{ textAlign: 'right' }}>
                  {IMPORTABLE.has(g.code) ? (
                    canEdit && (
                      <button
                        className="btn small"
                        disabled={importing !== null || job?.status === 'running'}
                        onClick={() => startImport(g.code)}
                      >
                        {importing === g.code ? '⏳' : t('dash_games_import')}
                      </button>
                    )
                  ) : (
                    <span className="muted" style={{ fontSize: 13 }}>{t('dash_games_no_importer')}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
