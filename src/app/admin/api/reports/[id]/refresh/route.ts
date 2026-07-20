import { NextRequest, NextResponse } from 'next/server';
import { adminMutate } from '@/lib/adminApi';

// POST /admin/api/reports/[id]/refresh — proxy the «ОБНОВИТЬ» row action on
// /admin/reports (admin-map §2.4.6) to the backend
// POST /api/v1/reports/{id}/refresh.
export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  const res = await adminMutate(`/api/v1/reports/${params.id}/refresh`, 'POST', undefined);
  const json = await res.json().catch(() => ({}));
  return NextResponse.json(json, { status: res.status });
}
