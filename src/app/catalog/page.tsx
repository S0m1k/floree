import { redirect } from 'next/navigation';
import CatalogView from '@/components/CatalogView';
import { getRecipes, getCategories } from '@/lib/catalog';

export const metadata = {
  title: 'Купить букет в Санкт-Петербурге — каталог Floree | Доставка за 2 часа',
  description:
    'Каталог авторских букетов Floree в Санкт-Петербурге. Свежие цветы, сборка по рецепту флориста, доставка по СПб за 2 часа. Розы, пионы, тюльпаны и композиции.',
  openGraph: {
    title: 'Каталог букетов Floree — купить в СПб с доставкой',
    description: 'Авторские букеты с доставкой за 2 часа по Санкт-Петербургу.',
    url: 'https://floree.ru/catalog',
    type: 'website' as const,
  },
};

interface Props {
  searchParams: { category?: string };
}

export default async function CatalogPage({ searchParams }: Props) {
  const [recipes, categories] = await Promise.all([getRecipes(), getCategories()]);

  // Legacy ?category=<id> links → redirect to the clean /catalog/<slug> URL.
  if (searchParams.category) {
    const match = categories.find((c) => c.id === searchParams.category);
    if (match) redirect(`/catalog/${match.attributes.slug || match.id}`);
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--paper)' }}>
      <div style={{ background: 'var(--paper-2)', borderBottom: '1px solid var(--line)' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <p className="eyebrow mb-4">Каталог</p>
          <h1
            className="serif"
            style={{ fontSize: 'clamp(2.2rem, 5vw, 3.5rem)', color: 'var(--ink)', lineHeight: 1.1 }}
          >
            Букеты Floree
          </h1>
          <p className="mt-3" style={{ color: 'var(--ink-3)', fontSize: '1rem' }}>
            Выберите букет — соберём по рецепту и доставим в течение 2 часов
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <CatalogView recipes={recipes} categories={categories} />
      </div>
    </div>
  );
}
