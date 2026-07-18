import { NextRequest, NextResponse } from 'next/server';
import { adminMutate } from '@/lib/adminApi';
import { isWarehouseDocType } from '@/lib/warehouseDocsConfig';

// PATCH/DELETE /admin/api/warehouse-docs/[docType]/[id] — generic proxy for
// editing a draft (header + line items, whole-row replace) and deleting a
// draft warehouse document (admin-map §2.4.3). Posted documents get a 409
// straight from the backend — surfaced to the UI as-is.

function backendPath(docType: string, id: string): string {
  return `/api/v1/${docType}/${encodeURIComponent(id)}`;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { docType: string; id: string } },
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
  const res = await adminMutate(backendPath(params.docType, params.id), 'PATCH', body);
  const json = await res.json().catch(() => ({}));
  return NextResponse.json(json, { status: res.status });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { docType: string; id: string } },
) {
  if (!isWarehouseDocType(params.docType)) {
    return NextResponse.json({ detail: 'Неизвестный тип документа' }, { status: 404 });
  }
  const res = await adminMutate(backendPath(params.docType, params.id), 'DELETE', undefined);
  if (res.status === 204) {
    return new NextResponse(null, { status: 204 });
  }
  const json = await res.json().catch(() => ({}));
  return NextResponse.json(json, { status: res.status });
}
