import { AdminOrder, AdminOrderPayment, AdminOrderStatusHistoryEntry, SimpleDictEntry, Worker } from '@/types';
import { adminFetch } from './adminApi';

export const STATUS_TABS: { value: string; label: string }[] = [
  { value: '', label: 'Все' },
  { value: 'new', label: 'Новые' },
  { value: 'assembled', label: 'Собранные' },
  { value: 'cancelled', label: 'Отменённые' },
  { value: 'completed', label: 'Завершённые' },
  { value: 'return', label: 'Возврат' },
  { value: 'credit', label: 'Кредит' },
  { value: 'courier', label: 'У курьера' },
];

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
  q?: string;
  page?: string;
}

const FILTER_KEYS: (keyof OrdersSearchParams)[] = [
  'status', 'store', 'source', 'florist', 'createdBy', 'closedBy',
  'createdFrom', 'createdTo', 'dueFrom', 'dueTo', 'closedFrom', 'closedTo',
];

export const PAGE_SIZE = 25;

export interface OrdersListResult {
  orders: AdminOrder[];
  total: number;
  statusCounts: Record<string, number>;
  aggregates: { totalAmount: number; paymentsAmount: number };
}

export async function getOrders(params: OrdersSearchParams): Promise<OrdersListResult> {
  const qs = new URLSearchParams();
  for (const key of FILTER_KEYS) {
    const value = params[key];
    if (value) qs.set(`filter[${key}]`, value);
  }
  if (params.q) qs.set('q', params.q);
  const page = Math.max(1, parseInt(params.page || '1', 10) || 1);
  qs.set('page[number]', String(page));
  qs.set('page[size]', String(PAGE_SIZE));

  const res = await adminFetch(`/api/v1/orders?${qs.toString()}`);
  if (!res.ok) {
    return { orders: [], total: 0, statusCounts: {}, aggregates: { totalAmount: 0, paymentsAmount: 0 } };
  }
  const json = await res.json();
  return {
    orders: json.data || [],
    total: json.meta?.total ?? 0,
    statusCounts: json.meta?.statusCounts ?? {},
    aggregates: json.meta?.aggregates ?? { totalAmount: 0, paymentsAmount: 0 },
  };
}

export async function getOrder(id: string): Promise<AdminOrder | null> {
  const res = await adminFetch(`/api/v1/orders/${id}`);
  if (!res.ok) return null;
  const json = await res.json();
  return json.data ?? null;
}

export async function getOrderPayments(orderId: string): Promise<AdminOrderPayment[]> {
  const res = await adminFetch(`/api/v1/payments?filter[order]=${orderId}`);
  if (!res.ok) return [];
  const json = await res.json();
  return json.data || [];
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
