import { MoneyDashboard } from '@/types';
import { fmtMoney, RadioMetricCard, DashTile, LineChart } from './shared';

type Metric = 'shipment' | 'payment' | 'margin';

function buildHref(from: string, to: string, metric: Metric): string {
  const qs = new URLSearchParams({ from, to, metric });
  return `/admin/retail-stores?${qs.toString()}`;
}

export default function MoneyTab({
  data, from, to, metric,
}: {
  data: MoneyDashboard; from: string; to: string; metric: Metric;
}) {
  const days = data.dailySeries[metric] || [];

  return (
    <div>
      <div className="admin-metric-grid">
        <RadioMetricCard
          label="Выручка по отгрузке"
          value={fmtMoney(data.revenueByShipment.amount)}
          deltaPct={data.revenueByShipment.changePct}
          href={buildHref(from, to, 'shipment')}
          selected={metric === 'shipment'}
        />
        <RadioMetricCard
          label="Выручка по оплате"
          value={fmtMoney(data.revenueByPayment.amount)}
          deltaPct={data.revenueByPayment.changePct}
          href={buildHref(from, to, 'payment')}
          selected={metric === 'payment'}
        />
        <RadioMetricCard
          label="Валовая прибыль"
          value="—"
          href={buildHref(from, to, 'margin')}
          selected={metric === 'margin'}
          unavailable
        />
      </div>

      <div className="admin-dash-columns">
        <section className="admin-panel">
          <p className="admin-panel__title">
            {metric === 'shipment' && 'Выручка по отгрузке — по дням'}
            {metric === 'payment' && 'Выручка по оплате — по дням'}
            {metric === 'margin' && 'Валовая прибыль — по дням'}
          </p>
          <div className="admin-line-chart-wrap">
            <LineChart days={days} />
          </div>
        </section>

        <div className="admin-dash-side">
          <div className="admin-dash-tile admin-dash-tile--green">
            <div className="admin-dash-tile__title">Заказы / Средний чек</div>
            <div className="admin-dash-tile__row">
              <span className="admin-dash-tile__value">{data.ordersCount}</span>
              <span className="admin-dash-tile__value">{fmtMoney(data.avgCheck)}</span>
            </div>
          </div>
          <div className="admin-dash-tile admin-dash-tile--orange">
            <div className="admin-dash-tile__title">Возвраты / Возвраты в деньгах</div>
            <div className="admin-dash-tile__row">
              <span className="admin-dash-tile__value">{data.returnsCount}</span>
              <span className="admin-dash-tile__value">{fmtMoney(data.returnsAmount)}</span>
            </div>
          </div>
          <DashTile title="Напечатано чеков" value={String(data.receiptsPrinted)} />
          <DashTile title="Суммарная скидка" value={fmtMoney(data.totalDiscount)} />
          <DashTile title="Маржинальность бизнеса за период" value="—" />
        </div>
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
            const [y, m, day] = d.date.split('-').map(Number);
            const date = new Date(y, m - 1, day);
            const WEEKDAYS = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
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
