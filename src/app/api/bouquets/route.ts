import { NextResponse } from 'next/server';
import { posifloraFetch } from '@/lib/posiflora';
import { BouquetsResponse, Bouquet, BouquetImage } from '@/types';

export async function GET() {
  try {
    const data: BouquetsResponse = await posifloraFetch('/v1/bouquets?include=logo&page%5Bsize%5D=200');

    // Filter to only demonstrated bouquets with onWindowAt set
    const demonstratedBouquets = data.data.filter(
      (b: Bouquet) => b.attributes.status === 'demonstrated' && b.attributes.onWindowAt
    );

    // Build image lookup from included
    const imageMap: Record<string, BouquetImage> = {};
    (data.included || []).forEach((img: BouquetImage) => {
      if (img.type === 'images') imageMap[img.id] = img;
    });

    // Attach imageUrl to each bouquet for convenience
    const bouquetsWithImages = demonstratedBouquets.map((b: Bouquet) => {
      const logoId = b.relationships.logo?.data?.id;
      const image = logoId ? imageMap[logoId] : null;
      return {
        ...b,
        imageUrl: image?.attributes.fileShop || image?.attributes.file || null,
      };
    });

    return NextResponse.json({ data: bouquetsWithImages, meta: data.meta });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
