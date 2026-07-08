import { getWarehouseDocs, WarehouseDocsSearchParams } from '@/lib/adminWarehouseDocs';
import { getStores, getWorkers } from '@/lib/adminOrders';
import WarehouseNav from '@/components/admin/WarehouseNav';
import WarehouseDocsList from '@/components/admin/WarehouseDocsList';

export const metadata = { title: 'Акты пересорта' };

interface Props {
  searchParams: WarehouseDocsSearchParams;
}

export default async function AdminSortingActsPage({ searchParams }: Props) {
  const [{ docs, total }, stores, workers] = await Promise.all([
    getWarehouseDocs('sorting-acts', searchParams),
    getStores(),
    getWorkers(),
  ]);

  return (
    <div>
      <WarehouseNav active="/admin/sorting-acts" />
      <WarehouseDocsList
        docType="sorting-acts"
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
