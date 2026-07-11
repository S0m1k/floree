import { MoneyDashboard, CustomersDashboard, BouquetsDashboard, WarehouseDashboard } from '@/types';
import { adminFetch } from './adminApi';

export interface DashboardSearchParams {
  from?: string;
  to?: string;
  store?: string;
  [key: string]: string | undefined;
}

// Local-date formatting (not toISOString, which converts to UTC and can
// shift the date by a day depending on the server's timezone offset).
function toLocalDateString(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function currentMonthRange(): { from: string; to: string } {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  return { from: toLocalDateString(from), to: toLocalDateString(now) };
}

function periodQs(params: DashboardSearchParams): URLSearchParams {
  const defaults = currentMonthRange();
  const qs = new URLSearchParams();
  qs.set('from', params.from || defaults.from);
  qs.set('to', params.to || defaults.to);
  if (params.store) qs.set('store', params.store);
  return qs;
}

export async function getMoneyDashboard(params: DashboardSearchParams): Promise<MoneyDashboard | null> {
  const res = await adminFetch(`/api/v1/analytics/money?${periodQs(params).toString()}`);
  if (!res.ok) return null;
  return res.json();
}

export async function getCustomersDashboard(params: DashboardSearchParams): Promise<CustomersDashboard | null> {
  const res = await adminFetch(`/api/v1/analytics/customers?${periodQs(params).toString()}`);
  if (!res.ok) return null;
  return res.json();
}

export async function getBouquetsDashboard(params: DashboardSearchParams): Promise<BouquetsDashboard | null> {
  const res = await adminFetch(`/api/v1/analytics/bouquets?${periodQs(params).toString()}`);
  if (!res.ok) return null;
  return res.json();
}

export async function getWarehouseDashboard(params: DashboardSearchParams): Promise<WarehouseDashboard | null> {
  const res = await adminFetch(`/api/v1/analytics/warehouse?${periodQs(params).toString()}`);
  if (!res.ok) return null;
  return res.json();
}
