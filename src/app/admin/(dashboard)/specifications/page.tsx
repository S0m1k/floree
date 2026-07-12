import Link from 'next/link';
import {
  getSpecifications, getCategories, specImageUrl, buildSpecificationsHref,
  PAGE_SIZE, SpecificationsSearchParams,
} from '@/lib/adminCatalog';
import BouquetsNav from '@/components/admin/BouquetsNav';

export const metadata = { title: 'Рецепты' };

const fmtMoney = (n: number) => new Intl.NumberFormat('ru-RU').format(Math.round(n)) + ' ₽';

interface Props {
  searchParams: SpecificationsSearchParams;
}

export default async function AdminSpecificationsPage({ searchParams }: Props) {
  const [{ specifications, imagesById, total }, categories] = await Promise.all([
    getSpecifications(searchParams),
    getCategories(),
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

      <form method="GET" action="/admin/specifications" className="admin-search" style={{ alignItems: 'center' }}>
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
        <input type="text" name="q" defaultValue={searchParams.q || ''} placeholder="Название рецепта…" style={{ flex: 1 }} />
        <button type="submit" className="admin-btn admin-btn--primary">Найти</button>
      </form>

      {specifications.length === 0 ? (
        <div className="admin-table-wrap"><div className="admin-empty">Рецепты не найдены — попробуйте изменить фильтры.</div></div>
      ) : (
        <>
          <div className="admin-card-grid">
            {specifications.map((spec) => {
              const a = spec.attributes;
              const imageUrl = specImageUrl(spec, imagesById);
              const priceRange = a.minPrice === a.maxPrice
                ? fmtMoney(a.minPrice)
                : `${fmtMoney(a.minPrice)} – ${fmtMoney(a.maxPrice)}`;
              return (
                <Link key={spec.id} href={`/admin/specifications/${spec.id}`} className="admin-recipe-card">
                  <div className="admin-recipe-card__photo">
                    {imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- external Posiflora CDN images, not under next/image domains
                      <img src={imageUrl} alt={a.title} />
                    ) : (
                      <span className="material-symbols-outlined admin-recipe-card__placeholder">local_florist</span>
                    )}
                    <span className={`admin-recipe-card__status admin-recipe-card__status--${a.public ? 'on' : 'off'}`}>
                      {a.public ? 'На сайте' : 'Не на сайте'}
                    </span>
                  </div>
                  <div className="admin-recipe-card__body">
                    <div className="admin-recipe-card__title">{a.title}</div>
                    <div className="admin-recipe-card__price">{priceRange}</div>
                    <div className="admin-recipe-card__variants">{a.variantsCount} вариант(ов)</div>
                  </div>
                </Link>
              );
            })}
          </div>

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
