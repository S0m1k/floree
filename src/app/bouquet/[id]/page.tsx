import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import AddToCartButton from '@/components/AddToCartButton';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface Props {
  params: { id: string };
}

async function getBouquet(id: string) {
  const res = await fetch(`${API_URL}/bouquets/${id}`, { cache: 'no-store' });
  if (!res.ok) return null;
  return res.json();
}

export async function generateMetadata({ params }: Props) {
  const bouquet = await getBouquet(params.id);
  if (!bouquet) return { title: 'Букет — Floree' };
  return {
    title: `${bouquet.attributes.title} — Floree`,
    description: bouquet.attributes.description || `Купить ${bouquet.attributes.title} в Floree`,
  };
}

export default async function BouquetPage({ params }: Props) {
  const bouquet = await getBouquet(params.id);
  if (!bouquet) notFound();

  const formatPrice = (price: number) => new Intl.NumberFormat('ru-RU').format(Math.round(price));

  const cartItem = {
    id: bouquet.id,
    title: bouquet.attributes.title,
    price: bouquet.attributes.saleAmount,
    quantity: 1,
    imageUrl: bouquet.imageUrl ?? undefined,
  };

  return (
    <div className="min-h-screen bg-gray-50/30">
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <nav className="flex items-center gap-2 text-sm text-gray-400 flex-wrap">
            <Link href="/" className="hover:text-rose-500 transition-colors">Главная</Link>
            <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            <Link href="/catalog" className="hover:text-rose-500 transition-colors">Витрина</Link>
            <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            <span className="text-gray-600 font-medium line-clamp-1">{bouquet.attributes.title}</span>
          </nav>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
          {/* Image */}
          <div className="relative aspect-square rounded-3xl overflow-hidden bg-rose-50 shadow-lg">
            {bouquet.imageUrl ? (
              <Image
                src={bouquet.imageUrl}
                alt={bouquet.attributes.title}
                fill
                unoptimized
                className="object-cover"
                sizes="(max-width: 1024px) 100vw, 50vw"
                priority
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-rose-100 to-pink-200">
                <span className="text-[120px] select-none">💐</span>
              </div>
            )}
            <div className="absolute top-4 left-4">
              <span className="inline-flex items-center gap-1.5 bg-green-500 text-white text-sm font-semibold px-4 py-1.5 rounded-full shadow-sm">
                <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
                На витрине
              </span>
            </div>
          </div>

          {/* Details */}
          <div className="flex flex-col">
            <h1 className="font-serif text-3xl sm:text-4xl font-bold text-gray-800 mb-4 leading-tight capitalize">
              {bouquet.attributes.title}
            </h1>

            <div className="mb-6">
              <span className="text-4xl font-bold text-rose-600 font-serif">
                {formatPrice(bouquet.attributes.saleAmount)} ₽
              </span>
              {bouquet.attributes.amount !== bouquet.attributes.saleAmount && bouquet.attributes.amount > 0 && (
                <span className="ml-3 text-xl text-gray-400 line-through">
                  {formatPrice(bouquet.attributes.amount)} ₽
                </span>
              )}
            </div>

            {bouquet.attributes.description && (
              <p className="text-gray-600 leading-relaxed mb-8">{bouquet.attributes.description}</p>
            )}

            <div className="grid grid-cols-2 gap-4 mb-8">
              {bouquet.attributes.height > 0 && (
                <div className="bg-rose-50 rounded-xl p-4">
                  <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Высота</p>
                  <p className="font-semibold text-gray-800">{bouquet.attributes.height} см</p>
                </div>
              )}
              {bouquet.attributes.width > 0 && (
                <div className="bg-rose-50 rounded-xl p-4">
                  <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Ширина</p>
                  <p className="font-semibold text-gray-800">{bouquet.attributes.width} см</p>
                </div>
              )}
            </div>

            <div className="mb-8">
              <AddToCartButton item={cartItem} />
            </div>

            <div className="p-4 bg-green-50 rounded-xl text-sm text-green-700 flex items-start gap-2">
              <svg className="h-5 w-5 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>Доставим свежий букет в течение 2 часов после оформления заказа</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
