import { FormEvent, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import CardImage from '../components/CardImage';
import Paginator from '../components/Paginator';
import ScanCardModal from '../components/ScanCardModal';
import { useGame } from '../game';
import { useLanguage } from '../i18n';
import { CONDITION_LABELS, CardNavState, CollectionItem, LANGUAGES, Pagination } from '../types';

function itemName(it: { card_name?: string; card_name_de?: string | null }, lang: string): string {
  return lang === 'de' ? it.card_name_de || it.card_name || '' : it.card_name || it.card_name_de || '';
}

export default function CollectionPage() {
  const { canEdit } = useAuth();
  const { lang, t, locale } = useLanguage();
  const { games } = useGame();
  const gamesWithItems = games.filter((g) => g.collectedCount > 0);
  const euro = (v: string | number | null | undefined, currency = 'EUR') =>
    v != null ? Number(v).toLocaleString(locale, { style: 'currency', currency }) : '—';
  const [params, setParams] = useSearchParams();
  const [items, setItems] = useState<CollectionItem[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState(params.get('search') || '');
  const [editing, setEditing] = useState<CollectionItem | null>(null);
  const [importingCsv, setImportingCsv] = useState(false);
  const [csvResult, setCsvResult] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const get = (k: string) => params.get(k) || '';

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    setParams(next, { replace: true });
  }

  useEffect(() => {
    const t = setTimeout(() => {
      if (searchInput !== get('search')) setParam('search', searchInput);
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  function load() {
    setLoading(true);
    api
      .collection({
        game: get('game') || undefined,
        search: get('search'),
        page: get('page') || 1,
        limit: 50,
        sort: get('sort') || undefined,
        condition: get('condition') || undefined,
        language: get('language') || undefined,
        first_edition: get('first_edition') || undefined,
      })
      .then((r) => { setItems(r.data); setPagination(r.pagination); setError(null); })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(load, [params]);

  async function remove(item: CollectionItem) {
    if (!confirm(`"${itemName(item, lang)}" ${t('coll_confirm_delete')}`)) return;
    try {
      await api.deleteCollectionItem(item.id);
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function importCsv(file: File) {
    setImportingCsv(true);
    setCsvResult(null);
    try {
      const text = await file.text();
      const { data } = await api.importCollectionCsv(text);
      const parts = [
        `${data.created} ${t('csv_result_created')}`,
        `${data.updated} ${t('csv_result_updated')}`,
        `${data.failed} ${t('csv_result_failed')}`,
      ];
      setCsvResult(`${t('csv_result')} ${parts.join(', ')}${data.errors.length ? ` — ${data.errors[0]}` : ''}`);
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setImportingCsv(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  return (
    <>
      <h1>{t('coll_title')}</h1>
      {error && <div className="error-banner">{error}</div>}

      <div className="toolbar">
        <input
          type="search"
          placeholder={t('coll_search_placeholder')}
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
        <a className="btn" href={api.collectionExportUrl()} download>{t('csv_export')}</a>
        {canEdit && (
          <>
            <button className="btn" disabled={importingCsv} onClick={() => fileInput.current?.click()}>
              {importingCsv ? t('csv_importing') : t('csv_import')}
            </button>
            <button className="btn" onClick={() => setScanning(true)}>{t('scan_button')}</button>
            <input
              ref={fileInput}
              type="file"
              accept=".csv,text/csv"
              style={{ display: 'none' }}
              onChange={(e) => e.target.files?.[0] && importCsv(e.target.files[0])}
            />
          </>
        )}
      </div>

      <div className="toolbar">
        <select value={get('game')} onChange={(e) => setParam('game', e.target.value)}>
          <option value="">{t('coll_filter_all_games')}</option>
          {gamesWithItems.map((g) => <option key={g.code} value={g.code}>{g.name}</option>)}
        </select>
        <select value={get('sort') || 'newest'} onChange={(e) => setParam('sort', e.target.value === 'newest' ? '' : e.target.value)}>
          <option value="newest">{t('coll_sort_newest')}</option>
          <option value="oldest">{t('coll_sort_oldest')}</option>
          <option value="name">{t('coll_sort_name')}</option>
          <option value="quantity">{t('coll_sort_quantity')}</option>
          <option value="value">{t('coll_sort_value')}</option>
        </select>
        <select value={get('condition')} onChange={(e) => setParam('condition', e.target.value)}>
          <option value="">{t('coll_filter_all_conditions')}</option>
          {Object.entries(CONDITION_LABELS).map(([code, label]) => (
            <option key={code} value={code}>{code} — {label}</option>
          ))}
        </select>
        <select value={get('language')} onChange={(e) => setParam('language', e.target.value)}>
          <option value="">{t('coll_filter_all_languages')}</option>
          {LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
          <input
            type="checkbox"
            style={{ width: 'auto' }}
            checked={get('first_edition') === '1'}
            onChange={(e) => setParam('first_edition', e.target.checked ? '1' : '')}
          />
          {t('coll_filter_first_edition')}
        </label>
      </div>
      {csvResult && <div className="panel" style={{ marginBottom: 16 }}>{csvResult}</div>}

      {loading ? (
        <div className="empty">{t('coll_loading')}</div>
      ) : items.length === 0 ? (
        <div className="empty">{t('coll_empty')}</div>
      ) : (
        <div className="table-wrap panel" style={{ padding: 0 }}>
          <table>
            <thead>
              <tr>
                <th></th><th>{t('col_card')}</th><th>{t('col_set')}</th><th>{t('col_condition')}</th><th>{t('col_language')}</th>
                <th>1st</th><th>{t('col_quantity')}</th><th>{t('col_purchase_price')}</th><th>{t('col_market_value')}</th><th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => {
                const navState: CardNavState = {
                  back: { path: `/collection${params.toString() ? `?${params.toString()}` : ''}`, name: t('coll_title') },
                  cardIds: [...new Set(items.map((x) => x.card_id).filter((x): x is number => x != null))],
                };
                return (
                <tr key={it.id}>
                  <td>
                    <Link to={`/cards/${it.card_id}`} state={navState}><CardImage className="thumb" src={it.image_small_url} alt="" /></Link>
                  </td>
                  <td><Link to={`/cards/${it.card_id}`} state={navState}>{itemName(it, lang)}</Link></td>
                  <td>{it.set_code} <span className="muted">{it.collector_number}</span></td>
                  <td>{it.condition} <span className="muted">({CONDITION_LABELS[it.condition]})</span></td>
                  <td>{it.language}</td>
                  <td>{it.is_first_edition ? <span className="badge-1st">1st</span> : ''}</td>
                  <td>{it.quantity}</td>
                  <td>{euro(it.purchase_price)}</td>
                  <td>{euro(it.market_price ? Number(it.market_price) * it.quantity : null, it.currency)}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {canEdit && (
                      <>
                        <button className="btn small" onClick={() => setEditing(it)}>{t('coll_edit')}</button>{' '}
                        <button className="btn small danger" onClick={() => remove(it)}>{t('coll_delete')}</button>
                      </>
                    )}
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {pagination && <Paginator p={pagination} onPage={(p) => setParam('page', String(p))} />}

      {editing && (
        <EditModal item={editing} onClose={() => setEditing(null)} onSaved={load} />
      )}

      {scanning && (
        <ScanCardModal onClose={() => setScanning(false)} onSaved={load} />
      )}
    </>
  );
}

function EditModal({ item, onClose, onSaved }: { item: CollectionItem; onClose: () => void; onSaved: () => void }) {
  const { lang, t } = useLanguage();
  const [quantity, setQuantity] = useState(item.quantity);
  const [condition, setCondition] = useState(item.condition);
  const [language, setLanguage] = useState(item.language);
  const [firstEdition, setFirstEdition] = useState(!!item.is_first_edition);
  const [storage, setStorage] = useState(item.storage_location || '');
  const [price, setPrice] = useState(item.purchase_price || '');
  const [acquiredAt, setAcquiredAt] = useState(item.acquired_at ? item.acquired_at.slice(0, 10) : '');
  const [notes, setNotes] = useState(item.notes || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.updateCollectionItem(item.id, {
        quantity,
        condition,
        language,
        is_first_edition: firstEdition,
        storage_location: storage || null,
        purchase_price: price ? Number(String(price).replace(',', '.')) : null,
        acquired_at: acquiredAt || null,
        notes: notes || null,
      });
      onSaved();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{t('coll_edit_title')}</h3>
        <p className="muted" style={{ marginBottom: 14 }}>{itemName(item, lang)}</p>
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={submit}>
          <div className="form-grid">
            <div>
              <label>{t('modal_quantity')}</label>
              <input type="number" min={1} value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} />
            </div>
            <div>
              <label>{t('modal_condition')}</label>
              <select value={condition} onChange={(e) => setCondition(e.target.value as CollectionItem['condition'])}>
                {Object.entries(CONDITION_LABELS).map(([code, label]) => (
                  <option key={code} value={code}>{code} — {label}</option>
                ))}
              </select>
            </div>
            <div>
              <label>{t('modal_language')}</label>
              <select value={language} onChange={(e) => setLanguage(e.target.value)}>
                {LANGUAGES.map((l) => <option key={l}>{l}</option>)}
              </select>
            </div>
            <div>
              <label>{t('modal_purchase_price')}</label>
              <input type="text" inputMode="decimal" placeholder="z. B. 4,99" value={price} onChange={(e) => setPrice(e.target.value)} />
            </div>
            <div>
              <label>{t('modal_acquired_at')}</label>
              <input type="date" value={acquiredAt} onChange={(e) => setAcquiredAt(e.target.value)} />
            </div>
            <div>
              <label>{t('coll_storage')}</label>
              <input type="text" value={storage} onChange={(e) => setStorage(e.target.value)} />
            </div>
            <div className="full">
              <label>
                <input
                  type="checkbox"
                  checked={firstEdition}
                  onChange={(e) => setFirstEdition(e.target.checked)}
                  style={{ width: 'auto', marginRight: 8 }}
                />
                {t('modal_first_edition')}
              </label>
            </div>
            <div className="full">
              <label>{t('coll_notes')}</label>
              <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>
          <div className="actions">
            <button type="button" className="btn" onClick={onClose}>{t('modal_cancel')}</button>
            <button type="submit" className="btn primary" disabled={saving}>{saving ? t('modal_saving') : t('modal_save')}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
