'use client';

import { useState } from 'react';
import { AdminBonusCard } from '@/types';

const TITLE_MAX = 100;
const SHOP_MAX = 100;

interface Props {
  card?: AdminBonusCard; // present -> edit, absent -> create
  onClose: () => void;
  onSaved: () => void;
}

// «Создать» / edit modal for a bonus-card (Wallet) template (admin-map
// §2.5.6): title, магазин, статус. Логотип загружается позже — нет пайплайна
// загрузки файлов (та же оговорка, что и у SpecificationImages).
export default function BonusCardFormModal({ card, onClose, onSaved }: Props) {
  const isEdit = Boolean(card);
  const [title, setTitle] = useState(card?.attributes.title || '');
  const [shopName, setShopName] = useState(card?.attributes.shopName || '');
  const [status, setStatus] = useState<'active' | 'archived'>(card?.attributes.status || 'active');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!title.trim()) { setError('Укажите название карты'); return; }

    const attributes = {
      title: title.trim(),
      shopName: shopName.trim() || null,
      status,
    };

    setSaving(true);
    try {
      const url = isEdit ? `/admin/api/bonus-cards/${card!.id}` : '/admin/api/bonus-cards';
      const res = await fetch(url, {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: { type: 'bonus-cards', attributes } }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof json.detail === 'string' ? json.detail : 'Не удалось сохранить карту');
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Что-то пошло не так');
      setSaving(false);
    }
  };

  return (
    <div className="admin-modal-backdrop" role="dialog" aria-modal="true" aria-label={isEdit ? 'Редактировать бонусную карту' : 'Создать бонусную карту'}>
      <div className="admin-modal" style={{ width: 480 }}>
        <div className="admin-modal__head">
          <p className="admin-modal__title">{isEdit ? 'Редактировать бонусную карту' : 'Создать бонусную карту'}</p>
          <button type="button" className="admin-modal__close" onClick={onClose} aria-label="Закрыть">×</button>
        </div>

        <form onSubmit={save}>
          <div className="admin-modal__body">
            <div className="admin-field">
              <label htmlFor="bc-title">Название карты *</label>
              <input
                id="bc-title" value={title} maxLength={TITLE_MAX}
                onChange={(e) => setTitle(e.target.value)} required autoFocus
              />
            </div>
            <div className="admin-field">
              <label htmlFor="bc-shop">Название магазина</label>
              <input
                id="bc-shop" value={shopName} maxLength={SHOP_MAX}
                onChange={(e) => setShopName(e.target.value)}
              />
            </div>
            <div className="admin-field">
              <label htmlFor="bc-status">Статус</label>
              <select id="bc-status" value={status} onChange={(e) => setStatus(e.target.value as 'active' | 'archived')}>
                <option value="active">Активно</option>
                <option value="archived">Архив</option>
              </select>
            </div>
            {error && <div className="admin-form-error">{error}</div>}
          </div>
          <div className="admin-form-actions" style={{ padding: '0 20px 20px' }}>
            <button type="button" className="admin-btn" onClick={onClose} disabled={saving}>Отмена</button>
            <button type="submit" className="admin-btn admin-btn--primary" disabled={saving}>
              {saving ? 'Сохраняем…' : isEdit ? 'Сохранить' : 'Создать'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
