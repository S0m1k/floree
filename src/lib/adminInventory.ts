import { AdminInventoryItem, AdminMeasure } from '@/types';

const API_URL =
  process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

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

  const res = await fetch(`${API_URL}/api/v1/inventory-items?${qs.toString()}`, { cache: 'no-store' });
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

// Full id->item lookup for warehouse document line items (packing-invoice-lines
// etc. only carry the item id in their `item` relationship, not an included
// resource — see backend/app/routers/v1_warehouse_docs.py `_make_detail`).
export async function getAllInventoryItemsMap(): Promise<Record<string, AdminInventoryItem>> {
  try {
    const res = await fetch(`${API_URL}/api/v1/inventory-items?page[size]=${FETCH_ALL_SIZE}`, { cache: 'no-store' });
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
    const res = await fetch(`${API_URL}/api/v1/measures?page[size]=200`, { cache: 'no-store' });
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
