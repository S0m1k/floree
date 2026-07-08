import { getMoneyDashboard, DashboardSearchParams } from '@/lib/adminDashboard';

export const metadata = { title: 'Аналитика' };

const fmtMoney = (n: number) => new Intl.NumberFormat('ru-RU').format(Math.round(n)) + ' ₽';
const fmtDelta = (pct: number | null) => {
  if (pct === null) return null;
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${pct}% к прошлому периоду`;
};

interface Props {
  searchParams: DashboardSearchParams;
}

function MetricCard({ label, value, deltaPct }: { label: string; value: string; deltaPct?: number | null }) {
  const delta = deltaPct !== undefined ? fmtDelta(deltaPct) : null;
  return (
    <div className="admin-metric-card">
      <div className="admin-metric-card__label">{label}</div>
      <div className="admin-metric-card__value">{value}</div>
      {delta && (
        <div className={`admin-metric-card__delta ${(deltaPct || 0) >= 0 ? 'admin-metric-card__delta--up' : 'admin-metric-card__delta--down'}`}>
          {delta}
        </div>
      )}
    </div>
  );
}

function UnavailableCard({ label }: { label: string }) {
  return (
    <div className="admin-metric-card">
      <div className="admin-metric-card__label">{label}</div>
      <div className="admin-metric-card__value admin-metric-card__value--muted">Нет данных</div>
    </div>
  );
}

const WEEKDAYS = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

export default async function AdminDashboardPage({ searchParams }: Props) {
  const data = await getMoneyDashboard(searchParams);

  if (!data) {
    return <div className="admin-empty">Не удалось загрузить аналитику.</div>;
  }

  return (
    <div>
      <div className="admin-dashboard-header">
        <div>
          <h1 className="admin-title" style={{ marginBottom: 4 }}>Floree</h1>
          <div className="admin-dashboard-header__meta">
            Данные обновлены: {new Date(data.updatedAt).toLocaleString('ru-RU')}
          </div>
        </div>
        <form method="GET" action="/admin/retail-stores" className="admin-period-form">
          <input type="date" name="from" defaultValue={data.period.from} />
          <span>—</span>
          <input type="date" name="to" defaultValue={data.period.to} />
          <button type="submit" className="admin-btn admin-btn--primary">Применить</button>
        </form>
      </div>

      <nav className="admin-subtabs">
        <span className="admin-subtab admin-subtab--active">Деньги</span>
        <span className="admin-subtab admin-subtab--disabled" title="Раздел ещё не реализован">Клиенты</span>
        <span className="admin-subtab admin-subtab--disabled" title="Раздел ещё не реализован">Букеты в магазине</span>
        <span className="admin-subtab admin-subtab--disabled" title="Раздел ещё не реализован">Склад</span>
      </nav>

      <div className="admin-metric-grid">
        <MetricCard label="Выручка по отгрузке" value={fmtMoney(data.revenueByShipment.amount)} deltaPct={data.revenueByShipment.changePct} />
        <MetricCard label="Выручка по оплате" value={fmtMoney(data.revenueByPayment.amount)} deltaPct={data.revenueByPayment.changePct} />
        <UnavailableCard label="Валовая прибыль" />
        <MetricCard label="Заказы" value={String(data.ordersCount)} />
        <MetricCard label="Средний чек" value={fmtMoney(data.avgCheck)} />
        <MetricCard label="Возвраты" value={String(data.returnsCount)} />
        <MetricCard label="Возвраты в деньгах" value={fmtMoney(data.returnsAmount)} />
        <UnavailableCard label="Напечатано чеков" />
        <UnavailableCard label="Суммарная скидка" />
        <UnavailableCard label="Маржинальность бизнеса" />
      </div>

      <p className="admin-section-title">Сотрудники</p>
      <div className="admin-table-wrap">
        {data.employees.length === 0 ? (
          <div className="admin-empty">Нет заказов с назначенным флористом за период.</div>
        ) : (
          <table className="admin-table">
            <thead>
              <tr><th>Сотрудник</th><th>Средний чек</th><th>Продажи</th><th>Доля</th></tr>
            </thead>
            <tbody>
              {data.employees.map((e) => (
                <tr key={e.workerId || 'none'}>
                  <td>{e.name}</td>
                  <td>{fmtMoney(e.avgCheck)}</td>
                  <td>{fmtMoney(e.sales)}</td>
                  <td>{e.sharePct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <div>
          <p className="admin-section-title">Способы оплаты</p>
          <div className="admin-table-wrap">
            {data.paymentMethods.length === 0 ? (
              <div className="admin-empty">Платежей за период нет.</div>
            ) : (
              data.paymentMethods.map((m) => (
                <div key={m.title} className="admin-list-row">
                  <span>{m.title}</span>
                  <span>{fmtMoney(m.amount)}<span className="admin-list-row__share">{m.sharePct}%</span></span>
                </div>
              ))
            )}
          </div>
        </div>

        <div>
          <p className="admin-section-title">Источники сделки</p>
          <div className="admin-table-wrap">
            {data.dealSources.length === 0 ? (
              <div className="admin-empty">Заказов за период нет.</div>
            ) : (
              data.dealSources.map((s) => (
                <div key={s.title} className="admin-list-row">
                  <span>{s.title}</span>
                  <span>{fmtMoney(s.amount)}<span className="admin-list-row__share">{s.sharePct}%</span></span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <p className="admin-section-title">Обязательства — грядущие заказы на неделю</p>
      <div className="admin-table-wrap">
        <div className="admin-calendar">
          {data.upcomingWeek.map((d) => {
            // Parse the date-only string as a local date, not UTC — new Date("YYYY-MM-DD")
            // is parsed as UTC midnight per spec, which can land on the wrong local weekday.
            const [y, m, day] = d.date.split('-').map(Number);
            const date = new Date(y, m - 1, day);
            return (
              <div key={d.date} className="admin-calendar__day">
                <div className="admin-calendar__day-label">{WEEKDAYS[date.getDay()]} {date.getDate()}</div>
                <div className="admin-calendar__day-count">{d.ordersCount}</div>
              </div>
            );
          })}
        </div>
        <div className="admin-empty" style={{ padding: '0 16px 16px', textAlign: 'left' }}>
          Авансы, накопленные бонусы, долг клиентов и бюджеты в грядущих заказах пока не отслеживаются.
        </div>
      </div>
    </div>
  );
}
