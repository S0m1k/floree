import { NextResponse } from 'next/server';
import { adminMutate } from '@/lib/adminApi';

export async function POST() {
  const res = await adminMutate('/api/v1/posiflora-import/run', 'POST', {});
  const json = await res.json().catch(() => ({}));
  return NextResponse.json(json, { status: res.status });
}
