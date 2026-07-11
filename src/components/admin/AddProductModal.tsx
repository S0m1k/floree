'use client';

import { useMemo, useState } from 'react';
import { AdminInventoryItem, AdminShowcaseBouquet } from '@/types';
import { fmtMoney } from '@/lib/format';

interface Props {
  orderId: string;
  bouquets: AdminShowcaseBouquet[];
  items: AdminInventoryItem[];
  onClose: () => void;
  onAdded: () => void;
}

type PickerTab = 'bouquet' | 'item';

// «Добавить продукт» — modal with two sources (admin-map §2.2.1): a showcase
// bouquet of the order's store, or a nomenclature item with a quantity. Only
// ids (+ quantity) are sent — prices are resolved by the backend from its own
// catalog, never from this client.
export default function AddProductModal({ orderId, bouquets, items, onClose, onAdded }: Props) {
  const [tab, setTab] = useState<PickerTab>('bouquet');
  const [query, setQuery] = useState('');
  const [selectedItemId, setSelectedItemId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filteredItems = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const base = needle
      ? items.filter((i) => i.attributes.title.toLowerCase().includes(needle))
      : items;
    return base.slice(0, 50);
  }, [items, query]);

  const post = async (body: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/admin/api/orders/${orderId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof json.detail === 'string' ? json.detail : 'Не удалось добавить позицию');
      }
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Что-то пошло не так');
      setBusy(false);
    }
  };

  const addItem = () => {
    if (!selectedItemId) { setError('Выберите товар'); return; }
    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty <= 0) { setError('Количество должно быть больше нуля'); return; }
    post({ inventoryItemId: selectedItemId, quantity: qty });
  };

  return (
    <div className="admin-modal-backdrop" role="dialog" aria-modal="true" aria-label="Добавить продукт">
      <div className="admin-modal">
        <div className="admin-modal__head">
          <p className="admin-modal__title">Добавить продукт</p>
          <button type="button" className="admin-modal__close" onClick={onClose} aria-label="Закрыть">×</button>
        </div>

        <div className="admin-chips" style={{ padding: '0 16px 12px' }}>
          {([['bouquet', 'Букет с витрины'], ['item', 'Товар']] as [PickerTab, string][]).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={`admin-chip ${tab === value ? 'admin-chip--active' : ''}`}
              onClick={() => { setTab(value); setError(null); }}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 'bouquet' ? (
          <div className="admin-modal__body">
            {bouquets.length === 0 ? (
              <div className="admin-empty">На витрине точки нет доступных букетов.</div>
            ) : (
              <ul className="admin-picker-list">
                {bouquets.map((b) => (
                  <li key={b.id}>
                    <button
                      type="button"
                      className="admin-picker-row"
                      disabled={busy}
                      onClick={() => post({ bouquetId: b.id })}
                    >
                      <span className="admin-picker-row__title">Букет - {b.attributes.title}</span>
                      <span className="admin-picker-row__price">{fmtMoney(b.attributes.saleAmount)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <div className="admin-modal__body">
            <div className="admin-field">
              <label htmlFor="item-search">Поиск по номенклатуре</label>
              <input
                id="item-search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Название товара"
              />
            </div>
            <ul className="admin-picker-list">
              {filteredItems.map((i) => (
                <li key={i.id}>
                  <button
                    type="button"
                    className={`admin-picker-row ${selectedItemId === i.id ? 'admin-picker-row--selected' : ''}`}
                    onClick={() => setSelectedItemId(i.id)}
                  >
                    <span className="admin-picker-row__title">{i.attributes.title}</span>
                    <span className="admin-picker-row__price">
                      {i.attributes.priceMax > 0 ? fmtMoney(i.attributes.priceMax) : 'нет цены'}
                    </span>
                  </button>
                </li>
              ))}
              {filteredItems.length === 0 && (
                <li className="admin-empty" style={{ padding: '24px 8px' }}>Ничего не найдено.</li>
              )}
            </ul>
            <div className="admin-field" style={{ maxWidth: 160 }}>
              <label htmlFor="item-qty">Количество</label>
              <input
                id="item-qty"
                type="number"
                min="0.001"
                step="any"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </div>
            <div className="admin-form-actions" style={{ marginTop: 8 }}>
              <button type="button" className="admin-btn admin-btn--primary" onClick={addItem} disabled={busy}>
                {busy ? 'Добавляем…' : 'Добавить товар'}
              </button>
            </div>
          </div>
        )}

        {error && <div className="admin-form-error" style={{ margin: '0 16px 16px' }}>{error}</div>}
      </div>
    </div>
  );
}
