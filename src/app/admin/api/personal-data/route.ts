import { NextRequest, NextResponse } from 'next/server';
import { adminMutate } from '@/lib/adminApi';

// PUT /admin/api/personal-data — proxy for saving the «Форма заполнения
// политики» consent template (admin-map §2.7) to PUT /api/v1/personal-data.
// Validation errors (400 — bad ИНН) pass through so the form can show them.
export async function PUT(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ detail: 'Некорректный запрос' }, { status: 400 });
  }
  const res = await adminMutate('/api/v1/personal-data', 'PUT', body);
  const json = await res.json().catch(() => ({}));
  return NextResponse.json(json, { status: res.status });
}
