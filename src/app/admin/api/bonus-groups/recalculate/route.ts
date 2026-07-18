import { NextResponse } from 'next/server';
import { adminMutate } from '@/lib/adminApi';

// POST /admin/api/bonus-groups/recalculate — proxy the «Пересчитать группы»
// button (admin-map §2.5.4) to the backend POST /api/v1/bonus-groups/recalculate,
// which reassigns every customer's bonus group by lifetime order total and
// returns {"updated": N}.
export async function POST() {
  const res = await adminMutate('/api/v1/bonus-groups/recalculate', 'POST', undefined);
  const json = await res.json().catch(() => ({}));
  return NextResponse.json(json, { status: res.status });
}
