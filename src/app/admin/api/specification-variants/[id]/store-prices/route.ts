import { NextRequest, NextResponse } from 'next/server';
import { adminMutate } from '@/lib/adminApi';

// PUT /admin/api/specification-variants/[id]/store-prices — «Активность на
// точках»: replaces the full per-store price set (a store missing from the
// body is removed — the corzinka delete). Proxies to the backend
// PUT /api/v1/specification-variants/{id}/store-prices.
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
  const res = await adminMutate(`/api/v1/specification-variants/${params.id}/store-prices`, 'PUT', body);
  const json = await res.json().catch(() => ({}));
  return NextResponse.json(json, { status: res.status });
}
