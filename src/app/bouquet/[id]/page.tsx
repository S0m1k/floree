import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import AddToCartButton from '@/components/AddToCartButton';

const API_URL = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface Props {
  params: { id: string };
}

async function getBouquet(id: string) {
  const res = await fetch(`${API_URL}/api/bouquets/${id}`, { cache: 'no-store' });
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
    <div className="min-h-screen" style={{ background: 'var(--paper)', paddingTop: 88 }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16 pt-10">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">

          {/* Image */}
          <div className="relative aspect-square overflow-hidden" style={{ background: 'var(--bone)' }}>
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
              <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'var(--bone)' }} />
            )}
            <div className="absolute top-4 left-4">
              <span className="eyebrow" style={{ background: 'var(--paper)', padding: '4px 10px', color: 'var(--ink)' }}>
                На витрине
              </span>
            </div>
          </div>

          {/* Details */}
          <div className="flex flex-col">
            <p className="eyebrow mb-4">
              <Link href="/catalog" style={{ color: 'var(--ink-3)' }}>Витрина</Link>
              {' / '}
              <span style={{ color: 'var(--ink)' }}>{bouquet.attributes.title}</span>
            </p>

            <h1 className="serif capitalize mb-6" style={{ fontSize: 'clamp(1.8rem, 4vw, 2.8rem)', color: 'var(--ink)', lineHeight: 1.1 }}>
              {bouquet.attributes.title}
            </h1>

            <div className="mb-8" style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
              <span className="serif" style={{ fontSize: '2rem', color: 'var(--plum)' }}>
                {formatPrice(bouquet.attributes.saleAmount)} ₽
              </span>
              {bouquet.attributes.amount !== bouquet.attributes.saleAmount && bouquet.attributes.amount > 0 && (
                <span style={{ fontSize: '1.2rem', color: 'var(--ink-3)', textDecoration: 'line-through' }}>
                  {formatPrice(bouquet.attributes.amount)} ₽
                </span>
              )}
            </div>

            {bouquet.attributes.description && (
              <p className="mb-8" style={{ color: 'var(--ink-2)', lineHeight: 1.7 }}>
                {bouquet.attributes.description}
              </p>
            )}

            {(bouquet.attributes.height > 0 || bouquet.attributes.width > 0) && (
              <div className="mb-8" style={{ display: 'flex', gap: 12 }}>
                {bouquet.attributes.height > 0 && (
                  <div style={{ padding: '12px 20px', background: 'var(--paper-2)', border: '1px solid var(--line)' }}>
                    <p className="eyebrow" style={{ marginBottom: 4 }}>Высота</p>
                    <p style={{ color: 'var(--ink)', fontWeight: 500 }}>{bouquet.attributes.height} см</p>
                  </div>
                )}
                {bouquet.attributes.width > 0 && (
                  <div style={{ padding: '12px 20px', background: 'var(--paper-2)', border: '1px solid var(--line)' }}>
                    <p className="eyebrow" style={{ marginBottom: 4 }}>Ширина</p>
                    <p style={{ color: 'var(--ink)', fontWeight: 500 }}>{bouquet.attributes.width} см</p>
                  </div>
                )}
              </div>
            )}

            <div className="mb-8">
              <AddToCartButton item={cartItem} />
            </div>

            <p style={{ color: 'var(--ink-3)', fontSize: '0.875rem' }}>
              Доставим свежий букет в течение 2 часов после оформления заказа
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
