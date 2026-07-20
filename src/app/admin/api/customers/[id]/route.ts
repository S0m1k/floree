import { NextRequest, NextResponse } from 'next/server';
import { adminMutate } from '@/lib/adminApi';

// PATCH /admin/api/customers/[id] — proxy a customer edit (or a manual bonus
// balance adjustment) to the backend PATCH /api/v1/customers/{id}. Validation
// errors (400) and 404 are forwarded so the client can surface them.
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
  const res = await adminMutate(`/api/v1/customers/${params.id}`, 'PATCH', body);
  const json = await res.json().catch(() => ({}));
  return NextResponse.json(json, { status: res.status });
}

// DELETE /admin/api/customers/[id] — proxy customer deletion to the backend
// DELETE /api/v1/customers/{id}. A 409 (customer has orders) is forwarded so
// the row menu can surface it.
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  const res = await adminMutate(`/api/v1/customers/${params.id}`, 'DELETE', undefined);
  if (res.status === 204) {
    return new NextResponse(null, { status: 204 });
  }
  const json = await res.json().catch(() => ({}));
  return NextResponse.json(json, { status: res.status });
}
