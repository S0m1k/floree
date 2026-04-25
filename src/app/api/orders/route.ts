import { NextRequest, NextResponse } from 'next/server';
import { posifloraFetch } from '@/lib/posiflora';

export async function POST(req: NextRequest) {
  const body = await req.json();
  try {
    const { bouquetIds, attributes } = body;

    const orderData = {
      data: {
        type: 'orders',
        attributes: {
          status: 'new',
          phone: attributes.phone,
          customerName: attributes.customerName,
          address: attributes.address,
          comment: attributes.comment,
          dueTime: attributes.dueTime || null,
        },
        relationships: bouquetIds?.length
          ? {
              bouquets: {
                data: bouquetIds.map((id: string) => ({ type: 'bouquets', id })),
              },
            }
          : undefined,
      },
    };

    const data = await posifloraFetch('/v1/orders', {
      method: 'POST',
      body: JSON.stringify(orderData),
    });

    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
