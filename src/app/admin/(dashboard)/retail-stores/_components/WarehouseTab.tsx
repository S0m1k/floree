import { WarehouseDashboard } from '@/types';
import { fmtMoney, fmtNum, DashTile } from './shared';

type WoSort = 'amount' | 'quantity';

function href(from: string, to: string, extra: Record<string, string>): string {
  const qs = new URLSearchParams({ tab: 'warehouse', from, to, ...extra });
  return `/admin/retail-stores?${qs.toString()}`;
}

export default function WarehouseTab({
  data, from, to, woSort,
}: {
  data: WarehouseDashboard; from: string; to: string; woSort: WoSort;
}) {
  const writtenOff = woSort === 'quantity' ? data.writtenOffTop.byQuantity : data.writtenOffTop.byAmount;

  return (
    <div className="admin-dash-columns">
      <div>
        <p className="admin-section-title" style={{ marginTop: 0 }}>Сумма закупок по приходным накладным</p>
        <div className="admin-table-wrap">
          {data.purchasesByCategory.length === 0 ? (
            <div className="admin-empty">Приходных накладных за период нет.</div>
          ) : (
            <table className="admin-table">
              <thead><tr><th>Категории</th><th>Сумма накладных</th></tr></thead>
              <tbody>
                {data.purchasesByCategory.map((c) => (
                  <tr key={c.category}><td>{c.category}</td><td>{fmtMoney(c.amount)}</td></tr>
                ))}
              </tbody>
              <tfoot><tr><td>Итого</td><td>{fmtMoney(data.totalPurchases)}</td></tr></tfoot>
            </table>
          )}
        </div>

        <p className="admin-section-title">Списания по причинам</p>
        <div className="admin-table-wrap">
          {data.writeOffsByReason.length === 0 ? (
            <div className="admin-empty">Списаний за период нет.</div>
          ) : (
            <table className="admin-table">
              <thead><tr><th>Все списания</th><th>Сумма</th><th>Доля</th></tr></thead>
              <tbody>
                {data.writeOffsByReason.map((r) => (
                  <tr key={r.reason}>
                    <td>{r.reason}</td>
                    <td>{fmtMoney(r.amount)}</td>
                    <td>{r.sharePct}%</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr><td>Сумма списаний</td><td colSpan={2}>{fmtMoney(data.totalWriteOffs)}</td></tr></tfoot>
            </table>
          )}
        </div>

        <div className="admin-dash-tiles">
          <DashTile title="Излишки инвентаризации" value={fmtMoney(data.inventoryResult.surplus)} />
          <DashTile title="Недостачи по инвентаризации" value={fmtMoney(data.inventoryResult.shortage)} />
          <div className="admin-dash-tile admin-dash-tile--green">
            <div className="admin-dash-tile__title">Результат для магазина</div>
            <div className="admin-dash-tile__value">{fmtMoney(data.inventoryResult.net)}</div>
          </div>
        </div>

        <p className="admin-section-title">Списанные товары</p>
        <div className="admin-radio-tiles" style={{ marginBottom: 8 }}>
          <a
            href={href(from, to, { woSort: 'amount' })}
            className={`admin-radio-tile ${woSort === 'amount' ? 'admin-radio-tile--selected' : ''}`}
            style={{ flex: '0 0 160px', textAlign: 'center' }}
          >
            <div className="admin-radio-tile__label">По сумме</div>
          </a>
          <a
            href={href(from, to, { woSort: 'quantity' })}
            className={`admin-radio-tile ${woSort === 'quantity' ? 'admin-radio-tile--selected' : ''}`}
            style={{ flex: '0 0 160px', textAlign: 'center' }}
          >
            <div className="admin-radio-tile__label">По количеству</div>
          </a>
          <select className="admin-select-disabled" disabled defaultValue="">
            <option value="">
              {data.writtenOffTop.reasons.length === 0 ? 'Все причины' : 'Все причины'}
            </option>
          </select>
        </div>
        <div className="admin-table-wrap">
          {writtenOff.length === 0 ? (
            <div className="admin-empty">Списаний за период нет.</div>
          ) : (
            <table className="admin-table">
              <thead><tr><th>Цветы</th><th>Списано</th><th>Доля</th></tr></thead>
              <tbody>
                {writtenOff.map((i) => (
                  <tr key={i.title}>
                    <td>{i.title}</td>
                    <td>{woSort === 'quantity' ? fmtNum(i.quantity) : fmtMoney(i.amount)}</td>
                    <td>{i.sharePct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="admin-dash-side">
        <div className="admin-dash-tile admin-dash-tile--orange">
          <div className="admin-dash-tile__title">Остатки в деньгах (в розничных ценах)</div>
          <div className="admin-dash-tile__value">{fmtMoney(data.right.stockRetailValue)}</div>
        </div>
        <DashTile title="Процент списания" value={`${data.right.writeOffPct}%`} />
        <DashTile title="Остатки цветов (себестоимость)" value={fmtMoney(data.right.stockFlowersCost)} />
        <DashTile title="Остатки других товаров (себестоимость)" value={fmtMoney(data.right.stockOtherCost)} />
        <DashTile title="Накладных на списание" value={fmtNum(data.right.writeOffInvoicesCount)} />
        <DashTile title="Приходных накладных сформировано" value={fmtNum(data.right.packingInvoicesCount)} />
        <DashTile title="Инвентаризаций проведено" value={fmtNum(data.right.inventoryActsCount)} />
      </div>
    </div>
  );
}
