'use client';

import { useState } from 'react';

export type SortKey = 'default' | 'price-asc' | 'price-desc';

export interface PriceRange {
  min: number | null;
  max: number | null;
}

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'default', label: 'Порядок: по умолчанию' },
  { key: 'price-asc', label: 'Цена: по возрастанию' },
  { key: 'price-desc', label: 'Цена: по убыванию' },
];

const fmt = (n: number) => new Intl.NumberFormat('ru-RU').format(n);

interface Props {
  sort: SortKey;
  onSortChange: (s: SortKey) => void;
  price: PriceRange;
  onPriceChange: (p: PriceRange) => void;
  /** Cheapest / priciest bouquet in the current list — used as input hints. */
  bounds: { min: number; max: number };
}

export default function CatalogFilters({
  sort,
  onSortChange,
  price,
  onPriceChange,
  bounds,
}: Props) {
  const [openSection, setOpenSection] = useState<'sort' | 'price' | null>(null);
  // Price is applied on «ОК», not on every keystroke — typing "1" in a range
  // shouldn't wipe the grid mid-input.
  const [minInput, setMinInput] = useState(price.min?.toString() ?? '');
  const [maxInput, setMaxInput] = useState(price.max?.toString() ?? '');

  const toggle = (section: 'sort' | 'price') =>
    setOpenSection((cur) => (cur === section ? null : section));

  const applyPrice = () => {
    const parse = (v: string) => {
      const n = Number(v.replace(/\s/g, '').replace(',', '.'));
      return v.trim() && Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
    };
    let min = parse(minInput);
    let max = parse(maxInput);
    if (min !== null && max !== null && min > max) [min, max] = [max, min];
    setMinInput(min?.toString() ?? '');
    setMaxInput(max?.toString() ?? '');
    onPriceChange({ min, max });
  };

  const reset = () => {
    setMinInput('');
    setMaxInput('');
    onSortChange('default');
    onPriceChange({ min: null, max: null });
    setOpenSection(null);
  };

  const isFiltered = sort !== 'default' || price.min !== null || price.max !== null;
  const activeSortLabel = SORT_OPTIONS.find((o) => o.key === sort)?.label ?? '';

  return (
    <div className="cat-filters">
      <div className="cat-filters__head">
        <span className="cat-filters__title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
            <path d="M7 4v6M7 14v6M17 4v10M17 18v2M4 12h6M14 15h6" strokeLinecap="round" />
          </svg>
          Фильтры
        </span>
        {isFiltered && (
          <button type="button" className="cat-filters__reset" onClick={reset}>
            Сбросить
          </button>
        )}
      </div>

      {/* ─── Сортировка ─── */}
      <div className="cat-filters__section">
        <button
          type="button"
          className="cat-filters__row"
          onClick={() => toggle('sort')}
          aria-expanded={openSection === 'sort'}
        >
          <span>Сортировка</span>
          <span className="cat-filters__row-right">
            {sort !== 'default' && <span className="cat-filters__hint">{activeSortLabel}</span>}
            <span className={`cat-filters__chevron ${openSection === 'sort' ? 'is-open' : ''}`}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 6l6 6-6 6" /></svg>
            </span>
          </span>
        </button>
        {openSection === 'sort' && (
          <div className="cat-filters__body">
            {SORT_OPTIONS.map((o) => (
              <button
                key={o.key}
                type="button"
                className={`cat-filters__option ${sort === o.key ? 'is-active' : ''}`}
                onClick={() => onSortChange(o.key)}
              >
                {o.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ─── Цена ─── */}
      <div className="cat-filters__section">
        <button
          type="button"
          className="cat-filters__row"
          onClick={() => toggle('price')}
          aria-expanded={openSection === 'price'}
        >
          <span>Цена</span>
          <span className="cat-filters__row-right">
            {(price.min !== null || price.max !== null) && (
              <span className="cat-filters__hint">
                {price.min !== null ? fmt(price.min) : fmt(bounds.min)} — {price.max !== null ? fmt(price.max) : fmt(bounds.max)} ₽
              </span>
            )}
            <span className={`cat-filters__chevron ${openSection === 'price' ? 'is-open' : ''}`}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 6l6 6-6 6" /></svg>
            </span>
          </span>
        </button>
        {openSection === 'price' && (
          <div className="cat-filters__body cat-filters__price">
            <input
              type="text"
              inputMode="numeric"
              value={minInput}
              onChange={(e) => setMinInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && applyPrice()}
              placeholder={fmt(bounds.min)}
              aria-label="Цена от"
            />
            <span className="cat-filters__dash">—</span>
            <input
              type="text"
              inputMode="numeric"
              value={maxInput}
              onChange={(e) => setMaxInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && applyPrice()}
              placeholder={fmt(bounds.max)}
              aria-label="Цена до"
            />
            <button type="button" className="cat-filters__ok" onClick={applyPrice}>
              ОК
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
