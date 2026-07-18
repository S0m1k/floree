import { NextRequest, NextResponse } from 'next/server';
import { adminMutate } from '@/lib/adminApi';
import { isWarehouseDocType } from '@/lib/warehouseDocsConfig';

// POST /admin/api/warehouse-docs/[docType] — generic proxy for creating a
// warehouse document draft (admin-map §2.4.3: packing-invoices,
// write-off-invoices, markdown-acts, sorting-acts, inventory-acts,
// movement-acts). `docType` is validated against the fixed WAREHOUSE_DOCS
// list so this can't be steered to an arbitrary backend path.
export async function POST(
  request: NextRequest,
  { params }: { params: { docType: string } },
) {
  if (!isWarehouseDocType(params.docType)) {
    return NextResponse.json({ detail: 'Неизвестный тип документа' }, { status: 404 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ detail: 'Некорректный запрос' }, { status: 400 });
  }
  const res = await adminMutate(`/api/v1/${params.docType}`, 'POST', body);
  const json = await res.json().catch(() => ({}));
  return NextResponse.json(json, { status: res.status });
}
