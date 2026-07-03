import Link from 'next/link';
import {
  getOrders, getStores, getOrderSources, getWorkers,
  STATUS_TABS, buildOrdersHref, OrdersSearchParams,
} from '@/lib/adminOrders';
import { Worker } from '@/types';
import OrdersFilterPanel from '@/components/admin/OrdersFilterPanel';
import OrdersTable from '@/components/admin/OrdersTable';

export const metadata = { title: 'Заказы' };

const fmtMoney = (n: number) => new Intl.NumberFormat('ru-RU').format(Math.round(n)) + ' ₽';

interface Props {
  searchParams: OrdersSearchParams;
}

export default async function AdminOrdersPage({ searchParams }: Props) {
  const [{ orders, total, statusCounts, aggregates }, stores, sources, workers] = await Promise.all([
    getOrders(searchParams),
    getStores(),
    getOrderSources(),
    getWorkers(),
  ]);

  const workersById: Record<string, Worker> = Object.fromEntries(workers.map((w) => [w.id, w]));
  const activeStatus = searchParams.status || '';

  return (
    <div>
      <h1 className="admin-title">Заказы</h1>

      <nav className="admin-tabs">
        {STATUS_TABS.map((tab) => {
          const count = tab.value ? statusCounts[tab.value] ?? 0 : statusCounts.all ?? 0;
          const isActive = activeStatus === tab.value;
          return (
            <Link
              key={tab.value || 'all'}
              href={buildOrdersHref(searchParams, { status: tab.value, page: undefined })}
              className={`admin-tab ${isActive ? 'admin-tab--active' : ''}`}
            >
              {tab.label.toUpperCase()} ({count})
            </Link>
          );
        })}
      </nav>

      <form method="GET" action="/admin/orders" className="admin-search">
        {Object.entries(searchParams)
          .filter(([key]) => key !== 'q' && key !== 'page')
          .map(([key, value]) => value && <input key={key} type="hidden" name={key} value={value} />)}
        <input type="text" name="q" defaultValue={searchParams.q || ''} placeholder="Номер, клиент, состав заказа…" />
        <button type="submit" className="admin-btn admin-btn--primary">Найти</button>
      </form>

      <div className="admin-layout">
        <OrdersFilterPanel current={searchParams} stores={stores} sources={sources} workers={workers} />

        <div>
          <OrdersTable orders={orders} total={total} current={searchParams} workersById={workersById} />

          <div className="admin-aggregates">
            <div className="admin-aggregate">
              <span className="admin-aggregate__label">Сумма заказов</span>
              <span className="admin-aggregate__value">{fmtMoney(aggregates.totalAmount)}</span>
            </div>
            <div className="admin-aggregate">
              <span className="admin-aggregate__label">Оплачено</span>
              <span className="admin-aggregate__value">{fmtMoney(aggregates.paymentsAmount)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
