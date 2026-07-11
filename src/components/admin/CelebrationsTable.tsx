'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { DictEntry } from '@/lib/adminSettings';

const TITLE_MAX = 50;
const API = '/admin/api/dict/customer-celebrations';

function formatPeriod(a: DictEntry['attributes']): string {
  const fmt = (iso: string | null | undefined) => {
    if (!iso) return null;
    const [y, m, d] = iso.split('-');
    return `${d}.${m}.${y}`;
  };
  const from = fmt(a.dateFrom);
  const to = fmt(a.dateTo);
  if (from && to) return from === to ? from : `${from} — ${to}`;
  return from || to || '—';
}

// «Праздничные события» (admin-map §2.7): «Создать» opens an inline form
// (Название + Период: two dates); table `Название | Период | ⋮ (Удалить)`.
export default function CelebrationsTable({ entries }: { entries: DictEntry[] }) {
  const router = useRouter();
  const [formOpen, setFormOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);

  const resetForm = () => {
    setTitle('');
    setDateFrom('');
    setDateTo('');
    setFormOpen(false);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: {
            type: 'customer-celebrations',
            attributes: { title: trimmed, dateFrom: dateFrom || null, dateTo: dateTo || null },
          },
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const detail = typeof json.detail === 'string' ? json.detail : '';
        if (detail.includes('already exists')) throw new Error('Такое событие уже есть');
        throw new Error(detail || 'Не удалось создать событие');
      }
      resetForm();
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
      const res = await fetch(`${API}/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!res.ok && res.status !== 204) {
        const json = await res.json().catch(() => ({}));
        throw new Error(typeof json.detail === 'string' ? json.detail : 'Не удалось удалить');
      }
      setMenuFor(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Что-то пошло не так');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      {!formOpen && (
        <div style={{ marginBottom: 16 }}>
          <button type="button" className="admin-btn admin-btn--primary" onClick={() => setFormOpen(true)}>
            Создать
          </button>
        </div>
      )}

      {formOpen && (
        <form onSubmit={handleCreate} className="admin-panel admin-dict-form">
          <div className="admin-field">
            <label htmlFor="celebration-title">Название</label>
            <input
              id="celebration-title"
              value={title}
              maxLength={TITLE_MAX}
              required
              onChange={(e) => setTitle(e.target.value)}
            />
            <span className="admin-form-counter">{title.length} / {TITLE_MAX}</span>
          </div>
          <div className="admin-field-grid">
            <div className="admin-field">
              <label htmlFor="celebration-from">Период с</label>
              <input
                id="celebration-from"
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div className="admin-field">
              <label htmlFor="celebration-to">Период по</label>
              <input
                id="celebration-to"
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
          </div>
          <div className="admin-form-actions admin-dict-form__actions">
            <button type="button" className="admin-btn" onClick={resetForm} disabled={busy}>
              Отмена
            </button>
            <button type="submit" className="admin-btn admin-btn--primary" disabled={busy || !title.trim()}>
              {busy ? 'Сохраняем…' : 'Создать'}
            </button>
          </div>
        </form>
      )}

      {error && <div className="admin-form-error admin-dict-error">{error}</div>}

      {entries.length === 0 ? (
        <div className="admin-table-wrap"><div className="admin-empty">Событий пока нет.</div></div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Название</th>
                <th>Период</th>
                <th aria-label="Действия" />
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td>{entry.attributes.title}</td>
                  <td>{formatPeriod(entry.attributes)}</td>
                  <td>
                    <div className="admin-row-menu">
                      <button
                        type="button"
                        className="admin-btn admin-row-menu__trigger"
                        onClick={() => setMenuFor(menuFor === entry.id ? null : entry.id)}
                        disabled={busy}
                        aria-haspopup="menu"
                        aria-expanded={menuFor === entry.id}
                      >
                        ⋮
                      </button>
                      {menuFor === entry.id && (
                        <ul className="admin-row-menu__list" role="menu">
                          <li role="menuitem">
                            <button
                              type="button"
                              className="admin-row-menu__item"
                              onClick={() => handleDelete(entry.id)}
                              disabled={busy}
                            >
                              Удалить
                            </button>
                          </li>
                        </ul>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
