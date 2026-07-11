import { BouquetsDashboard } from '@/types';
import { fmtMoney, fmtNum, DashTile, WeekdayChart, HourlyChart } from './shared';

export default function BouquetsTab({ data }: { data: BouquetsDashboard }) {
  return (
    <div>
      <div className="admin-dash-tile admin-dash-tile--green" style={{ marginBottom: 20 }}>
        <div className="admin-dash-tile__row" style={{ gap: 24, flexWrap: 'wrap' }}>
          <div>
            <div className="admin-dash-tile__title">Выручка по отгрузкам</div>
            <div className="admin-dash-tile__value" style={{ fontSize: 26 }}>{fmtMoney(data.revenue)}</div>
          </div>
          <div>
            <div className="admin-dash-tile__title">Средняя стоимость букета</div>
            <div className="admin-dash-tile__value" style={{ fontSize: 26 }}>{fmtMoney(data.avgPrice)}</div>
          </div>
          <div>
            <div className="admin-dash-tile__title">Маржинальность витрины</div>
            <div className="admin-dash-tile__value" style={{ fontSize: 26 }}>—</div>
          </div>
        </div>
      </div>

      <div className="admin-dash-tiles">
        <DashTile title="Букетов продано" value={fmtNum(data.bouquetsSold)} />
        <DashTile title="Продано с доставкой" value={fmtNum(data.soldWithDelivery)} />
        <DashTile title="Букетов в день в среднем" value={fmtNum(Math.round(data.avgPerDay * 10) / 10)} />
      </div>

      <p className="admin-section-title">Продажи букетов по дням</p>
      <section className="admin-panel">
        <WeekdayChart data={data.weekday} />
      </section>

      <p className="admin-section-title">Продажи внутри дня</p>
      <section className="admin-panel">
        <div className="admin-line-chart-wrap">
          <HourlyChart hours={data.hourly} />
        </div>
      </section>

      <div className="admin-dash-columns">
        <div>
          <p className="admin-section-title" style={{ marginTop: 0 }}>Рейтинг по стоимости букета</p>
          <div className="admin-table-wrap">
            {data.priceRanking.every((r) => r.sold === 0) ? (
              <div className="admin-empty">Продаж за период нет.</div>
            ) : (
              <table className="admin-table">
                <thead><tr><th>Диапазон</th><th>Продано</th><th>Выручка</th></tr></thead>
                <tbody>
                  {data.priceRanking.map((r) => (
                    <tr key={r.label}>
                      <td>{r.label}</td>
                      <td>{fmtNum(r.sold)}</td>
                      <td>{fmtMoney(r.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div>
          <p className="admin-section-title" style={{ marginTop: 0 }}>Продукты, топ-5</p>
          <div className="admin-table-wrap">
            {data.topProducts.length === 0 ? (
              <div className="admin-empty">Товаров в составе заказов за период нет.</div>
            ) : (
              <table className="admin-table">
                <thead><tr><th>Товар</th><th>Продано</th><th>Выручка</th></tr></thead>
                <tbody>
                  {data.topProducts.map((p) => (
                    <tr key={p.title}>
                      <td>{p.title}</td>
                      <td>{fmtNum(p.sold)}</td>
                      <td>{fmtMoney(p.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div className="admin-order-note">
            Показана выручка по товару, не прибыль — себестоимость товаров склад не отслеживает.
          </div>
        </div>
      </div>
    </div>
  );
}
