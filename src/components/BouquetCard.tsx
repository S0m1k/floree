'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useCart } from '@/lib/cart';
import { Bouquet } from '@/types';

interface BouquetWithImage extends Bouquet {
  imageUrl?: string | null;
}

interface Props {
  bouquet: BouquetWithImage;
}

export default function BouquetCard({ bouquet }: Props) {
  const addItem = useCart((s) => s.addItem);

  const handleAddToCart = (e: React.MouseEvent) => {
    e.preventDefault();
    addItem({
      id: bouquet.id,
      title: bouquet.attributes.title,
      price: bouquet.attributes.saleAmount,
      quantity: 1,
      imageUrl: bouquet.imageUrl ?? undefined,
    });
  };

  const formatPrice = (price: number) =>
    new Intl.NumberFormat('ru-RU').format(Math.round(price));

  return (
    <div className="group bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1 flex flex-col">
      <Link href={`/bouquet/${bouquet.id}`} className="block relative overflow-hidden aspect-square bg-rose-50">
        {bouquet.imageUrl ? (
          <Image
            src={bouquet.imageUrl}
            alt={bouquet.attributes.title}
            fill
            unoptimized
            className="object-cover group-hover:scale-105 transition-transform duration-500"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-rose-100 to-pink-200">
            <span className="text-6xl select-none">💐</span>
          </div>
        )}

        {/* Status badge */}
        <div className="absolute top-3 left-3">
          <span className="inline-flex items-center gap-1.5 bg-green-500 text-white text-xs font-semibold px-3 py-1 rounded-full shadow-sm">
            <span className="w-1.5 h-1.5 bg-white rounded-full" />
            На витрине
          </span>
        </div>

        {/* Price badge */}
        <div className="absolute top-3 right-3 bg-white/90 backdrop-blur-sm rounded-full px-3 py-1 shadow-sm">
          <span className="text-rose-600 font-semibold text-sm">
            {formatPrice(bouquet.attributes.saleAmount)} ₽
          </span>
        </div>
      </Link>

      <div className="p-4 flex flex-col flex-1">
        <Link href={`/bouquet/${bouquet.id}`} className="block mb-3 hover:text-rose-600 transition-colors">
          <h3 className="font-semibold text-gray-800 text-base leading-snug line-clamp-2 capitalize">
            {bouquet.attributes.title}
          </h3>
        </Link>

        <div className="mt-auto">
          <button
            onClick={handleAddToCart}
            className="w-full bg-rose-500 hover:bg-rose-600 active:bg-rose-700 text-white font-medium py-2.5 px-4 rounded-xl transition-colors duration-200 text-sm"
          >
            В корзину
          </button>
        </div>
      </div>
    </div>
  );
}
