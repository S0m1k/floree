import { NextRequest, NextResponse } from 'next/server';
import { adminMutate } from '@/lib/adminApi';

// PUT /admin/api/specification-variants/[id]/composition — «Сохранить» in the
// «Состав варианта рецепта» modal: replaces the full row set. Proxies to the
// backend PUT /api/v1/specification-variants/{id}/composition.
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ detail: 'Некорректный запрос' }, { status: 400 });
  }
  const res = await adminMutate(`/api/v1/specification-variants/${params.id}/composition`, 'PUT', body);
  const json = await res.json().catch(() => ({}));
  return NextResponse.json(json, { status: res.status });
}
