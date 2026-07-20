import { FormEvent, useState } from 'react';
import { api } from '../api';
import { useLanguage } from '../i18n';
import { CONDITION_LABELS, Condition, LANGUAGES, Print } from '../types';

interface Props {
  print: Print;
  cardName: string;
  onClose: () => void;
  onSaved: () => void;
}

/** Dialog: einen Print mit Zustand/Sprache/Menge zur Sammlung hinzufügen. */
export default function AddToCollectionModal({ print, cardName, onClose, onSaved }: Props) {
  const { t } = useLanguage();
  const [quantity, setQuantity] = useState(1);
  const [condition, setCondition] = useState<Condition>('NM');
  const [language, setLanguage] = useState('DE');
  const [firstEdition, setFirstEdition] = useState(false);
  const [storage, setStorage] = useState('');
  const [price, setPrice] = useState('');
  const [acquiredAt, setAcquiredAt] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.addToCollection({
        print_id: print.id,
        quantity,
        condition,
        language,
        is_first_edition: firstEdition,
        storage_location: storage || null,
        purchase_price: price ? Number(price.replace(',', '.')) : null,
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
        <h3>{t('modal_add_title')}</h3>
        <p className="muted" style={{ marginBottom: 14 }}>
          {cardName} — {print.collector_number} ({print.rarity})
        </p>
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={submit}>
          <div className="form-grid">
            <div>
              <label>{t('modal_quantity')}</label>
              <input type="number" min={1} value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} />
            </div>
            <div>
              <label>{t('modal_condition')}</label>
              <select value={condition} onChange={(e) => setCondition(e.target.value as Condition)}>
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
              <label>{t('modal_storage')}</label>
              <input type="text" placeholder="z. B. Ordner 2" value={storage} onChange={(e) => setStorage(e.target.value)} />
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
              <label>{t('modal_notes')}</label>
              <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>
          <div className="actions">
            <button type="button" className="btn" onClick={onClose}>{t('modal_cancel')}</button>
            <button type="submit" className="btn primary" disabled={saving}>
              {saving ? t('modal_saving') : t('modal_add')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
