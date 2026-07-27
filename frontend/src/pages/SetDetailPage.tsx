import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import AddToCollectionModal from '../components/AddToCollectionModal';
import CardImage from '../components/CardImage';
import RemoveFromCollectionModal from '../components/RemoveFromCollectionModal';
import { useLanguage } from '../i18n';
import { CardNavState, Print, SetDetail } from '../types';

function printName(p: { card_name?: string; card_name_de?: string | null }, lang: string): string {
  return lang === 'de' ? p.card_name_de || p.card_name || '' : p.card_name || p.card_name_de || '';
}

export default function SetDetailPage() {
  const { id } = useParams();
  const { canEdit } = useAuth();
  const { lang, t, locale } = useLanguage();
  const [set, setSet] = useState<SetDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modalPrint, setModalPrint] = useState<Print | null>(null);
  const [removePrint, setRemovePrint] = useState<Print | null>(null);
  const [onlyMissing, setOnlyMissing] = useState(false);
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

  const euro = (v: string | null | undefined, currency = 'EUR') =>
    v ? Number(v).toLocaleString(locale, { style: 'currency', currency }) : '—';

  const load = useCallback(() => {
    api.set(id!).then((r) => setSet(r.data)).catch((err) => setError(err.message));
  }, [id]);

  useEffect(load, [load]);

  if (error) return <div className="error-banner">{error}</div>;
  if (!set) return <div className="empty">{t('sets_loading')}</div>;

  const owned = set.prints.filter((p) => (p.ownedQuantity || 0) > 0).length;
  const pct = set.prints.length ? Math.round((owned / set.prints.length) * 100) : 0;

  const visiblePrints = onlyMissing ? set.prints.filter((p) => !(p.ownedQuantity || 0)) : set.prints;
  // Navigationskontext für die Kartendetailseite: Zurück-Ziel + Blätter-Reihenfolge
  const navState: CardNavState = {
    back: { path: `/sets/${set.id}`, name: set.name },
    cardIds: [...new Set(visiblePrints.map((p) => p.card_id))],
  };

  return (
    <>
      <p style={{ marginBottom: 12 }}>
        <Link to="/sets" className="muted">{t('set_back_to_list')}</Link>
      </p>
      <h1>{set.name} <span className="muted">({set.code})</span></h1>
      <p className="muted" style={{ marginBottom: 8 }}>
        {set.release_date ? `${t('set_released_on')} ${new Date(set.release_date).toLocaleDateString(locale)}` : t('set_release_unknown')} ·{' '}
        {set.prints.length} {t('sets_prints')} · {owned} {t('sets_collected')} ({pct} %)
      </p>
      <div className="progress" style={{ maxWidth: 420, marginBottom: 12 }}>
        <div style={{ width: `${pct}%` }} />
      </div>

      <label className="muted" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 16, cursor: 'pointer' }}>
        <input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} />
        {t('set_only_missing')}
      </label>

      <div className="table-wrap panel" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr><th></th><th>{t('col_number')}</th><th>{t('col_card')}</th><th>{t('col_rarity')}</th><th>{t('col_price')}</th><th>{t('col_owned')}</th><th></th></tr>
          </thead>
          <tbody>
            {visiblePrints.map((p) => (
              <tr key={p.id}>
                <td>
                  <Link to={`/cards/${p.card_id}`} state={navState}><CardImage className="thumb" src={p.image_small_url} alt="" /></Link>
                </td>
                <td>{p.collector_number}</td>
                <td><Link to={`/cards/${p.card_id}`} state={navState}>{printName(p, lang)}</Link></td>
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
                <td>
                  {(p.ownedQuantity || 0) > 0
                    ? <strong style={{ color: 'var(--green)' }}>{p.ownedQuantity}×</strong>
                    : <span className="muted">—</span>}
                </td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
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
                      {(p.ownedQuantity || 0) > 0 && (
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
                      {(p.ownedQuantity || 0) > 0 && (
                        <>
                          {' '}
                          <button className="btn small danger" onClick={() => setRemovePrint(p)}>{t('remove_from_collection')}</button>
                        </>
                      )}
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modalPrint && (
        <AddToCollectionModal
          print={modalPrint}
          cardName={printName(modalPrint, lang)}
          onClose={() => setModalPrint(null)}
          onSaved={load}
        />
      )}

      {removePrint && (
        <RemoveFromCollectionModal
          print={removePrint}
          cardName={printName(removePrint, lang)}
          onClose={() => setRemovePrint(null)}
          onChanged={load}
        />
      )}
    </>
  );
}
