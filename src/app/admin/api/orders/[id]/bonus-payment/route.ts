import { NextRequest, NextResponse } from 'next/server';
import { adminMutate } from '@/lib/adminApi';

// PUT /admin/api/orders/[id]/bonus-payment — «Оплата бонусами» (admin-map
// §2.2.1). {amount: >= 0}; amount=0 fully reverses a previous charge. The
// backend validates against the customer's bonus balance and «К оплате»;
// 400 passes through to the modal.
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
  const res = await adminMutate(`/api/v1/orders/${params.id}/bonus-payment`, 'PUT', body);
  const json = await res.json().catch(() => ({}));
  return NextResponse.json(json, { status: res.status });
}
