import Link from 'next/link';
import { getShowcasePage, getStoresFull, PAGE_SIZE } from '@/lib/adminShowcase';
import { ShowcaseSearchParams, buildShowcaseHref } from '@/lib/showcaseHref';
import { plural } from '@/lib/showcaseFormat';
import { fmtMoney } from '@/lib/format';
import BouquetsNav from '@/components/admin/BouquetsNav';
import ShowcaseStoreSelect from '@/components/admin/ShowcaseStoreSelect';
import ShowcaseSortBar from '@/components/admin/ShowcaseSortBar';
import ShowcaseBouquetCard from '@/components/admin/ShowcaseBouquetCard';

export const metadata = { title: 'Букеты в магазине' };

interface Props {
  searchParams: ShowcaseSearchParams;
}

export default async function AdminShowcasePage({ searchParams }: Props) {
  const stores = await getStoresFull();

  if (stores.length === 0) {
    return (
      <div>
        <BouquetsNav active="/admin/showcase" />
        <h1 className="admin-title">Букеты в магазине</h1>
        <div className="admin-table-wrap"><div className="admin-empty">Точки продаж не найдены.</div></div>
      </div>
    );
  }

  const storeId = searchParams.store && stores.some((s) => s.id === searchParams.store)
    ? searchParams.store
    : stores[0].id;
  const store = stores.find((s) => s.id === storeId) || stores[0];

  const { bouquets, meta } = await getShowcasePage({ ...searchParams, store: storeId });

  const page = Math.max(1, parseInt(searchParams.page || '1', 10) || 1);
  const pageCount = Math.max(1, Math.ceil(meta.total / PAGE_SIZE));

  return (
    <div>
      <BouquetsNav active="/admin/showcase" />

      <div className="admin-showcase-header">
        <ShowcaseStoreSelect stores={stores} currentStoreId={storeId} searchParams={searchParams} />
        <div className="admin-showcase-header__address">{store.attributes.address || '—'}</div>
      </div>

      <div className="admin-showcase-summary">
        <div className="admin-showcase-tab admin-showcase-tab--active">
          <div className="admin-showcase-tab__title">
            {meta.count} {plural(meta.count, ['букет', 'букета', 'букетов'])} на витрине
          </div>
          <div className="admin-showcase-tab__sub">
            Цены от {fmtMoney(meta.minPrice)} до {fmtMoney(meta.maxPrice)}
          </div>
          <div className="admin-showcase-tab__sub">Сумма — {fmtMoney(meta.totalSum)}</div>
        </div>
        <div className="admin-showcase-tab admin-showcase-tab--disabled" title="Пока недоступно">
          <div className="admin-showcase-tab__title">Цветы и расходники в букетах</div>
          <div className="admin-showcase-tab__sub">— стеблей</div>
        </div>
        <button
          type="button"
          className="admin-btn admin-showcase-print-all"
          disabled
          title="Пока недоступно"
        >
          Распечатать все штрихкоды
        </button>
      </div>

      <div className="admin-showcase-toolbar">
        <ShowcaseSortBar searchParams={searchParams} />
        <select className="admin-inline-select" disabled title="У букета пока нет привязки к флористу">
          <option>Флорист</option>
        </select>
        <form method="GET" action="/admin/showcase" className="admin-search" style={{ flex: 1, margin: 0 }}>
          <input type="hidden" name="store" value={storeId} />
          {searchParams.sort && <input type="hidden" name="sort" value={searchParams.sort} />}
          <input type="text" name="q" defaultValue={searchParams.q || ''} placeholder="Поиск по номеру, названию" />
          <button type="submit" className="admin-btn admin-btn--primary">Найти</button>
        </form>
      </div>

      {bouquets.length === 0 ? (
        <div className="admin-table-wrap"><div className="admin-empty">На витрине этой точки пока нет букетов.</div></div>
      ) : (
        <>
          <div className="admin-showcase-grid">
            {bouquets.map((b) => (
              <ShowcaseBouquetCard key={b.id} bouquet={b} />
            ))}
          </div>

          <div className="admin-pagination" style={{ marginTop: 14 }}>
            <span>Найдено букетов: {meta.total}</span>
            <div className="admin-pagination__pages">
              {Array.from({ length: pageCount }, (_, i) => i + 1)
                .filter((p) => p === 1 || p === pageCount || Math.abs(p - page) <= 2)
                .map((p, idx, arr) => (
                  <span key={p} style={{ display: 'flex', alignItems: 'center' }}>
                    {idx > 0 && arr[idx - 1] !== p - 1 && <span style={{ padding: '0 2px' }}>…</span>}
                    {p === page ? (
                      <span className="admin-pagination__current">{p}</span>
                    ) : (
                      <Link href={buildShowcaseHref({ ...searchParams, store: storeId }, { page: String(p) })}>{p}</Link>
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
