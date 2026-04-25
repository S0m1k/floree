import { NextRequest, NextResponse } from 'next/server';
import { posifloraFetch } from '@/lib/posiflora';

export async function POST(req: NextRequest) {
  const body = await req.json();
  try {
    const data = await posifloraFetch('/v1/orders', {
      method: 'POST',
      body: JSON.stringify({
        data: {
          type: 'orders',
          attributes: {
            status: 'new',
            ...body.attributes,
          },
        },
      }),
    });
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
