// Pure config for the six warehouse document types (admin-map §2.4.3) — no
// server-only imports (next/headers via adminApi), so client components can
// import this directly instead of pulling in adminWarehouseDocs.ts's data
// fetchers. adminWarehouseDocs.ts re-exports everything here for existing
// server-side callers.

import { AdminWarehouseDocType } from '@/types';

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

// Whitelist guard for the generic /admin/api/warehouse-docs/[docType] proxy
// (mirrors isDictType in adminSettings.ts) — docType doubles as the backend
// apiPath for every entry in WAREHOUSE_DOCS, so this also validates the
// segment forwarded straight into the backend URL.
export function isWarehouseDocType(value: string): value is AdminWarehouseDocType {
  return WAREHOUSE_DOCS.some((d) => d.docType === value);
}

export interface WarehouseDocsSearchParams {
  store?: string;
  page?: string;
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
