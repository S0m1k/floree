import { AdminShowcaseBouquet, AdminShowcaseMeta, AdminStore } from '@/types';
import { adminFetch } from './adminApi';
import { PAGE_SIZE, ShowcaseSearchParams } from './showcaseHref';

// Re-exported from the client-safe module so existing importers of
// `@/lib/adminShowcase` keep working; client components should import these
// from `@/lib/showcaseHref` directly to avoid pulling in the server data
// layer (mirrors the split in src/lib/adminOrders.ts / orderStatus.ts).
export { PAGE_SIZE, buildShowcaseHref } from './showcaseHref';
export type { ShowcaseSearchParams } from './showcaseHref';

// The physical-showcase status (Posiflora `window`) — bouquets currently
// collected and standing on the point's showcase (admin-map §2.3.1).
const WINDOW_STATUS = 'window';
const EXCLUDED_FALLBACK_STATUSES = ['sold', 'deleted', 'off', 'disassembled'];

export interface ShowcasePageResult {
  bouquets: AdminShowcaseBouquet[];
  meta: AdminShowcaseMeta;
}

const EMPTY_META: AdminShowcaseMeta = { total: 0, count: 0, minPrice: 0, maxPrice: 0, totalSum: 0 };
const EMPTY_RESULT: ShowcasePageResult = { bouquets: [], meta: EMPTY_META };

function _page(params: ShowcaseSearchParams): number {
  return Math.max(1, parseInt(params.page || '1', 10) || 1);
}

/**
 * One page of showcase bouquets + the summary meta the two tab-cards need.
 *
 * The backend filters to `filter[status]=window` first (the real Posiflora
 * vocabulary). ETL data may use a different vocabulary though — mirrors the
 * fallback in `getShowcaseBouquets` (src/lib/adminOrders.ts): if a store has
 * zero bouquets on `window`, fall back to everything not sold/disassembled/
 * deleted/off, paginating and aggregating that set client-side instead.
 */
export async function getShowcasePage(params: ShowcaseSearchParams): Promise<ShowcasePageResult> {
  const page = _page(params);
  const sort = params.sort || '-createdAt';

  const qs = new URLSearchParams();
  if (params.store) qs.set('filter[store]', params.store);
  qs.set('filter[status]', WINDOW_STATUS);
  if (params.q) qs.set('q', params.q);
  qs.set('sort', sort);
  qs.set('page[number]', String(page));
  qs.set('page[size]', String(PAGE_SIZE));

  const res = await adminFetch(`/api/v1/bouquets?${qs.toString()}`);
  if (!res.ok) return EMPTY_RESULT;
  const json = await res.json();
  const bouquets: AdminShowcaseBouquet[] = json.data || [];
  const meta: AdminShowcaseMeta = json.meta ?? EMPTY_META;

  if (meta.count > 0) return { bouquets, meta };

  const fallbackQs = new URLSearchParams();
  if (params.store) fallbackQs.set('filter[store]', params.store);
  if (params.q) fallbackQs.set('q', params.q);
  fallbackQs.set('sort', sort);
  fallbackQs.set('page[size]', '500');
  const fbRes = await adminFetch(`/api/v1/bouquets?${fallbackQs.toString()}`);
  if (!fbRes.ok) return EMPTY_RESULT;
  const fbJson = await fbRes.json();
  const all: AdminShowcaseBouquet[] = fbJson.data || [];
  const filtered = all.filter((b) => !EXCLUDED_FALLBACK_STATUSES.includes(b.attributes.status));
  if (filtered.length === 0) return EMPTY_RESULT;

  const total = filtered.length;
  const start = (page - 1) * PAGE_SIZE;
  const prices = filtered.map((b) => b.attributes.saleAmount);
  return {
    bouquets: filtered.slice(start, start + PAGE_SIZE),
    meta: {
      total,
      count: total,
      minPrice: Math.min(...prices),
      maxPrice: Math.max(...prices),
      totalSum: prices.reduce((sum, p) => sum + p, 0),
    },
  };
}

export async function getStoresFull(): Promise<AdminStore[]> {
  const res = await adminFetch(`/api/v1/stores?page[size]=200`);
  if (!res.ok) return [];
  const json = await res.json();
  return json.data || [];
}
