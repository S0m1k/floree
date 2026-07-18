import { NextRequest, NextResponse } from 'next/server';
import { adminMutate } from '@/lib/adminApi';

// PATCH/DELETE /admin/api/vendors/[id] — proxy editing/deleting a vendor
// (admin-map §2.4.4). DELETE surfaces the backend's 400 (system vendor) or
// 409 (vendor has linked packing invoices) straight through to the UI.

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ detail: 'Некорректный запрос' }, { status: 400 });
  }
  const res = await adminMutate(`/api/v1/vendors/${params.id}`, 'PATCH', body);
  const json = await res.json().catch(() => ({}));
  return NextResponse.json(json, { status: res.status });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  const res = await adminMutate(`/api/v1/vendors/${params.id}`, 'DELETE', undefined);
  if (res.status === 204) {
    return new NextResponse(null, { status: 204 });
  }
  const json = await res.json().catch(() => ({}));
  return NextResponse.json(json, { status: res.status });
}
