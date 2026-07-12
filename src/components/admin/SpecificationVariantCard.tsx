'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AdminInventoryItem, AdminSpecificationVariant, SimpleDictEntry } from '@/types';
import { fmtMoney } from '@/lib/format';
import SpecificationCompositionModal from './SpecificationCompositionModal';

interface CompositionRow {
  itemId: string;
  title: string;
  quantity: number;
  retailPrice: number;
}

interface StorePriceRow {
  storeId: string;
  storeTitle: string;
  priceValue: number | null;
  effectivePrice: number;
  isDefaultPrice: boolean;
}

interface Props {
  specId: string;
  specTitle: string;
  variant: AdminSpecificationVariant;
  variantTitle: string;
  compositionRows: CompositionRow[];
  compositionTotal: number;
  storePrices: StorePriceRow[];
  allStores: SimpleDictEntry[];
  items: AdminInventoryItem[];
  canDelete: boolean;
}

export default function SpecificationVariantCard({
  specId, specTitle, variant, variantTitle, compositionRows, compositionTotal,
  storePrices, allStores, items, canDelete,
}: Props) {
  const router = useRouter();
  const [title, setTitle] = useState(variantTitle);
  const [showModal, setShowModal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingStoreId, setEditingStoreId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [addStoreId, setAddStoreId] = useState('');

  const refresh = () => {
    setShowModal(false);
    setBusy(false);
    router.refresh();
  };

  const saveTitle = async () => {
    const trimmed = title.trim();
    if (!trimmed || trimmed === variantTitle) { setTitle(variantTitle); return; }
    const res = await fetch(`/admin/api/specification-variants/${variant.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: { attributes: { title: trimmed } } }),
    });
    if (res.ok) router.refresh();
    else setTitle(variantTitle);
  };

  const duplicate = async () => {
    setBusy(true);
    setError(null);
    const res = await fetch(`/admin/api/specifications/${specId}/variants`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ copyFrom: variant.id }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(typeof json.detail === 'string' ? json.detail : 'Не удалось дублировать вариант');
      setBusy(false);
      return;
    }
    refresh();
  };

  const remove = async () => {
    setBusy(true);
    setError(null);
    const res = await fetch(`/admin/api/specification-variants/${variant.id}`, { method: 'DELETE' });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(typeof json.detail === 'string' ? json.detail : 'Не удалось удалить вариант');
      setBusy(false);
      return;
    }
    refresh();
  };

  const putStorePrices = async (rows: { storeId: string; priceValue: number | null }[]) => {
    setBusy(true);
    setError(null);
    const res = await fetch(`/admin/api/specification-variants/${variant.id}/store-prices`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: rows }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(typeof json.detail === 'string' ? json.detail : 'Не удалось сохранить цены на точках');
      setBusy(false);
      return;
    }
    refresh();
  };

  const currentRows = () => storePrices.map((p) => ({ storeId: p.storeId, priceValue: p.priceValue }));

  const addStore = () => {
    if (!addStoreId) return;
    putStorePrices([...currentRows(), { storeId: addStoreId, priceValue: null }]);
    setAddStoreId('');
  };

  const removeStore = (storeId: string) => {
    putStorePrices(currentRows().filter((r) => r.storeId !== storeId));
  };

  const startEditPrice = (row: StorePriceRow) => {
    setEditingStoreId(row.storeId);
    setEditingValue(row.priceValue != null ? String(row.priceValue) : '');
  };

  const commitEditPrice = (storeId: string) => {
    const trimmed = editingValue.trim();
    const priceValue = trimmed === '' ? null : Number(trimmed);
    if (priceValue !== null && (!Number.isFinite(priceValue) || priceValue < 0)) {
      setError('Цена должна быть числом ≥ 0');
      setEditingStoreId(null);
      return;
    }
    setEditingStoreId(null);
    putStorePrices(currentRows().map((r) => (r.storeId === storeId ? { ...r, priceValue } : r)));
  };

  const availableStores = allStores.filter((s) => !storePrices.some((p) => p.storeId === s.id));
  const initialCompositionRows: CompositionRow[] = compositionRows.map((r) => ({ ...r }));

  return (
    <section className="admin-panel admin-recipe-variant">
      <div className="admin-recipe-variant__head">
        <input
          className="admin-recipe-variant__title-input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={saveTitle}
          aria-label="Название варианта"
        />
        <div className="admin-form-actions" style={{ padding: 0 }}>
          <button type="button" className="admin-btn" disabled title="Скоро">+ Добавить тег</button>
          <button type="button" className="admin-btn" onClick={duplicate} disabled={busy}>Дублировать</button>
          <button
            type="button"
            className="admin-btn admin-btn--danger"
            onClick={remove}
            disabled={busy || !canDelete}
            title={canDelete ? undefined : 'Нельзя удалить последний вариант рецепта'}
          >
            Удалить
          </button>
        </div>
      </div>

      <div className="admin-recipe-variant__body">
        <p className="admin-panel__title" style={{ padding: '12px 16px 0' }}>Состав</p>
        <div style={{ padding: '4px 16px 12px' }}>
          {compositionRows.length === 0 ? (
            <p className="admin-form-note">Состав не задан.</p>
          ) : (
            compositionRows.map((r) => (
              <div key={r.itemId} className="admin-recipe-variant__comp-row">
                {r.title} — {r.quantity}
              </div>
            ))
          )}
          <div className="admin-form-actions" style={{ padding: '10px 0 0', justifyContent: 'flex-start' }}>
            <button type="button" className="admin-btn admin-btn--outline-blue" onClick={() => setShowModal(true)}>
              Редактировать состав
            </button>
            <span className="admin-form-note">Сумма состава {fmtMoney(compositionTotal)}</span>
          </div>
        </div>

        <p className="admin-panel__title" style={{ padding: '0 16px' }}>Активность на точках</p>
        <div style={{ padding: '4px 16px 16px' }}>
          {storePrices.length === 0 ? (
            <p className="admin-form-note">Вариант пока не активирован ни на одной точке.</p>
          ) : (
            <div className="admin-store-price-grid">
              {storePrices.map((row) => (
                <div key={row.storeId} className="admin-store-price-card">
                  <div className="admin-store-price-card__title">{row.storeTitle}</div>
                  <div className="admin-store-price-card__composition">Цена состава {fmtMoney(compositionTotal)}</div>
                  <div className="admin-store-price-card__sale">
                    {editingStoreId === row.storeId ? (
                      <input
                        type="number" min="0" step="1" autoFocus
                        value={editingValue}
                        onChange={(e) => setEditingValue(e.target.value)}
                        onBlur={() => commitEditPrice(row.storeId)}
                        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                      />
                    ) : (
                      <button type="button" className="admin-store-price-card__price" onClick={() => startEditPrice(row)}>
                        {fmtMoney(row.effectivePrice)}
                      </button>
                    )}
                    <span className="admin-store-price-card__label">
                      {row.isDefaultPrice ? 'По цене состава' : 'Своя цена'}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="admin-composition__delete"
                    onClick={() => removeStore(row.storeId)}
                    aria-label={`Снять с точки ${row.storeTitle}`}
                    title="Снять с точки"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          {availableStores.length > 0 && (
            <div className="admin-form-actions" style={{ padding: '12px 0 0', justifyContent: 'flex-start' }}>
              <select value={addStoreId} onChange={(e) => setAddStoreId(e.target.value)} style={{ maxWidth: 220 }}>
                <option value="">Выберите точку…</option>
                {availableStores.map((s) => (
                  <option key={s.id} value={s.id}>{s.attributes.title}</option>
                ))}
              </select>
              <button type="button" className="admin-btn admin-btn--primary" onClick={addStore} disabled={!addStoreId || busy}>
                + Добавить на точку
              </button>
            </div>
          )}
        </div>

        {error && <div className="admin-form-error" style={{ margin: '0 16px 16px' }}>{error}</div>}
      </div>

      {showModal && (
        <SpecificationCompositionModal
          swvId={variant.id}
          specTitle={specTitle}
          variantTitle={variantTitle}
          initialRows={initialCompositionRows}
          items={items}
          stores={allStores.map((s) => ({ id: s.id, attributes: { title: s.attributes.title } }))}
          onClose={() => setShowModal(false)}
          onSaved={refresh}
        />
      )}
    </section>
  );
}
