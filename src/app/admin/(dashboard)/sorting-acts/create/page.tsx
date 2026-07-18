import Link from 'next/link';
import { getStores } from '@/lib/adminOrders';
import { getAllInventoryItemsMap } from '@/lib/adminInventory';
import WarehouseDocCreateForm from '@/components/admin/WarehouseDocCreateForm';

export const metadata = { title: 'Создать акт пересорта' };

export default async function CreateSortingActPage() {
  const [stores, itemsById] = await Promise.all([getStores(), getAllInventoryItemsMap()]);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
        <Link href="/admin/sorting-acts" className="admin-btn">← Назад</Link>
        <h1 className="admin-title" style={{ margin: 0 }}>Создать акт пересорта</h1>
      </div>
      <WarehouseDocCreateForm
        docType="sorting-acts"
        stores={stores}
        vendors={[]}
        items={Object.values(itemsById)}
      />
    </div>
  );
}
