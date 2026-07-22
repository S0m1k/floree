import { AdminInventoryItem, AdminMeasure } from '@/types';
import { adminFetch } from './adminApi';

export const PAGE_SIZE = 25;

// backend/app/routers/v1_inventory.py only supports `filter[category]` on
// /v1/inventory-items — there's no `q` search param and it isn't cursor-safe
// for text search anyway, so name search + pagination happen here, over a
// single large fetch (~347 items per admin-map.md §2.3.4, well under this cap).
const FETCH_ALL_SIZE = 2000;

export interface InventorySearchParams {
  category?: string;
  q?: string;
  page?: string;
}

export interface InventoryListResult {
  items: AdminInventoryItem[];
  total: number;
}

export async function getInventoryItems(params: InventorySearchParams): Promise<InventoryListResult> {
  const qs = new URLSearchParams();
  if (params.category) qs.set('filter[category]', params.category);
  qs.set('page[size]', String(FETCH_ALL_SIZE));

  const res = await adminFetch(`/api/v1/inventory-items?${qs.toString()}`);
  if (!res.ok) return { items: [], total: 0 };
  const json = await res.json();
  let items: AdminInventoryItem[] = json.data || [];

  if (params.q) {
    const needle = params.q.trim().toLowerCase();
    if (needle) items = items.filter((i) => i.attributes.title.toLowerCase().includes(needle));
  }

  const total = items.length;
  const page = Math.max(1, parseInt(params.page || '1', 10) || 1);
  const start = (page - 1) * PAGE_SIZE;
  return { items: items.slice(start, start + PAGE_SIZE), total };
}

// Single item by id — the catalog card (/admin/catalog/[id], admin-map
// §2.3.4) and its edit form.
export async function getInventoryItem(id: string): Promise<AdminInventoryItem | null> {
  const res = await adminFetch(`/api/v1/inventory-items/${id}`);
  if (!res.ok) return null;
  const json = await res.json();
  return json.data || null;
}

// Full id->item lookup for warehouse document line items (packing-invoice-lines
// etc. only carry the item id in their `item` relationship, not an included
// resource — see backend/app/routers/v1_warehouse_docs.py `_make_detail`).
export async function getAllInventoryItemsMap(): Promise<Record<string, AdminInventoryItem>> {
  try {
    const res = await adminFetch(`/api/v1/inventory-items?page[size]=${FETCH_ALL_SIZE}`);
    if (!res.ok) return {};
    const json = await res.json();
    const items: AdminInventoryItem[] = json.data || [];
    return Object.fromEntries(items.map((i) => [i.id, i]));
  } catch {
    return {};
  }
}

export async function getMeasures(): Promise<AdminMeasure[]> {
  try {
    const res = await adminFetch(`/api/v1/measures?page[size]=200`);
    if (!res.ok) return [];
    const json = await res.json();
    return json.data || [];
  } catch {
    return [];
  }
}

export function buildInventoryHref(
  basePath: string,
  current: InventorySearchParams,
  overrides: Partial<InventorySearchParams>
): string {
  const merged: Record<string, string> = {};
  for (const [key, value] of Object.entries({ ...current, ...overrides })) {
    if (value) merged[key] = value;
  }
  const qs = new URLSearchParams(merged);
  const query = qs.toString();
  return query ? `${basePath}?${query}` : basePath;
}

// ---------- Остатки («Обзор склада», /v1/stock) ----------

export interface StockRow {
  id: string;
  attributes: {
    title: string;
    quantity: number;
    costPrice: number;
    costSum: number;
    retailPrice: number;
    retailSum: number;
  };
}

export interface StockOverview {
  rows: StockRow[];
  totals: { qty: number; costSum: number; retailSum: number };
}

export async function getStockOverview(
  storeId: string,
  params: InventorySearchParams
): Promise<StockOverview> {
  const qs = new URLSearchParams();
  qs.set('filter[store]', storeId);
  if (params.category) qs.set('filter[category]', params.category);
  if (params.q) qs.set('q', params.q);

  const res = await adminFetch(`/api/v1/stock?${qs.toString()}`);
  if (!res.ok) return { rows: [], totals: { qty: 0, costSum: 0, retailSum: 0 } };
  const json = await res.json();
  return {
    rows: json.data || [],
    totals: json.meta?.totals || { qty: 0, costSum: 0, retailSum: 0 },
  };
}
