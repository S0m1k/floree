import { NextRequest, NextResponse } from 'next/server';
import { adminMutate } from '@/lib/adminApi';

// PATCH /admin/api/orders/[id] — proxy a general order-card edit (tags,
// comment, budget) to the backend PATCH /api/v1/orders/{id}. Separate from
// .../[id]/status, which is dedicated to the status-change control; a 400
// (unknown tag / overlong comment) or 409 (status change on a terminal order)
// is forwarded so the client can surface it.
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
  const res = await adminMutate(`/api/v1/orders/${params.id}`, 'PATCH', body);
  const json = await res.json().catch(() => ({}));
  return NextResponse.json(json, { status: res.status });
}
