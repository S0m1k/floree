import WarehouseNav from '@/components/admin/WarehouseNav';
import GeneratedFilesTable from '@/components/admin/GeneratedFilesTable';
import { getGeneratedFiles } from '@/lib/adminFinance';

export const metadata = { title: 'Экспорт таблиц' };

interface Props {
  searchParams: { page?: string };
}

// «Экспорт таблиц» (admin-map §2.4.8) — history of every generated CSV
// (reports + customers/items exports), newest first.
export default async function AdminExportsListPage({ searchParams }: Props) {
  const { files, count } = await getGeneratedFiles(undefined, searchParams.page || '1');

  return (
    <div>
      <WarehouseNav active="/admin/exports-list" />
      <h1 className="admin-title">Экспорт таблиц</h1>
      <GeneratedFilesTable files={files} count={count} />
    </div>
  );
}
