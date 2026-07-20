'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AdminExpense, SimpleDictEntry } from '@/types';
import { fmtMoney, fmtDate } from '@/lib/format';
import ExpenseFormModal from './ExpenseFormModal';

interface Props {
  expenses: AdminExpense[];
  count: number;
  total: number;
  stores: SimpleDictEntry[];
  exportHref: string;
}

// «Список расходов» (admin-map §2.4.7): create modal + table
// `# | Статья | Сумма | Дата | Точка | Комментарий | ✕`.
export default function ExpensesTable({ expenses, count, total, stores, exportHref }: Props) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const storesById = Object.fromEntries(stores.map((s) => [s.id, s.attributes.title]));

  const handleDelete = async (expense: AdminExpense) => {
    if (!window.confirm(`Удалить расход «${expense.attributes.article}» на ${fmtMoney(expense.attributes.amount)}?`)) return;
    setError(null);
    setBusyId(expense.id);
    try {
      const res = await fetch(`/admin/api/expenses/${expense.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(typeof json.detail === 'string' ? json.detail : 'Не удалось удалить расход');
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Что-то пошло не так');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <button type="button" className="admin-btn admin-btn--primary" onClick={() => setCreating(true)}>
          Добавить расход
        </button>
        <a href={exportHref} className="admin-btn">Скачать в Эксель</a>
        <button type="button" className="admin-btn" disabled title="Скоро">Выгрузить в 1С</button>
      </div>

      {error && <div className="admin-form-error admin-dict-error">{error}</div>}

      {expenses.length === 0 ? (
        <div className="admin-table-wrap"><div className="admin-empty">Расходов пока нет.</div></div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Статья</th>
                <th>Сумма</th>
                <th>Дата</th>
                <th>Точка</th>
                <th>Комментарий</th>
                <th aria-label="Удалить" />
              </tr>
            </thead>
            <tbody>
              {expenses.map((e, i) => {
                const a = e.attributes;
                const storeId = e.relationships?.store?.data?.id;
                return (
                  <tr key={e.id}>
                    <td>{i + 1}</td>
                    <td>{a.article}</td>
                    <td>{fmtMoney(a.amount)}</td>
                    <td>{fmtDate(a.date)}</td>
                    <td>{(storeId && storesById[storeId]) || '—'}</td>
                    <td>{a.comment || '—'}</td>
                    <td>
                      <button
                        type="button"
                        className="admin-btn admin-row-menu__trigger"
                        onClick={() => handleDelete(e)}
                        disabled={busyId === e.id}
                        aria-label="Удалить расход"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="admin-pagination">
            <span>Найдено расходов: {count} · Итого: {fmtMoney(total)}</span>
          </div>
        </div>
      )}

      {creating && (
        <ExpenseFormModal
          stores={stores}
          onClose={() => setCreating(false)}
          onSaved={() => { setCreating(false); router.refresh(); }}
        />
      )}
    </div>
  );
}
