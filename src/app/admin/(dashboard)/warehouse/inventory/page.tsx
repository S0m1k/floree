import { getStockOverview } from '@/lib/adminInventory';
import { getStores } from '@/lib/adminOrders';
import WarehouseNav from '@/components/admin/WarehouseNav';
import InventoryCountForm from '@/components/admin/InventoryCountForm';

export const metadata = { title: 'Инвентаризация' };

// Пересчёт остатков точки: заполняются только пересчитанные позиции, акт
// проводится сразу (POST /v1/stock/inventory) и выправляет остатки.
export default async function InventoryCountPage() {
  const stores = await getStores();
  const storeId = stores[0]?.id || '';
  const { rows } = storeId
    ? await getStockOverview(storeId, {})
    : { rows: [] };

  return (
    <div>
      <WarehouseNav active="/admin/warehouse" />
      <h1 className="admin-title">Инвентаризация</h1>
      {storeId ? (
        <InventoryCountForm storeId={storeId} rows={rows} />
      ) : (
        <div className="admin-empty">Нет торговой точки</div>
      )}
    </div>
  );
}
