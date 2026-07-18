'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AdminCustomer } from '@/types';
import { CustomersSearchParams, PAGE_SIZE, buildCustomersHref } from '@/lib/adminCustomersShared';
import { customersToCsv } from '@/lib/customerCsv';
import CustomerActionsMenu from './CustomerActionsMenu';

const fmtMoney = (n: number) => new Intl.NumberFormat('ru-RU').format(Math.round(n)) + ' ₽';
const fmtDate = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('ru-RU');
};

function downloadCsv(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

interface Props {
  customers: AdminCustomer[];
  total: number;
  current: CustomersSearchParams;
}

// Таблица «Клиенты» (admin-map §2.5.1): чекбоксы строк + «Выбрать все» +
// панель массовых действий, кебаб-меню «⋮» на строку. Рассылок/Push у нас
// нет, поэтому вместо них — реально работающий экспорт выбранных клиентов
// в CSV (генерируется на клиенте из уже загруженных строк, без похода на
// сервер) и «Снять выделение».
export default function CustomersTable({ customers, total, current }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const page = Math.max(1, parseInt(current.page || '1', 10) || 1);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const allSelected = customers.length > 0 && customers.every((c) => selected.has(c.id));

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(customers.map((c) => c.id)));
  };

  const clearSelection = () => setSelected(new Set());

  const exportSelected = () => {
    const rows = customers.filter((c) => selected.has(c.id));
    downloadCsv('customers-selected.csv', customersToCsv(rows));
  };

  if (customers.length === 0) {
    return (
      <div className="admin-table-wrap">
        <div className="admin-empty">Клиенты не найдены — попробуйте изменить фильтры.</div>
      </div>
    );
  }

  return (
    <div className="admin-table-wrap">
      {selected.size > 0 && (
        <div className="admin-bulk-bar">
          <span className="admin-bulk-bar__count">Выбрано: {selected.size}</span>
          <button type="button" className="admin-btn" onClick={exportSelected}>
            Экспортировать выбранных
          </button>
          <button type="button" className="admin-btn" disabled title="Скоро">
            Создать рассылку
          </button>
          <button type="button" className="admin-btn" disabled title="Скоро">
            Создать Push
          </button>
          <button type="button" className="admin-bulk-bar__clear" onClick={clearSelection}>
            Снять выделение
          </button>
        </div>
      )}

      <table className="admin-table">
        <thead>
          <tr>
            <th style={{ width: 36 }}>
              <label className="admin-checkbox" aria-label="Выбрать все">
                <input type="checkbox" checked={allSelected} onChange={toggleAll} />
              </label>
            </th>
            <th>Имя</th>
            <th>Телефон</th>
            <th>Средний чек</th>
            <th>Заказов на сумму</th>
            <th>Бонусы</th>
            <th>Дата рождения</th>
            <th aria-label="Действия" />
          </tr>
        </thead>
        <tbody>
          {customers.map((c) => {
            const a = c.attributes;
            const isSelected = selected.has(c.id);
            return (
              <tr key={c.id}>
                <td>
                  <label className="admin-checkbox" aria-label={`Выбрать ${a.title || 'клиента'}`}>
                    <input type="checkbox" checked={isSelected} onChange={() => toggleOne(c.id)} />
                  </label>
                </td>
                <td><Link href={`/admin/customers/${c.id}`}>{a.title || 'Без имени'}</Link></td>
                <td>{a.phone}</td>
                <td>{a.ordersQty > 0 ? fmtMoney(a.averageCheck) : '—'}</td>
                <td>{a.ordersQty > 0 ? `${fmtMoney(a.ordersAmount)} (${a.ordersQty})` : '—'}</td>
                <td>{a.currentPoints}</td>
                <td>{fmtDate(a.birthday)}</td>
                <td style={{ width: 48 }}>
                  <CustomerActionsMenu
                    customerId={c.id}
                    customerName={a.title || 'Без имени'}
                    editHref={`/admin/customers/${c.id}/edit`}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="admin-pagination">
        <span>Найдено клиентов: {total}</span>
        <div className="admin-pagination__pages">
          {Array.from({ length: pageCount }, (_, i) => i + 1)
            .filter((p) => p === 1 || p === pageCount || Math.abs(p - page) <= 2)
            .map((p, idx, arr) => (
              <span key={p} style={{ display: 'flex', alignItems: 'center' }}>
                {idx > 0 && arr[idx - 1] !== p - 1 && <span style={{ padding: '0 2px' }}>…</span>}
                {p === page ? (
                  <span className="admin-pagination__current">{p}</span>
                ) : (
                  <Link href={buildCustomersHref(current, { page: String(p) })}>{p}</Link>
                )}
              </span>
            ))}
        </div>
      </div>
    </div>
  );
}
