import Link from 'next/link';
import { getStores, getOrderSources, getOrderTags, getCustomersForSelect } from '@/lib/adminOrders';
import CreateOrderForm from '@/components/admin/CreateOrderForm';

export const metadata = { title: 'Новый заказ' };

export default async function CreateOrderPage() {
  const [stores, sources, tags, customers] = await Promise.all([
    getStores(),
    getOrderSources(),
    getOrderTags(),
    getCustomersForSelect(),
  ]);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
        <Link href="/admin/orders" className="admin-btn" style={{ flex: '0 0 auto' }}>← Назад</Link>
        <h1 className="admin-title" style={{ margin: 0 }}>Новый заказ</h1>
      </div>

      <CreateOrderForm stores={stores} sources={sources} tags={tags} customers={customers} />
    </div>
  );
}
