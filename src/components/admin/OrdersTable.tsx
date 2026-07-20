'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AdminOrder, SimpleDictEntry, Worker } from '@/types';
import { OrdersSearchParams, PAGE_SIZE, buildOrdersHref } from '@/lib/ordersQuery';
import OrderStatusBadge from './OrderStatusBadge';
import OrderRowMenu from './OrderRowMenu';
import OrdersColumnsButton, { ColumnDef } from './OrdersColumnsButton';

const fmtDateTime = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const fmtDate = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const fmtMoney = (n: number | null | undefined) =>
  n == null ? '—' : new Intl.NumberFormat('ru-RU').format(Math.round(n)) + ' ₽';

// Настраиваемые колонки списка заказов (admin-map §2.2, кнопка «Столбцы»).
// Дефолтный видимый набор повторяет таблицу Posiflora: № · Статус · Клиент ·
// Дата/время создания · Автор заказа · Дата/время завершения (+ наши Теги).
const COLUMNS: ColumnDef[] = [
  { key: 'docNo', label: '№', locked: true, defaultOn: true },
  { key: 'status', label: 'Статус', defaultOn: true },
  { key: 'customer', label: 'Клиент', defaultOn: true },
  { key: 'tags', label: 'Теги', defaultOn: true },
  { key: 'createdAt', label: 'Дата/время создания', defaultOn: true },
  { key: 'author', label: 'Автор заказа', defaultOn: true },
  { key: 'closedAt', label: 'Дата/время завершения', defaultOn: true },
  { key: 'source', label: 'Источник', defaultOn: false },
  { key: 'store', label: 'Торговая точка', defaultOn: false },
  { key: 'florist', label: 'Флорист', defaultOn: false },
  { key: 'closedBy', label: 'Кем закрыт', defaultOn: false },
  { key: 'dueDate', label: 'Дата исполнения', defaultOn: false },
  { key: 'budget', label: 'Бюджет', defaultOn: false },
  { key: 'totalAmount', label: 'Сумма', defaultOn: false },
  { key: 'paymentsAmount', label: 'Оплачено', defaultOn: false },
];

const STORAGE_KEY = 'floree.admin.orders.columns';

const defaultVisible = (): Record<string, boolean> =>
  Object.fromEntries(COLUMNS.map((c) => [c.key, c.locked || c.defaultOn]));

const loadVisible = (): Record<string, boolean> => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultVisible();
    const saved: unknown = JSON.parse(raw);
    if (!Array.isArray(saved)) return defaultVisible();
    const on = new Set(saved.filter((k): k is string => typeof k === 'string'));
    return Object.fromEntries(COLUMNS.map((c) => [c.key, c.locked || on.has(c.key)]));
  } catch {
    return defaultVisible();
  }
};

interface Props {
  orders: AdminOrder[];
  total: number;
  current: OrdersSearchParams;
  workersById: Record<string, Worker>;
  tagsById?: Record<string, SimpleDictEntry>;
  sourcesById?: Record<string, SimpleDictEntry>;
  storesById?: Record<string, SimpleDictEntry>;
  pageSize?: number;
}

