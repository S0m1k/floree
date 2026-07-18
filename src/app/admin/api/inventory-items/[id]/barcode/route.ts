import { NextRequest, NextResponse } from 'next/server';
import { adminMutate } from '@/lib/adminApi';

// POST /admin/api/inventory-items/[id]/barcode — proxy «Сгенерировать
// штрих-коды» (admin-map §2.3.4) to the backend. Idempotent: an item that
// already has a barcode gets it echoed back unchanged.
export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  const res = await adminMutate(`/api/v1/inventory-items/${params.id}/barcode`, 'POST', undefined);
  const json = await res.json().catch(() => ({}));
  return NextResponse.json(json, { status: res.status });
}
