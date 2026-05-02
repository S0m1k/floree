'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useCart } from '@/lib/cart';
import { Bouquet } from '@/types';

interface BouquetWithImage extends Bouquet {
  imageUrl?: string | null;
}

export default function BouquetCard({ bouquet }: { bouquet: BouquetWithImage }) {
  const addItem = useCart((s) => s.addItem);

  const handleAddToCart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
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
    <Link
      href={`/bouquet/${bouquet.id}`}
      className="reveal group block bg-white overflow-hidden rounded-2xl shadow-sm hover:shadow-lg transition-shadow duration-400 flex flex-col"
    >
      {/* Image */}
      <div className="relative aspect-[4/5] overflow-hidden bg-[#f5f0eb]">
        {bouquet.imageUrl ? (
          <Image
            src={bouquet.imageUrl}
            alt={bouquet.attributes.title}
            fill
            unoptimized
            className="object-cover transition-transform duration-700 ease-out group-hover:scale-105"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-rose-50 to-pink-100">
            <span className="text-6xl select-none opacity-60">💐</span>
          </div>
        )}

        {/* Hover overlay */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-300 flex items-center justify-center">
          <span className="
            opacity-0 group-hover:opacity-100
            translate-y-2 group-hover:translate-y-0
            transition-all duration-300
            bg-white text-gray-900 text-sm font-medium
            px-5 py-2 rounded-full shadow-md
          ">
            Смотреть →
          </span>
        </div>

        {/* Price badge — top right */}
        <div className="absolute top-3 right-3">
          <span className="bg-white/95 backdrop-blur-sm text-gray-900 font-semibold text-sm px-3 py-1 rounded-full shadow-sm">
            {formatPrice(bouquet.attributes.saleAmount)} ₽
          </span>
        </div>
      </div>

      {/* Info */}
      <div className="p-4 flex flex-col flex-1">
        <h3 className="font-medium text-gray-800 text-sm leading-snug line-clamp-2 capitalize mb-3 flex-1">
          {bouquet.attributes.title}
        </h3>

        {/* "В корзину" — always visible on mobile, appears on hover on desktop */}
        <button
          onClick={handleAddToCart}
          className="
            w-full text-sm font-medium py-2.5 rounded-xl transition-all duration-200
            bg-rose-500 text-white hover:bg-rose-600 active:scale-[0.98]
            md:opacity-0 md:translate-y-1 md:group-hover:opacity-100 md:group-hover:translate-y-0
          "
        >
          В корзину
        </button>
      </div>
    </Link>
  );
}