export default function OrdersTable({
  orders, total, current, workersById, tagsById = {}, sourcesById = {}, storesById = {}, pageSize = PAGE_SIZE,
}: Props) {
  const page = Math.max(1, parseInt(current.page || '1', 10) || 1);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  // Дефолт на SSR, реальный выбор пользователя — после гидрации (localStorage).
  const [visible, setVisible] = useState<Record<string, boolean>>(defaultVisible);
  useEffect(() => { setVisible(loadVisible()); }, []);

  const persist = (next: Record<string, boolean>) => {
    setVisible(next);
    try {
      const on = COLUMNS.filter((c) => !c.locked && next[c.key]).map((c) => c.key);
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(on));
    } catch {
      // localStorage недоступен (private mode) — выбор живёт до перезагрузки.
    }
  };

  const toggle = (key: string) => persist({ ...visible, [key]: !visible[key] });
  const reset = () => persist(defaultVisible());

  const shownColumns = COLUMNS.filter((c) => visible[c.key]);

  const workerName = (id: string | null | undefined) =>
    (id && workersById[id]?.attributes.name) || '—';

  const renderCell = (col: ColumnDef, o: AdminOrder) => {
    const a = o.attributes;
    const rels = o.relationships;
    switch (col.key) {
      case 'docNo':
        return <Link href={`/admin/orders/${o.id}`}>{a.docNo || o.id.slice(0, 8)}</Link>;
      case 'status':
        return <OrderStatusBadge status={a.status} variant="text" />;
      case 'customer':
        return (
          <>
            <div>{a.deliveryContact || '—'}</div>
            <div style={{ color: 'var(--admin-text-3)', fontSize: 12 }}>{a.deliveryPhoneNumber}</div>
          </>
        );
      case 'tags': {
        const tagIds = rels?.tags?.data?.map((t) => t.id) || [];
        if (tagIds.length === 0) return '—';
        return (
          <div className="admin-chips" style={{ gap: 4 }}>
            {tagIds.map((id) => (
              <span key={id} className="admin-chip admin-chip--active" style={{ padding: '2px 8px', fontSize: 12 }}>
                {tagsById[id]?.attributes.title || id}
              </span>
            ))}
          </div>
        );
      }
      case 'createdAt':
        return fmtDateTime(a.createdAt);
      case 'author':
        return workerName(rels?.createdBy?.data?.id);
      case 'closedAt':
        return fmtDateTime(a.closedAt);
      case 'source': {
        const id = rels?.source?.data?.id;
        return (id && sourcesById[id]?.attributes.title) || '—';
      }
      case 'store': {
        const id = rels?.store?.data?.id;
        return (id && storesById[id]?.attributes.title) || '—';
      }
      case 'florist':
        return workerName(rels?.florist?.data?.id);
      case 'closedBy':
        return workerName(rels?.closedBy?.data?.id);
      case 'dueDate':
        return fmtDate(a.dueDate || a.dueTime);
      case 'budget':
        return fmtMoney(a.budget);
      case 'totalAmount':
        return fmtMoney(a.totalAmount);
      case 'paymentsAmount':
        return fmtMoney(a.paymentsAmount);
      default:
        return '—';
    }
  };

  return (
    <div className="admin-table-wrap">
      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '8px 8px 0' }}>
        <OrdersColumnsButton columns={COLUMNS} visible={visible} onToggle={toggle} onReset={reset} />
      </div>

      {orders.length === 0 ? (
        <div className="admin-empty">Заказы не найдены — попробуйте изменить фильтры.</div>
      ) : (
        <>
          <table className="admin-table">
            <thead>
              <tr>
                {shownColumns.map((c) => <th key={c.key}>{c.label}</th>)}
                <th aria-label="Действия" />
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  {shownColumns.map((c) => <td key={c.key}>{renderCell(c, o)}</td>)}
                  <td style={{ width: 48 }}>
                    <OrderRowMenu orderId={o.id} status={o.attributes.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="admin-pagination">
            <span>Найдено заказов: {total}</span>
            <div className="admin-pagination__pages">
              {Array.from({ length: pageCount }, (_, i) => i + 1)
                .filter((p) => p === 1 || p === pageCount || Math.abs(p - page) <= 2)
                .map((p, idx, arr) => (
                  <span key={p} style={{ display: 'flex', alignItems: 'center' }}>
                    {idx > 0 && arr[idx - 1] !== p - 1 && <span style={{ padding: '0 2px' }}>…</span>}
                    {p === page ? (
                      <span className="admin-pagination__current">{p}</span>
                    ) : (
                      <Link href={buildOrdersHref(current, { page: String(p) })}>{p}</Link>
                    )}
                  </span>
                ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
