import { NextRequest, NextResponse } from 'next/server';
import { adminFetch } from '@/lib/adminApi';

const ENTITIES = new Set(['customers', 'items']);

// GET /admin/api/imports/[entity]/template — «Скачать пример» button, proxies
// the backend's CSV example through with the worker's Bearer token (the
// browser can't attach it to a plain <a href> pointed at the API directly).
export async function GET(
  _request: NextRequest,
  { params }: { params: { entity: string } },
) {
  if (!ENTITIES.has(params.entity)) {
    return NextResponse.json({ detail: 'Unknown import entity' }, { status: 404 });
  }

  const res = await adminFetch(`/api/v1/imports/${params.entity}/template`);
  if (!res.ok) {
    return NextResponse.json({ detail: 'Не удалось скачать пример' }, { status: res.status });
  }
  const buf = await res.arrayBuffer();
  return new NextResponse(buf, {
    status: 200,
    headers: {
      'Content-Type': res.headers.get('content-type') || 'text/csv; charset=utf-8',
      'Content-Disposition':
        res.headers.get('content-disposition') || `attachment; filename="${params.entity}-example.csv"`,
    },
  });
}
