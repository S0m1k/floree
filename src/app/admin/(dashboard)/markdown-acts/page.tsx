import { getWarehouseDocs, WarehouseDocsSearchParams } from '@/lib/adminWarehouseDocs';
import { getStores, getWorkers } from '@/lib/adminOrders';
import WarehouseNav from '@/components/admin/WarehouseNav';
import WarehouseDocsList from '@/components/admin/WarehouseDocsList';

export const metadata = { title: 'Акты уценки' };

interface Props {
  searchParams: WarehouseDocsSearchParams;
}

export default async function AdminMarkdownActsPage({ searchParams }: Props) {
  const [{ docs, total }, stores, workers] = await Promise.all([
    getWarehouseDocs('markdown-acts', searchParams),
    getStores(),
    getWorkers(),
  ]);

  return (
    <div>
      <WarehouseNav active="/admin/markdown-acts" />
      <WarehouseDocsList
        docType="markdown-acts"
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
