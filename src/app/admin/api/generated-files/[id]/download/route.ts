import { NextResponse } from 'next/server';
import { adminFetch } from '@/lib/adminApi';

// GET /admin/api/generated-files/[id]/download — «Скачать» row action on
// /admin/exports-list and /admin/items-export (admin-map §2.4.5/§2.4.8) for
// customers/items export history rows. Streams the backend's CSV response
// straight through, same shape as /admin/api/reports/[id]/download.
export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const res = await adminFetch(`/api/v1/generated-files/${params.id}/download`);
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    return NextResponse.json(json, { status: res.status });
  }
  const body = await res.arrayBuffer();
  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': res.headers.get('content-type') || 'text/csv; charset=utf-8',
      'Content-Disposition': res.headers.get('content-disposition') || 'attachment; filename="export.csv"',
    },
  });
}
