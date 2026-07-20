import Link from 'next/link';
import WarehouseNav from '@/components/admin/WarehouseNav';
import ExpensesTable from '@/components/admin/ExpensesTable';
import PnlSummary from '@/components/admin/PnlSummary';
import { getExpenses, getFinancePnl, buildFinanceHref, FinancialAccountingSearchParams } from '@/lib/adminFinance';
import { getStores } from '@/lib/adminOrders';

export const metadata = { title: 'Финансовый учёт' };

interface Props {
  searchParams: FinancialAccountingSearchParams;
}

// «Финансовый учёт» (admin-map §2.4.7): «Список расходов» | «Прибыль и убытки».
export default async function AdminFinancialAccountingPage({ searchParams }: Props) {
  const tab = searchParams.tab === 'pnl' ? 'pnl' : 'expenses';
  const stores = await getStores();

  return (
    <div>
      <WarehouseNav active="/admin/financial-accounting" />
      <h1 className="admin-title">Финансовый учёт</h1>

      <nav className="admin-tabs">
        <Link
          href={buildFinanceHref(searchParams, { tab: undefined })}
          className={`admin-tab ${tab === 'expenses' ? 'admin-tab--active' : ''}`}
        >
          Список расходов
        </Link>
        <Link
          href={buildFinanceHref(searchParams, { tab: 'pnl' })}
          className={`admin-tab ${tab === 'pnl' ? 'admin-tab--active' : ''}`}
        >
          Прибыль и убытки
        </Link>
      </nav>

      <form method="GET" action="/admin/financial-accounting" className="admin-search" style={{ flexWrap: 'wrap' }}>
        {tab === 'pnl' && <input type="hidden" name="tab" value="pnl" />}
        <input type="date" name="from" defaultValue={searchParams.from || ''} aria-label="Период с" />
        <input type="date" name="to" defaultValue={searchParams.to || ''} aria-label="Период по" />
        <select name="store" defaultValue={searchParams.store || ''} className="admin-inline-select">
          <option value="">Все точки</option>
          {stores.map((s) => (
            <option key={s.id} value={s.id}>{s.attributes.title}</option>
          ))}
        </select>
        {tab === 'expenses' && (
          <input
            type="text" name="q" defaultValue={searchParams.q || ''}
            placeholder="Поиск по статье или комментарию…" style={{ flex: 1, minWidth: 180 }}
          />
        )}
        <button type="submit" className="admin-btn admin-btn--primary">Применить</button>
      </form>

      {tab === 'expenses' ? (
        <ExpensesSection searchParams={searchParams} stores={stores} />
      ) : (
        <PnlSection searchParams={searchParams} />
      )}
    </div>
  );
}

async function ExpensesSection({
  searchParams,
  stores,
}: {
  searchParams: FinancialAccountingSearchParams;
  stores: Awaited<ReturnType<typeof getStores>>;
}) {
  const { expenses, count, total } = await getExpenses(searchParams);
  const exportQs = new URLSearchParams();
  if (searchParams.from) exportQs.set('from', searchParams.from);
  if (searchParams.to) exportQs.set('to', searchParams.to);
  if (searchParams.store) exportQs.set('store', searchParams.store);
  if (searchParams.q) exportQs.set('q', searchParams.q);

  return (
    <ExpensesTable
      expenses={expenses}
      count={count}
      total={total}
      stores={stores}
      exportHref={`/admin/api/expenses/export${exportQs.toString() ? `?${exportQs.toString()}` : ''}`}
    />
  );
}

async function PnlSection({ searchParams }: { searchParams: FinancialAccountingSearchParams }) {
  const pnl = await getFinancePnl(searchParams);
  return <PnlSummary pnl={pnl} />;
}
