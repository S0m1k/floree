import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import CatalogView from '@/components/CatalogView';
import { getRecipes, getCategories, getCategoryBySlug } from '@/lib/catalog';

interface Props {
  params: { category: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const category = await getCategoryBySlug(params.category);
  if (!category) return { title: 'Категория не найдена — Floree' };
  const title = category.attributes.title;
  return {
    title: `${title} — купить в Санкт-Петербурге с доставкой | Floree`,
    description: `Букеты категории «${title}» от Floree. Сборка по рецепту флориста, доставка по СПб за 2 часа.`,
    alternates: { canonical: `https://floree.ru/catalog/${params.category}` },
    openGraph: {
      title: `${title} — букеты Floree`,
      description: `Букеты «${title}» с доставкой за 2 часа по Санкт-Петербургу.`,
      url: `https://floree.ru/catalog/${params.category}`,
      type: 'website',
    },
  };
}

export default async function CategoryPage({ params }: Props) {
  const categories = await getCategories();
  const category = categories.find((c) => (c.attributes.slug || c.id) === params.category);
  if (!category) notFound();

  const recipes = await getRecipes(category.id);
  const slug = category.attributes.slug || category.id;

  return (
    <div className="min-h-screen" style={{ background: 'var(--paper)' }}>
      <div style={{ background: 'var(--paper-2)', borderBottom: '1px solid var(--line)' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <p className="eyebrow mb-4">
            <Link href="/catalog" data-hover style={{ color: 'var(--ink-3)' }}>
              Каталог
            </Link>{' '}
            / {category.attributes.title}
          </p>
          <h1
            className="serif"
            style={{ fontSize: 'clamp(2.2rem, 5vw, 3.5rem)', color: 'var(--ink)', lineHeight: 1.1 }}
          >
            {category.attributes.title}
          </h1>
          <p className="mt-3" style={{ color: 'var(--ink-3)', fontSize: '1rem' }}>
            Соберём по рецепту и доставим в течение 2 часов
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <CatalogView recipes={recipes} categories={categories} activeSlug={slug} />
      </div>
    </div>
  );
}
