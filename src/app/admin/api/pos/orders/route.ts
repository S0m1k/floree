import { NextRequest, NextResponse } from 'next/server';
import { adminMutate } from '@/lib/adminApi';

// GET /admin/api/pos/orders?store=…&date=YYYY-MM-DD — заказы точки за день
// для вкладки «Заказы» терминала (группировка по статусам — на клиенте).
export async function GET(request: NextRequest) {
  const store = request.nextUrl.searchParams.get('store');
  const date = request.nextUrl.searchParams.get('date');
  if (!store || !date) {
    return NextResponse.json({ detail: 'store и date обязательны' }, { status: 400 });
  }
  const qs = new URLSearchParams({
    'filter[store]': store,
    'filter[createdFrom]': date,
    'filter[createdTo]': date,
    'page[size]': '100',
    sort: '-createdAt',
  });
  const res = await adminMutate(`/api/v1/orders?${qs}`, 'GET', undefined);
  const json = await res.json().catch(() => ({}));
  return NextResponse.json(json, { status: res.status });
}
