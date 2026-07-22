import { NextRequest, NextResponse } from 'next/server';
import { adminMutate } from '@/lib/adminApi';

// GET /admin/api/pos/recipes?store=… — рецепты с ценой точки («Собрать букет»).
export async function GET(request: NextRequest) {
  const store = request.nextUrl.searchParams.get('store');
  if (!store) {
    return NextResponse.json({ detail: 'store обязателен' }, { status: 400 });
  }
  const res = await adminMutate(
    `/api/v1/pos/recipes?filter[store]=${encodeURIComponent(store)}`,
    'GET',
    undefined,
  );
  const json = await res.json().catch(() => ({}));
  return NextResponse.json(json, { status: res.status });
}
