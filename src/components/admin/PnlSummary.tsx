import { FinancePnl } from '@/types';
import { fmtMoney } from '@/lib/format';

interface Props {
  pnl: FinancePnl | null;
}

// «Прибыль и убытки» (admin-map §2.4.7): «Валовая прибыль − Внесённые
// расходы − Списания со склада = Чистая прибыль». Cost-of-goods isn't known
// for every sold line (only items with a StockBalance.cost_price row do) —
// the summary says so plainly instead of pretending the number is exact.
export default function PnlSummary({ pnl }: Props) {
  if (!pnl) {
    return <div className="admin-table-wrap"><div className="admin-empty">Не удалось загрузить данные P&L.</div></div>;
  }

  const coverageIncomplete = pnl.totalItems > 0 && pnl.coveredItems < pnl.totalItems;

  return (
    <div className="admin-table-wrap" style={{ padding: 24 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 20 }}>
        <PnlTile label="Выручка" value={pnl.revenue} />
        <PnlTile label="Себестоимость" value={pnl.costOfGoods} />
        <PnlTile label="Валовая прибыль" value={pnl.grossProfit} emphasize />
        <PnlTile label="Внесённые расходы" value={pnl.expensesTotal} negative />
        <PnlTile label="Списания со склада" value={pnl.writeoffsTotal} negative />
        <PnlTile label="Чистая прибыль" value={pnl.netProfit} emphasize />
      </div>

      <p style={{ fontSize: 14, color: 'var(--admin-text-2)', margin: '0 0 8px' }}>
        Валовая прибыль − Внесённые расходы − Списания со склада = Чистая прибыль:&nbsp;
        {fmtMoney(pnl.grossProfit)} − {fmtMoney(pnl.expensesTotal)} − {fmtMoney(pnl.writeoffsTotal)} = {fmtMoney(pnl.netProfit)}
      </p>

      {coverageIncomplete && (
        <p className="admin-form-error" style={{ marginTop: 12 }}>
          Себестоимость известна для {pnl.coveredItems} из {pnl.totalItems} проданных позиций — по остальным нет
          цены закупки (StockBalance.cost_price), они учтены как 0 ₽. Валовая прибыль может быть завышена.
        </p>
      )}
    </div>
  );
}

function PnlTile({ label, value, emphasize, negative }: { label: string; value: number; emphasize?: boolean; negative?: boolean }) {
  return (
    <div style={{ padding: 14, borderRadius: 10, background: 'var(--admin-field-bg)' }}>
      <div style={{ fontSize: 12, color: 'var(--admin-text-2)', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: emphasize ? 22 : 18, fontWeight: emphasize ? 700 : 600 }}>
        {negative && value > 0 ? '−' : ''}{fmtMoney(Math.abs(value))}
      </div>
    </div>
  );
}
