import Link from 'next/link';
import { getStores } from '@/lib/adminOrders';
import { getAllInventoryItemsMap } from '@/lib/adminInventory';
import WarehouseDocCreateForm from '@/components/admin/WarehouseDocCreateForm';

export const metadata = { title: 'Создать накладную на списание' };

export default async function CreateWriteoffInvoicePage() {
  const [stores, itemsById] = await Promise.all([getStores(), getAllInventoryItemsMap()]);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
        <Link href="/admin/writeoff-invoices" className="admin-btn">← Назад</Link>
        <h1 className="admin-title" style={{ margin: 0 }}>Создать накладную на списание</h1>
      </div>
      <WarehouseDocCreateForm
        docType="write-off-invoices"
        stores={stores}
        vendors={[]}
        items={Object.values(itemsById)}
      />
    </div>
  );
}
