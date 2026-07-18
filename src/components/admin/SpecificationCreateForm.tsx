'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AdminCategory } from '@/types';
import { DictEntry } from '@/lib/adminSettings';

const TITLE_MAX = 100;

interface Props {
  categories: AdminCategory[];
  tags: DictEntry[];
}

// «Новый рецепт» — the minimal creation form (admin-map §2.3.2: title +
// category + tags + description). The backend seeds the first quantity
// variant, so the user lands on the full card ready to edit the
// composition/prices.
export default function SpecificationCreateForm({ categories, tags }: Props) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [description, setDescription] = useState('');
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleTag = (id: string) => {
    setTagIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!title.trim()) { setError('Укажите название рецепта'); return; }

    setSubmitting(true);
    try {
      const res = await fetch('/admin/api/specifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: {
            type: 'specifications',
            attributes: { title: title.trim(), description: description.trim(), tags: tagIds },
            relationships: {
              category: { data: categoryId ? { type: 'categories', id: categoryId } : null },
            },
          },
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof json.detail === 'string' ? json.detail : 'Не удалось создать рецепт');
      }
      router.push(`/admin/specifications/${json.data.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Что-то пошло не так');
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="admin-panel" style={{ maxWidth: 520 }}>
      <p className="admin-panel__title">Новый рецепт</p>

      <div className="admin-field">
        <label htmlFor="new-spec-title">Название *</label>
        <input
          id="new-spec-title" value={title} maxLength={TITLE_MAX} required autoFocus
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>

      <div className="admin-field">
        <label htmlFor="new-spec-category">Категория</label>
        <select id="new-spec-category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">Без категории</option>
          {categories.filter((c) => !c.attributes.deleted).map((c) => (
            <option key={c.id} value={c.id}>{c.attributes.title}</option>
          ))}
        </select>
      </div>

      <div className="admin-field">
        <label>Выбрать теги</label>
        <div className="admin-chips">
          {tags.map((t) => {
            const selected = tagIds.includes(t.id);
            return (
              <button
                key={t.id}
                type="button"
                className={`admin-chip ${selected ? 'admin-chip--active' : ''}`}
                onClick={() => toggleTag(t.id)}
              >
                {t.attributes.title}
                {selected && <span className="admin-chip__x" aria-hidden> ×</span>}
              </button>
            );
          })}
          {tags.length === 0 && <span className="admin-form-note">Тегов пока нет — добавьте их в Настройках.</span>}
        </div>
      </div>

      <div className="admin-field" style={{ paddingBottom: 16 }}>
        <label htmlFor="new-spec-description">Описание</label>
        <textarea id="new-spec-description" rows={4} value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>

      {error && <div className="admin-form-error" style={{ margin: '0 16px 12px' }}>{error}</div>}

      <div className="admin-form-actions">
        <button
          type="button" className="admin-btn"
          onClick={() => router.push('/admin/specifications')}
          disabled={submitting}
        >
          Отмена
        </button>
        <button type="submit" className="admin-btn admin-btn--primary" disabled={submitting}>
          {submitting ? 'Создаём…' : 'Создать рецепт'}
        </button>
      </div>
    </form>
  );
}
