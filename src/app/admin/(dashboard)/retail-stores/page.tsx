import { getMoneyDashboard, currentMonthRange, DashboardSearchParams } from '@/lib/adminDashboard';
import MoneyTab from './_components/MoneyTab';
import { DashboardHeader } from './_components/shared';

export const metadata = { title: 'Аналитика' };

interface Props {
  searchParams: DashboardSearchParams & { metric?: string };
}

// «Деньги» — вкладка 1/4 дашборда (admin-map §2.1), единственная что остаётся
// на /admin/retail-stores; остальные три живут на своих маршрутах
// (/admin/customers/analytic, /admin/showcase/analytics,
// /admin/warehouse/analytics) — см. DashboardHeader в _components/shared.tsx.
export default async function AdminDashboardPage({ searchParams }: Props) {
  const defaults = currentMonthRange();
  const from = searchParams.from || defaults.from;
  const to = searchParams.to || defaults.to;

  const money = await getMoneyDashboard(searchParams);
  const updatedAt = money ? new Date(money.updatedAt).toLocaleString('ru-RU') : '—';

  return (
    <div>
      <DashboardHeader active="money" from={from} to={to} updatedAt={updatedAt} periodFormAction="/admin/retail-stores" />

      {money ? (
        <MoneyTab
          data={money}
          from={from}
          to={to}
          metric={(searchParams.metric as 'shipment' | 'payment' | 'margin') || 'shipment'}
        />
      ) : <div className="admin-empty">Не удалось загрузить аналитику.</div>}
    </div>
  );
}
