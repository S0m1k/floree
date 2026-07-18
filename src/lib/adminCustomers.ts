import {
  AdminBonusHistoryEntry,
  AdminCustomer,
  AdminCustomerSpend,
  AdminCustomerStats,
  SimpleDictEntry,
} from '@/types';
import { adminFetch } from './adminApi';
import { PAGE_SIZE, CustomersSearchParams, buildCustomersHref } from './adminCustomersShared';

export { PAGE_SIZE, buildCustomersHref };
export type { CustomersSearchParams };

// Cap for the «Экспорт клиентов» CSV — the whole filtered selection, not just
// the current page. 437 live Posiflora customers fit comfortably under this.
export const EXPORT_PAGE_SIZE = 5000;

const FILTER_KEYS: (keyof CustomersSearchParams)[] = [
  'source', 'gender', 'customerType', 'preferences', 'amountFrom', 'amountTo',
  'registeredFrom', 'registeredTo',
];

export interface CustomersListResult {
  customers: AdminCustomer[];
  total: number;
}

// Shared by getCustomers() and the CSV export route handler — the filter[...]
// query the backend understands, without paging.
export function customersFilterQuery(params: CustomersSearchParams): URLSearchParams {
  const qs = new URLSearchParams();
  for (const key of FILTER_KEYS) {
    const value = params[key];
    if (value) qs.set(`filter[${key}]`, value);
  }
  if (params.q) qs.set('q', params.q);
  return qs;
}

export async function getCustomers(
  params: CustomersSearchParams,
  pageSize: number = PAGE_SIZE,
): Promise<CustomersListResult> {
  const qs = customersFilterQuery(params);
  const page = Math.max(1, parseInt(params.page || '1', 10) || 1);
  qs.set('page[number]', String(page));
  qs.set('page[size]', String(pageSize));

  const res = await adminFetch(`/api/v1/customers?${qs.toString()}`);
  if (!res.ok) return { customers: [], total: 0 };
  const json = await res.json();
  return { customers: json.data || [], total: json.meta?.total ?? 0 };
}

export async function getCustomer(id: string): Promise<AdminCustomer | null> {
  const res = await adminFetch(`/api/v1/customers/${id}`);
  if (!res.ok) return null;
  const json = await res.json();
  return json.data ?? null;
}

// Плитки статистики карточки клиента (вкладка «Общая информация»).
export async function getCustomerStats(id: string): Promise<AdminCustomerStats | null> {
  const res = await adminFetch(`/api/v1/customers/${id}/stats`);
  if (!res.ok) return null;
  const json = await res.json();
  return json.data?.attributes ?? null;
}

// Дневные суммы заказов для бар-чарта «Траты клиента».
export async function getCustomerSpend(
  id: string,
  from?: string,
  to?: string,
): Promise<AdminCustomerSpend | null> {
  const qs = new URLSearchParams();
  if (from) qs.set('filter[from]', from);
  if (to) qs.set('filter[to]', to);
  const query = qs.toString();
  const res = await adminFetch(`/api/v1/customers/${id}/spend${query ? `?${query}` : ''}`);
  if (!res.ok) return null;
  const json = await res.json();
  return json.data?.attributes ?? null;
}

// «История списаний и начислений бонусов» (вкладка «Бонусы»).
export async function getCustomerBonusHistory(
  id: string,
  from?: string,
  to?: string,
): Promise<AdminBonusHistoryEntry[]> {
  const qs = new URLSearchParams();
  if (from) qs.set('filter[from]', from);
  if (to) qs.set('filter[to]', to);
  const query = qs.toString();
  const res = await adminFetch(`/api/v1/customers/${id}/bonus-history${query ? `?${query}` : ''}`);
  if (!res.ok) return [];
  const json = await res.json();
  return json.data || [];
}

export async function getCustomerSources(): Promise<SimpleDictEntry[]> {
  try {
    const res = await adminFetch(`/api/v1/customer-sources?page[size]=200`);
    if (!res.ok) return [];
    const json = await res.json();
    return json.data || [];
  } catch {
    return [];
  }
}

export async function getCustomerPreferences(): Promise<SimpleDictEntry[]> {
  try {
    const res = await adminFetch(`/api/v1/customer-preferences?page[size]=200`);
    if (!res.ok) return [];
    const json = await res.json();
    return json.data || [];
  } catch {
    return [];
  }
}
