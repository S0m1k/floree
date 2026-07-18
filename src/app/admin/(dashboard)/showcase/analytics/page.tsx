import { getBouquetsDashboard, currentMonthRange, DashboardSearchParams } from '@/lib/adminDashboard';
import BouquetsTab from '../../retail-stores/_components/BouquetsTab';
import { DashboardHeader } from '../../retail-stores/_components/shared';

export const metadata = { title: 'Аналитика витрины' };

interface Props {
  searchParams: DashboardSearchParams;
}

// «Букеты в магазине» — вкладка 3/4 дашборда (admin-map §2.1, §2.3.3), на
// своём маршруте так, что «Букеты и каталог → Аналитика (витрины)» в
// сайдбаре ведёт сюда напрямую. Тонкая обёртка вокруг
// retail-stores/_components — компонент не задублирован.
export default async function ShowcaseAnalyticsPage({ searchParams }: Props) {
  const defaults = currentMonthRange();
  const from = searchParams.from || defaults.from;
  const to = searchParams.to || defaults.to;

  const bouquets = await getBouquetsDashboard(searchParams);
  const updatedAt = bouquets ? new Date(bouquets.updatedAt).toLocaleString('ru-RU') : '—';

  return (
    <div>
      <DashboardHeader
        active="bouquets" from={from} to={to} updatedAt={updatedAt}
        periodFormAction="/admin/showcase/analytics"
      />

      {bouquets ? <BouquetsTab data={bouquets} /> : <div className="admin-empty">Не удалось загрузить аналитику.</div>}
    </div>
  );
}
