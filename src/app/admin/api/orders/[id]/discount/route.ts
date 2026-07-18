import { NextRequest, NextResponse } from 'next/server';
import { adminMutate } from '@/lib/adminApi';

// PUT /admin/api/orders/[id]/discount — apply a discount/markup to the whole
// order or one composition line (admin-map §2.2.1, итоговая панель СКИДКА/
// НАДБАВКА + «Скидка/Надбавка на позицию»). The backend computes the money
// amount from the target's own base; 400/409 pass through to the modal.
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
  const res = await adminMutate(`/api/v1/orders/${params.id}/discount`, 'PUT', body);
  const json = await res.json().catch(() => ({}));
  return NextResponse.json(json, { status: res.status });
}

// DELETE /admin/api/orders/[id]/discount?target=order|item&itemId=…&kind=discount|markup
// — «Снять» скидку/надбавку.
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const qs = request.nextUrl.search;
  const res = await adminMutate(`/api/v1/orders/${params.id}/discount${qs}`, 'DELETE', undefined);
  const json = await res.json().catch(() => ({}));
  return NextResponse.json(json, { status: res.status });
}
