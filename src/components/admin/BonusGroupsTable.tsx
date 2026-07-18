'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AdminBonusGroup } from '@/types';
import BonusGroupFormModal from './BonusGroupFormModal';

interface Props {
  groups: AdminBonusGroup[];
}

const STATUS_LABEL: Record<string, string> = { active: 'Активна', archived: 'Архив' };

// «Бонусы» (admin-map §2.5.4): create button + «Пересчитать группы» + table
// `Название группы | Статус | % к начислению | Максимальный % | Порог входа |
// Публичная группа | ⋮`.
export default function BonusGroupsTable({ groups }: Props) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<AdminBonusGroup | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recalcMsg, setRecalcMsg] = useState<string | null>(null);

  const handleDelete = async (group: AdminBonusGroup) => {
    if (!window.confirm(`Удалить группу «${group.attributes.title}»?`)) return;
    setMenuFor(null);
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/admin/api/bonus-groups/${group.id}`, { method: 'DELETE' });
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

  const handleRecalculate = async () => {
    setError(null);
    setRecalcMsg(null);
    setBusy(true);
    try {
      const res = await fetch('/admin/api/bonus-groups/recalculate', { method: 'POST' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof json.detail === 'string' ? json.detail : 'Не удалось пересчитать группы');
      }
      setRecalcMsg(`Обновлено клиентов: ${json.updated ?? 0}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Что-то пошло не так');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="button" className="admin-btn admin-btn--primary" onClick={() => setCreating(true)}>
          Создать
        </button>
        <button type="button" className="admin-btn" onClick={handleRecalculate} disabled={busy}>
          Пересчитать группы
        </button>
        {recalcMsg && <span style={{ fontSize: 13, color: 'var(--admin-text-2)' }}>{recalcMsg}</span>}
      </div>

      {error && <div className="admin-form-error admin-dict-error">{error}</div>}

      {groups.length === 0 ? (
        <div className="admin-table-wrap"><div className="admin-empty">Бонусных групп пока нет.</div></div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Название группы</th>
                <th>Статус</th>
                <th>% к начислению</th>
                <th>Максимальный %</th>
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
                    <td>{a.accrualPercent}%</td>
                    <td>{a.maxPercent}%</td>
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
        <BonusGroupFormModal
          onClose={() => setCreating(false)}
          onSaved={() => { setCreating(false); router.refresh(); }}
        />
      )}
      {editing && (
        <BonusGroupFormModal
          group={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); router.refresh(); }}
        />
      )}
    </div>
  );
}
