import {
  AdminCustomer, AdminOrder, AdminOrderAggregates, AdminOrderCompositionLine, AdminOrderPayment,
  AdminOrderStatusHistoryEntry, AdminOrderTotals, AdminShowcaseBouquet,
  SimpleDictEntry, Worker,
} from '@/types';
import { adminFetch } from './adminApi';

// Re-exported from client-safe modules so existing importers of
// `@/lib/adminOrders` keep working; client components should import these
// directly from `@/lib/orderStatus` / `@/lib/ordersQuery` to avoid pulling
// the server data layer (adminApi.ts → next/headers) into the client bundle.
export { STATUS_TABS, TERMINAL_STATUSES } from './orderStatus';
export {
  FILTER_KEYS, PAGE_SIZE, PAGE_SIZE_OPTIONS,
  buildOrdersHref, resolvePageSize,
} from './ordersQuery';
export type { OrdersSearchParams } from './ordersQuery';

import { FILTER_KEYS, resolvePageSize, OrdersSearchParams } from './ordersQuery';

const EMPTY_AGGREGATES: AdminOrderAggregates = {
  ordersTotal: 0, budgetTotal: 0, paidTotal: 0, creditTotal: 0,
  bonusTotal: 0, discountTotal: 0, markupTotal: 0,
};

export interface OrdersListResult {
  orders: AdminOrder[];
  total: number;
  statusCounts: Record<string, number>;
  aggregates: AdminOrderAggregates;
  // order-tags included resources, keyed by id — resolves the chip titles for
  // orders.relationships.tags without a per-row lookup.
  tagsById: Record<string, SimpleDictEntry>;
  pageSize: number;
}

export async function getOrders(params: OrdersSearchParams): Promise<OrdersListResult> {
  const qs = new URLSearchParams();
  for (const key of FILTER_KEYS) {
    const value = params[key];
    if (value) qs.set(`filter[${key}]`, value);
  }
  if (params.q) qs.set('q', params.q);
  const page = Math.max(1, parseInt(params.page || '1', 10) || 1);
  const pageSize = resolvePageSize(params.pageSize);
  qs.set('page[number]', String(page));
  qs.set('page[size]', String(pageSize));

  const res = await adminFetch(`/api/v1/orders?${qs.toString()}`);
  if (!res.ok) {
    return { orders: [], total: 0, statusCounts: {}, aggregates: EMPTY_AGGREGATES, tagsById: {}, pageSize };
  }
  const json = await res.json();
  const tagsById: Record<string, SimpleDictEntry> = {};
  for (const inc of json.included || []) {
    if (inc.type === 'order-tags') tagsById[inc.id] = inc;
  }
  return {
    orders: json.data || [],
    total: json.meta?.total ?? 0,
    statusCounts: json.meta?.statusCounts ?? {},
    aggregates: json.meta?.aggregates ?? EMPTY_AGGREGATES,
    tagsById,
    pageSize,
  };
}

export interface OrderResult {
  order: AdminOrder;
  tagsById: Record<string, SimpleDictEntry>;
}

export async function getOrder(id: string): Promise<OrderResult | null> {
  const res = await adminFetch(`/api/v1/orders/${id}`);
  if (!res.ok) return null;
  const json = await res.json();
  if (!json.data) return null;
  const tagsById: Record<string, SimpleDictEntry> = {};
  for (const inc of json.included || []) {
    if (inc.type === 'order-tags') tagsById[inc.id] = inc;
  }
  return { order: json.data, tagsById };
}

export async function getOrderPayments(orderId: string): Promise<AdminOrderPayment[]> {
  const res = await adminFetch(`/api/v1/payments?filter[order]=${orderId}`);
  if (!res.ok) return [];
  const json = await res.json();
  return json.data || [];
}

// GET /v1/orders/{id}/items — состав заказа + итоги + платежи (вкладка
// «Продукты», admin-map §2.2.1). `readOnly` is true for legacy ETL/checkout
// orders whose composition comes from the frozen bouquet_ids JSON.
export interface OrderComposition {
  lines: AdminOrderCompositionLine[];
  totals: AdminOrderTotals | null;
  payments: AdminOrderPayment[];
  readOnly: boolean;
}

export async function getOrderComposition(orderId: string): Promise<OrderComposition> {
  const empty: OrderComposition = { lines: [], totals: null, payments: [], readOnly: false };
  const res = await adminFetch(`/api/v1/orders/${orderId}/items`);
  if (!res.ok) return empty;
  const json = await res.json();
  return {
    lines: json.data || [],
    totals: json.meta?.totals ?? null,
    payments: json.meta?.payments ?? [],
    readOnly: Boolean(json.meta?.readOnly),
  };
}

// Showcase bouquets of one store for the «Добавить продукт» picker. The
// backend supports filter[store]; the "on window" filter happens here since
// bouquet statuses come straight from the Posiflora ETL.
export async function getShowcaseBouquets(storeId: string | null): Promise<AdminShowcaseBouquet[]> {
  const qs = new URLSearchParams({ 'page[size]': '500' });
  if (storeId) qs.set('filter[store]', storeId);
  const res = await adminFetch(`/api/v1/bouquets?${qs.toString()}`);
  if (!res.ok) return [];
  const json = await res.json();
  const bouquets: AdminShowcaseBouquet[] = json.data || [];
  const onWindow = bouquets.filter((b) => b.attributes.status === 'window');
  // ETL data may use a different status vocabulary — fall back to everything
  // not sold/deleted rather than an empty picker.
  if (onWindow.length > 0) return onWindow;
  return bouquets.filter((b) => !['sold', 'deleted', 'off'].includes(b.attributes.status));
}

export async function getOrderStatusHistory(orderId: string): Promise<AdminOrderStatusHistoryEntry[]> {
  const res = await adminFetch(`/api/v1/orders/${orderId}/status-history`);
  if (!res.ok) return [];
  const json = await res.json();
  return json.data || [];
}

async function getDict(path: string): Promise<SimpleDictEntry[]> {
  try {
    const res = await adminFetch(`/api/v1/${path}?page[size]=200`);
    if (!res.ok) return [];
    const json = await res.json();
    return json.data || [];
  } catch {
    return [];
  }
}

export async function getStores(): Promise<SimpleDictEntry[]> {
  return getDict('stores');
}

export async function getOrderSources(): Promise<SimpleDictEntry[]> {
  return getDict('order-sources');
}

export async function getOrderTags(): Promise<SimpleDictEntry[]> {
  return getDict('order-tags');
}

// «Причины скидок и надбавок» — the shared discount-reasons dictionary used
// by PUT /v1/orders/{id}/discount for both kind=discount and kind=markup
// (admin-map §2.7, /admin/discount-reasons).
export async function getDiscountReasons(): Promise<SimpleDictEntry[]> {
  return getDict('discount-reasons');
}

// Flat customer list for the create-order «Клиент» select (admin-map §2.2.2).
export async function getCustomersForSelect(): Promise<AdminCustomer[]> {
  try {
    const res = await adminFetch(`/api/v1/customers?page[size]=200`);
    if (!res.ok) return [];
    const json = await res.json();
    return json.data || [];
  } catch {
    return [];
  }
}

export async function getWorkers(): Promise<Worker[]> {
  try {
    const res = await adminFetch(`/api/v1/workers?page[size]=200`);
    if (!res.ok) return [];
    const json = await res.json();
    return json.data || [];
  } catch {
    return [];
  }
}
