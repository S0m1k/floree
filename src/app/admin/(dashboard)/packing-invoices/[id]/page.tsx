import { notFound } from 'next/navigation';
import { getWarehouseDoc } from '@/lib/adminWarehouseDocs';
import { getStores, getWorkers } from '@/lib/adminOrders';
import { getVendorsDict } from '@/lib/adminVendors';
import { getAllInventoryItemsMap } from '@/lib/adminInventory';
import WarehouseDocCard from '@/components/admin/WarehouseDocCard';

export const metadata = { title: 'Приходная накладная' };

interface Props {
  params: { id: string };
}

export default async function PackingInvoiceDetailPage({ params }: Props) {
  const result = await getWarehouseDoc('packing-invoices', params.id);
  if (!result) notFound();

  const [stores, workers, vendors, itemsById] = await Promise.all([
    getStores(),
    getWorkers(),
    getVendorsDict(),
    getAllInventoryItemsMap(),
  ]);

  return (
    <WarehouseDocCard
      docType="packing-invoices"
      doc={result.doc}
      lines={result.lines}
      itemsById={itemsById}
      storesById={Object.fromEntries(stores.map((s) => [s.id, s]))}
      workersById={Object.fromEntries(workers.map((w) => [w.id, w]))}
      vendorsById={Object.fromEntries(vendors.map((v) => [v.id, v]))}
    />
  );
}
