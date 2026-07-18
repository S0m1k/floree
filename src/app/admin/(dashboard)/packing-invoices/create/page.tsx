import Link from 'next/link';
import { getStores } from '@/lib/adminOrders';
import { getVendorsDict } from '@/lib/adminVendors';
import { getAllInventoryItemsMap } from '@/lib/adminInventory';
import WarehouseDocCreateForm from '@/components/admin/WarehouseDocCreateForm';

export const metadata = { title: 'Создать накладную' };

export default async function CreatePackingInvoicePage() {
  const [stores, vendors, itemsById] = await Promise.all([
    getStores(),
    getVendorsDict(),
    getAllInventoryItemsMap(),
  ]);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
        <Link href="/admin/packing-invoices" className="admin-btn">← Назад</Link>
        <h1 className="admin-title" style={{ margin: 0 }}>Создать приходную накладную</h1>
      </div>
      <WarehouseDocCreateForm
        docType="packing-invoices"
        stores={stores}
        vendors={vendors}
        items={Object.values(itemsById)}
      />
    </div>
  );
}
