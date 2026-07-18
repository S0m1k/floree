import Link from 'next/link';
import {
  getSpecifications, getCategories, buildSpecificationsHref,
  PAGE_SIZE, SpecificationsSearchParams, SPECIFICATION_SORT_OPTIONS,
} from '@/lib/adminCatalog';
import { getWorkers } from '@/lib/adminOrders';
import BouquetsNav from '@/components/admin/BouquetsNav';
import SpecificationsGrid from '@/components/admin/SpecificationsGrid';

export const metadata = { title: 'Рецепты' };

interface Props {
  searchParams: SpecificationsSearchParams;
}

export default async function AdminSpecificationsPage({ searchParams }: Props) {
  const [{ specifications, imagesById, tagsById, total }, categories, workers] = await Promise.all([
    getSpecifications(searchParams),
    getCategories(),
    getWorkers(),
  ]);

  const page = Math.max(1, parseInt(searchParams.page || '1', 10) || 1);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <BouquetsNav active="/admin/specifications" />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <h1 className="admin-title">Рецепты</h1>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <Link href="/admin/categories" className="admin-btn" style={{ height: 36 }}>Категории</Link>
          <Link href="/admin/specifications/create" className="admin-btn admin-btn--primary" style={{ height: 36 }}>
            Новый рецепт
          </Link>
        </div>
      </div>

      <nav className="admin-tabs">
        <Link
          href={buildSpecificationsHref(searchParams, { archive: undefined, page: undefined })}
          className={`admin-tab ${searchParams.archive !== 'true' ? 'admin-tab--active' : ''}`}
        >
          Рецепты
        </Link>
        <Link
          href={buildSpecificationsHref(searchParams, { archive: 'true', page: undefined })}
          className={`admin-tab ${searchParams.archive === 'true' ? 'admin-tab--active' : ''}`}
        >
          Архив рецептов
        </Link>
      </nav>

      <form method="GET" action="/admin/specifications" className="admin-search" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
        {searchParams.archive === 'true' && <input type="hidden" name="archive" value="true" />}
        <select name="category" defaultValue={searchParams.category || ''} className="admin-inline-select">
          <option value="">Все категории</option>
          {categories.filter((c) => !c.attributes.deleted).map((c) => (
            <option key={c.id} value={c.id}>{c.attributes.title}</option>
          ))}
        </select>
        <select name="public" defaultValue={searchParams.public || ''} className="admin-inline-select">
          <option value="">Активность на сайте</option>
          <option value="true">На сайте</option>
          <option value="false">Не на сайте</option>
        </select>
        <select name="author" defaultValue={searchParams.author || ''} className="admin-inline-select">
          <option value="">Все авторы</option>
          {workers.map((w) => (
            <option key={w.id} value={w.id}>{w.attributes.name}</option>
          ))}
        </select>
        <select name="sort" defaultValue={searchParams.sort || '-updatedAt'} className="admin-inline-select">
          {SPECIFICATION_SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <input type="text" name="q" defaultValue={searchParams.q || ''} placeholder="Название рецепта…" style={{ flex: 1, minWidth: 180 }} />
        <button type="submit" className="admin-btn admin-btn--primary">Найти</button>
      </form>

      {specifications.length === 0 ? (
        <div className="admin-table-wrap"><div className="admin-empty">Рецепты не найдены — попробуйте изменить фильтры.</div></div>
      ) : (
        <>
          <SpecificationsGrid specifications={specifications} imagesById={imagesById} tagsById={tagsById} />

          <div className="admin-pagination" style={{ marginTop: 14 }}>
            <span>Найдено рецептов: {total}</span>
            <div className="admin-pagination__pages">
              {Array.from({ length: pageCount }, (_, i) => i + 1)
                .filter((p) => p === 1 || p === pageCount || Math.abs(p - page) <= 2)
                .map((p, idx, arr) => (
                  <span key={p} style={{ display: 'flex', alignItems: 'center' }}>
                    {idx > 0 && arr[idx - 1] !== p - 1 && <span style={{ padding: '0 2px' }}>…</span>}
                    {p === page ? (
                      <span className="admin-pagination__current">{p}</span>
                    ) : (
                      <Link href={buildSpecificationsHref(searchParams, { page: String(p) })}>{p}</Link>
                    )}
                  </span>
                ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
