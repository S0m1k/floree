'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AdminBonusCard } from '@/types';
import BonusCardFormModal from './BonusCardFormModal';

interface Props {
  cards: AdminBonusCard[];
}

const STATUS_LABEL: Record<string, string> = { active: 'Активно', archived: 'Архив' };

const fmtDate = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('ru-RU');
};

// «Бонусные карты» (admin-map §2.5.6): create button + table
// `Название карты | Логотип | Название магазина | Дата создания | Статус | ⋮`.
export default function BonusCardsTable({ cards }: Props) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<AdminBonusCard | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async (card: AdminBonusCard) => {
    if (!window.confirm(`Удалить карту «${card.attributes.title}»?`)) return;
    setMenuFor(null);
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/admin/api/bonus-cards/${card.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(typeof json.detail === 'string' ? json.detail : 'Не удалось удалить карту');
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

      {cards.length === 0 ? (
        <div className="admin-table-wrap"><div className="admin-empty">Бонусных карт пока нет.</div></div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Название карты</th>
                <th>Логотип</th>
                <th>Название магазина</th>
                <th>Дата создания</th>
                <th>Статус</th>
                <th aria-label="Действия" />
              </tr>
            </thead>
            <tbody>
              {cards.map((c) => {
                const a = c.attributes;
                return (
                  <tr key={c.id}>
                    <td>{a.title}</td>
                    <td>—</td>
                    <td>{a.shopName || '—'}</td>
                    <td>{fmtDate(a.createdAt)}</td>
                    <td>{STATUS_LABEL[a.status] || a.status}</td>
                    <td>
                      <div className="admin-row-menu">
                        <button
                          type="button"
                          className="admin-btn admin-row-menu__trigger"
                          onClick={() => setMenuFor(menuFor === c.id ? null : c.id)}
                          disabled={busy}
                          aria-haspopup="menu"
                          aria-expanded={menuFor === c.id}
                        >
                          ⋮
                        </button>
                        {menuFor === c.id && (
                          <ul className="admin-row-menu__list" role="menu">
                            <li role="menuitem">
                              <button
                                type="button"
                                className="admin-row-menu__item"
                                onClick={() => { setMenuFor(null); setEditing(c); }}
                                disabled={busy}
                              >
                                Редактировать
                              </button>
                            </li>
                            <li role="menuitem">
                              <button
                                type="button"
                                className="admin-row-menu__item"
                                onClick={() => handleDelete(c)}
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
        <BonusCardFormModal
          onClose={() => setCreating(false)}
          onSaved={() => { setCreating(false); router.refresh(); }}
        />
      )}
      {editing && (
        <BonusCardFormModal
          card={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); router.refresh(); }}
        />
      )}
    </div>
  );
}
