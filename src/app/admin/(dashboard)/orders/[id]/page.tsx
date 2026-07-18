import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  TERMINAL_STATUSES, getOrder, getOrderComposition, getOrderStatusHistory, getOrderTags,
  getShowcaseBouquets, getStores, getWorkers,
} from '@/lib/adminOrders';
import { getAllInventoryItemsMap } from '@/lib/adminInventory';
import { fmtDateTime } from '@/lib/format';
import OrderStatusBadge from '@/components/admin/OrderStatusBadge';
import OrderStatusControl from '@/components/admin/OrderStatusControl';
import OrderProductsTab from '@/components/admin/OrderProductsTab';
import OrderTagsEditor from '@/components/admin/OrderTagsEditor';
import OrderCommentEditor from '@/components/admin/OrderCommentEditor';

export const metadata = { title: 'Заказ' };

interface Props {
  params: { id: string };
  searchParams: { tab?: string };
}

export default async function AdminOrderDetailPage({ params, searchParams }: Props) {
  const result = await getOrder(params.id);
  if (!result) notFound();
  const { order, tagsById } = result;

  const a = order.attributes;
  const tab = searchParams.tab === 'products' ? 'products' : 'info';
  const storeId = order.relationships?.store?.data?.id ?? null;
  const tagIds = order.relationships?.tags?.data?.map((t) => t.id) ?? [];

  const [statusHistory, stores, allTags, workers] = await Promise.all([
    getOrderStatusHistory(order.id),
    getStores(),
    getOrderTags(),
    getWorkers(),
  ]);

  // The «Продукты» tab data (composition + pickers) is only fetched when shown.
  const [composition, bouquets, inventoryById] =
    tab === 'products'
      ? await Promise.all([
          getOrderComposition(order.id),
          getShowcaseBouquets(storeId),
          getAllInventoryItemsMap(),
        ])
      : [null, [], {}];
  const inventoryItems = Object.values(inventoryById);

  const store = storeId ? stores.find((s) => s.id === storeId) : null;
  const floristId = order.relationships?.florist?.data?.id;
  const florist = floristId ? workers.find((w) => w.id === floristId) : null;

  const tabHref = (t: string) => `/admin/orders/${order.id}${t === 'info' ? '' : `?tab=${t}`}`;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
        <Link href="/admin/orders" className="admin-btn" style={{ flex: '0 0 auto' }}>← Назад</Link>
        <h1 className="admin-title" style={{ margin: 0 }}>Заказ № {a.docNo || order.id.slice(0, 8)}</h1>
        <OrderStatusControl orderId={order.id} status={a.status} />
        <button
          type="button"
          className="admin-btn admin-btn--primary"
          style={{ marginLeft: 'auto' }}
          disabled
          title="Скоро"
        >
          Скачать
        </button>
      </div>

      <nav className="admin-tabs">
        <Link href={tabHref('info')} className={`admin-tab ${tab === 'info' ? 'admin-tab--active' : ''}`}>
          Общая информация
        </Link>
        <Link href={tabHref('products')} className={`admin-tab ${tab === 'products' ? 'admin-tab--active' : ''}`}>
          Продукты
        </Link>
      </nav>

      {tab === 'info' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <section className="admin-panel">
            <p className="admin-panel__title">Точка продаж</p>
            <div style={{ padding: '10px 16px 16px' }}>
              {store ? store.attributes.title : 'Не указана'}
            </div>
          </section>

          <section className="admin-panel">
            <p className="admin-panel__title">Клиент</p>
            <div className="admin-table-wrap" style={{ border: 'none', margin: '10px 16px 16px', width: 'auto' }}>
              <table className="admin-table">
                <thead>
                  <tr><th>Имя</th><th>Телефон</th></tr>
                </thead>
                <tbody>
                  <tr>
                    <td>{a.deliveryContact || '—'}</td>
                    <td>{a.deliveryPhoneNumber || '—'}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section className="admin-panel">
            <p className="admin-panel__title">Быстрые теги</p>
            <OrderTagsEditor orderId={order.id} allTags={allTags} tagIds={tagIds} tagsById={tagsById} />
          </section>

          <section className="admin-panel">
            <p className="admin-panel__title">Комментарий</p>
            <OrderCommentEditor orderId={order.id} comment={a.description || ''} />
          </section>

          <section className="admin-panel">
            <p className="admin-panel__title">Доставка</p>
            <div style={{ padding: '10px 16px 16px', display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div>Время исполнения: {a.dueTime ? fmtDateTime(a.dueTime) : 'не указано'}</div>
              {florist && <div>Флорист: {florist.attributes.name}</div>}
            </div>
          </section>

          <section className="admin-panel">
            <p className="admin-panel__title">История статусов</p>
            {statusHistory.length === 0 ? (
              <div className="admin-empty">История пока не ведётся — переходы статусов ещё не фиксируются.</div>
            ) : (
              <div className="admin-table-wrap" style={{ border: 'none', margin: '10px 16px 16px', width: 'auto' }}>
                <table className="admin-table">
                  <thead>
                    <tr><th>Статус</th><th>Дата обновления</th><th>Исполнитель</th></tr>
                  </thead>
                  <tbody>
                    {statusHistory.map((h) => {
                      const workerId = h.relationships?.worker?.data?.id;
                      const worker = workerId ? workers.find((w) => w.id === workerId) : null;
                      return (
                        <tr key={h.id}>
                          <td><OrderStatusBadge status={h.attributes.status} /></td>
                          <td>{fmtDateTime(h.attributes.changedAt)}</td>
                          <td>{worker?.attributes.name || '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      ) : (
        <OrderProductsTab
          orderId={order.id}
          comment={a.description || ''}
          lines={composition?.lines ?? []}
          totals={composition?.totals ?? null}
          payments={composition?.payments ?? []}
          readOnly={composition?.readOnly ?? false}
          terminal={TERMINAL_STATUSES.includes(a.status)}
          bouquets={bouquets}
          items={inventoryItems}
        />
      )}
    </div>
  );
}
