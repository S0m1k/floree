import { NextRequest, NextResponse } from 'next/server';
import { adminMutate } from '@/lib/adminApi';

// POST /admin/api/pos/orders/:id/payments — принять оплату по заказу в кассе.
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ detail: 'Некорректный запрос' }, { status: 400 });
  }
  const res = await adminMutate(
    `/api/v1/pos/orders/${encodeURIComponent(params.id)}/payments`,
    'POST',
    body,
  );
  const json = await res.json().catch(() => ({}));
  return NextResponse.json(json, { status: res.status });
}
