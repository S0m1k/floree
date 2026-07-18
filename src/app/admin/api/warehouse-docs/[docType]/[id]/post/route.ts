import { NextRequest, NextResponse } from 'next/server';
import { adminMutate } from '@/lib/adminApi';
import { isWarehouseDocType } from '@/lib/warehouseDocsConfig';

// POST /admin/api/warehouse-docs/[docType]/[id]/post — proxy «Провести»:
// posts a draft warehouse document, applying its StockBalance side effects
// server-side. Already-posted documents get a 409 straight from the backend.
export async function POST(
  _request: NextRequest,
  { params }: { params: { docType: string; id: string } },
) {
  if (!isWarehouseDocType(params.docType)) {
    return NextResponse.json({ detail: 'Неизвестный тип документа' }, { status: 404 });
  }
  const res = await adminMutate(
    `/api/v1/${params.docType}/${encodeURIComponent(params.id)}/post`,
    'POST',
    undefined,
  );
  const json = await res.json().catch(() => ({}));
  return NextResponse.json(json, { status: res.status });
}
