import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { useLanguage } from '../i18n';
import { CONDITION_LABELS, CollectionItem, Print } from '../types';

interface Props {
  print: Print;
  cardName: string;
  onClose: () => void;
  /** Wird nach jeder Änderung (Menge reduziert / Eintrag gelöscht) aufgerufen. */
  onChanged: () => void;
}

/**
 * Dialog: Sammlungseinträge eines Prints anzeigen und einzelne Exemplare
 * abziehen oder ganze Einträge löschen. Lädt die Einträge selbst über die
 * Karten-API, damit er von Karten- und Set-Detailseite gleichermaßen nutzbar ist.
 */
export default function RemoveFromCollectionModal({ print, cardName, onClose, onChanged }: Props) {
  const { t } = useLanguage();
  const [items, setItems] = useState<CollectionItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api
      .card(print.card_id)
      .then((r) => {
        const p = r.data.prints.find((x) => x.id === print.id);
        setItems(p?.collectionItems || []);
      })
      .catch((err) => setError(err.message));
  }, [print.card_id, print.id]);

  useEffect(load, [load]);

  async function mutate(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      onChanged();
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const removeOne = (item: CollectionItem) =>
    mutate(() =>
      item.quantity > 1
        ? api.updateCollectionItem(item.id, { quantity: item.quantity - 1 })
        : api.deleteCollectionItem(item.id)
    );

  const removeEntry = (item: CollectionItem) => mutate(() => api.deleteCollectionItem(item.id));

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{t('remove_modal_title')}</h3>
        <p className="muted" style={{ marginBottom: 14 }}>
          {cardName} — {print.collector_number} ({print.rarity})
        </p>
        {error && <div className="error-banner">{error}</div>}

        {items === null ? (
          <div className="empty">{t('remove_loading')}</div>
        ) : items.length === 0 ? (
          <div className="empty">{t('remove_empty')}</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t('col_condition')}</th>
                  <th>{t('col_language')}</th>
                  <th>1st</th>
                  <th>{t('col_quantity')}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id}>
                    <td>{it.condition} <span className="muted">({CONDITION_LABELS[it.condition]})</span></td>
                    <td>{it.language}</td>
                    <td>{it.is_first_edition ? <span className="badge-1st">1st</span> : ''}</td>
                    <td>{it.quantity}</td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button className="btn small" disabled={busy} onClick={() => removeOne(it)}>{t('remove_one')}</button>{' '}
                      <button className="btn small danger" disabled={busy} onClick={() => removeEntry(it)}>{t('remove_entry')}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="actions">
          <button type="button" className="btn" onClick={onClose}>{t('remove_close')}</button>
        </div>
      </div>
    </div>
  );
}
