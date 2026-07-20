import Link from 'next/link';
import WarehouseNav from '@/components/admin/WarehouseNav';
import GeneratedFilesTable from '@/components/admin/GeneratedFilesTable';
import { getGeneratedFiles } from '@/lib/adminFinance';

export const metadata = { title: 'Экспорт товаров' };

interface Props {
  searchParams: { page?: string };
}

// «Экспорт товаров» (admin-map §2.4.5) — history of items-export CSV runs
// (produced by the «Экспортировать продукты» button on /admin/catalog).
export default async function AdminItemsExportPage({ searchParams }: Props) {
  const { files, count } = await getGeneratedFiles('items-export', searchParams.page || '1');

  return (
    <div>
      <WarehouseNav active="/admin/items-export" />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <h1 className="admin-title" style={{ marginBottom: 0 }}>Экспорт товаров</h1>
        <Link href="/admin/catalog" className="admin-btn admin-btn--primary" style={{ height: 36, marginBottom: 16, display: 'inline-flex', alignItems: 'center' }}>
          К каталогу
        </Link>
      </div>
      <GeneratedFilesTable files={files} count={count} showKindColumn={false} />
    </div>
  );
}
