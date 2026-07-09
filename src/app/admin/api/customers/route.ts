import { NextRequest, NextResponse } from 'next/server';
import { adminMutate } from '@/lib/adminApi';

// POST /admin/api/customers — proxy the create-customer form submission to the
// backend POST /api/v1/customers with the worker's Bearer token (read
// server-side from the httpOnly cookie). Backend validation errors (400 —
// duplicate phone, bad phone, length limits) pass straight through so the
// client form can show them.
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ detail: 'Некорректный запрос' }, { status: 400 });
  }
  const res = await adminMutate('/api/v1/customers', 'POST', body);
  const json = await res.json().catch(() => ({}));
  return NextResponse.json(json, { status: res.status });
}
