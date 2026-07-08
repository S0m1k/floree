import { AdminWarehouseDoc, AdminWarehouseDocLine, AdminWarehouseDocType } from '@/types';
import { adminFetch } from './adminApi';

export const DOC_PAGE_SIZE = 25;

export interface WarehouseDocConfig {
  docType: AdminWarehouseDocType;
  apiPath: string;   // /api/v1/<apiPath> — backend/app/routers/v1_warehouse_docs.py
  route: string;      // /admin/<route>
  title: string;
  singular: string;  // detail card header, e.g. «Приходная накладная № …»
  createLabel: string;
  // MovementAct has no store_id column (only from_store_id/to_store_id), so
  // `filter[store]` is a no-op for it server-side — don't render that filter.
  hasStoreFilter: boolean;
}

export const WAREHOUSE_DOCS: WarehouseDocConfig[] = [
  {
    docType: 'packing-invoices', apiPath: 'packing-invoices', route: 'packing-invoices',
    title: 'Приходные накладные', singular: 'Приходная накладная',
    createLabel: 'Создать накладную', hasStoreFilter: true,
  },
  {
    docType: 'write-off-invoices', apiPath: 'write-off-invoices', route: 'writeoff-invoices',
    title: 'Накладные на списание', singular: 'Накладная на списание',
    createLabel: 'Создать накладную', hasStoreFilter: true,
  },
  {
    docType: 'markdown-acts', apiPath: 'markdown-acts', route: 'markdown-acts',
    title: 'Акты уценки', singular: 'Акт уценки',
    createLabel: 'Создать акт', hasStoreFilter: true,
  },
  {
    docType: 'sorting-acts', apiPath: 'sorting-acts', route: 'sorting-acts',
    title: 'Акты пересорта', singular: 'Акт пересорта',
    createLabel: 'Создать акт', hasStoreFilter: true,
  },
  {
    docType: 'inventory-acts', apiPath: 'inventory-acts', route: 'inventory-acts',
    title: 'Акты инвентаризаций', singular: 'Акт инвентаризации',
    createLabel: 'Создать акт', hasStoreFilter: true,
  },
  {
    docType: 'movement-acts', apiPath: 'movement-acts', route: 'movement-acts',
    title: 'Акты перемещений', singular: 'Акт перемещения',
    createLabel: 'Создать акт', hasStoreFilter: false,
  },
];

export function getDocConfig(docType: AdminWarehouseDocType): WarehouseDocConfig {
  const cfg = WAREHOUSE_DOCS.find((d) => d.docType === docType);
  if (!cfg) throw new Error(`Unknown warehouse doc type: ${docType}`);
  return cfg;
}

export interface WarehouseDocsSearchParams {
  store?: string;
  page?: string;
}

export interface WarehouseDocsListResult {
  docs: AdminWarehouseDoc[];
  total: number;
}

export async function getWarehouseDocs(
  docType: AdminWarehouseDocType,
  params: WarehouseDocsSearchParams
): Promise<WarehouseDocsListResult> {
  const cfg = getDocConfig(docType);
  const qs = new URLSearchParams();
  if (params.store) qs.set('filter[store]', params.store);
  const page = Math.max(1, parseInt(params.page || '1', 10) || 1);
  qs.set('page[number]', String(page));
  qs.set('page[size]', String(DOC_PAGE_SIZE));

  const res = await adminFetch(`/api/v1/${cfg.apiPath}?${qs.toString()}`);
  if (!res.ok) return { docs: [], total: 0 };
  const json = await res.json();
  return { docs: json.data || [], total: json.meta?.total ?? 0 };
}

export interface WarehouseDocDetailResult {
  doc: AdminWarehouseDoc;
  lines: AdminWarehouseDocLine[];
}

export async function getWarehouseDoc(
  docType: AdminWarehouseDocType,
  id: string
): Promise<WarehouseDocDetailResult | null> {
  const cfg = getDocConfig(docType);
  const res = await adminFetch(`/api/v1/${cfg.apiPath}/${id}`);
  if (!res.ok) return null;
  const json = await res.json();
  if (!json.data) return null;
  return { doc: json.data, lines: json.included || [] };
}

export function buildWarehouseDocsHref(
  route: string,
  current: WarehouseDocsSearchParams,
  overrides: Partial<WarehouseDocsSearchParams>
): string {
  const merged: Record<string, string> = {};
  for (const [key, value] of Object.entries({ ...current, ...overrides })) {
    if (value) merged[key] = value;
  }
  const qs = new URLSearchParams(merged);
  const query = qs.toString();
  return query ? `/admin/${route}?${query}` : `/admin/${route}`;
}
