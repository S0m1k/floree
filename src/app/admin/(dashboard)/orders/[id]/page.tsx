import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  getOrder, getOrderPayments, getOrderStatusHistory, getStores, getWorkers,
} from '@/lib/adminOrders';
import OrderStatusBadge from '@/components/admin/OrderStatusBadge';
import OrderStatusControl from '@/components/admin/OrderStatusControl';

export const metadata = { title: 'Заказ' };

const fmtMoney = (n: number) => new Intl.NumberFormat('ru-RU').format(Math.round(n)) + ' ₽';

const fmtDateTime = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

interface Props {
  params: { id: string };
  searchParams: { tab?: string };
}

export default async function AdminOrderDetailPage({ params, searchParams }: Props) {
  const order = await getOrder(params.id);
  if (!order) notFound();

  const [payments, statusHistory, stores, workers] = await Promise.all([
    getOrderPayments(order.id),
    getOrderStatusHistory(order.id),
    getStores(),
    getWorkers(),
  ]);

  const a = order.attributes;
  const tab = searchParams.tab === 'products' ? 'products' : 'info';

  const storeId = order.relationships?.store?.data?.id;
  const store = storeId ? stores.find((s) => s.id === storeId) : null;
  const floristId = order.relationships?.florist?.data?.id;
  const florist = floristId ? workers.find((w) => w.id === floristId) : null;

  const tabHref = (t: string) => `/admin/orders/${order.id}${t === 'info' ? '' : `?tab=${t}`}`;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
        <Link href="/admin/orders" className="admin-btn" style={{ flex: '0 0 auto' }}>← Назад</Link>
        <h1 className="admin-title" style={{ margin: 0 }}>Заказ № {a.docNo || order.id.slice(0, 8)}</h1>
        <OrderStatusControl orderId={order.id} status={a.status} />
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <section className="admin-panel">
            <p className="admin-panel__title">Комментарий к заказу</p>
            <div style={{ padding: '10px 16px 16px' }}>{a.description || 'Нет комментария'}</div>
          </section>

          <section className="admin-panel">
            <p className="admin-panel__title">Состав заказа</p>
            {a.items.length === 0 ? (
              <div className="admin-empty">
                Состав недоступен — заказ импортирован из Posiflora без данных о позициях.
              </div>
            ) : (
              <div className="admin-table-wrap" style={{ border: 'none', margin: '10px 16px 16px', width: 'auto' }}>
                <table className="admin-table">
                  <thead>
                    <tr><th>Наименование</th><th>Цена</th><th>Количество</th><th>Сумма</th></tr>
                  </thead>
                  <tbody>
                    {a.items.map((item, i) => (
                      <tr key={`${item.recipe_id}-${i}`}>
                        <td>{item.title}</td>
                        <td>{fmtMoney(item.price)}</td>
                        <td>{item.qty}</td>
                        <td>{fmtMoney(item.price * item.qty)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="admin-panel">
            <p className="admin-panel__title">История платежей</p>
            {payments.length === 0 ? (
              <div className="admin-empty">Платежей пока нет.</div>
            ) : (
              <div className="admin-table-wrap" style={{ border: 'none', margin: '10px 16px 16px', width: 'auto' }}>
                <table className="admin-table">
                  <thead>
                    <tr><th>Способ оплаты</th><th>Дата</th><th>Сумма</th></tr>
                  </thead>
                  <tbody>
                    {payments.map((p) => (
                      <tr key={p.id}>
                        <td>{p.attributes.posted ? 'Подтверждён' : 'Ожидает'}</td>
                        <td>{fmtDateTime(p.attributes.date)}</td>
                        <td>{fmtMoney(p.attributes.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <div className="admin-aggregates">
            <div className="admin-aggregate">
              <span className="admin-aggregate__label">Итого</span>
              <span className="admin-aggregate__value">{fmtMoney(a.totalAmount)}</span>
            </div>
            <div className="admin-aggregate">
              <span className="admin-aggregate__label">Оплачено</span>
              <span className="admin-aggregate__value">{fmtMoney(a.paymentsAmount)}</span>
            </div>
            <div className="admin-aggregate">
              <span className="admin-aggregate__label">Статус оплаты</span>
              <span className="admin-aggregate__value">{a.paymentStatus === 'paid' ? 'Заказ оплачен' : 'Не оплачен'}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
