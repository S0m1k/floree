import { NextRequest, NextResponse } from 'next/server';
import { adminMutate } from '@/lib/adminApi';
import { isDictType } from '@/lib/adminSettings';

// PATCH/DELETE /admin/api/dict/[type]/[id] — generic proxy for editing
// (celebrations, measures) and deleting reference dictionary entries
// (admin-map §2.7). `type` is validated against the whitelist and the id is
// URL-encoded, so the proxy cannot be steered to an arbitrary backend path.

function backendPath(type: string, id: string): string {
  return `/api/v1/${type}/${encodeURIComponent(id)}`;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { type: string; id: string } },
) {
  if (!isDictType(params.type)) {
    return NextResponse.json({ detail: 'Неизвестный справочник' }, { status: 404 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ detail: 'Некорректный запрос' }, { status: 400 });
  }
  const res = await adminMutate(backendPath(params.type, params.id), 'PATCH', body);
  const json = await res.json().catch(() => ({}));
  return NextResponse.json(json, { status: res.status });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { type: string; id: string } },
) {
  if (!isDictType(params.type)) {
    return NextResponse.json({ detail: 'Неизвестный справочник' }, { status: 404 });
  }
  const res = await adminMutate(backendPath(params.type, params.id), 'DELETE', undefined);
  if (res.status === 204) {
    return new NextResponse(null, { status: 204 });
  }
  const json = await res.json().catch(() => ({}));
  return NextResponse.json(json, { status: res.status });
}
