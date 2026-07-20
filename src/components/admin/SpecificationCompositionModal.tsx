'use client';

import { useMemo, useState } from 'react';
import { AdminInventoryItem } from '@/types';
import { fmtMoney } from '@/lib/format';

interface Row {
  itemId: string;
  title: string;
  quantity: number;
  retailPrice: number;
}

interface Props {
  swvId: string;
  specTitle: string;
  variantTitle: string;
  initialRows: Row[];
  items: AdminInventoryItem[];
  stores: { id: string; attributes: { title: string } }[];
  onClose: () => void;
  onSaved: () => void;
}

// «Состав варианта рецепта» modal (admin-map §2.3.2): add/remove flowers or
// goods, edit quantities, see the retail price and line sum live, then
// PUT the whole row set to the backend (it recomputes item.max_price × qty
// itself — nothing priced here is trusted from the client).
export default function SpecificationCompositionModal({
  swvId, specTitle, variantTitle, initialRows, items, stores, onClose, onSaved,
}: Props) {
  const [rows, setRows] = useState<Row[]>(initialRows);
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = rows.reduce((sum, r) => sum + r.quantity * r.retailPrice, 0);

  const suggestions = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    const already = new Set(rows.map((r) => r.itemId));
    return items
      .filter((i) => !already.has(i.id))
      .filter((i) => {
        const a = i.attributes;
        return (
          a.title.toLowerCase().includes(needle)
          || (a.globalId || '').toLowerCase().includes(needle)
          || (a.barcode || '').toLowerCase().includes(needle)
        );
      })
      .slice(0, 20);
  }, [items, query, rows]);

  const addRow = (item: AdminInventoryItem) => {
    setRows((prev) => [
      ...prev,
      { itemId: item.id, title: item.attributes.title, quantity: 1, retailPrice: item.attributes.priceMax },
    ]);
    setQuery('');
  };

  const setQuantity = (itemId: string, quantity: number) => {
    setRows((prev) => prev.map((r) => (r.itemId === itemId ? { ...r, quantity } : r)));
  };

  const removeRow = (itemId: string) => {
    setRows((prev) => prev.filter((r) => r.itemId !== itemId));
  };

  const save = async () => {
    setError(null);
    if (rows.some((r) => !(r.quantity > 0))) {
      setError('Количество должно быть больше нуля для каждой позиции');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/admin/api/specification-variants/${swvId}/composition`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: rows.map((r) => ({ itemId: r.itemId, quantity: r.quantity })),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof json.detail === 'string' ? json.detail : 'Не удалось сохранить состав');
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Что-то пошло не так');
      setSaving(false);
    }
  };

  return (
    <div className="admin-modal-backdrop" role="dialog" aria-modal="true" aria-label="Состав варианта рецепта">
      <div className="admin-modal" style={{ width: 640 }}>
        <div className="admin-modal__head">
          <div>
            <p className="admin-modal__title">Состав варианта рецепта</p>
            <p className="admin-form-note" style={{ margin: 0 }}>{specTitle} — {variantTitle}</p>
          </div>
          <button type="button" className="admin-modal__close" onClick={onClose} aria-label="Закрыть">×</button>
        </div>

        <div className="admin-modal__body">
          {stores.length > 0 && (
            <div className="admin-field" style={{ maxWidth: 320 }}>
              <label htmlFor="composition-store">Показывать розничную цену по точке</label>
              <select
                id="composition-store"
                disabled
                title="Розничная цена в этом каталоге общая для всех точек"
                defaultValue=""
              >
                <option value="">Все точки</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>{s.attributes.title}</option>
                ))}
              </select>
            </div>
          )}

          {rows.length === 0 ? (
            <div className="admin-empty">В составе пока нет позиций.</div>
          ) : (
            <div className="admin-table-wrap" style={{ border: 'none', margin: '0 0 12px', width: 'auto' }}>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th style={{ width: 32 }}>№</th>
                    <th>Название</th>
                    <th style={{ width: 100 }}>Кол-во</th>
                    <th style={{ width: 110 }}>Розн. цена</th>
                    <th style={{ width: 110 }}>Сумма</th>
                    <th aria-label="Действия" style={{ width: 36 }} />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, idx) => (
                    <tr key={r.itemId}>
                      <td>{idx + 1}</td>
                      <td>{r.title}</td>
                      <td>
                        <input
                          type="number" min="0.001" step="any" value={r.quantity}
                          style={{ width: 72 }}
                          onChange={(e) => setQuantity(r.itemId, Number(e.target.value))}
                        />
                      </td>
                      <td>{fmtMoney(r.retailPrice)}</td>
                      <td>{fmtMoney(r.quantity * r.retailPrice)}</td>
                      <td>
                        <button
                          type="button"
                          className="admin-composition__delete"
                          onClick={() => removeRow(r.itemId)}
                          aria-label={`Удалить ${r.title}`}
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="admin-field" style={{ position: 'relative' }}>
            <label htmlFor="composition-search">Введите название товара, артикул, штрихкод</label>
            <input
              id="composition-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск по номенклатуре…"
            />
            {suggestions.length > 0 && (
              <ul className="admin-picker-list" style={{ marginTop: 8 }}>
                {suggestions.map((i) => (
                  <li key={i.id}>
                    <button type="button" className="admin-picker-row" onClick={() => addRow(i)}>
                      <span className="admin-picker-row__title">{i.attributes.title}</span>
                      <span className="admin-picker-row__price">
                        {i.attributes.priceMax > 0 ? fmtMoney(i.attributes.priceMax) : 'нет цены'}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="admin-form-actions" style={{ justifyContent: 'space-between', marginTop: 12 }}>
            <strong>Сумма состава {fmtMoney(total)}</strong>
            <button type="button" className="admin-btn admin-btn--primary" onClick={save} disabled={saving}>
              {saving ? 'Сохраняем…' : 'Сохранить'}
            </button>
          </div>
          {error && <div className="admin-form-error">{error}</div>}
        </div>
      </div>
    </div>
  );
}
