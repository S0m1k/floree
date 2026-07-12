import { NextRequest, NextResponse } from 'next/server';
import { adminMutate } from '@/lib/adminApi';

// PATCH /admin/api/specification-variants/[id] — rename a quantity variant.
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
  const res = await adminMutate(`/api/v1/specification-variants/${params.id}`, 'PATCH', body);
  const json = await res.json().catch(() => ({}));
  return NextResponse.json(json, { status: res.status });
}

// DELETE /admin/api/specification-variants/[id] — «Удалить» a quantity
// variant (400 if it's the recipe's last one).
export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const res = await adminMutate(`/api/v1/specification-variants/${params.id}`, 'DELETE', undefined);
  const json = await res.json().catch(() => ({}));
  return NextResponse.json(json, { status: res.status });
}
