'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AdminWarehouseDocType, AdminInventoryItem, AdminVendor, SimpleDictEntry,
} from '@/types';
import { getDocConfig } from '@/lib/warehouseDocsConfig';
import { fmtMoney } from '@/lib/format';

const REASON_MAX = 255;

interface ItemRow {
  itemId: string;
  title: string;
  quantity: string;
  price?: string;      // packing-invoices only — the supplier's incoming price
  newPrice?: string;   // markdown-acts only
}

interface SortingRow {
  itemFromId: string;
  fromTitle: string;
  itemToId: string;
  toTitle: string;
  quantity: string;
}

// Per-type quantity label + optional second numeric field for the single-item
// doc types (everything except sorting-acts, which swaps one item for
// another and gets its own two-picker row builder below).
const LINE_CONFIG: Record<
  string,
  { qtyLabel: string; extraField?: { key: 'price' | 'newPrice'; label: string }; quantityKey: 'quantity' | 'actualQty' }
> = {
  'packing-invoices': { qtyLabel: 'Кол-во', extraField: { key: 'price', label: 'Цена закупки' }, quantityKey: 'quantity' },
  'write-off-invoices': { qtyLabel: 'Кол-во', quantityKey: 'quantity' },
  'markdown-acts': { qtyLabel: 'Кол-во', extraField: { key: 'newPrice', label: 'Новая цена' }, quantityKey: 'quantity' },
  'inventory-acts': { qtyLabel: 'Фактическое кол-во', quantityKey: 'actualQty' },
  'movement-acts': { qtyLabel: 'Кол-во', quantityKey: 'quantity' },
};

function todayIso(): string {
  return new Date().toISOString().split('T')[0];
}

function itemLabel(i: AdminInventoryItem): string {
  return i.attributes.title;
}

interface ItemSearchProps {
  items: AdminInventoryItem[];
  excludeIds: Set<string>;
  placeholder: string;
  onPick: (item: AdminInventoryItem) => void;
}

