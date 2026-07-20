import Link from 'next/link';
import { getInventoryItems, buildInventoryHref, InventorySearchParams, PAGE_SIZE } from '@/lib/adminInventory';
import { getCategories } from '@/lib/adminCatalog';
import WarehouseNav from '@/components/admin/WarehouseNav';
import { fmtMoney } from '@/lib/format';

export const metadata = { title: 'Обзор склада' };

interface Props {
  searchParams: InventorySearchParams;
}

export default async function AdminWarehousePage({ searchParams }: Props) {
  const [{ items, total }, categories] = await Promise.all([
    getInventoryItems(searchParams),
    getCategories(),
  ]);
  const page = Math.max(1, parseInt(searchParams.page || '1', 10) || 1);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <WarehouseNav active="/admin/warehouse" />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="admin-title" style={{ marginBottom: 0 }}>Обзор склада</h1>
        <button className="admin-btn" disabled title="Пока недоступно" style={{ height: 36, marginBottom: 16 }}>
          Экспортировать продукты
        </button>
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

      {items.length === 0 ? (
        <div className="admin-table-wrap"><div className="admin-empty">Товары не найдены — попробуйте изменить фильтры.</div></div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Название</th>
                <th>Остатки, шт</th>
                <th>Цены</th>
                <th>Резерв</th>
                <th>Остатки, деньги</th>
                <th>Себестоимость</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const a = item.attributes;
                const priceRange = a.priceMin === a.priceMax ? fmtMoney(a.priceMin) : `${fmtMoney(a.priceMin)} – ${fmtMoney(a.priceMax)}`;
                return (
                  <tr key={item.id}>
                    <td>{a.title}</td>
                    {/* Остатки/резерв/себестоимость: backend/app/inventory_models.py
                        has a StockBalance model, but no /v1 endpoint exposes it
                        yet — these columns populate once an ETL job fills
                        stock_balances and a router serializes it. */}
                    <td>—</td>
                    <td>{priceRange}</td>
                    <td>—</td>
                    <td>—</td>
                    <td>—</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td>Итого: {total} поз.</td>
                <td>—</td>
                <td>—</td>
                <td>—</td>
                <td>—</td>
                <td>—</td>
              </tr>
            </tfoot>
          </table>

          <div className="admin-pagination">
            <span>Найдено товаров: {total}</span>
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
