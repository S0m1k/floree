import { NextRequest, NextResponse } from 'next/server';
import { adminMutate } from '@/lib/adminApi';

// DELETE /admin/api/promo-codes/{code} — remove a promo code.
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { code: string } }
) {
  const res = await adminMutate(
    `/api/v1/promo-codes/${encodeURIComponent(params.code)}`,
    'DELETE',
    undefined
  );
  const json = await res.json().catch(() => ({}));
  return NextResponse.json(json, { status: res.status });
}
