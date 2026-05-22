import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import AddToCartButton from '@/components/AddToCartButton';
import { RecipeDetail } from '@/types';

const API_URL = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface Props {
  params: { id: string };
}

async function getRecipe(id: string): Promise<RecipeDetail | null> {
  const res = await fetch(`${API_URL}/api/recipes/${id}`, { cache: 'no-store' });
  if (!res.ok) return null;
  return res.json();
}

export async function generateMetadata({ params }: Props) {
  const recipe = await getRecipe(params.id);
  if (!recipe) return { title: 'Букет — Floree' };
  return {
    title: `${recipe.attributes.title} — Floree`,
    description: recipe.attributes.description || `Купить ${recipe.attributes.title} в Floree`,
  };
}

export default async function RecipePage({ params }: Props) {
  const recipe = await getRecipe(params.id);
  if (!recipe) notFound();

  const formatPrice = (price: number) => new Intl.NumberFormat('ru-RU').format(Math.round(price));
  const price = recipe.attributes.minPrice;

  // Resolve image URLs: prefer backend-provided imageUrls, else read from included
  const images = recipe.imageUrls && recipe.imageUrls.length > 0
    ? recipe.imageUrls
    : recipe.imageUrl ? [recipe.imageUrl] : [];

  // Resolve tag titles from included
  const tagTitles: string[] = [];
  const tagsRel = recipe.relationships?.tags?.data || [];
  const includedTags = recipe.included?.tags || {};
  for (const ref of tagsRel) {
    const t = includedTags[ref.id];
    if (t?.attributes?.title) tagTitles.push(t.attributes.title);
  }

  const primaryImage = images[0];

  const cartItem = {
    id: recipe.id,
    title: recipe.attributes.title,
    price,
    quantity: 1,
    imageUrl: primaryImage,
  };

  return (
    <div className="min-h-screen" style={{ background: 'var(--paper)', paddingTop: 88 }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16 pt-10">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">

          {/* Gallery */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="relative aspect-square overflow-hidden" style={{ background: 'var(--bone)' }}>
              {primaryImage ? (
                <Image
                  src={primaryImage}
                  alt={recipe.attributes.title}
                  fill
                  unoptimized
                  className="object-cover"
                  sizes="(max-width: 1024px) 100vw, 50vw"
                  priority
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'var(--bone)' }} />
              )}
            </div>
            {images.length > 1 && (
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(images.length, 5)}, 1fr)`, gap: 8 }}>
                {images.slice(0, 5).map((src, i) => (
                  <div key={i} className="relative aspect-square overflow-hidden" style={{ background: 'var(--bone)' }}>
                    <Image
                      src={src}
                      alt={`${recipe.attributes.title} — фото ${i + 1}`}
                      fill
                      unoptimized
                      className="object-cover"
                      sizes="20vw"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Details */}
          <div className="flex flex-col">
            <p className="eyebrow mb-4">
              <Link href="/catalog" style={{ color: 'var(--ink-3)' }}>Каталог</Link>
              {' / '}
              <span style={{ color: 'var(--ink)' }}>{recipe.attributes.title}</span>
            </p>

            <h1 className="serif capitalize mb-6" style={{ fontSize: 'clamp(1.8rem, 4vw, 2.8rem)', color: 'var(--ink)', lineHeight: 1.1 }}>
              {recipe.attributes.title}
            </h1>

            <div className="mb-8" style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
              <span className="serif" style={{ fontSize: '2rem', color: 'var(--plum)' }}>
                {formatPrice(price)} ₽
              </span>
            </div>

            {recipe.attributes.description && (
              <p className="mb-8" style={{ color: 'var(--ink-2)', lineHeight: 1.7, whiteSpace: 'pre-line' }}>
                {recipe.attributes.description}
              </p>
            )}

            {tagTitles.length > 0 && (
              <div className="mb-8" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {tagTitles.map((t) => (
                  <span
                    key={t}
                    className="eyebrow"
                    style={{ padding: '6px 12px', background: 'var(--paper-2)', border: '1px solid var(--line)', color: 'var(--ink-2)' }}
                  >
                    {t}
                  </span>
                ))}
              </div>
            )}

            <div className="mb-8">
              <AddToCartButton item={cartItem} />
            </div>

            <p style={{ color: 'var(--ink-3)', fontSize: '0.875rem' }}>
              Соберём по рецепту и доставим в течение 2 часов после оформления заказа
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
