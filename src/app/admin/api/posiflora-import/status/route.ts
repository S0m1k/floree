import { NextResponse } from 'next/server';
import { adminFetch } from '@/lib/adminApi';

export async function GET() {
  const res = await adminFetch('/api/v1/posiflora-import/status');
  const json = await res.json().catch(() => ({}));
  return NextResponse.json(json, { status: res.status });
}
