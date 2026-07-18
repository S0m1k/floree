import { getCustomersDashboard, currentMonthRange, DashboardSearchParams } from '@/lib/adminDashboard';
import CustomersTab from '../../retail-stores/_components/CustomersTab';
import { DashboardHeader } from '../../retail-stores/_components/shared';

export const metadata = { title: 'Аналитика клиентов' };

interface Props {
  searchParams: DashboardSearchParams & { segment?: string; bonusView?: string };
}

// «Клиенты» — вкладка 2/4 дашборда (admin-map §2.1, §2.5.2), на своём
// маршруте так, что «Клиенты и развитие → Аналитика» в сайдбаре ведёт сюда
// напрямую. Тонкая обёртка: данные и разметка переиспользованы из
// retail-stores/_components — ничего не задублировано.
export default async function CustomersAnalyticsPage({ searchParams }: Props) {
  const defaults = currentMonthRange();
  const from = searchParams.from || defaults.from;
  const to = searchParams.to || defaults.to;

  const customers = await getCustomersDashboard(searchParams);
  const updatedAt = customers ? new Date(customers.updatedAt).toLocaleString('ru-RU') : '—';

  return (
    <div>
      <DashboardHeader
        active="customers" from={from} to={to} updatedAt={updatedAt}
        periodFormAction="/admin/customers/analytic"
      />

      {customers ? (
        <CustomersTab
          data={customers}
          from={from}
          to={to}
          segment={(searchParams.segment as 'regular' | 'new' | 'anon') || 'regular'}
          bonusView={(searchParams.bonusView as 'accrued' | 'spent') || 'accrued'}
        />
      ) : <div className="admin-empty">Не удалось загрузить аналитику.</div>}
    </div>
  );
}
