import { NextRequest, NextResponse } from 'next/server';
import { adminMutate } from '@/lib/adminApi';

// PUT /admin/api/shop-settings — proxy for saving the «Онлайн-витрина»
// settings form (admin-map §2.3.2) to PUT /api/v1/shop-settings.
// Validation errors (400 — bad email/phone) pass through so the form can
// show them.
export async function PUT(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ detail: 'Некорректный запрос' }, { status: 400 });
  }
  const res = await adminMutate('/api/v1/shop-settings', 'PUT', body);
  const json = await res.json().catch(() => ({}));
  return NextResponse.json(json, { status: res.status });
}