function ItemSearch({ items, excludeIds, placeholder, onPick }: ItemSearchProps) {
  const [query, setQuery] = useState('');
  const suggestions = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    return items
      .filter((i) => !excludeIds.has(i.id))
      .filter((i) => {
        const a = i.attributes;
        return (
          a.title.toLowerCase().includes(needle)
          || (a.globalId || '').toLowerCase().includes(needle)
          || (a.barcode || '').toLowerCase().includes(needle)
        );
      })
      .slice(0, 20);
  }, [items, query, excludeIds]);

  return (
    <div className="admin-field" style={{ position: 'relative' }}>
      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={placeholder} />
      {suggestions.length > 0 && (
        <ul className="admin-picker-list" style={{ marginTop: 8 }}>
          {suggestions.map((i) => (
            <li key={i.id}>
              <button
                type="button"
                className="admin-picker-row"
                onClick={() => { onPick(i); setQuery(''); }}
              >
                <span className="admin-picker-row__title">{itemLabel(i)}</span>
                <span className="admin-picker-row__price">
                  {i.attributes.priceMax > 0 ? fmtMoney(i.attributes.priceMax) : 'нет цены'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface Props {
  docType: AdminWarehouseDocType;
  stores: SimpleDictEntry[];
  vendors: AdminVendor[];
  items: AdminInventoryItem[];
}

export default function WarehouseDocCreateForm({ docType, stores, vendors, items }: Props) {
  const router = useRouter();
  const cfg = getDocConfig(docType);
  const isMovement = docType === 'movement-acts';
  const isSorting = docType === 'sorting-acts';
  const isPacking = docType === 'packing-invoices';
  const isWriteoff = docType === 'write-off-invoices';

  const [date, setDate] = useState(todayIso());
  const [storeId, setStoreId] = useState(stores.length === 1 ? stores[0].id : '');
  const [fromStoreId, setFromStoreId] = useState('');
  const [toStoreId, setToStoreId] = useState('');
  const [vendorId, setVendorId] = useState('');
  const [reason, setReason] = useState('');

  const [rows, setRows] = useState<ItemRow[]>([]);
  const [sortingRows, setSortingRows] = useState<SortingRow[]>([]);
  const [pendingFrom, setPendingFrom] = useState<AdminInventoryItem | null>(null);
  const [pendingTo, setPendingTo] = useState<AdminInventoryItem | null>(null);
  const [pendingQty, setPendingQty] = useState('1');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lineConfig = LINE_CONFIG[docType];

  const addItemRow = (item: AdminInventoryItem) => {
    setRows((prev) => [...prev, { itemId: item.id, title: itemLabel(item), quantity: '1' }]);
  };
  const updateRow = (itemId: string, patch: Partial<ItemRow>) => {
    setRows((prev) => prev.map((r) => (r.itemId === itemId ? { ...r, ...patch } : r)));
  };
  const removeRow = (itemId: string) => {
    setRows((prev) => prev.filter((r) => r.itemId !== itemId));
  };

  const addSortingRow = () => {
    if (!pendingFrom || !pendingTo) return;
    const qty = Number(pendingQty);
    if (!(qty > 0)) { setError('Количество должно быть больше нуля'); return; }
    if (pendingFrom.id === pendingTo.id) { setError('Позиции «Из» и «В» должны различаться'); return; }
    setSortingRows((prev) => [
      ...prev,
      { itemFromId: pendingFrom.id, fromTitle: itemLabel(pendingFrom), itemToId: pendingTo.id, toTitle: itemLabel(pendingTo), quantity: pendingQty },
    ]);
    setPendingFrom(null);
    setPendingTo(null);
    setPendingQty('1');
    setError(null);
  };
  const removeSortingRow = (idx: number) => {
    setSortingRows((prev) => prev.filter((_, i) => i !== idx));
  };

  const cancelHref = `/admin/${cfg.route}`;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (isMovement) {
      if (!fromStoreId || !toStoreId) { setError('Выберите склад-источник и склад-получатель'); return; }
      if (fromStoreId === toStoreId) { setError('Склад-источник и склад-получатель должны различаться'); return; }
    } else if (!storeId) {
      setError('Выберите точку продаж');
      return;
    }
    if (isPacking && !vendorId) { setError('Выберите поставщика'); return; }
    if (isWriteoff && reason.length > REASON_MAX) { setError(`Причина не длиннее ${REASON_MAX} символов`); return; }

    let lines: Record<string, unknown>[];
    if (isSorting) {
      if (sortingRows.length === 0) { setError('Добавьте хотя бы одну позицию'); return; }
      lines = sortingRows.map((r) => ({ itemFromId: r.itemFromId, itemToId: r.itemToId, quantity: Number(r.quantity) }));
    } else {
      if (rows.length === 0) { setError('Добавьте хотя бы одну позицию'); return; }
      // Every doc type needs a positive quantity except inventory-acts, where
      // 0 is a legitimate actual count (item fully missing on recount).
      const isInventory = docType === 'inventory-acts';
      for (const r of rows) {
        const qty = Number(r.quantity);
        const valid = isInventory ? qty >= 0 : qty > 0;
        if (Number.isNaN(qty) || !valid) { setError(`Некорректное количество для «${r.title}»`); return; }
        if (lineConfig?.extraField) {
          const raw = r[lineConfig.extraField.key];
          const val = Number(raw);
          if (raw === undefined || raw === '' || Number.isNaN(val) || val < 0) {
            setError(`Укажите «${lineConfig.extraField.label}» для «${r.title}»`);
            return;
          }
        }
      }
      lines = rows.map((r) => {
        const line: Record<string, unknown> = { itemId: r.itemId, [lineConfig!.quantityKey]: Number(r.quantity) };
        if (lineConfig?.extraField) line[lineConfig.extraField.key] = Number(r[lineConfig.extraField.key]);
        return line;
      });
    }

    const attributes: Record<string, unknown> = { date };
    if (isWriteoff && reason.trim()) attributes.reason = reason.trim();

    const relationships: Record<string, unknown> = {};
    if (isMovement) {
      relationships.fromStore = { data: { type: 'stores', id: fromStoreId } };
      relationships.toStore = { data: { type: 'stores', id: toStoreId } };
    } else {
      relationships.store = { data: { type: 'stores', id: storeId } };
    }
    if (isPacking) relationships.vendor = { data: { type: 'vendors', id: vendorId } };

    setSubmitting(true);
    try {
      const res = await fetch(`/admin/api/warehouse-docs/${cfg.apiPath}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: { type: docType, attributes, relationships }, lines }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof json.detail === 'string' ? json.detail : 'Не удалось создать документ');
      }
      const id = json?.data?.id;
      if (!id) throw new Error('Сервер не вернул созданный документ');
      router.push(`/admin/${cfg.route}/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Что-то пошло не так');
      setSubmitting(false);
    }
  };

  const excludeIds = useMemo(() => new Set(rows.map((r) => r.itemId)), [rows]);

  return (
    <form onSubmit={handleSubmit} className="admin-order-form">
      <section className="admin-panel">
        <p className="admin-panel__title">{isMovement ? 'Склады' : 'Точка продаж'}</p>
        <div className="admin-field-grid">
          {isMovement ? (
            <>
              <div className="admin-field">
                <label htmlFor="fromStore">Откуда *</label>
                <select id="fromStore" value={fromStoreId} onChange={(e) => setFromStoreId(e.target.value)} required>
                  <option value="">Выберите точку</option>
                  {stores.map((s) => <option key={s.id} value={s.id}>{s.attributes.title}</option>)}
                </select>
              </div>
              <div className="admin-field">
                <label htmlFor="toStore">Куда *</label>
                <select id="toStore" value={toStoreId} onChange={(e) => setToStoreId(e.target.value)} required>
                  <option value="">Выберите точку</option>
                  {stores.map((s) => <option key={s.id} value={s.id}>{s.attributes.title}</option>)}
                </select>
              </div>
            </>
          ) : (
            <div className="admin-field">
              <label htmlFor="store">Точка продаж *</label>
              <select id="store" value={storeId} onChange={(e) => setStoreId(e.target.value)} required>
                <option value="">Выберите точку продаж</option>
                {stores.map((s) => <option key={s.id} value={s.id}>{s.attributes.title}</option>)}
              </select>
            </div>
          )}
          <div className="admin-field">
            <label htmlFor="date">Дата *</label>
            <input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
          {isPacking && (
            <div className="admin-field">
              <label htmlFor="vendor">Поставщик *</label>
              <select id="vendor" value={vendorId} onChange={(e) => setVendorId(e.target.value)} required>
                <option value="">Выберите поставщика</option>
                {vendors.map((v) => <option key={v.id} value={v.id}>{v.attributes.title}</option>)}
              </select>
            </div>
          )}
          {isWriteoff && (
            <div className="admin-field">
              <label htmlFor="reason">Причина списания</label>
              <input
                id="reason" value={reason} maxLength={REASON_MAX}
                onChange={(e) => setReason(e.target.value)} placeholder="Порча, брак…"
              />
            </div>
          )}
        </div>
      </section>

      <section className="admin-panel">
        <p className="admin-panel__title">Позиции</p>

        {isSorting ? (
          <>
            {sortingRows.length > 0 && (
              <div className="admin-table-wrap" style={{ border: 'none', margin: '0 0 12px', width: 'auto' }}>
                <table className="admin-table">
                  <thead>
                    <tr><th>Из</th><th>В</th><th style={{ width: 100 }}>Кол-во</th><th aria-label="Действия" style={{ width: 36 }} /></tr>
                  </thead>
                  <tbody>
                    {sortingRows.map((r, idx) => (
                      <tr key={`${r.itemFromId}-${r.itemToId}-${idx}`}>
                        <td>{r.fromTitle}</td>
                        <td>{r.toTitle}</td>
                        <td>{r.quantity}</td>
                        <td>
                          <button type="button" className="admin-composition__delete" onClick={() => removeSortingRow(idx)} aria-label="Удалить">×</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="admin-field-grid">
              <div className="admin-field">
                <label>Из</label>
                {pendingFrom ? (
                  <div className="admin-form-hint">{itemLabel(pendingFrom)} <button type="button" onClick={() => setPendingFrom(null)}>×</button></div>
                ) : (
                  <ItemSearch items={items} excludeIds={new Set()} placeholder="Поиск позиции «Из»…" onPick={setPendingFrom} />
                )}
              </div>
              <div className="admin-field">
                <label>В</label>
                {pendingTo ? (
                  <div className="admin-form-hint">{itemLabel(pendingTo)} <button type="button" onClick={() => setPendingTo(null)}>×</button></div>
                ) : (
                  <ItemSearch items={items} excludeIds={new Set()} placeholder="Поиск позиции «В»…" onPick={setPendingTo} />
                )}
              </div>
              <div className="admin-field">
                <label htmlFor="pendingQty">Кол-во</label>
                <input id="pendingQty" type="number" min="0.001" step="any" value={pendingQty} onChange={(e) => setPendingQty(e.target.value)} style={{ width: 100 }} />
              </div>
            </div>
            <button type="button" className="admin-btn" onClick={addSortingRow} disabled={!pendingFrom || !pendingTo}>
              + Добавить позицию
            </button>
          </>
        ) : (
          <>
            {rows.length === 0 ? (
              <div className="admin-empty">Позиции пока не добавлены.</div>
            ) : (
              <div className="admin-table-wrap" style={{ border: 'none', margin: '0 0 12px', width: 'auto' }}>
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Название</th>
                      <th style={{ width: 110 }}>{lineConfig?.qtyLabel}</th>
                      {lineConfig?.extraField && <th style={{ width: 130 }}>{lineConfig.extraField.label}</th>}
                      <th aria-label="Действия" style={{ width: 36 }} />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.itemId}>
                        <td>{r.title}</td>
                        <td>
                          <input
                            type="number" min={docType === 'inventory-acts' ? '0' : '0.001'} step="any"
                            value={r.quantity} style={{ width: 90 }}
                            onChange={(e) => updateRow(r.itemId, { quantity: e.target.value })}
                          />
                        </td>
                        {lineConfig?.extraField && (
                          <td>
                            <input
                              type="number" min="0" step="any"
                              value={(r[lineConfig.extraField.key] as string) ?? ''}
                              style={{ width: 110 }}
                              onChange={(e) => updateRow(r.itemId, { [lineConfig.extraField!.key]: e.target.value } as Partial<ItemRow>)}
                            />
                          </td>
                        )}
                        <td>
                          <button type="button" className="admin-composition__delete" onClick={() => removeRow(r.itemId)} aria-label={`Удалить ${r.title}`}>×</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <ItemSearch items={items} excludeIds={excludeIds} placeholder="Поиск по номенклатуре…" onPick={addItemRow} />
          </>
        )}
      </section>

      {error && <div className="admin-form-error">{error}</div>}

      <div className="admin-form-actions">
        <button type="button" className="admin-btn" onClick={() => router.push(cancelHref)} disabled={submitting}>
          Отмена
        </button>
        <button type="submit" className="admin-btn admin-btn--primary" disabled={submitting}>
          {submitting ? 'Создаём…' : cfg.createLabel}
        </button>
      </div>
    </form>
  );
}
