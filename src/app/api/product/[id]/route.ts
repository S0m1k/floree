import { NextResponse } from 'next/server';
import { posifloraFetch } from '@/lib/posiflora';

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const data = await posifloraFetch(`/v1/catalog/inventory-items/${params.id}`);
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
