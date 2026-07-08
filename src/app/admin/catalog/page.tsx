import Link from 'next/link';
import { getInventoryItems, getMeasures, buildInventoryHref, InventorySearchParams, PAGE_SIZE } from '@/lib/adminInventory';
import { getCategories } from '@/lib/adminCatalog';
import WarehouseNav from '@/components/admin/WarehouseNav';
import { fmtMoney } from '@/lib/format';

export const metadata = { title: 'Каталог товаров и услуг' };

interface Props {
  searchParams: InventorySearchParams;
}

export default async function AdminCatalogPage({ searchParams }: Props) {
  const [{ items, total }, categories, measures] = await Promise.all([
    getInventoryItems(searchParams),
    getCategories(),
    getMeasures(),
  ]);
  const categoriesById = Object.fromEntries(categories.map((c) => [c.id, c]));
  const measuresById = Object.fromEntries(measures.map((m) => [m.id, m]));

  const page = Math.max(1, parseInt(searchParams.page || '1', 10) || 1);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <WarehouseNav active="/admin/catalog" />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <h1 className="admin-title" style={{ marginBottom: 0 }}>Каталог товаров и услуг</h1>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <button className="admin-btn" disabled title="Пока недоступно">Создать продукт</button>
          <button className="admin-btn" disabled title="Пока недоступно">Экспортировать продукты</button>
          <button className="admin-btn" disabled title="Пока недоступно">Сгенерировать штрих-коды</button>
        </div>
      </div>

      <form method="GET" action="/admin/catalog" className="admin-search" style={{ alignItems: 'center' }}>
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
                <th>Категория</th>
                <th>Цены</th>
                <th>Единица измерения</th>
                <th>Активность</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const a = item.attributes;
                const categoryId = item.relationships.category?.data?.id;
                const measureId = item.relationships.measure?.data?.id;
                const priceRange = a.priceMin === a.priceMax ? fmtMoney(a.priceMin) : `${fmtMoney(a.priceMin)} – ${fmtMoney(a.priceMax)}`;
                return (
                  <tr key={item.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        {/* No photo: /v1/inventory-items doesn't include image
                            resources in the list response yet (see
                            backend/app/routers/v1_inventory.py) — placeholder
                            icon until the backend adds a `logo` include. */}
                        <span className="admin-table-thumb">
                          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>inventory_2</span>
                        </span>
                        {a.title}
                      </div>
                    </td>
                    <td>{categoryId ? categoriesById[categoryId]?.attributes.title || '—' : '—'}</td>
                    <td>{priceRange}</td>
                    <td>{measureId ? measuresById[measureId]?.attributes.title || '—' : '—'}</td>
                    <td>
                      <span className={`admin-doc-status admin-doc-status--${a.public ? 'posted' : 'draft'}`}>
                        {a.public ? 'Активен' : 'Неактивен'}
                      </span>
                    </td>
                    <td><button className="admin-btn" disabled style={{ height: 28, padding: '0 8px' }}>⋮</button></td>
                  </tr>
                );
              })}
            </tbody>
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
                      <Link href={buildInventoryHref('/admin/catalog', searchParams, { page: String(p) })}>{p}</Link>
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
