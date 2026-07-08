import { notFound } from 'next/navigation';
import { getWarehouseDoc } from '@/lib/adminWarehouseDocs';
import { getStores, getWorkers } from '@/lib/adminOrders';
import { getAllInventoryItemsMap } from '@/lib/adminInventory';
import WarehouseDocCard from '@/components/admin/WarehouseDocCard';

export const metadata = { title: 'Акт уценки' };

interface Props {
  params: { id: string };
}

export default async function MarkdownActDetailPage({ params }: Props) {
  const result = await getWarehouseDoc('markdown-acts', params.id);
  if (!result) notFound();

  const [stores, workers, itemsById] = await Promise.all([
    getStores(),
    getWorkers(),
    getAllInventoryItemsMap(),
  ]);

  return (
    <WarehouseDocCard
      docType="markdown-acts"
      doc={result.doc}
      lines={result.lines}
      itemsById={itemsById}
      storesById={Object.fromEntries(stores.map((s) => [s.id, s]))}
      workersById={Object.fromEntries(workers.map((w) => [w.id, w]))}
    />
  );
}
