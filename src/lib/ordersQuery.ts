// Client-safe /admin/orders query-param helpers. Kept free of any server-only
// imports (no next/headers) so client components — PageSizeSelect and any
// future filter widget — can import them without pulling the server data
// layer (adminApi.ts) into the client bundle.

// Query params accepted by the /admin/orders page (mirrors admin-map.md §2.2
// "Фильтр заказов"). Maps 1:1 to the /v1/orders `filter[...]` params.
export interface OrdersSearchParams {
  status?: string;
  store?: string;
  source?: string;
  florist?: string;
  createdBy?: string;
  closedBy?: string;
  createdFrom?: string;
  createdTo?: string;
  dueFrom?: string;
  dueTo?: string;
  closedFrom?: string;
  closedTo?: string;
  // Карточка клиента, вкладка «Заказы» — заказы одного клиента (по FK или телефону).
  customer?: string;
  // «Быстрые теги» select в панели фильтров (filter[tag]).
  tag?: string;
  q?: string;
  page?: string;
  pageSize?: string;
}

export const FILTER_KEYS: (keyof OrdersSearchParams)[] = [
  'status', 'store', 'source', 'florist', 'createdBy', 'closedBy',
  'createdFrom', 'createdTo', 'dueFrom', 'dueTo', 'closedFrom', 'closedTo',
  'customer', 'tag',
];

export const PAGE_SIZE = 25;
export const PAGE_SIZE_OPTIONS = [25, 50, 100];

// Effective page size from the URL param, clamped to the allowed options.
export function resolvePageSize(pageSize?: string): number {
  const n = parseInt(pageSize || '', 10);
  return PAGE_SIZE_OPTIONS.includes(n) ? n : PAGE_SIZE;
}

// Builds an /admin/orders href that preserves every current filter/search
// param, overriding only the given keys — used by status tabs and pagination
// links so switching tabs/pages never drops the rest of the filter panel.
export function buildOrdersHref(
  current: OrdersSearchParams,
  overrides: Partial<OrdersSearchParams>
): string {
  const merged: Record<string, string> = {};
  for (const [key, value] of Object.entries({ ...current, ...overrides })) {
    if (value) merged[key] = value;
  }
  const qs = new URLSearchParams(merged);
  const query = qs.toString();
  return query ? `/admin/orders?${query}` : '/admin/orders';
}
