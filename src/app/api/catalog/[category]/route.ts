import { NextResponse } from 'next/server';
import { posifloraFetch } from '@/lib/posiflora';

export async function GET(
  _req: Request,
  { params }: { params: { category: string } }
) {
  try {
    const data = await posifloraFetch(`/v1/catalog/${params.category}`);
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
