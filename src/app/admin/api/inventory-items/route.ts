import { NextRequest, NextResponse } from 'next/server';
import { adminMutate } from '@/lib/adminApi';

// POST /admin/api/inventory-items — proxy «Создать продукт» (admin-map
// §2.3.4) to the backend POST /api/v1/inventory-items.
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ detail: 'Некорректный запрос' }, { status: 400 });
  }
  const res = await adminMutate('/api/v1/inventory-items', 'POST', body);
  const json = await res.json().catch(() => ({}));
  return NextResponse.json(json, { status: res.status });
}
