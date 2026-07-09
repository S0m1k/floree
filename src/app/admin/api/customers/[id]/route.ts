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
