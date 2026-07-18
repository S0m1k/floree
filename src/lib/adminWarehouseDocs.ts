import { AdminWarehouseDoc, AdminWarehouseDocLine, AdminWarehouseDocType } from '@/types';
import { adminFetch } from './adminApi';

// Config (WAREHOUSE_DOCS, getDocConfig, isWarehouseDocType, buildWarehouseDocsHref,
// DOC_PAGE_SIZE) lives in warehouseDocsConfig.ts, which has no server-only
// imports — client components (WarehouseDocActions, WarehouseDocCreateForm)
// import it directly instead of pulling in adminFetch's next/headers chain.
// Re-exported here so existing server-side callers of this module keep working.
export {
  DOC_PAGE_SIZE,
  WAREHOUSE_DOCS,
  getDocConfig,
  isWarehouseDocType,
  buildWarehouseDocsHref,
} from './warehouseDocsConfig';
export type { WarehouseDocConfig, WarehouseDocsSearchParams } from './warehouseDocsConfig';

import { getDocConfig, DOC_PAGE_SIZE, WarehouseDocsSearchParams } from './warehouseDocsConfig';

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
