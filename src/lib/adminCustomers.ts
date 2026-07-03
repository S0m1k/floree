import { AdminCustomer, SimpleDictEntry } from '@/types';

const API_URL =
  process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

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

  const res = await fetch(`${API_URL}/api/v1/customers?${qs.toString()}`, { cache: 'no-store' });
  if (!res.ok) return { customers: [], total: 0 };
  const json = await res.json();
  return { customers: json.data || [], total: json.meta?.total ?? 0 };
}

export async function getCustomerSources(): Promise<SimpleDictEntry[]> {
  try {
    const res = await fetch(`${API_URL}/api/v1/customer-sources?page[size]=200`, { cache: 'no-store' });
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
