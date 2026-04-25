import { NextRequest, NextResponse } from 'next/server';
import { posifloraFetch } from '@/lib/posiflora';

const STORE_ID = process.env.POSIFLORA_STORE_ID!;
const SOURCE_ID = process.env.POSIFLORA_SOURCE_ID!;

export async function POST(req: NextRequest) {
  const body = await req.json();
  try {
    const { bouquetIds, attributes } = body;

    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const docNo = Date.now().toString().slice(-12);

    const orderData = {
      data: {
        type: 'orders',
        attributes: {
          status: 'new',
          date: today,
          docNo,
          delivery: true,
          deliveryContact: attributes.customerName,
          deliveryPhoneNumber: attributes.phone,
          deliveryComments: [attributes.address, attributes.comment].filter(Boolean).join(' — '),
          ...(attributes.dueTime ? { dueTime: attributes.dueTime } : {}),
        },
        relationships: {
          store: { data: { type: 'stores', id: STORE_ID } },
          source: { data: { type: 'order-sources', id: SOURCE_ID } },
          ...(bouquetIds?.length
            ? { bouquets: { data: bouquetIds.map((id: string) => ({ type: 'bouquets', id })) } }
            : {}),
        },
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
