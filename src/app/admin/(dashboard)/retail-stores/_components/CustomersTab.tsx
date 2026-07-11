import { CustomersDashboard } from '@/types';
import { fmtMoney, fmtNum, DashTile, LineChart } from './shared';

type Segment = 'regular' | 'new' | 'anon';
type BonusView = 'accrued' | 'spent';

function href(from: string, to: string, extra: Record<string, string>): string {
  const qs = new URLSearchParams({ tab: 'customers', from, to, ...extra });
  return `/admin/retail-stores?${qs.toString()}`;
}

function SegmentCard({
  title, hint, count, ctaLabel,
}: { title: string; hint: string; count: number; ctaLabel: string }) {
  return (
    <div className="admin-segment-card">
      <div className="admin-segment-card__title">
        {title}
        <span className="admin-segment-card__hint" title={hint}>?</span>
      </div>
      <div className="admin-segment-card__value">{fmtNum(count)} клиентов</div>
      <div className="admin-segment-card__desc">{hint}</div>
      <button
        type="button"
        disabled
        className={`admin-segment-card__btn ${count === 0 ? 'admin-segment-card__btn--zero' : ''}`}
      >
        {ctaLabel}
      </button>
    </div>
  );
}

const SEGMENT_LABELS: Record<Segment, string> = { regular: 'Постоянные', new: 'Новые', anon: 'Обезличенные' };
const BONUS_LABELS: Record<BonusView, string> = { accrued: 'накоплено клиентами', spent: 'потрачено клиентами' };

export default function CustomersTab({
  data, from, to, segment, bonusView,
}: {
  data: CustomersDashboard; from: string; to: string; segment: Segment; bonusView: BonusView;
}) {
  const salesSeries = data.salesBySegment[segment];
  const bonusSeries = data.bonusSystem[bonusView];

  return (
    <div>
      <p className="admin-section-title" style={{ marginTop: 0 }}>Сегментация клиентов</p>
      <div className="admin-segment-grid">
        <SegmentCard
          title="Разовые покупатели"
          hint="Клиенты, оформившие ровно 1 заказ за всё время."
          count={data.segments.onceOnly.count}
          ctaLabel="Отправить Push/SMS"
        />
        <SegmentCard
          title="Без покупок"
          hint="Клиенты в базе, у которых ещё нет ни одного заказа."
          count={data.segments.noPurchases.count}
          ctaLabel="Отправить Push/SMS"
        />
        <SegmentCard
          title="Риск оттока"
          hint="2+ заказа за всё время, но не было заказов 12+ месяцев."
          count={data.segments.churnRisk.count}
          ctaLabel="Отправить Push/SMS"
        />
        <SegmentCard
          title="Активные постоянные"
          hint="5+ заказов за всё время, последний заказ — в пределах года."
          count={data.segments.activeRegular.count}
          ctaLabel="Отправить Push/SMS"
        />
      </div>

      <div className="admin-dash-columns">
        <div className="admin-dash-side" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <section className="admin-panel">
            <p className="admin-panel__title">+{fmtNum(data.newCustomers.count)} клиентов добавлено в базу</p>
            <div className="admin-line-chart-wrap">
              <LineChart days={data.newCustomers.days} totalLabel={`Всего новых: ${fmtNum(data.newCustomers.count)}`} />
            </div>
          </section>
          <DashTile title="Заказов закрыто с привязанным клиентом" value={`${data.ordersWithCustomerPct}%`} />
        </div>

        <div className="admin-dash-side">
          <div className="admin-dash-tile admin-dash-tile--orange">
            <div className="admin-dash-tile__title">Клиентов за всё время</div>
            <div className="admin-dash-tile__value">{fmtNum(data.allTime.customersCount)}</div>
          </div>
          <DashTile title="Бонусов всего в системе" value={fmtNum(data.allTime.bonusesTotal)} />
          <DashTile
            title="Эффективность бонусной системы"
            value={data.allTime.bonusEfficiencyPct === null ? '—' : `${data.allTime.bonusEfficiencyPct}%`}
          />
          <DashTile title="Событий всего в базе" value={fmtNum(data.allTime.eventsTotal)} />
          <DashTile title="Карточек с событиями" value={`${data.allTime.eventsCoveragePct}%`} />
        </div>
      </div>

      <p className="admin-section-title">Покупатели</p>
      <div className="admin-table-wrap">
        {data.buyerTypes.every((b) => b.count === 0) ? (
          <div className="admin-empty">Заказов за период нет.</div>
        ) : (
          <table className="admin-table">
            <thead>
              <tr><th>Тип клиентов</th><th>Продажи</th><th>Средний чек</th><th>Доля продаж</th></tr>
            </thead>
            <tbody>
              {data.buyerTypes.map((b) => (
                <tr key={b.type}>
                  <td>{b.title}</td>
                  <td>{fmtMoney(b.sales)}</td>
                  <td>{fmtMoney(b.avgCheck)}</td>
                  <td>{b.sharePct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p className="admin-section-title">Продажи по сегментам</p>
      <div className="admin-radio-tiles">
        {(['regular', 'new', 'anon'] as Segment[]).map((key) => (
          <a
            key={key}
            href={href(from, to, { segment: key, bonusView })}
            className={`admin-radio-tile ${segment === key ? 'admin-radio-tile--selected' : ''}`}
          >
            <div className="admin-radio-tile__value">{fmtMoney(data.salesBySegment[key].total)}</div>
            <div className="admin-radio-tile__label">{SEGMENT_LABELS[key]}</div>
          </a>
        ))}
      </div>
      <section className="admin-panel">
        <div className="admin-line-chart-wrap">
          <LineChart days={salesSeries.days} totalLabel={`Продажи: ${fmtMoney(salesSeries.total)}`} />
        </div>
      </section>

      <p className="admin-section-title">Бонусная система</p>
      <div className="admin-radio-tiles">
        {(['accrued', 'spent'] as BonusView[]).map((key) => (
          <a
            key={key}
            href={href(from, to, { segment, bonusView: key })}
            className={`admin-radio-tile ${bonusView === key ? 'admin-radio-tile--selected' : ''}`}
          >
            <div className="admin-radio-tile__value">{fmtNum(data.bonusSystem[key].total)}</div>
            <div className="admin-radio-tile__label">Бонусов {BONUS_LABELS[key]}</div>
          </a>
        ))}
      </div>
      <div className="admin-dash-columns">
        <section className="admin-panel">
          <div className="admin-line-chart-wrap">
            <LineChart days={bonusSeries.days} totalLabel={`Всего: ${fmtNum(bonusSeries.total)}`} />
          </div>
        </section>
        <DashTile
          title="Эффективность бонусной системы за период"
          value={data.bonusSystem.efficiencyPct === null ? '—' : `${data.bonusSystem.efficiencyPct}%`}
        />
      </div>
    </div>
  );
}
