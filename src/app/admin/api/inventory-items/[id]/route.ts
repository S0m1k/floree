import { NextRequest, NextResponse } from 'next/server';
import { adminMutate } from '@/lib/adminApi';

// PATCH/DELETE /admin/api/inventory-items/[id] — proxy editing/soft-deleting
// a product (admin-map §2.3.4). DELETE surfaces the backend's 409 (item is
// referenced by a document/recipe/order) straight through to the UI.

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
  const res = await adminMutate(`/api/v1/inventory-items/${params.id}`, 'PATCH', body);
  const json = await res.json().catch(() => ({}));
  return NextResponse.json(json, { status: res.status });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  const res = await adminMutate(`/api/v1/inventory-items/${params.id}`, 'DELETE', undefined);
  const json = await res.json().catch(() => ({}));
  return NextResponse.json(json, { status: res.status });
}
