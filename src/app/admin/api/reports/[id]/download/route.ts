import { NextResponse } from 'next/server';
import { adminFetch } from '@/lib/adminApi';

// GET /admin/api/reports/[id]/download — proxy the «СКАЧАТЬ» row action on
// /admin/reports (admin-map §2.4.6). Streams the backend's CSV response
// straight through (content-type + content-disposition included) rather than
// re-wrapping it as JSON.
export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const res = await adminFetch(`/api/v1/reports/${params.id}/download`);
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    return NextResponse.json(json, { status: res.status });
  }
  const body = await res.arrayBuffer();
  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': res.headers.get('content-type') || 'text/csv; charset=utf-8',
      'Content-Disposition': res.headers.get('content-disposition') || 'attachment; filename="report.csv"',
    },
  });
}
