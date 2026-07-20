import { NextRequest, NextResponse } from 'next/server';
import { adminMutate } from '@/lib/adminApi';

// GET /admin/api/pos/products?store=… — товарная витрина кассы: продаваемые
// букеты точки (с возрастом для бейджа срока жизни) + позиции каталога с
// розничной ценой и фото. Склейка и фильтрация — на бэкенде (/v1/pos/products).
export async function GET(request: NextRequest) {
  const store = request.nextUrl.searchParams.get('store');
  if (!store) {
    return NextResponse.json({ detail: 'store обязателен' }, { status: 400 });
  }
  const res = await adminMutate(
    `/api/v1/pos/products?filter[store]=${encodeURIComponent(store)}`,
    'GET',
    undefined,
  );
  const json = await res.json().catch(() => ({}));
  return NextResponse.json(json, { status: res.status });
}
