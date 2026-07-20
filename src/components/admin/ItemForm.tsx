'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AdminCategory, AdminInventoryItem, AdminMeasure } from '@/types';

const TITLE_MAX = 255;
const BARCODE_MAX = 64;

interface Props {
  item?: AdminInventoryItem; // present -> edit, absent -> create
  categories: AdminCategory[];
  measures: AdminMeasure[];
}

// «Создать продукт» / edit card (admin-map §2.3.4). Same fields either way —
// only the HTTP verb + target + redirect differ.
export default function ItemForm({ item, categories, measures }: Props) {
  const router = useRouter();
  const isEdit = Boolean(item);
  const a = item?.attributes;

  const [title, setTitle] = useState(a?.title || '');
  const [itemType, setItemType] = useState<'item' | 'service'>(a?.itemType || 'item');
  const [categoryId, setCategoryId] = useState(item?.relationships.category?.data?.id || '');
  const [measureId, setMeasureId] = useState(item?.relationships.measure?.data?.id || '');
  const [priceMin, setPriceMin] = useState(String(a?.priceMin ?? 0));
  const [priceMax, setPriceMax] = useState(String(a?.priceMax ?? 0));
  const [barcode, setBarcode] = useState(a?.barcode || '');
  const [isPublic, setIsPublic] = useState(a?.public ?? false);
  const [status, setStatus] = useState<'on' | 'off'>(a?.status === 'off' ? 'off' : 'on');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!title.trim()) { setError('Укажите название товара'); return; }
    const min = Number(priceMin);
    const max = Number(priceMax);
    if (Number.isNaN(min) || Number.isNaN(max) || min < 0 || max < 0) {
      setError('Цены должны быть числами не меньше нуля');
      return;
    }
    if (max < min) { setError('Максимальная цена не может быть меньше минимальной'); return; }

    const attributes: Record<string, unknown> = {
      title: title.trim(),
      itemType,
      priceMin: min,
      priceMax: max,
      public: isPublic,
      status,
      barcode: barcode.trim() || null,
    };
    const relationships: Record<string, unknown> = {
      category: { data: categoryId ? { type: 'categories', id: categoryId } : null },
      measure: { data: measureId ? { type: 'measures', id: measureId } : null },
    };

    setSaving(true);
    try {
      const url = isEdit ? `/admin/api/inventory-items/${item!.id}` : '/admin/api/inventory-items';
      const res = await fetch(url, {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: { type: 'inventory-items', attributes, relationships } }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof json.detail === 'string' ? json.detail : 'Не удалось сохранить товар');
      }
      const id = json?.data?.id || item?.id;
      if (!id) throw new Error('Сервер не вернул сохранённый товар');
      router.push(`/admin/catalog/${id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Что-то пошло не так');
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} className="admin-order-form">
      <section className="admin-panel">
        <p className="admin-panel__title">Основное</p>
        <div className="admin-field-grid">
          <div className="admin-field">
            <label htmlFor="item-title">Название *</label>
            <input
              id="item-title" value={title} maxLength={TITLE_MAX}
              onChange={(e) => setTitle(e.target.value)} required autoFocus
            />
          </div>
          <div className="admin-field">
            <label htmlFor="item-type">Тип</label>
            <select id="item-type" value={itemType} onChange={(e) => setItemType(e.target.value as 'item' | 'service')}>
              <option value="item">Товар</option>
              <option value="service">Услуга</option>
            </select>
          </div>
          <div className="admin-field">
            <label htmlFor="item-category">Категория</label>
            <select id="item-category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">Без категории</option>
              {categories.filter((c) => !c.attributes.deleted).map((c) => (
                <option key={c.id} value={c.id}>{c.attributes.title}</option>
              ))}
            </select>
          </div>
          <div className="admin-field">
            <label htmlFor="item-measure">Единица измерения</label>
            <select id="item-measure" value={measureId} onChange={(e) => setMeasureId(e.target.value)}>
              <option value="">Не указана</option>
              {measures.filter((m) => !m.attributes.deleted).map((m) => (
                <option key={m.id} value={m.id}>{m.attributes.title}</option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section className="admin-panel">
        <p className="admin-panel__title">Цены и штрихкод</p>
        <div className="admin-field-grid">
          <div className="admin-field">
            <label htmlFor="item-price-min">Мин. цена</label>
            <input id="item-price-min" type="number" min="0" step="1" value={priceMin} onChange={(e) => setPriceMin(e.target.value)} />
          </div>
          <div className="admin-field">
            <label htmlFor="item-price-max">Макс. цена</label>
            <input id="item-price-max" type="number" min="0" step="1" value={priceMax} onChange={(e) => setPriceMax(e.target.value)} />
          </div>
          <div className="admin-field">
            <label htmlFor="item-barcode">Штрихкод</label>
            <input
              id="item-barcode" value={barcode} maxLength={BARCODE_MAX}
              onChange={(e) => setBarcode(e.target.value)} placeholder="Оставьте пустым — сгенерируется позже"
            />
          </div>
        </div>
      </section>

      <section className="admin-panel">
        <p className="admin-panel__title">Активность</p>
        <div className="admin-field-grid">
          <div className="admin-field">
            <label htmlFor="item-status">Активность</label>
            <select id="item-status" value={status} onChange={(e) => setStatus(e.target.value as 'on' | 'off')}>
              <option value="on">Активен</option>
              <option value="off">Неактивен</option>
            </select>
          </div>
          <label className="admin-field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />
            <span>Добавлен в интернет-магазин</span>
          </label>
        </div>
      </section>

      {error && <div className="admin-form-error">{error}</div>}

      <div className="admin-form-actions">
        <button
          type="button" className="admin-btn"
          onClick={() => router.push(isEdit ? `/admin/catalog/${item!.id}` : '/admin/catalog')}
          disabled={saving}
        >
          Отмена
        </button>
        <button type="submit" className="admin-btn admin-btn--primary" disabled={saving}>
          {saving ? 'Сохраняем…' : isEdit ? 'Сохранить' : 'Создать'}
        </button>
      </div>
    </form>
  );
}
