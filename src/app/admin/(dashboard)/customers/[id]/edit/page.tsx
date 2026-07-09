import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCustomer } from '@/lib/adminCustomers';
import { getOrderSources } from '@/lib/adminOrders';
import CustomerForm from '@/components/admin/CustomerForm';

export const metadata = { title: 'Редактирование клиента' };

interface Props {
  params: { id: string };
}

export default async function EditCustomerPage({ params }: Props) {
  const [customer, sources] = await Promise.all([
    getCustomer(params.id),
    getOrderSources(),
  ]);
  if (!customer) notFound();

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
        <Link href={`/admin/customers/${customer.id}`} className="admin-btn" style={{ flex: '0 0 auto' }}>← Назад</Link>
        <h1 className="admin-title" style={{ margin: 0 }}>
          {customer.attributes.title || 'Без имени'} — редактирование
        </h1>
      </div>

      <CustomerForm sources={sources} customer={customer} />
    </div>
  );
}
