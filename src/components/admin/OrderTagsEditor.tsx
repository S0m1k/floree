'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { SimpleDictEntry } from '@/types';

interface Props {
  orderId: string;
  allTags: SimpleDictEntry[];
  tagIds: string[];
  tagsById: Record<string, SimpleDictEntry>;
}

// «Быстрые теги» на карточке заказа (вкладка «Общая информация»,
// admin-map §2.2.1): текущие теги как чипы; клик «Изменить» открывает
// мультивыбор из /v1/order-tags → PATCH /admin/api/orders/[id]
// { relationships: { tags } }.
export default function OrderTagsEditor({ orderId, allTags, tagIds, tagsById }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<string[]>(tagIds);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]));
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/admin/api/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: {
            type: 'orders',
            relationships: { tags: { data: selected.map((id) => ({ type: 'order-tags', id })) } },
          },
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof json.detail === 'string' ? json.detail : 'Не удалось изменить теги');
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
      <div style={{ padding: '10px 16px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="admin-chips">
          {tagIds.length === 0 && <span style={{ color: 'var(--admin-text-3)' }}>Тегов нет</span>}
          {tagIds.map((id) => (
            <span key={id} className="admin-chip admin-chip--active">
              {tagsById[id]?.attributes.title || id}
            </span>
          ))}
        </div>
        <button
          type="button"
          className="admin-btn"
          style={{ alignSelf: 'flex-start' }}
          onClick={() => { setSelected(tagIds); setEditing(true); }}
        >
          Изменить
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: '10px 16px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="admin-chips">
        {allTags.map((t) => {
          const isSelected = selected.includes(t.id);
          return (
            <button
              key={t.id}
              type="button"
              className={`admin-chip ${isSelected ? 'admin-chip--active' : ''}`}
              onClick={() => toggle(t.id)}
              disabled={busy}
            >
              {t.attributes.title}
              {isSelected && <span className="admin-chip__x" aria-hidden> ×</span>}
            </button>
          );
        })}
        {allTags.length === 0 && <span className="admin-form-note">Тегов пока нет — добавьте их в Настройках.</span>}
      </div>
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
