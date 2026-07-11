import Link from 'next/link';
import {
  getMoneyDashboard, getCustomersDashboard, getBouquetsDashboard, getWarehouseDashboard,
  currentMonthRange, DashboardSearchParams,
} from '@/lib/adminDashboard';
import MoneyTab from './_components/MoneyTab';
import CustomersTab from './_components/CustomersTab';
import BouquetsTab from './_components/BouquetsTab';
import WarehouseTab from './_components/WarehouseTab';

export const metadata = { title: 'Аналитика' };

const TABS = [
  { key: 'money', label: 'Деньги' },
  { key: 'customers', label: 'Клиенты' },
  { key: 'bouquets', label: 'Букеты в магазине' },
  { key: 'warehouse', label: 'Склад' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

interface Props {
  searchParams: DashboardSearchParams & {
    tab?: string; metric?: string; segment?: string; bonusView?: string; woSort?: string;
  };
}

export default async function AdminDashboardPage({ searchParams }: Props) {
  const tab: TabKey = (TABS.find((t) => t.key === searchParams.tab)?.key || 'money') as TabKey;
  const defaults = currentMonthRange();
  const from = searchParams.from || defaults.from;
  const to = searchParams.to || defaults.to;

  const [money, customers, bouquets, warehouse] = await Promise.all([
    tab === 'money' ? getMoneyDashboard(searchParams) : Promise.resolve(null),
    tab === 'customers' ? getCustomersDashboard(searchParams) : Promise.resolve(null),
    tab === 'bouquets' ? getBouquetsDashboard(searchParams) : Promise.resolve(null),
    tab === 'warehouse' ? getWarehouseDashboard(searchParams) : Promise.resolve(null),
  ]);

  const active = money || customers || bouquets || warehouse;
  const updatedAt = active ? new Date(active.updatedAt).toLocaleString('ru-RU') : '—';

  return (
    <div>
      <div className="admin-dash-topbar">
        <div className="admin-dash-topbar__left">
          <h1 className="admin-title" style={{ margin: 0 }}>Floree</h1>
          {/* Касса — оперативный остаток кассы не отслеживается ни в одной
              таблице, честно показываем 0 (см. финальный отчёт). */}
          <span className="admin-dash-topbar__till">В кассе <strong>0 ₽</strong></span>
          <div className="admin-dash-topbar__links">
            <span className="admin-dash-link admin-dash-link--disabled" title="Раздел ещё не реализован">Инструкция</span>
            <span className="admin-dash-link admin-dash-link--disabled" title="Раздел ещё не реализован">Настройки точки продаж</span>
          </div>
        </div>
        <div className="admin-dashboard-header__meta">Данные обновлены: {updatedAt}</div>
      </div>

      <div className="admin-dashboard-header" style={{ marginBottom: 8 }}>
        <nav className="admin-subtabs">
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={`/admin/retail-stores?tab=${t.key}&from=${from}&to=${to}`}
              className={`admin-subtab ${tab === t.key ? 'admin-subtab--active' : ''}`}
            >
              {t.label}
            </Link>
          ))}
        </nav>
        <form method="GET" action="/admin/retail-stores" className="admin-period-form">
          <input type="hidden" name="tab" value={tab} />
          <input type="date" name="from" defaultValue={from} />
          <span>—</span>
          <input type="date" name="to" defaultValue={to} />
          <button type="submit" className="admin-btn admin-btn--primary">Применить</button>
        </form>
      </div>

      {tab === 'money' && (
        money ? (
          <MoneyTab
            data={money}
            from={from}
            to={to}
            metric={(searchParams.metric as 'shipment' | 'payment' | 'margin') || 'shipment'}
          />
        ) : <div className="admin-empty">Не удалось загрузить аналитику.</div>
      )}
      {tab === 'customers' && (
        customers ? (
          <CustomersTab
            data={customers}
            from={from}
            to={to}
            segment={(searchParams.segment as 'regular' | 'new' | 'anon') || 'regular'}
            bonusView={(searchParams.bonusView as 'accrued' | 'spent') || 'accrued'}
          />
        ) : <div className="admin-empty">Не удалось загрузить аналитику.</div>
      )}
      {tab === 'bouquets' && (
        bouquets ? <BouquetsTab data={bouquets} /> : <div className="admin-empty">Не удалось загрузить аналитику.</div>
      )}
      {tab === 'warehouse' && (
        warehouse ? (
          <WarehouseTab
            data={warehouse}
            from={from}
            to={to}
            woSort={(searchParams.woSort as 'amount' | 'quantity') || 'amount'}
          />
        ) : <div className="admin-empty">Не удалось загрузить аналитику.</div>
      )}
    </div>
  );
}
