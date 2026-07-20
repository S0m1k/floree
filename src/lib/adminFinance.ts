import { AdminExpense, AdminGeneratedFile, FinancePnl, GeneratedFileKind } from '@/types';
import { adminFetch } from './adminApi';

// Учёт и финансы → Отчёты / Финансовый учёт / история выгрузок
// (admin-map §2.4.5-2.4.8, backend/app/routers/v1_finance.py).

export const FINANCE_PAGE_SIZE = 50;

export interface ExpensesSearchParams {
  from?: string;
  to?: string;
  store?: string;
  q?: string;
  page?: string;
}

export interface ExpensesListResult {
  expenses: AdminExpense[];
  count: number;
  total: number; // sum of amount over the filtered selection
}

function expensesFilterQuery(params: ExpensesSearchParams): URLSearchParams {
  const qs = new URLSearchParams();
  if (params.from) qs.set('from', params.from);
  if (params.to) qs.set('to', params.to);
  if (params.store) qs.set('store', params.store);
  if (params.q) qs.set('q', params.q);
  return qs;
}

export async function getExpenses(params: ExpensesSearchParams): Promise<ExpensesListResult> {
  const qs = expensesFilterQuery(params);
  const page = Math.max(1, parseInt(params.page || '1', 10) || 1);
  qs.set('page[number]', String(page));
  qs.set('page[size]', String(FINANCE_PAGE_SIZE));

  const res = await adminFetch(`/api/v1/expenses?${qs.toString()}`);
  if (!res.ok) return { expenses: [], count: 0, total: 0 };
  const json = await res.json();
  return {
    expenses: json.data || [],
    count: json.meta?.page?.count ?? (json.data || []).length,
    total: json.meta?.total ?? 0,
  };
}

// The «Скачать в Эксель» button on /admin/financial-accounting downloads the
// *current filtered selection*, not a page at a time — mirrors customers/
// items-export's EXPORT_PAGE_SIZE convention.
export const EXPENSE_EXPORT_PAGE_SIZE = 5000;

export async function getFinancePnl(params: { from?: string; to?: string; store?: string }): Promise<FinancePnl | null> {
  const qs = new URLSearchParams();
  if (params.from) qs.set('from', params.from);
  if (params.to) qs.set('to', params.to);
  if (params.store) qs.set('store', params.store);

  const res = await adminFetch(`/api/v1/finance/pnl?${qs.toString()}`);
  if (!res.ok) return null;
  return res.json();
}

export interface ReportsSearchParams {
  type?: string;
  q?: string;
  page?: string;
}

export interface GeneratedFilesListResult {
  files: AdminGeneratedFile[];
  count: number;
}

export async function getReports(params: ReportsSearchParams): Promise<GeneratedFilesListResult> {
  const qs = new URLSearchParams();
  if (params.type) qs.set('type', params.type);
  if (params.q) qs.set('q', params.q);
  const page = Math.max(1, parseInt(params.page || '1', 10) || 1);
  qs.set('page[number]', String(page));
  qs.set('page[size]', String(FINANCE_PAGE_SIZE));

  const res = await adminFetch(`/api/v1/reports?${qs.toString()}`);
  if (!res.ok) return { files: [], count: 0 };
  const json = await res.json();
  return { files: json.data || [], count: json.meta?.page?.count ?? (json.data || []).length };
}

export async function getGeneratedFiles(kind: GeneratedFileKind | undefined, page = '1'): Promise<GeneratedFilesListResult> {
  const qs = new URLSearchParams();
  if (kind) qs.set('kind', kind);
  qs.set('page[number]', page);
  qs.set('page[size]', String(FINANCE_PAGE_SIZE));

  const res = await adminFetch(`/api/v1/generated-files?${qs.toString()}`);
  if (!res.ok) return { files: [], count: 0 };
  const json = await res.json();
  return { files: json.data || [], count: json.meta?.page?.count ?? (json.data || []).length };
}
