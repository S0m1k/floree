import { AdminDevice, AdminRole, AdminShift, Worker } from '@/types';
import { adminFetch } from './adminApi';

// Data layer for «Контроль сотрудников» (docs/posiflora/admin-map.md §2.6):
// workers list/detail, roles, cash-register shifts and florist devices.

export const STAFF_PAGE_SIZE = 25;

// The fixed access-right sets offered by the worker form (§2.6.2) — mirrors
// ACCESS_RIGHT_SETS in backend/app/routers/v1_staff.py.
export const ACCESS_RIGHT_SETS = [
  'Администратор',
  'Флорист',
  'Курьер',
  'Администратор точек',
  'Менеджер склада',
  'Менеджер по заказам',
];

export interface StaffSearchParams {
  page?: string;
}

export interface ShiftsSearchParams {
  store?: string;
  worker?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: string;
}

export interface WorkersListResult {
  workers: Worker[];
  total: number;
}

export async function getWorkersPage(params: StaffSearchParams): Promise<WorkersListResult> {
  const page = Math.max(1, parseInt(params.page || '1', 10) || 1);
  const qs = new URLSearchParams({
    'page[number]': String(page),
    'page[size]': String(STAFF_PAGE_SIZE),
  });
  const res = await adminFetch(`/api/v1/workers?${qs.toString()}`);
  if (!res.ok) return { workers: [], total: 0 };
  const json = await res.json();
  return { workers: json.data || [], total: json.meta?.total ?? 0 };
}

export async function getWorkerById(id: string): Promise<Worker | null> {
  const res = await adminFetch(`/api/v1/workers/${id}`);
  if (!res.ok) return null;
  const json = await res.json();
  return json.data ?? null;
}

export async function getRoles(): Promise<AdminRole[]> {
  const res = await adminFetch(`/api/v1/roles?page[size]=200`);
  if (!res.ok) return [];
  const json = await res.json();
  return json.data || [];
}

export async function getRoleById(id: string): Promise<AdminRole | null> {
  const res = await adminFetch(`/api/v1/roles/${id}`);
  if (!res.ok) return null;
  const json = await res.json();
  return json.data ?? null;
}

export interface ShiftsListResult {
  shifts: AdminShift[];
  total: number;
}

export async function getShifts(params: ShiftsSearchParams): Promise<ShiftsListResult> {
  const qs = new URLSearchParams();
  if (params.store) qs.set('filter[store]', params.store);
  if (params.worker) qs.set('filter[worker]', params.worker);
  if (params.dateFrom) qs.set('filter[dateFrom]', params.dateFrom);
  if (params.dateTo) qs.set('filter[dateTo]', params.dateTo);
  const page = Math.max(1, parseInt(params.page || '1', 10) || 1);
  qs.set('page[number]', String(page));
  qs.set('page[size]', String(STAFF_PAGE_SIZE));

  const res = await adminFetch(`/api/v1/shifts?${qs.toString()}`);
  if (!res.ok) return { shifts: [], total: 0 };
  const json = await res.json();
  return { shifts: json.data || [], total: json.meta?.total ?? 0 };
}

export async function getDevices(): Promise<AdminDevice[]> {
  const res = await adminFetch(`/api/v1/devices?page[size]=200`);
  if (!res.ok) return [];
  const json = await res.json();
  return json.data || [];
}
