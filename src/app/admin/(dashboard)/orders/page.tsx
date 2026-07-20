import Link from 'next/link';
import {
  getOrders, getStores, getOrderSources, getOrderTags, getWorkers,
  STATUS_TABS, buildOrdersHref, OrdersSearchParams,
} from '@/lib/adminOrders';
import { Worker } from '@/types';
import OrdersFilterPanel from '@/components/admin/OrdersFilterPanel';
import OrdersTable from '@/components/admin/OrdersTable';
import PageSizeSelect from '@/components/admin/PageSizeSelect';

export const metadata = { title: 'Заказы' };

const fmtMoney = (n: number) => new Intl.NumberFormat('ru-RU').format(Math.round(n)) + ' ₽';

interface Props {
  searchParams: OrdersSearchParams;
}

export default async function AdminOrdersPage({ searchParams }: Props) {
  const [{ orders, total, statusCounts, aggregates, tagsById, pageSize }, stores, sources, tags, workers] =
    await Promise.all([
      getOrders(searchParams),
      getStores(),
      getOrderSources(),
      getOrderTags(),
      getWorkers(),
    ]);

  const workersById: Record<string, Worker> = Object.fromEntries(workers.map((w) => [w.id, w]));
  const activeStatus = searchParams.status || '';

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 16 }}>
        <h1 className="admin-title" style={{ margin: 0 }}>Заказы</h1>
        <Link href="/admin/orders/create" className="admin-btn admin-btn--primary">Создать новый</Link>
      </div>

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
              {tab.label.toUpperCase()}
              <span className={`admin-tab__count admin-tab__count--${tab.value}`}>{count}</span>
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
        <OrdersFilterPanel current={searchParams} stores={stores} sources={sources} tags={tags} workers={workers} />

        <div>
          <OrdersTable
            orders={orders}
            total={total}
            current={searchParams}
            workersById={workersById}
            tagsById={tagsById}
            pageSize={pageSize}
          />

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
            <PageSizeSelect current={searchParams} />
          </div>

          <div className="admin-aggregates">
            <div className="admin-aggregate">
              <span className="admin-aggregate__label">Сумма заказов</span>
              <span className="admin-aggregate__value">{fmtMoney(aggregates.ordersTotal)}</span>
            </div>
            <div className="admin-aggregate">
              <span className="admin-aggregate__label">Бюджет</span>
              <span className="admin-aggregate__value">{fmtMoney(aggregates.budgetTotal)}</span>
            </div>
            <div className="admin-aggregate">
              <span className="admin-aggregate__label">Оплачено</span>
              <span className="admin-aggregate__value">{fmtMoney(aggregates.paidTotal)}</span>
            </div>
            <div className="admin-aggregate">
              <span className="admin-aggregate__label">Кредит</span>
              <span className="admin-aggregate__value">{fmtMoney(aggregates.creditTotal)}</span>
            </div>
            <div className="admin-aggregate">
              <span className="admin-aggregate__label">Бонусы</span>
              <span className="admin-aggregate__value">{fmtMoney(aggregates.bonusTotal)}</span>
            </div>
            <div className="admin-aggregate">
              <span className="admin-aggregate__label">Скидка</span>
              <span className="admin-aggregate__value">{fmtMoney(aggregates.discountTotal)}</span>
            </div>
            <div className="admin-aggregate">
              <span className="admin-aggregate__label">Надбавка</span>
              <span className="admin-aggregate__value">{fmtMoney(aggregates.markupTotal)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
