import { NextRequest, NextResponse } from 'next/server';
import { adminMutate } from '@/lib/adminApi';
import { isDictType } from '@/lib/adminSettings';

// POST /admin/api/dict/[type] — generic proxy for creating a reference
// dictionary entry (admin-map §2.7). `type` is validated against the fixed
// whitelist in adminSettings so this handler cannot be used to reach an
// arbitrary backend path.
export async function POST(
  request: NextRequest,
  { params }: { params: { type: string } },
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
  const res = await adminMutate(`/api/v1/${params.type}`, 'POST', body);
  const json = await res.json().catch(() => ({}));
  return NextResponse.json(json, { status: res.status });
}
