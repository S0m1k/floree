import Link from 'next/link';
import { posifloraFetch } from '@/lib/posiflora';
import BouquetCard from '@/components/BouquetCard';
import { BouquetsResponse, Bouquet, BouquetImage } from '@/types';

export const metadata = {
  title: 'Витрина — Floree',
  description: 'Готовые букеты прямо из витрины Floree. Быстрая доставка.',
};

async function getBouquets() {
  try {
    const data: BouquetsResponse = await posifloraFetch('/v1/bouquets?include=logo&page%5Bsize%5D=200');

    const demonstratedBouquets = data.data.filter(
      (b: Bouquet) => b.attributes.status === 'demonstrated' && b.attributes.onWindowAt
    );

    const imageMap: Record<string, BouquetImage> = {};
    (data.included || []).forEach((img: BouquetImage) => {
      if (img.type === 'images') imageMap[img.id] = img;
    });

    return demonstratedBouquets.map((b: Bouquet) => {
      const logoId = b.relationships.logo?.data?.id;
      const image = logoId ? imageMap[logoId] : null;
      return {
        ...b,
        imageUrl: image?.attributes.fileShop || image?.attributes.file || null,
      };
    });
  } catch {
    return [];
  }
}

export default async function CatalogPage() {
  const bouquets = await getBouquets();

  return (
    <div className="min-h-screen bg-gray-50/30">
      {/* Hero */}
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          {/* Breadcrumb */}
          <nav className="flex items-center gap-2 text-sm text-gray-400 mb-6">
            <Link href="/" className="hover:text-rose-500 transition-colors">Главная</Link>
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            <span className="text-gray-600 font-medium">Витрина</span>
          </nav>

          <h1 className="font-serif text-4xl sm:text-5xl font-bold text-gray-800 mb-3">
            Витрина
          </h1>
          <p className="text-gray-500 text-lg max-w-xl">
            Готовые букеты, которые ждут вас прямо сейчас
          </p>
        </div>
      </div>

      {/* Bouquets Grid */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {bouquets.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-7xl mb-6">💐</div>
            <p className="text-gray-500 text-xl font-medium mb-2">
              Сейчас витрина обновляется — загляните позже!
            </p>
            <p className="text-gray-400 text-sm mb-8">Мы готовим для вас свежие букеты</p>
            <Link
              href="/"
              className="inline-flex items-center gap-2 bg-rose-500 text-white px-6 py-3 rounded-xl font-medium hover:bg-rose-600 transition-colors"
            >
              На главную
            </Link>
          </div>
        ) : (
          <>
            <p className="text-sm text-gray-400 mb-6">
              {bouquets.length}{' '}
              {bouquets.length === 1
                ? 'букет'
                : bouquets.length < 5
                ? 'букета'
                : 'букетов'}{' '}
              на витрине
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {bouquets.map((bouquet) => (
                <BouquetCard key={bouquet.id} bouquet={bouquet} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
