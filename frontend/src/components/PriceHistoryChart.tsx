import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';
import { useLanguage } from '../i18n';
import { PriceHistoryEntry } from '../types';

interface Props {
  printId: number;
}

const WIDTH = 720;
const HEIGHT = 220;
const PAD = { top: 16, right: 16, bottom: 26, left: 56 };

/** Rundet eine Achsen-Obergrenze auf einen "glatten" Wert (1/2/5 × 10^n) auf. */
function niceCeil(value: number): number {
  if (value <= 0) return 1;
  const exp = Math.floor(Math.log10(value));
  const base = value / 10 ** exp;
  const niceBase = base <= 1 ? 1 : base <= 2 ? 2 : base <= 5 ? 5 : 10;
  return niceBase * 10 ** exp;
}

/**
 * Schlanker Preisverlauf-Chart (SVG, ohne externe Lib) für einen einzelnen
 * Print. Lädt seine Daten selbst über die Preis-Historie-API — so kann er
 * unabhängig je Zeile in der Print-Tabelle ein-/ausgeklappt werden.
 */
export default function PriceHistoryChart({ printId }: Props) {
  const { t, locale } = useLanguage();
  const [entries, setEntries] = useState<PriceHistoryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const [addPrice, setAddPrice] = useState('');
  const [addCurrency, setAddCurrency] = useState('EUR');
  const [addDate, setAddDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const reload = useCallback(() => {
    api
      .printPrices(printId)
      .then((r) => setEntries(r.data))
      .catch((err) => setError(err.message));
  }, [printId]);

  useEffect(() => {
    setEntries(null);
    setError(null);
    reload();
  }, [printId, reload]);

  async function submitManualPrice(e: FormEvent) {
    e.preventDefault();
    setAddError(null);
    const value = Number(addPrice.replace(',', '.'));
    if (!addPrice || Number.isNaN(value) || value <= 0) {
      setAddError(t('price_history_add_price'));
      return;
    }
    setSaving(true);
    try {
      await api.addManualPrice(printId, { price: value, currency: addCurrency, recorded_at: addDate });
      setAddPrice('');
      reload();
    } catch (err) {
      setAddError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function deleteManualPrice(priceId: number) {
    if (!window.confirm(t('price_history_manual_delete_confirm'))) return;
    await api.deletePriceEntry(printId, priceId);
    reload();
  }

  const sourceLabel = useCallback(
    (source: string) => (source === 'manual' ? t('price_history_source_manual') : source),
    [t]
  );

  const points = useMemo(() => {
    if (!entries || entries.length === 0) return [];
    const times = entries.map((e) => new Date(e.recorded_at).getTime());
    const prices = entries.map((e) => Number(e.price));
    const minT = Math.min(...times);
    const maxT = Math.max(...times);
    const maxP = niceCeil(Math.max(...prices) * 1.1);
    const innerW = WIDTH - PAD.left - PAD.right;
    const innerH = HEIGHT - PAD.top - PAD.bottom;
    const spanT = maxT - minT || 1;
    return entries.map((e, i) => ({
      entry: e,
      t: times[i],
      price: prices[i],
      x: PAD.left + ((times[i] - minT) / spanT) * innerW,
      y: PAD.top + innerH - (prices[i] / maxP) * innerH,
      maxP,
    }));
  }, [entries]);

  const maxP = points[0]?.maxP ?? 1;
  const yTicks = useMemo(() => {
    const steps = 4;
    return Array.from({ length: steps + 1 }, (_, i) => (maxP / steps) * i);
  }, [maxP]);

  const formatPrice = useCallback(
    (value: number, currency: string) =>
      value.toLocaleString(locale, { style: 'currency', currency }),
    [locale]
  );

  const formatDate = useCallback(
    (iso: string) => new Date(iso).toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' }),
    [locale]
  );

  const handleMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (!svgRef.current || points.length === 0) return;
      const rect = svgRef.current.getBoundingClientRect();
      const xInSvg = ((e.clientX - rect.left) / rect.width) * WIDTH;
      let nearest = 0;
      let nearestDist = Infinity;
      points.forEach((p, i) => {
        const dist = Math.abs(p.x - xInSvg);
        if (dist < nearestDist) {
          nearestDist = dist;
          nearest = i;
        }
      });
      setHoverIdx(nearest);
    },
    [points]
  );

  const addForm = (
    <form className="price-history-add" onSubmit={submitManualPrice}>
      <span className="price-history-add-heading">{t('price_history_add_heading')}</span>
      <input
        type="text"
        inputMode="decimal"
        placeholder={t('price_history_add_price')}
        value={addPrice}
        onChange={(e) => setAddPrice(e.target.value)}
      />
      <select value={addCurrency} onChange={(e) => setAddCurrency(e.target.value)}>
        <option value="EUR">EUR</option>
        <option value="USD">USD</option>
      </select>
      <input type="date" value={addDate} onChange={(e) => setAddDate(e.target.value)} />
      <button type="submit" className="btn small primary" disabled={saving}>
        {saving ? t('price_history_add_saving') : t('price_history_add_button')}
      </button>
      {addError && <span className="price-history-add-error">{addError}</span>}
    </form>
  );

  const manualEntries = (entries || []).filter((e) => e.source === 'manual');
  const manualList = manualEntries.length > 0 && (
    <div className="price-history-manual-list">
      <span className="muted">{t('price_history_manual_heading')}</span>
      <ul>
        {manualEntries.map((e) => (
          <li key={e.id}>
            <span>
              {formatPrice(Number(e.price), e.currency)} · {formatDate(e.recorded_at)}
            </span>
            <button type="button" className="btn small danger" onClick={() => deleteManualPrice(e.id)}>
              {t('price_history_manual_delete')}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );

  if (error) return <div className="error-banner">{error}</div>;
  if (entries === null) return <div className="empty price-history-empty">{t('price_history_loading')}</div>;
  if (entries.length === 0)
    return (
      <div className="price-history">
        <div className="empty price-history-empty">{t('price_history_empty')}</div>
        {addForm}
      </div>
    );

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L${points[points.length - 1].x.toFixed(1)},${HEIGHT - PAD.bottom} L${points[0].x.toFixed(1)},${HEIGHT - PAD.bottom} Z`;
  const hover = hoverIdx !== null ? points[hoverIdx] : null;
  const innerW = WIDTH - PAD.left - PAD.right;

  return (
    <div className="price-history">
      {entries.length === 1 && <p className="muted price-history-hint">{t('price_history_single_point')}</p>}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="price-history-svg"
        onPointerMove={handleMove}
        onPointerLeave={() => setHoverIdx(null)}
      >
        <defs>
          <linearGradient id={`price-fill-${printId}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.1" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {yTicks.map((tick, i) => {
          const y = PAD.top + (HEIGHT - PAD.top - PAD.bottom) * (1 - i / (yTicks.length - 1));
          return (
            <g key={i}>
              <line x1={PAD.left} x2={WIDTH - PAD.right} y1={y} y2={y} className="price-history-grid" />
              <text x={PAD.left - 8} y={y} className="price-history-axis" textAnchor="end" dominantBaseline="middle">
                {formatPrice(tick, entries[0].currency)}
              </text>
            </g>
          );
        })}

        <text x={PAD.left} y={HEIGHT - 6} className="price-history-axis" textAnchor="start">
          {formatDate(entries[0].recorded_at)}
        </text>
        <text x={WIDTH - PAD.right} y={HEIGHT - 6} className="price-history-axis" textAnchor="end">
          {formatDate(entries[entries.length - 1].recorded_at)}
        </text>

        {points.length > 1 && <path d={areaPath} fill={`url(#price-fill-${printId})`} stroke="none" />}
        {points.length > 1 && <path d={linePath} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />}

        {points.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={i === hoverIdx ? 5 : 4}
            fill={p.entry.source === 'manual' ? 'var(--green)' : 'var(--accent)'}
            stroke="var(--bg-panel)"
            strokeWidth={2}
          />
        ))}

        {hover && (
          <line x1={hover.x} x2={hover.x} y1={PAD.top} y2={HEIGHT - PAD.bottom} className="price-history-crosshair" />
        )}

        <rect
          x={PAD.left}
          y={PAD.top}
          width={innerW}
          height={HEIGHT - PAD.top - PAD.bottom}
          fill="transparent"
        />
      </svg>

      {hover && (
        <div
          className="price-history-tooltip"
          style={{ left: `${(hover.x / WIDTH) * 100}%`, top: `${(hover.y / HEIGHT) * 100}%` }}
        >
          <div className="price-history-tooltip-value">{formatPrice(hover.price, hover.entry.currency)}</div>
          <div className="price-history-tooltip-meta">
            {formatDate(hover.entry.recorded_at)} · {sourceLabel(hover.entry.source)}
          </div>
        </div>
      )}

      {addForm}
      {manualList}
    </div>
  );
}
