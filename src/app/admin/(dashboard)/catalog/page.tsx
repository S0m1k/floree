import Link from 'next/link';
import { getInventoryItems, getMeasures, buildInventoryHref, InventorySearchParams, PAGE_SIZE } from '@/lib/adminInventory';
import { getCategories } from '@/lib/adminCatalog';
import WarehouseNav from '@/components/admin/WarehouseNav';
import BouquetsNav from '@/components/admin/BouquetsNav';
import ItemRowActions from '@/components/admin/ItemRowActions';
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

  const exportQs = new URLSearchParams();
  if (searchParams.category) exportQs.set('category', searchParams.category);
  if (searchParams.q) exportQs.set('q', searchParams.q);
  const exportHref = `/admin/api/inventory-items/export${exportQs.toString() ? `?${exportQs.toString()}` : ''}`;

  return (
    <div>
      <BouquetsNav active="/admin/catalog" />
      {/* Also reachable from «Учёт и финансы» (warehouse) — this catalog
          screen is shared between both groups, so both tab-strips apply. */}
      <WarehouseNav active="/admin/catalog" />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <h1 className="admin-title" style={{ marginBottom: 0 }}>Каталог товаров и услуг</h1>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <Link href="/admin/catalog/create" className="admin-btn admin-btn--primary">Создать продукт</Link>
          <a href={exportHref} className="admin-btn">Экспортировать продукты</a>
          {/* Bulk barcode generation needs a row-selection UI the table doesn't
              have yet (admin-map §2.3.4 ☐ column) — per-row generation lives
              in each row's ⋮ menu (ItemRowActions) below instead. */}
          <button className="admin-btn" disabled title="Выберите товары в списке — пока доступно только по одному, через ⋮">Сгенерировать штрих-коды</button>
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
                <th>Связь со справочником</th>
                <th>В магазине</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const a = item.attributes;
                const categoryId = item.relationships.category?.data?.id;
                const measureId = item.relationships.measure?.data?.id;
                const priceRange = a.priceMin === a.priceMax ? fmtMoney(a.priceMin) : `${fmtMoney(a.priceMin)} – ${fmtMoney(a.priceMax)}`;
                const isActive = a.status !== 'off';
                return (
                  <tr key={item.id}>
                    <td>
                      <Link href={`/admin/catalog/${item.id}`} style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'inherit', textDecoration: 'none' }}>
                        {/* No photo: /v1/inventory-items doesn't include image
                            resources in the list response yet (see
                            backend/app/routers/v1_inventory.py) — placeholder
                            icon until the backend adds a `logo` include. */}
                        <span className="admin-table-thumb">
                          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>inventory_2</span>
                        </span>
                        {a.title}
                      </Link>
                    </td>
                    <td>{categoryId ? categoriesById[categoryId]?.attributes.title || '—' : '—'}</td>
                    <td>{priceRange}</td>
                    <td>{measureId ? measuresById[measureId]?.attributes.title || '—' : '—'}</td>
                    <td>
                      <span className={`admin-doc-status admin-doc-status--${isActive ? 'posted' : 'draft'}`}>
                        {isActive ? 'Активен' : 'Неактивен'}
                      </span>
                    </td>
                    <td>{a.globalId ? 'POSIFLORA' : 'Не связано'}</td>
                    <td>{a.public ? 'Добавлен' : 'Не добавлен'}</td>
                    <td><ItemRowActions item={item} /></td>
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
