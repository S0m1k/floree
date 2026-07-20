import { getWarehouseDocs, WarehouseDocsSearchParams } from '@/lib/adminWarehouseDocs';
import { getStores, getWorkers } from '@/lib/adminOrders';
import { getVendorsDict } from '@/lib/adminVendors';
import WarehouseNav from '@/components/admin/WarehouseNav';
import WarehouseDocsList from '@/components/admin/WarehouseDocsList';

export const metadata = { title: 'Приходные накладные' };

interface Props {
  searchParams: WarehouseDocsSearchParams;
}

export default async function AdminPackingInvoicesPage({ searchParams }: Props) {
  const [{ docs, total }, stores, workers, vendors] = await Promise.all([
    getWarehouseDocs('packing-invoices', searchParams),
    getStores(),
    getWorkers(),
    getVendorsDict(),
  ]);

  return (
    <div>
      <WarehouseNav active="/admin/packing-invoices" />
      <WarehouseDocsList
        docType="packing-invoices"
        docs={docs}
        total={total}
        current={searchParams}
        stores={stores}
        storesById={Object.fromEntries(stores.map((s) => [s.id, s]))}
        workersById={Object.fromEntries(workers.map((w) => [w.id, w]))}
        vendorsById={Object.fromEntries(vendors.map((v) => [v.id, v]))}
      />
    </div>
  );
}
