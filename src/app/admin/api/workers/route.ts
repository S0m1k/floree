import { NextRequest, NextResponse } from 'next/server';
import { adminMutate } from '@/lib/adminApi';

// POST /admin/api/workers — proxy the «Новый сотрудник» form submission to the
// backend POST /api/v1/workers with the worker's Bearer token (read
// server-side from the httpOnly cookie). Backend validation errors (400 —
// duplicate login, bad PIN, …) pass through so the form can show them.
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ detail: 'Некорректный запрос' }, { status: 400 });
  }
  const res = await adminMutate('/api/v1/workers', 'POST', body);
  const json = await res.json().catch(() => ({}));
  return NextResponse.json(json, { status: res.status });
}
