import Link from 'next/link';
import { buildInventoryHref, getStockOverview, InventorySearchParams, PAGE_SIZE } from '@/lib/adminInventory';
import { getCategories } from '@/lib/adminCatalog';
import { getStores } from '@/lib/adminOrders';
import WarehouseNav from '@/components/admin/WarehouseNav';
import { fmtMoney } from '@/lib/format';

export const metadata = { title: 'Обзор склада' };

interface Props {
  searchParams: InventorySearchParams;
}

// Остатки номенклатуры по точке (admin-map §2.4.1). Данные — наш складской
// журнал (/v1/stock): инвентаризация задаёт остатки, продажи POS списывают.
export default async function AdminWarehousePage({ searchParams }: Props) {
  const [stores, categories] = await Promise.all([getStores(), getCategories()]);
  const storeId = stores[0]?.id || '';
  const { rows, totals } = storeId
    ? await getStockOverview(storeId, searchParams)
    : { rows: [], totals: { qty: 0, costSum: 0, retailSum: 0 } };

  const page = Math.max(1, parseInt(searchParams.page || '1', 10) || 1);
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const shown = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div>
      <WarehouseNav active="/admin/warehouse" />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="admin-title" style={{ marginBottom: 0 }}>Обзор склада</h1>
        <Link href="/admin/warehouse/inventory" className="admin-btn admin-btn--primary" style={{ marginBottom: 16 }}>
          Инвентаризация
        </Link>
      </div>

      <form method="GET" action="/admin/warehouse" className="admin-search" style={{ alignItems: 'center' }}>
        <select name="category" defaultValue={searchParams.category || ''} className="admin-inline-select">
          <option value="">Укажите категорию</option>
          {categories.filter((c) => !c.attributes.deleted).map((c) => (
            <option key={c.id} value={c.id}>{c.attributes.title}</option>
          ))}
        </select>
        <input type="text" name="q" defaultValue={searchParams.q || ''} placeholder="Укажите название, артикул…" style={{ flex: 1 }} />
        <button type="submit" className="admin-btn admin-btn--primary">Найти</button>
      </form>

      {shown.length === 0 ? (
        <div className="admin-table-wrap"><div className="admin-empty">Товары не найдены — попробуйте изменить фильтры.</div></div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Название</th>
                <th>Остатки, шт</th>
                <th>Розничная цена</th>
                <th>Остатки, деньги</th>
                <th>Себестоимость</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((row) => {
                const a = row.attributes;
                return (
                  <tr key={row.id}>
                    <td>{a.title}</td>
                    <td style={a.quantity < 0 ? { color: '#B3261E', fontWeight: 600 } : undefined}>
                      {a.quantity}
                    </td>
                    <td>{fmtMoney(a.retailPrice)}</td>
                    <td>{fmtMoney(a.retailSum)}</td>
                    <td>{a.costPrice ? fmtMoney(a.costPrice) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td>Итого: {rows.length} поз.</td>
                <td>{totals.qty}</td>
                <td>—</td>
                <td>{fmtMoney(totals.retailSum)}</td>
                <td>{totals.costSum ? fmtMoney(totals.costSum) : '—'}</td>
              </tr>
            </tfoot>
          </table>

          <div className="admin-pagination">
            <span>Найдено товаров: {rows.length}</span>
            <div className="admin-pagination__pages">
              {Array.from({ length: pageCount }, (_, i) => i + 1)
                .filter((p) => p === 1 || p === pageCount || Math.abs(p - page) <= 2)
                .map((p, idx, arr) => (
                  <span key={p} style={{ display: 'flex', alignItems: 'center' }}>
                    {idx > 0 && arr[idx - 1] !== p - 1 && <span style={{ padding: '0 2px' }}>…</span>}
                    {p === page ? (
                      <span className="admin-pagination__current">{p}</span>
                    ) : (
                      <Link href={buildInventoryHref('/admin/warehouse', searchParams, { page: String(p) })}>{p}</Link>
                    )}
                  </span>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
