'use client';

import { useState } from 'react';
import { AdminDiscountGroup } from '@/types';

const TITLE_MAX = 100;

interface Props {
  group?: AdminDiscountGroup; // present -> edit, absent -> create
  onClose: () => void;
  onSaved: () => void;
}

// «Создать» / edit modal for a discount group (admin-map §2.5.5): title,
// скидка %, порог входа, публичная группа, статус.
export default function DiscountGroupFormModal({ group, onClose, onSaved }: Props) {
  const isEdit = Boolean(group);
  const [title, setTitle] = useState(group?.attributes.title || '');
  const [discountPercent, setDiscountPercent] = useState(String(group?.attributes.discountPercent ?? 0));
  const [entryThreshold, setEntryThreshold] = useState(String(group?.attributes.entryThreshold ?? 0));
  const [isPublic, setIsPublic] = useState(group?.attributes.isPublic ?? true);
  const [status, setStatus] = useState<'active' | 'archived'>(group?.attributes.status || 'active');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!title.trim()) { setError('Укажите название группы'); return; }

    const discount = Number(discountPercent);
    const threshold = Number(entryThreshold);
    if (!Number.isInteger(discount) || discount < 0 || discount > 100) {
      setError('Скидка — целое число от 0 до 100'); return;
    }
    if (!Number.isInteger(threshold) || threshold < 0) {
      setError('Порог входа не может быть отрицательным'); return;
    }

    const attributes = {
      title: title.trim(),
      discountPercent: discount,
      entryThreshold: threshold,
      isPublic,
      status,
    };

    setSaving(true);
    try {
      const url = isEdit ? `/admin/api/discount-groups/${group!.id}` : '/admin/api/discount-groups';
      const res = await fetch(url, {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: { type: 'discount-groups', attributes } }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof json.detail === 'string' ? json.detail : 'Не удалось сохранить группу');
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Что-то пошло не так');
      setSaving(false);
    }
  };

  return (
    <div className="admin-modal-backdrop" role="dialog" aria-modal="true" aria-label={isEdit ? 'Редактировать скидочную группу' : 'Создать скидочную группу'}>
      <div className="admin-modal" style={{ width: 480 }}>
        <div className="admin-modal__head">
          <p className="admin-modal__title">{isEdit ? 'Редактировать скидочную группу' : 'Создать скидочную группу'}</p>
          <button type="button" className="admin-modal__close" onClick={onClose} aria-label="Закрыть">×</button>
        </div>

        <form onSubmit={save}>
          <div className="admin-modal__body">
            <div className="admin-field">
              <label htmlFor="dg-title">Название группы *</label>
              <input
                id="dg-title" value={title} maxLength={TITLE_MAX}
                onChange={(e) => setTitle(e.target.value)} required autoFocus
              />
            </div>
            <div className="admin-field-grid">
              <div className="admin-field">
                <label htmlFor="dg-percent">Скидка, %</label>
                <input
                  id="dg-percent" type="number" min={0} max={100} value={discountPercent}
                  onChange={(e) => setDiscountPercent(e.target.value)}
                />
              </div>
              <div className="admin-field">
                <label htmlFor="dg-threshold">Порог входа, ₽</label>
                <input
                  id="dg-threshold" type="number" min={0} value={entryThreshold}
                  onChange={(e) => setEntryThreshold(e.target.value)}
                />
              </div>
            </div>
            <div className="admin-field">
              <label htmlFor="dg-status">Статус</label>
              <select id="dg-status" value={status} onChange={(e) => setStatus(e.target.value as 'active' | 'archived')}>
                <option value="active">Активна</option>
                <option value="archived">Архив</option>
              </select>
            </div>
            <div className="admin-field">
              <label className="admin-checkbox">
                <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />
                Публичная группа
              </label>
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
