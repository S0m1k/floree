'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { DictEntry } from '@/lib/adminSettings';

const TITLE_MAX = 50;
const API = '/admin/api/dict/measures';

// ФФД «мера количества предмета расчёта» codes shown by the live Posiflora
// units form: (0) штуки … (255) иные.
const MEASURE_CODES: { code: number; label: string }[] = [
  { code: 0, label: '(0) штуки' },
  { code: 10, label: '(10) грамм' },
  { code: 11, label: '(11) килограмм' },
  { code: 12, label: '(12) тонна' },
  { code: 20, label: '(20) сантиметр' },
  { code: 22, label: '(22) метр' },
  { code: 32, label: '(32) квадратный метр' },
  { code: 40, label: '(40) миллилитр' },
  { code: 41, label: '(41) литр' },
  { code: 42, label: '(42) кубический метр' },
  { code: 71, label: '(71) час' },
  { code: 70, label: '(70) сутки' },
  { code: 255, label: '(255) иные' },
];

function measureLabel(code: number | null | undefined): string {
  if (code === null || code === undefined) return '—';
  return MEASURE_CODES.find((m) => m.code === code)?.label || `(${code})`;
}

interface RowDraft {
  title: string;
  shortName: string;
  measureCode: string; // select value; '' = not set
}

// «Единицы измерения» (admin-map §2.7): «Создать» + table
// `Название | Сокращение | Мера количества товара | ⋮ (Редактировать инлайн, Удалить)`.
export default function MeasuresTable({ entries }: { entries: DictEntry[] }) {
  const router = useRouter();
  const [formOpen, setFormOpen] = useState(false);
  const [draft, setDraft] = useState<RowDraft>({ title: '', shortName: '', measureCode: '' });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<RowDraft>({ title: '', shortName: '', measureCode: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);

  const attributesFrom = (d: RowDraft) => ({
    title: d.title.trim(),
    shortName: d.shortName.trim() || null,
    measureCode: d.measureCode === '' ? null : Number(d.measureCode),
  });

  const request = async (url: string, method: string, body?: unknown) => {
    const res = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok && res.status !== 204) {
      const json = await res.json().catch(() => ({}));
      const detail = typeof json.detail === 'string' ? json.detail : '';
      if (detail.includes('already exists')) throw new Error('Такая единица уже есть');
      throw new Error(detail || 'Не удалось сохранить');
    }
  };

  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await fn();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Что-то пошло не так');
    } finally {
      setBusy(false);
    }
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.title.trim()) return;
    void run(async () => {
      await request(API, 'POST', { data: { type: 'measures', attributes: attributesFrom(draft) } });
      setDraft({ title: '', shortName: '', measureCode: '' });
      setFormOpen(false);
    });
  };

  const startEdit = (entry: DictEntry) => {
    setMenuFor(null);
    setEditingId(entry.id);
    setEditDraft({
      title: entry.attributes.title,
      shortName: entry.attributes.shortName || '',
      measureCode:
        entry.attributes.measureCode === null || entry.attributes.measureCode === undefined
          ? ''
          : String(entry.attributes.measureCode),
    });
  };

  const handleSaveEdit = (id: string) => {
    if (!editDraft.title.trim()) return;
    void run(async () => {
      await request(`${API}/${encodeURIComponent(id)}`, 'PATCH', {
        data: { type: 'measures', attributes: attributesFrom(editDraft) },
      });
      setEditingId(null);
    });
  };

  const handleDelete = (id: string) => {
    void run(async () => {
      await request(`${API}/${encodeURIComponent(id)}`, 'DELETE');
      setMenuFor(null);
    });
  };

  const codeSelect = (value: string, onChange: (v: string) => void, id: string) => (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)} aria-label="Мера количества товара">
      <option value="">Не указана</option>
      {MEASURE_CODES.map((m) => (
        <option key={m.code} value={m.code}>{m.label}</option>
      ))}
    </select>
  );

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
            <label htmlFor="measure-title">Название</label>
            <input
              id="measure-title"
              value={draft.title}
              maxLength={TITLE_MAX}
              required
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            />
            <span className="admin-form-counter">{draft.title.length} / {TITLE_MAX}</span>
          </div>
          <div className="admin-field-grid">
            <div className="admin-field">
              <label htmlFor="measure-short">Сокращение</label>
              <input
                id="measure-short"
                value={draft.shortName}
                maxLength={TITLE_MAX}
                placeholder="шт"
                onChange={(e) => setDraft({ ...draft, shortName: e.target.value })}
              />
            </div>
            <div className="admin-field">
              <label htmlFor="measure-code">Мера количества товара</label>
              {codeSelect(draft.measureCode, (v) => setDraft({ ...draft, measureCode: v }), 'measure-code')}
            </div>
          </div>
          <div className="admin-form-actions admin-dict-form__actions">
            <button
              type="button"
              className="admin-btn"
              onClick={() => setFormOpen(false)}
              disabled={busy}
            >
              Отмена
            </button>
            <button type="submit" className="admin-btn admin-btn--primary" disabled={busy || !draft.title.trim()}>
              {busy ? 'Сохраняем…' : 'Создать'}
            </button>
          </div>
        </form>
      )}

      {error && <div className="admin-form-error admin-dict-error">{error}</div>}

      {entries.length === 0 ? (
        <div className="admin-table-wrap"><div className="admin-empty">Единиц измерения пока нет.</div></div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Название</th>
                <th>Сокращение</th>
                <th>Мера количества товара</th>
                <th aria-label="Действия" />
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => {
                const isEditing = editingId === entry.id;
                if (isEditing) {
                  return (
                    <tr key={entry.id}>
                      <td>
                        <input
                          value={editDraft.title}
                          maxLength={TITLE_MAX}
                          aria-label="Название"
                          className="admin-dict-inline-input"
                          onChange={(e) => setEditDraft({ ...editDraft, title: e.target.value })}
                        />
                      </td>
                      <td>
                        <input
                          value={editDraft.shortName}
                          maxLength={TITLE_MAX}
                          aria-label="Сокращение"
                          className="admin-dict-inline-input"
                          onChange={(e) => setEditDraft({ ...editDraft, shortName: e.target.value })}
                        />
                      </td>
                      <td>
                        {codeSelect(
                          editDraft.measureCode,
                          (v) => setEditDraft({ ...editDraft, measureCode: v }),
                          `measure-code-${entry.id}`,
                        )}
                      </td>
                      <td>
                        <div className="admin-dict-inline-actions">
                          <button
                            type="button"
                            className="admin-btn admin-btn--primary"
                            onClick={() => handleSaveEdit(entry.id)}
                            disabled={busy || !editDraft.title.trim()}
                          >
                            Сохранить
                          </button>
                          <button type="button" className="admin-btn" onClick={() => setEditingId(null)} disabled={busy}>
                            Отмена
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                }
                return (
                  <tr key={entry.id}>
                    <td>{entry.attributes.title}</td>
                    <td>{entry.attributes.shortName || '—'}</td>
                    <td>{measureLabel(entry.attributes.measureCode)}</td>
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
                                onClick={() => startEdit(entry)}
                                disabled={busy}
                              >
                                Редактировать
                              </button>
                            </li>
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
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
