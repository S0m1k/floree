'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AdminDiscountGroup } from '@/types';
import DiscountGroupFormModal from './DiscountGroupFormModal';

interface Props {
  groups: AdminDiscountGroup[];
}

const STATUS_LABEL: Record<string, string> = { active: 'Активна', archived: 'Архив' };

// «Скидки» (admin-map §2.5.5): create button + table
// `Название группы | Статус | Скидка (%) | Порог входа | Публичная группа | ⋮`.
export default function DiscountGroupsTable({ groups }: Props) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<AdminDiscountGroup | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async (group: AdminDiscountGroup) => {
    if (!window.confirm(`Удалить группу «${group.attributes.title}»?`)) return;
    setMenuFor(null);
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/admin/api/discount-groups/${group.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(typeof json.detail === 'string' ? json.detail : 'Не удалось удалить группу');
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Что-то пошло не так');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <button type="button" className="admin-btn admin-btn--primary" onClick={() => setCreating(true)}>
          Создать
        </button>
      </div>

      {error && <div className="admin-form-error admin-dict-error">{error}</div>}

      {groups.length === 0 ? (
        <div className="admin-table-wrap"><div className="admin-empty">Скидочных групп пока нет.</div></div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Название группы</th>
                <th>Статус</th>
                <th>Скидка (%)</th>
                <th>Порог входа</th>
                <th>Публичная группа</th>
                <th aria-label="Действия" />
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => {
                const a = g.attributes;
                return (
                  <tr key={g.id}>
                    <td>{a.title}</td>
                    <td>{STATUS_LABEL[a.status] || a.status}</td>
                    <td>{a.discountPercent}%</td>
                    <td>{a.entryThreshold.toLocaleString('ru-RU')} ₽</td>
                    <td>{a.isPublic ? 'Да' : 'Нет'}</td>
                    <td>
                      <div className="admin-row-menu">
                        <button
                          type="button"
                          className="admin-btn admin-row-menu__trigger"
                          onClick={() => setMenuFor(menuFor === g.id ? null : g.id)}
                          disabled={busy}
                          aria-haspopup="menu"
                          aria-expanded={menuFor === g.id}
                        >
                          ⋮
                        </button>
                        {menuFor === g.id && (
                          <ul className="admin-row-menu__list" role="menu">
                            <li role="menuitem">
                              <button
                                type="button"
                                className="admin-row-menu__item"
                                onClick={() => { setMenuFor(null); setEditing(g); }}
                                disabled={busy}
                              >
                                Редактировать
                              </button>
                            </li>
                            <li role="menuitem">
                              <button
                                type="button"
                                className="admin-row-menu__item"
                                onClick={() => handleDelete(g)}
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

      {creating && (
        <DiscountGroupFormModal
          onClose={() => setCreating(false)}
          onSaved={() => { setCreating(false); router.refresh(); }}
        />
      )}
      {editing && (
        <DiscountGroupFormModal
          group={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); router.refresh(); }}
        />
      )}
    </div>
  );
}
