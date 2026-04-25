import { NextResponse } from 'next/server';
import { posifloraFetch } from '@/lib/posiflora';

export async function GET() {
  try {
    const data = await posifloraFetch('/v1/catalog/categories');
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
