'use client';

import { useState } from 'react';
import { EXPENSE_ARTICLES, SimpleDictEntry } from '@/types';

interface Props {
  stores: SimpleDictEntry[];
  onClose: () => void;
  onSaved: () => void;
}

const todayIso = () => new Date().toISOString().slice(0, 10);

// «Добавить расход» modal (admin-map §2.4.7): статья (fixed dictionary),
// сумма, дата, точка, комментарий.
export default function ExpenseFormModal({ stores, onClose, onSaved }: Props) {
  const [article, setArticle] = useState<string>(EXPENSE_ARTICLES[0]);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayIso());
  const [storeId, setStoreId] = useState(stores[0]?.id || '');
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) { setError('Сумма должна быть больше нуля'); return; }
    if (!date) { setError('Укажите дату'); return; }
    if (!storeId) { setError('Укажите торговую точку'); return; }

    setSaving(true);
    try {
      const res = await fetch('/admin/api/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: {
            type: 'expenses',
            attributes: { article, amount: value, date, comment: comment.trim() || null, storeId },
          },
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof json.detail === 'string' ? json.detail : 'Не удалось сохранить расход');
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Что-то пошло не так');
      setSaving(false);
    }
  };

  return (
    <div className="admin-modal-backdrop" role="dialog" aria-modal="true" aria-label="Добавить расход">
      <div className="admin-modal" style={{ width: 480 }}>
        <div className="admin-modal__head">
          <p className="admin-modal__title">Добавить расход</p>
          <button type="button" className="admin-modal__close" onClick={onClose} aria-label="Закрыть">×</button>
        </div>

        <form onSubmit={save}>
          <div className="admin-modal__body">
            <div className="admin-field">
              <label htmlFor="exp-article">Статья *</label>
              <select id="exp-article" value={article} onChange={(e) => setArticle(e.target.value)} autoFocus>
                {EXPENSE_ARTICLES.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div className="admin-field-grid">
              <div className="admin-field">
                <label htmlFor="exp-amount">Сумма, ₽ *</label>
                <input
                  id="exp-amount" type="number" min={0.01} step={0.01} value={amount}
                  onChange={(e) => setAmount(e.target.value)} required
                />
              </div>
              <div className="admin-field">
                <label htmlFor="exp-date">Дата *</label>
                <input id="exp-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
              </div>
            </div>
            <div className="admin-field">
              <label htmlFor="exp-store">Точка *</label>
              <select id="exp-store" value={storeId} onChange={(e) => setStoreId(e.target.value)}>
                {stores.map((s) => <option key={s.id} value={s.id}>{s.attributes.title}</option>)}
              </select>
            </div>
            <div className="admin-field">
              <label htmlFor="exp-comment">Комментарий</label>
              <textarea id="exp-comment" value={comment} onChange={(e) => setComment(e.target.value)} rows={3} />
            </div>
            {error && <div className="admin-form-error">{error}</div>}
          </div>
          <div className="admin-form-actions" style={{ padding: '0 20px 20px' }}>
            <button type="button" className="admin-btn" onClick={onClose} disabled={saving}>Отмена</button>
            <button type="submit" className="admin-btn admin-btn--primary" disabled={saving}>
              {saving ? 'Сохраняем…' : 'Добавить'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
