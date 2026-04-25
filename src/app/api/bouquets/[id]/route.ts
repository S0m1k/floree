import { NextResponse } from 'next/server';
import { posifloraFetch } from '@/lib/posiflora';

export async function GET(_: Request, { params }: { params: { id: string } }) {
  try {
    const data = await posifloraFetch(`/v1/bouquets/${params.id}?include=logo`);

    // Build image map from included
    const imageMap: Record<string, any> = {};
    (data.included || []).forEach((img: any) => { imageMap[img.id] = img; });

    const logoId = data.data?.relationships?.logo?.data?.id;
    const image = logoId ? imageMap[logoId] : null;
    const bouquet = {
      ...data.data,
      imageUrl: image?.attributes?.fileShop || image?.attributes?.file || null,
    };

    return NextResponse.json({ data: bouquet });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
