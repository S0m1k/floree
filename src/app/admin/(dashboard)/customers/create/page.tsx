import Link from 'next/link';
import { getOrderSources } from '@/lib/adminOrders';
import CustomerForm from '@/components/admin/CustomerForm';

export const metadata = { title: 'Новый клиент' };

export default async function CreateCustomerPage() {
  const sources = await getOrderSources();

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
        <Link href="/admin/customers" className="admin-btn" style={{ flex: '0 0 auto' }}>← Назад</Link>
        <h1 className="admin-title" style={{ margin: 0 }}>Новый клиент</h1>
      </div>

      <CustomerForm sources={sources} />
    </div>
  );
}
