import { NextRequest, NextResponse } from 'next/server';
import { adminMutate } from '@/lib/adminApi';

// POST /admin/api/orders/[id]/items — add a composition line. The body carries
// only the source id ({bouquetId} or {inventoryItemId, quantity}); prices are
// resolved server-side by the backend (admin-map §2.2.1 — никогда с клиента).
// 400 (validation) / 409 (terminal order) pass through for the modal to show.
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ detail: 'Некорректный запрос' }, { status: 400 });
  }
  const res = await adminMutate(`/api/v1/orders/${params.id}/items`, 'POST', body);
  const json = await res.json().catch(() => ({}));
  return NextResponse.json(json, { status: res.status });
}
