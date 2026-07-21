import { NextRequest, NextResponse } from 'next/server';
import { adminMutate } from '@/lib/adminApi';

// POST /admin/api/pos/fiscal-receipts/:id/retry — повторить упавший чек aQsi.
export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  const res = await adminMutate(
    `/api/v1/pos/fiscal-receipts/${encodeURIComponent(params.id)}/retry`,
    'POST',
    {},
  );
  const json = await res.json().catch(() => ({}));
  return NextResponse.json(json, { status: res.status });
}
