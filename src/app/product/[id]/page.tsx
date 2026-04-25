import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { posifloraFetch } from '@/lib/posiflora';
import AddToCartButton from '@/components/AddToCartButton';

interface Props {
  params: { id: string };
}

async function getProduct(id: string) {
  try {
    const data = await posifloraFetch(`/v1/catalog/inventory-items/${id}`);
    return data?.data ?? null;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: Props) {
  const product = await getProduct(params.id);
  if (!product) return { title: 'Товар не найден — Floree' };
  return {
    title: `${product.attributes.title} — Floree`,
    description: product.attributes.description ?? `Купить ${product.attributes.title} в Floree`,
  };
}

export default async function ProductPage({ params }: Props) {
  const product = await getProduct(params.id);

  if (!product) {
    notFound();
  }

  const { title, minPrice, maxPrice, imageUrl, description } = product.attributes;

  const formatPrice = (price: number) =>
    new Intl.NumberFormat('ru-RU').format(Math.round(price));

  const cartItem = {
    id: product.id,
    title,
    price: minPrice,
    quantity: 1,
    imageUrl: imageUrl ?? undefined,
  };

  return (
    <div className="min-h-screen bg-gray-50/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-gray-400 mb-8 flex-wrap">
          <Link href="/" className="hover:text-rose-500 transition-colors">Главная</Link>
          <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <Link href="/catalog" className="hover:text-rose-500 transition-colors">Каталог</Link>
          <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <span className="text-gray-600 font-medium line-clamp-1">{title}</span>
        </nav>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16">
          {/* Image */}
          <div className="relative aspect-square rounded-3xl overflow-hidden bg-gradient-to-br from-rose-50 to-pink-100 shadow-lg">
            {imageUrl ? (
              <Image
                src={imageUrl}
                alt={title}
                fill
                className="object-cover"
                sizes="(max-width: 1024px) 100vw, 50vw"
                priority
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-[140px] leading-none select-none">🌸</span>
              </div>
            )}
          </div>

          {/* Details */}
          <div className="flex flex-col justify-center">
            <div className="inline-flex items-center gap-2 bg-green-50 text-green-700 text-xs font-medium px-3 py-1.5 rounded-full w-fit mb-4">
              <span className="w-1.5 h-1.5 bg-green-500 rounded-full" />
              В наличии
            </div>

            <h1 className="font-serif text-3xl sm:text-4xl font-bold text-gray-800 mb-4 leading-tight">
              {title}
            </h1>

            {/* Price */}
            <div className="mb-6">
              {minPrice === maxPrice ? (
                <p className="text-3xl font-bold text-rose-600">
                  {formatPrice(minPrice)} ₽
                </p>
              ) : (
                <div>
                  <p className="text-3xl font-bold text-rose-600">
                    от {formatPrice(minPrice)} ₽
                  </p>
                  <p className="text-sm text-gray-400 mt-1">
                    до {formatPrice(maxPrice)} ₽
                  </p>
                </div>
              )}
            </div>

            {/* Description */}
            {description && (
              <div className="mb-8 p-5 bg-white rounded-2xl border border-gray-100 shadow-sm">
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Описание
                </h3>
                <p className="text-gray-600 leading-relaxed text-sm whitespace-pre-wrap">
                  {description}
                </p>
              </div>
            )}

            {/* Add to cart */}
            <div className="mb-8">
              <AddToCartButton item={cartItem} />
            </div>

            {/* Features */}
            <div className="grid grid-cols-3 gap-4">
              {[
                { icon: '🚚', label: 'Доставка', sub: '2 часа' },
                { icon: '🌿', label: 'Свежие', sub: 'цветы' },
                { icon: '🎁', label: 'Упаковка', sub: 'в подарок' },
              ].map(({ icon, label, sub }) => (
                <div
                  key={label}
                  className="bg-gray-50 rounded-xl p-3 text-center"
                >
                  <div className="text-2xl mb-1">{icon}</div>
                  <div className="text-xs font-semibold text-gray-700">{label}</div>
                  <div className="text-xs text-gray-400">{sub}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
