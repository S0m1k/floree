import WarehouseNav from '@/components/admin/WarehouseNav';
import ReportsTable from '@/components/admin/ReportsTable';
import { getReports, ReportsSearchParams } from '@/lib/adminFinance';

export const metadata = { title: 'Отчёты' };

interface Props {
  searchParams: ReportsSearchParams;
}

// «Отчёты» (admin-map §2.4.6): create modal + type filter + search + table
// `Название отчёта | Период | Формат | Дата формирования` with
// ОБНОВИТЬ / ОТПРАВИТЬ / СКАЧАТЬ row actions.
export default async function AdminReportsPage({ searchParams }: Props) {
  const { files, count } = await getReports(searchParams);

  return (
    <div>
      <WarehouseNav active="/admin/reports" />
      <h1 className="admin-title">Отчёты</h1>
      <ReportsTable reports={files} count={count} current={searchParams} />
    </div>
  );
}
