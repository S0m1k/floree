import { AdminVendor } from '@/types';

const API_URL =
  process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export const PAGE_SIZE = 25;

export interface VendorsSearchParams {
  page?: string;
}

export interface VendorsListResult {
  vendors: AdminVendor[];
  total: number;
}

export async function getVendors(params: VendorsSearchParams): Promise<VendorsListResult> {
  const qs = new URLSearchParams();
  const page = Math.max(1, parseInt(params.page || '1', 10) || 1);
  qs.set('page[number]', String(page));
  qs.set('page[size]', String(PAGE_SIZE));

  const res = await fetch(`${API_URL}/api/v1/vendors?${qs.toString()}`, { cache: 'no-store' });
  if (!res.ok) return { vendors: [], total: 0 };
  const json = await res.json();
  return { vendors: json.data || [], total: json.meta?.total ?? 0 };
}

// Unpaginated id->vendor lookup for the packing-invoices list/detail (vendor
// column) — mirrors getStores()/getWorkers() in src/lib/adminOrders.ts.
export async function getVendorsDict(): Promise<AdminVendor[]> {
  try {
    const res = await fetch(`${API_URL}/api/v1/vendors?page[size]=200`, { cache: 'no-store' });
    if (!res.ok) return [];
    const json = await res.json();
    return json.data || [];
  } catch {
    return [];
  }
}

export function buildVendorsHref(current: VendorsSearchParams, overrides: Partial<VendorsSearchParams>): string {
  const merged: Record<string, string> = {};
  for (const [key, value] of Object.entries({ ...current, ...overrides })) {
    if (value) merged[key] = value;
  }
  const qs = new URLSearchParams(merged);
  const query = qs.toString();
  return query ? `/admin/vendors?${query}` : '/admin/vendors';
}
