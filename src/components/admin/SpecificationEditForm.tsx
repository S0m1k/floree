'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AdminCategory, AdminSpecificationDetail, Worker } from '@/types';
import { DictEntry } from '@/lib/adminSettings';

const TITLE_MAX = 100;

interface Props {
  spec: AdminSpecificationDetail;
  categories: AdminCategory[];
  workers: Worker[];
  tags: DictEntry[];
  selectedTagIds: string[];
}

export default function SpecificationEditForm({ spec, categories, workers, tags, selectedTagIds }: Props) {
  const router = useRouter();
  const a = spec.attributes;

  const [title, setTitle] = useState(a.title);
  const [categoryId, setCategoryId] = useState(spec.relationships.category?.data?.id || '');
  const [authorId, setAuthorId] = useState(spec.relationships.author?.data?.id || '');
  const [videoUrl, setVideoUrl] = useState(a.videoUrl || '');
  const [description, setDescription] = useState(a.description || '');
  const [tagIds, setTagIds] = useState<string[]>(selectedTagIds);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const toggleTag = (id: string) => {
    setTagIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaved(false);
    if (!title.trim()) { setError('Укажите название рецепта'); return; }

    setSubmitting(true);
    try {
      const res = await fetch(`/admin/api/specifications/${spec.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: {
            attributes: {
              title: title.trim(),
              description: description.trim(),
              videoUrl: videoUrl.trim(),
              tags: tagIds,
            },
            relationships: {
              category: { data: categoryId ? { type: 'categories', id: categoryId } : null },
              author: { data: authorId ? { type: 'workers', id: authorId } : null },
            },
          },
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof json.detail === 'string' ? json.detail : 'Не удалось сохранить рецепт');
      }
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Что-то пошло не так');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="admin-panel">
      <p className="admin-panel__title">Основная информация</p>

      <div className="admin-field">
        <label htmlFor="spec-title">Название *</label>
        <input
          id="spec-title" value={title} maxLength={TITLE_MAX} required
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>

      <div className="admin-field">
        <label htmlFor="spec-author">Автор</label>
        <select id="spec-author" value={authorId} onChange={(e) => setAuthorId(e.target.value)}>
          <option value="">Не указан</option>
          {workers.map((w) => (
            <option key={w.id} value={w.id}>{w.attributes.name}</option>
          ))}
        </select>
      </div>

      <div className="admin-field">
        <label htmlFor="spec-category">Категория</label>
        <select id="spec-category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">Без категории</option>
          {categories.filter((c) => !c.attributes.deleted).map((c) => (
            <option key={c.id} value={c.id}>{c.attributes.title}</option>
          ))}
        </select>
      </div>

      <div className="admin-field">
        <label htmlFor="spec-video">Ссылка на видео (YouTube)</label>
        <input
          id="spec-video" type="url" value={videoUrl}
          placeholder="https://youtube.com/watch?v=…"
          onChange={(e) => setVideoUrl(e.target.value)}
        />
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
        <label htmlFor="spec-description">Описание</label>
        <textarea
          id="spec-description" rows={5} value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      {error && <div className="admin-form-error" style={{ margin: '0 16px 12px' }}>{error}</div>}

      <div className="admin-form-actions">
        {saved && !submitting && <span className="admin-form-note">Сохранено</span>}
        <button type="submit" className="admin-btn admin-btn--primary" disabled={submitting}>
          {submitting ? 'Сохраняем…' : 'Сохранить'}
        </button>
      </div>
    </form>
  );
}
