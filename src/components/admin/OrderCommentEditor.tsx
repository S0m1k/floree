'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const COMMENT_MAX = 500;

interface Props {
  orderId: string;
  comment: string;
}

// Комментарий к заказу на вкладке «Общая информация»: значение с кнопкой
// «Изменить» → инлайн textarea + счётчик символов → PATCH
// /admin/api/orders/[id] { attributes: { comment } }.
export default function OrderCommentEditor({ orderId, comment }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(comment);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (value.length > COMMENT_MAX) {
      setError(`Комментарий не длиннее ${COMMENT_MAX} символов`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/admin/api/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: { type: 'orders', attributes: { comment: value } } }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof json.detail === 'string' ? json.detail : 'Не удалось изменить комментарий');
      }
      setEditing(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  };

  if (!editing) {
    return (
      <div style={{ padding: '10px 16px 16px' }}>
        <div className="admin-order-comment">
          <span className="admin-order-comment__label">Комментарий к заказу</span>
          <span>{comment || 'Нет комментария'}</span>
        </div>
        <button
          type="button"
          className="admin-btn"
          style={{ marginTop: 10 }}
          onClick={() => { setValue(comment); setEditing(true); }}
        >
          Изменить
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: '10px 16px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <textarea
        className="admin-textarea"
        rows={3}
        maxLength={COMMENT_MAX}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={busy}
        autoFocus
      />
      <span className="admin-form-counter">{value.length} / {COMMENT_MAX}</span>
      <div className="admin-form-actions" style={{ justifyContent: 'flex-start' }}>
        <button type="button" className="admin-btn admin-btn--primary" onClick={save} disabled={busy}>
          {busy ? '…' : 'Сохранить'}
        </button>
        <button type="button" className="admin-btn" onClick={() => setEditing(false)} disabled={busy}>
          Отмена
        </button>
      </div>
      {error && <div className="admin-form-error">{error}</div>}
    </div>
  );
}
