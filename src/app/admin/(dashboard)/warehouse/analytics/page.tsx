import { getWarehouseDashboard, currentMonthRange, DashboardSearchParams } from '@/lib/adminDashboard';
import WarehouseTab from '../../retail-stores/_components/WarehouseTab';
import { DashboardHeader } from '../../retail-stores/_components/shared';

export const metadata = { title: 'Аналитика склада' };

interface Props {
  searchParams: DashboardSearchParams & { woSort?: string };
}

// «Склад» — вкладка 4/4 дашборда (admin-map §2.1, §2.4.2), на своём маршруте
// так, что «Учёт и финансы → Склад → Аналитика» в сайдбаре ведёт сюда
// напрямую. Тонкая обёртка вокруг retail-stores/_components — компонент не
// задублирован.
export default async function WarehouseAnalyticsPage({ searchParams }: Props) {
  const defaults = currentMonthRange();
  const from = searchParams.from || defaults.from;
  const to = searchParams.to || defaults.to;

  const warehouse = await getWarehouseDashboard(searchParams);
  const updatedAt = warehouse ? new Date(warehouse.updatedAt).toLocaleString('ru-RU') : '—';

  return (
    <div>
      <DashboardHeader
        active="warehouse" from={from} to={to} updatedAt={updatedAt}
        periodFormAction="/admin/warehouse/analytics"
      />

      {warehouse ? (
        <WarehouseTab
          data={warehouse}
          from={from}
          to={to}
          woSort={(searchParams.woSort as 'amount' | 'quantity') || 'amount'}
        />
      ) : <div className="admin-empty">Не удалось загрузить аналитику.</div>}
    </div>
  );
}
