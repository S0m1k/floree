import Link from 'next/link';
import { getStores } from '@/lib/adminOrders';
import { getAllInventoryItemsMap } from '@/lib/adminInventory';
import WarehouseDocCreateForm from '@/components/admin/WarehouseDocCreateForm';

export const metadata = { title: 'Создать акт инвентаризации' };

export default async function CreateInventoryActPage() {
  const [stores, itemsById] = await Promise.all([getStores(), getAllInventoryItemsMap()]);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
        <Link href="/admin/inventory-acts" className="admin-btn">← Назад</Link>
        <h1 className="admin-title" style={{ margin: 0 }}>Создать акт инвентаризации</h1>
      </div>
      <WarehouseDocCreateForm
        docType="inventory-acts"
        stores={stores}
        vendors={[]}
        items={Object.values(itemsById)}
      />
    </div>
  );
}
