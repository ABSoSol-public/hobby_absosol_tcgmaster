import { FormEvent, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import CardImage from '../components/CardImage';
import Paginator from '../components/Paginator';
import ScanCardModal from '../components/ScanCardModal';
import { useLanguage } from '../i18n';
import { CONDITION_LABELS, CardNavState, CollectionItem, Pagination } from '../types';

function itemName(it: { card_name?: string; card_name_de?: string | null }, lang: string): string {
  return lang === 'de' ? it.card_name_de || it.card_name || '' : it.card_name || it.card_name_de || '';
}

export default function CollectionPage() {
  const { lang, t, locale } = useLanguage();
  const euro = (v: string | number | null | undefined) =>
    v != null ? Number(v).toLocaleString(locale, { style: 'currency', currency: 'EUR' }) : '—';
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
      .collection({ search: get('search'), page: get('page') || 1, limit: 50 })
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
                  <td>{euro(it.market_price ? Number(it.market_price) * it.quantity : null)}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button className="btn small" onClick={() => setEditing(it)}>{t('coll_edit')}</button>{' '}
                    <button className="btn small danger" onClick={() => remove(it)}>{t('coll_delete')}</button>
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
  const [storage, setStorage] = useState(item.storage_location || '');
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
        storage_location: storage || null,
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
            <div className="full">
              <label>{t('coll_storage')}</label>
              <input type="text" value={storage} onChange={(e) => setStorage(e.target.value)} />
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
