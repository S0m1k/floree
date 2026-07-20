'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { DictEntry, DictType } from '@/lib/adminSettings';

const TITLE_MAX = 50;

interface Props {
  apiType: DictType; // backend dictionary path (may differ from the page route)
  placeholder: string; // e.g. «Укажите наименование нового тега»
  entries: DictEntry[];
}

// Generic chip-list dictionary screen body (admin-map §2.7): a card with an
// input (0/50 counter) + green «Добавить», below — green chips with a white
// «×» that deletes the entry. Matches the live «Теги заказов» screen.
export default function DictionaryChips({ apiType, placeholder, entries }: Props) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/admin/api/dict/${apiType}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: { type: apiType, attributes: { title: trimmed } } }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const detail = typeof json.detail === 'string' ? json.detail : '';
        if (detail.includes('already exists')) throw new Error('Такое значение уже есть в справочнике');
        throw new Error(detail || 'Не удалось добавить');
      }
      setTitle('');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Что-то пошло не так');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/admin/api/dict/${apiType}/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (!res.ok && res.status !== 204) {
        const json = await res.json().catch(() => ({}));
        throw new Error(typeof json.detail === 'string' ? json.detail : 'Не удалось удалить');
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Что-то пошло не так');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="admin-panel admin-dict-panel">
      <form onSubmit={handleAdd} className="admin-dict-add">
        <div className="admin-field admin-dict-add__field">
          <input
            value={title}
            maxLength={TITLE_MAX}
            placeholder={placeholder}
            aria-label={placeholder}
            onChange={(e) => setTitle(e.target.value)}
          />
          <span className="admin-form-counter">{title.length} / {TITLE_MAX}</span>
        </div>
        <button
          type="submit"
          className="admin-btn admin-btn--primary"
          disabled={busy || !title.trim()}
        >
          Добавить
        </button>
      </form>

      {error && <div className="admin-form-error admin-dict-error">{error}</div>}

      {entries.length === 0 ? (
        <div className="admin-empty">Справочник пока пуст.</div>
      ) : (
        <div className="admin-chips admin-dict-chips">
          {entries.map((entry) => (
            <span key={entry.id} className="admin-dict-chip">
              {entry.attributes.title}
              <button
                type="button"
                className="admin-dict-chip__x"
                onClick={() => handleDelete(entry.id)}
                disabled={busy}
                aria-label={`Удалить «${entry.attributes.title}»`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
