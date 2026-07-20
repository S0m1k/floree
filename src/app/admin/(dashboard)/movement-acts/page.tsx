import { getWarehouseDocs, WarehouseDocsSearchParams } from '@/lib/adminWarehouseDocs';
import { getStores, getWorkers } from '@/lib/adminOrders';
import WarehouseNav from '@/components/admin/WarehouseNav';
import WarehouseDocsList from '@/components/admin/WarehouseDocsList';

export const metadata = { title: 'Акты перемещений' };

interface Props {
  searchParams: WarehouseDocsSearchParams;
}

export default async function AdminMovementActsPage({ searchParams }: Props) {
  // MovementAct has no store_id column (from_store_id/to_store_id instead), so
  // WarehouseDocsList skips the store filter for this doc type — see
  // hasStoreFilter in src/lib/adminWarehouseDocs.ts.
  const [{ docs, total }, stores, workers] = await Promise.all([
    getWarehouseDocs('movement-acts', searchParams),
    getStores(),
    getWorkers(),
  ]);

  return (
    <div>
      <WarehouseNav active="/admin/movement-acts" />
      <WarehouseDocsList
        docType="movement-acts"
        docs={docs}
        total={total}
        current={searchParams}
        stores={stores}
        storesById={Object.fromEntries(stores.map((s) => [s.id, s]))}
        workersById={Object.fromEntries(workers.map((w) => [w.id, w]))}
      />
    </div>
  );
}
