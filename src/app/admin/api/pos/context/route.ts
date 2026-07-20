import { NextRequest, NextResponse } from 'next/server';
import { adminMutate } from '@/lib/adminApi';

// GET /admin/api/pos/context?store=… — состояние кассы точки (открытая смена,
// ожидаемый нал, продажи смены). adminMutate вместо adminFetch: клиентскому
// экрану терминала нужен статус, а не redirect.
export async function GET(request: NextRequest) {
  const store = request.nextUrl.searchParams.get('store');
  if (!store) {
    return NextResponse.json({ detail: 'store обязателен' }, { status: 400 });
  }
  const res = await adminMutate(
    `/api/v1/pos/context?filter[store]=${encodeURIComponent(store)}`,
    'GET',
    undefined,
  );
  const json = await res.json().catch(() => ({}));
  return NextResponse.json(json, { status: res.status });
}
