import Link from 'next/link';
import { AdminOrder, SimpleDictEntry, Worker } from '@/types';
import { OrdersSearchParams, PAGE_SIZE, buildOrdersHref } from '@/lib/adminOrders';
import OrderStatusBadge from './OrderStatusBadge';

const fmtDateTime = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

interface Props {
  orders: AdminOrder[];
  total: number;
  current: OrdersSearchParams;
  workersById: Record<string, Worker>;
  tagsById?: Record<string, SimpleDictEntry>;
  pageSize?: number;
}

export default function OrdersTable({ orders, total, current, workersById, tagsById = {}, pageSize = PAGE_SIZE }: Props) {
  const page = Math.max(1, parseInt(current.page || '1', 10) || 1);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  if (orders.length === 0) {
    return (
      <div className="admin-table-wrap">
        <div className="admin-empty">Заказы не найдены — попробуйте изменить фильтры.</div>
      </div>
    );
  }

  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead>
          <tr>
            <th>№</th>
            <th>Статус</th>
            <th>Клиент</th>
            <th>Теги</th>
            <th>Дата/время создания</th>
            <th>Автор заказа</th>
            <th>Дата/время завершения</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => {
            const a = o.attributes;
            const createdById = o.relationships?.createdBy?.data?.id;
            const author = createdById ? workersById[createdById]?.attributes.name : null;
            const tagIds = o.relationships?.tags?.data?.map((t) => t.id) || [];
            return (
              <tr key={o.id}>
                <td><Link href={`/admin/orders/${o.id}`}>{a.docNo || o.id.slice(0, 8)}</Link></td>
                <td><OrderStatusBadge status={a.status} variant="text" /></td>
                <td>
                  <div>{a.deliveryContact || '—'}</div>
                  <div style={{ color: 'var(--admin-text-3)', fontSize: 12 }}>{a.deliveryPhoneNumber}</div>
                </td>
                <td>
                  {tagIds.length === 0 ? (
                    '—'
                  ) : (
                    <div className="admin-chips" style={{ gap: 4 }}>
                      {tagIds.map((id) => (
                        <span key={id} className="admin-chip admin-chip--active" style={{ padding: '2px 8px', fontSize: 12 }}>
                          {tagsById[id]?.attributes.title || id}
                        </span>
                      ))}
                    </div>
                  )}
                </td>
                <td>{fmtDateTime(a.createdAt)}</td>
                <td>{author || '—'}</td>
                <td>{fmtDateTime(a.closedAt)}</td>
              </tr>
            );
          })}
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
    </div>
  );
}
