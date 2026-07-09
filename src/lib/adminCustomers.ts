import {
  AdminBonusHistoryEntry,
  AdminCustomer,
  AdminCustomerSpend,
  AdminCustomerStats,
  SimpleDictEntry,
} from '@/types';
import { adminFetch } from './adminApi';

export const PAGE_SIZE = 25;

export interface CustomersSearchParams {
  source?: string;
  gender?: string;
  registeredFrom?: string;
  registeredTo?: string;
  q?: string;
  page?: string;
}

const FILTER_KEYS: (keyof CustomersSearchParams)[] = [
  'source', 'gender', 'registeredFrom', 'registeredTo',
];

export interface CustomersListResult {
  customers: AdminCustomer[];
  total: number;
}

export async function getCustomers(params: CustomersSearchParams): Promise<CustomersListResult> {
  const qs = new URLSearchParams();
  for (const key of FILTER_KEYS) {
    const value = params[key];
    if (value) qs.set(`filter[${key}]`, value);
  }
  if (params.q) qs.set('q', params.q);
  const page = Math.max(1, parseInt(params.page || '1', 10) || 1);
  qs.set('page[number]', String(page));
  qs.set('page[size]', String(PAGE_SIZE));

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

export function buildCustomersHref(
  current: CustomersSearchParams,
  overrides: Partial<CustomersSearchParams>
): string {
  const merged: Record<string, string> = {};
  for (const [key, value] of Object.entries({ ...current, ...overrides })) {
    if (value) merged[key] = value;
  }
  const qs = new URLSearchParams(merged);
  const query = qs.toString();
  return query ? `/admin/customers?${query}` : '/admin/customers';
}
