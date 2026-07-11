import { NextResponse } from 'next/server';
import { adminMutate } from '@/lib/adminApi';

// DELETE /admin/api/orders/[id]/items/[itemId] — remove a composition line
// (a bouquet row takes its component rows with it; the backend recomputes the
// order total). 404 / 409 (terminal order) pass through.
export async function DELETE(
  _request: Request,
  { params }: { params: { id: string; itemId: string } },
) {
  const res = await adminMutate(
    `/api/v1/orders/${params.id}/items/${params.itemId}`,
    'DELETE',
    undefined,
  );
  const json = await res.json().catch(() => ({}));
  return NextResponse.json(json, { status: res.status });
}
