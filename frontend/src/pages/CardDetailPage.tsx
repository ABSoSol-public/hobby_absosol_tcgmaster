import { Fragment, useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import AddToCollectionModal from '../components/AddToCollectionModal';
import CardImage from '../components/CardImage';
import PriceHistoryChart from '../components/PriceHistoryChart';
import RemoveFromCollectionModal from '../components/RemoveFromCollectionModal';
import { cardName, cardText, useLanguage } from '../i18n';
import { CardDetail, CardNavState, Print } from '../types';

// YGOPRODeck (und andere Quellen) liefern Set-Codes nur mit dem englischen
// Sprachkürzel (z. B. "MP24-EN174"), auch wenn eine deutsche TCG-Ausgabe der
// Karte existiert und auf ihr ein eigener "-DE"-Code aufgedruckt ist. Diese
// deutsche Nummer ist in der Quelle schlicht nicht enthalten — daher hier nur
// eine reine Textableitung (Sprachkürzel ersetzt), keine verifizierte Angabe.
function deVariantHint(collectorNumber: string | null | undefined, hasGermanRelease: boolean): string | null {
  if (!collectorNumber || !hasGermanRelease) return null;
  const m = collectorNumber.match(/^([A-Z0-9]{2,6}-)([A-Z]{1,3})(\d{1,4}[A-Z]?)$/i);
  if (!m) return null;
  const [, prefix, lang, number] = m;
  if (lang.toUpperCase() === 'DE') return null;
  return `${prefix}DE${number}`;
}

export default function CardDetailPage() {
  const { id } = useParams();
  const { canEdit } = useAuth();
  const { lang, t, locale } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();
  const navState = (location.state || null) as CardNavState | null;
  const [card, setCard] = useState<CardDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modalPrint, setModalPrint] = useState<Print | null>(null);
  const [removePrint, setRemovePrint] = useState<Print | null>(null);
  const [historyPrintId, setHistoryPrintId] = useState<number | null>(null);
  const [busyPrintId, setBusyPrintId] = useState<number | null>(null);

  async function quickAdjust(printId: number, action: 'add' | 'remove') {
    setBusyPrintId(printId);
    try {
      await (action === 'add' ? api.quickAddOne(printId) : api.quickRemoveOne(printId));
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyPrintId(null);
    }
  }

  // Blätter-Kontext: Position der aktuellen Karte in der Herkunftsliste
  const ids = navState?.cardIds || [];
  const idx = ids.indexOf(Number(id));
  const prevId = idx > 0 ? ids[idx - 1] : null;
  const nextId = idx >= 0 && idx < ids.length - 1 ? ids[idx + 1] : null;
  const goTo = useCallback(
    (cardId: number) => navigate(`/cards/${cardId}`, { state: navState }),
    [navigate, navState]
  );

  // Pfeiltasten ←/→ blättern durch die Liste (nicht in Formularfeldern/Modals)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (modalPrint || removePrint) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'ArrowLeft' && prevId != null) goTo(prevId);
      if (e.key === 'ArrowRight' && nextId != null) goTo(nextId);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [prevId, nextId, modalPrint, removePrint, goTo]);

  const euro = (v: string | null | undefined, currency = 'EUR') =>
    v ? Number(v).toLocaleString(locale, { style: 'currency', currency }) : '—';

  const load = useCallback(() => {
    api.card(id!).then((r) => setCard(r.data)).catch((err) => setError(err.message));
  }, [id]);

  useEffect(load, [load]);

  if (error) return <div className="error-banner">{error}</div>;
  if (!card) return <div className="empty">{t('cards_loading')}</div>;

  const gd = card.game_data || {};
  const props: [string, unknown][] = [
    [t('card_prop_type'), card.card_type],
    [t('card_prop_attribute'), gd.attribute],
    [t('card_prop_race'), gd.race],
    [t('card_prop_level'), gd.level],
    [t('card_prop_linkval'), gd.linkval],
    [t('card_prop_scale'), gd.scale],
    [t('card_prop_atk'), gd.atk],
    [t('card_prop_def'), gd.def],
    [t('card_prop_archetype'), gd.archetype],
    [t('card_prop_passcode'), card.external_id],
  ];

  const displayName = cardName(card, lang);
  const otherName = lang === 'de' ? card.name : card.name_de;
  const displayText = cardText(card, lang) || t('card_no_translation');

  return (
    <>
      <div className="card-nav">
        <Link to={navState?.back?.path || '/cards'} className="muted">
          {navState?.back?.name ? `${t('card_back_to')} ${navState.back.name}` : t('card_back_to_browser')}
        </Link>
        {idx >= 0 && ids.length > 1 && (
          <span className="card-nav-pager">
            <button className="btn small" disabled={prevId == null} onClick={() => prevId != null && goTo(prevId)}>
              {t('card_prev')}
            </button>
            <span className="muted">{idx + 1} {t('card_of')} {ids.length}</span>
            <button className="btn small" disabled={nextId == null} onClick={() => nextId != null && goTo(nextId)}>
              {t('card_next')}
            </button>
          </span>
        )}
      </div>
      <div className="card-detail">
        <div>
          <CardImage className="big" src={card.image_url || card.image_small_url} alt={displayName} />
        </div>
        <div>
          <h1>{displayName}</h1>
          {otherName && otherName !== displayName && <p className="muted">{otherName}</p>}
          <dl className="props">
            {props
              .filter(([, v]) => v !== null && v !== undefined && v !== '')
              .map(([k, v]) => (
                <div key={k} style={{ display: 'contents' }}>
                  <dt>{k}</dt>
                  <dd>{String(v)}</dd>
                </div>
              ))}
          </dl>
          <p className="card-text">{displayText}</p>

          <h2>{t('card_prints_heading')} ({card.prints.length})</h2>
          <div className="table-wrap panel" style={{ padding: 0 }}>
            <table>
              <thead>
                <tr><th>{t('col_set')}</th><th>{t('col_number')}</th><th>{t('col_rarity')}</th><th>{t('col_price')}</th><th>{t('col_owned')}</th><th></th></tr>
              </thead>
              <tbody>
                {card.prints.map((p) => {
                  const owned = (p.collectionItems || []).reduce((sum, i) => sum + i.quantity, 0);
                  const historyOpen = historyPrintId === p.id;
                  const deHint = deVariantHint(p.collector_number, Boolean(card.name_de));
                  return (
                    <Fragment key={p.id}>
                      <tr>
                        <td><Link to={`/sets/${p.set_id}`}>{p.set_name}</Link></td>
                        <td>
                          {p.collector_number}
                          {deHint && (
                            <div className="muted" style={{ fontSize: '0.85em' }}>
                              {t('card_number_de_hint')}: {deHint}
                            </div>
                          )}
                        </td>
                        <td>{p.rarity}</td>
                        <td>
                          {euro(p.market_price, p.currency)}
                          {p.marketplace_url && (
                            <>
                              {' '}
                              <a href={p.marketplace_url} target="_blank" rel="noopener noreferrer" title={t('price_marketplace_link')}>↗</a>
                            </>
                          )}
                        </td>
                        <td>{owned > 0 ? <strong style={{ color: 'var(--green)' }}>{owned}×</strong> : <span className="muted">—</span>}</td>
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <button
                            className={`btn small${historyOpen ? ' primary' : ''}`}
                            onClick={() => setHistoryPrintId(historyOpen ? null : p.id)}
                            aria-expanded={historyOpen}
                            title={historyOpen ? t('price_history_toggle_close') : t('price_history_toggle')}
                          >
                            {t('price_history_toggle')}
                          </button>{' '}
                          {canEdit && (
                            <>
                              <button
                                className="btn small"
                                disabled={busyPrintId === p.id}
                                title={t('quick_add_one')}
                                onClick={() => quickAdjust(p.id, 'add')}
                              >
                                {t('quick_add_one')}
                              </button>{' '}
                              {owned > 0 && (
                                <>
                                  <button
                                    className="btn small"
                                    disabled={busyPrintId === p.id}
                                    title={t('quick_remove_one')}
                                    onClick={() => quickAdjust(p.id, 'remove')}
                                  >
                                    {t('quick_remove_one')}
                                  </button>{' '}
                                </>
                              )}
                              <button className="btn small primary" onClick={() => setModalPrint(p)}>{t('add_to_collection')}</button>
                              {owned > 0 && (
                                <>
                                  {' '}
                                  <button className="btn small danger" onClick={() => setRemovePrint(p)}>{t('remove_from_collection')}</button>
                                </>
                              )}
                            </>
                          )}
                        </td>
                      </tr>
                      {historyOpen && (
                        <tr>
                          <td colSpan={6} style={{ padding: 0, background: 'var(--bg)' }}>
                            <PriceHistoryChart printId={p.id} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {modalPrint && (
        <AddToCollectionModal
          print={modalPrint}
          cardName={displayName}
          onClose={() => setModalPrint(null)}
          onSaved={load}
        />
      )}

      {removePrint && (
        <RemoveFromCollectionModal
          print={removePrint}
          cardName={displayName}
          onClose={() => setRemovePrint(null)}
          onChanged={load}
        />
      )}
    </>
  );
}
