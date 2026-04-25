'use client';

import Image from 'next/image';
import Link from 'next/link';
import { CatalogItem } from '@/types';
import { useCart } from '@/lib/cart';

interface Props {
  item: CatalogItem;
}

export default function ProductCard({ item }: Props) {
  const addItem = useCart((s) => s.addItem);

  const handleAddToCart = (e: React.MouseEvent) => {
    e.preventDefault();
    addItem({
      id: item.id,
      title: item.attributes.title,
      price: item.attributes.minPrice,
      quantity: 1,
      imageUrl: item.attributes.imageUrl,
    });
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('ru-RU').format(Math.round(price));
  };

  return (
    <div className="group bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1 flex flex-col">
      <Link href={`/product/${item.id}`} className="block relative overflow-hidden aspect-square bg-rose-50">
        {item.attributes.imageUrl ? (
          <Image
            src={item.attributes.imageUrl}
            alt={item.attributes.title}
            fill
            className="object-cover group-hover:scale-105 transition-transform duration-500"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-rose-100 to-pink-200">
            <span className="text-6xl select-none">🌸</span>
          </div>
        )}
        {/* Price badge */}
        <div className="absolute top-3 right-3 bg-white/90 backdrop-blur-sm rounded-full px-3 py-1 shadow-sm">
          <span className="text-rose-600 font-semibold text-sm">
            от {formatPrice(item.attributes.minPrice)} ₽
          </span>
        </div>
      </Link>

      <div className="p-4 flex flex-col flex-1">
        <Link href={`/product/${item.id}`} className="block mb-1 hover:text-rose-600 transition-colors">
          <h3 className="font-semibold text-gray-800 text-base leading-snug line-clamp-2">
            {item.attributes.title}
          </h3>
        </Link>

        <div className="mt-1 mb-3">
          {item.attributes.minPrice === item.attributes.maxPrice ? (
            <p className="text-gray-500 text-sm">
              {formatPrice(item.attributes.minPrice)} ₽
            </p>
          ) : (
            <p className="text-gray-500 text-sm">
              {formatPrice(item.attributes.minPrice)} – {formatPrice(item.attributes.maxPrice)} ₽
            </p>
          )}
        </div>

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
