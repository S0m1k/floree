import { NextRequest, NextResponse } from 'next/server';
import { adminMutate } from '@/lib/adminApi';

// GET /admin/api/pos/orders/:id — карточка заказа для терминала: сам заказ +
// состав с итогами одним ответом (склейка GET /v1/orders/{id} и /items).
export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const id = encodeURIComponent(params.id);
  const [orderRes, itemsRes] = await Promise.all([
    adminMutate(`/api/v1/orders/${id}`, 'GET', undefined),
    adminMutate(`/api/v1/orders/${id}/items`, 'GET', undefined),
  ]);
  if (!orderRes.ok) {
    const json = await orderRes.json().catch(() => ({}));
    return NextResponse.json(json, { status: orderRes.status });
  }
  const orderJson = await orderRes.json().catch(() => ({}));
  const itemsJson = itemsRes.ok ? await itemsRes.json().catch(() => ({})) : {};
  return NextResponse.json({
    order: orderJson.data ?? null,
    items: itemsJson.data ?? [],
    totals: itemsJson.meta ?? null,
  });
}
