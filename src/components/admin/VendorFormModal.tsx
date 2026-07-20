'use client';

import { useState } from 'react';
import { AdminVendor } from '@/types';

const TITLE_MAX = 255;
const PHONE_MAX = 32;
const EMAIL_MAX = 255;
const COMMENT_MAX = 2000;

interface Props {
  vendor?: AdminVendor; // present -> edit, absent -> create
  onClose: () => void;
  onSaved: () => void;
}

// «Создать поставщика» / edit modal (admin-map §2.4.4). Same title/phone/
// email/comment fields either way — only the HTTP verb + target differ.
export default function VendorFormModal({ vendor, onClose, onSaved }: Props) {
  const isEdit = Boolean(vendor);
  const [title, setTitle] = useState(vendor?.attributes.title || '');
  const [phone, setPhone] = useState(vendor?.attributes.phone || '');
  const [email, setEmail] = useState(vendor?.attributes.email || '');
  const [description, setDescription] = useState(vendor?.attributes.description || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!title.trim()) { setError('Укажите название поставщика'); return; }

    const attributes = {
      title: title.trim(),
      phone: phone.trim() || null,
      email: email.trim() || null,
      description: description.trim() || null,
    };

    setSaving(true);
    try {
      const url = isEdit ? `/admin/api/vendors/${vendor!.id}` : '/admin/api/vendors';
      const res = await fetch(url, {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: { type: 'vendors', attributes } }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof json.detail === 'string' ? json.detail : 'Не удалось сохранить поставщика');
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Что-то пошло не так');
      setSaving(false);
    }
  };

  return (
    <div className="admin-modal-backdrop" role="dialog" aria-modal="true" aria-label={isEdit ? 'Редактировать поставщика' : 'Создать поставщика'}>
      <div className="admin-modal" style={{ width: 480 }}>
        <div className="admin-modal__head">
          <p className="admin-modal__title">{isEdit ? 'Редактировать поставщика' : 'Создать поставщика'}</p>
          <button type="button" className="admin-modal__close" onClick={onClose} aria-label="Закрыть">×</button>
        </div>

        <form onSubmit={save}>
          <div className="admin-modal__body">
            <div className="admin-field">
              <label htmlFor="vendor-title">Название *</label>
              <input
                id="vendor-title" value={title} maxLength={TITLE_MAX}
                onChange={(e) => setTitle(e.target.value)} required autoFocus
              />
            </div>
            <div className="admin-field">
              <label htmlFor="vendor-phone">Телефон</label>
              <input id="vendor-phone" value={phone} maxLength={PHONE_MAX} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="admin-field">
              <label htmlFor="vendor-email">Электронный адрес</label>
              <input id="vendor-email" type="email" value={email} maxLength={EMAIL_MAX} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="admin-field">
              <label htmlFor="vendor-comment">Комментарий</label>
              <textarea
                id="vendor-comment" value={description} maxLength={COMMENT_MAX} rows={3}
                onChange={(e) => setDescription(e.target.value)} className="admin-textarea"
              />
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
