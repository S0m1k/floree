import Link from 'next/link';
import { notFound } from 'next/navigation';
import RecipePurchase from '@/components/RecipePurchase';
import RecipeGallery from '@/components/RecipeGallery';
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
  if (!recipe) return { title: 'Букет не найден — Floree', robots: { index: false } };
  const title = recipe.attributes.title;
  const description = recipe.attributes.description
    || `Купить букет «${title}» в Санкт-Петербурге с доставкой за 2 часа. Флористическая студия Floree — свежие цветы, авторская сборка.`;
  return {
    title: `${title} — купить букет в СПб | Floree`,
    description,
    openGraph: {
      title: `${title} — Floree`,
      description,
      url: `https://floree.ru/recipe/${params.id}`,
      type: 'website' as const,
    },
  };
}

export default async function RecipePage({ params }: Props) {
  const recipe = await getRecipe(params.id);
  if (!recipe) notFound();

  const variants = recipe.variants ?? [];

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

  return (
    <div className="min-h-screen" style={{ background: 'var(--paper)', paddingTop: 88 }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16 pt-10">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">

          {/* Gallery — листается стрелками, свайпом и по миниатюрам */}
          <RecipeGallery images={images} title={recipe.attributes.title} />

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

            <RecipePurchase
              recipeId={recipe.id}
              title={recipe.attributes.title}
              imageUrl={primaryImage}
              fallbackPrice={recipe.attributes.minPrice}
              variants={variants}
            />

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

          </div>
        </div>
      </div>
    </div>
  );
}
