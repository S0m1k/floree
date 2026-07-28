import Link from 'next/link';
import RecipeCard from '@/components/RecipeCard';
import { Recipe, RecipeCategory } from '@/types';
import { orderCategories } from '@/lib/categoryOrder';

const API_URL = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export const metadata = {
  title: 'Купить букет в Санкт-Петербурге — каталог Floree | Доставка за 2 часа',
  description: 'Каталог авторских букетов Floree в Санкт-Петербурге. Свежие цветы, сборка по рецепту флориста, доставка по СПб за 2 часа. Розы, пионы, тюльпаны и композиции.',
  openGraph: {
    title: 'Каталог букетов Floree — купить в СПб с доставкой',
    description: 'Авторские букеты с доставкой за 2 часа по Санкт-Петербургу.',
    url: 'https://floree.ru/catalog',
    type: 'website' as const,
  },
};

async function getRecipes(categoryId?: string): Promise<Recipe[]> {
  try {
    const qs = categoryId ? `?category=${encodeURIComponent(categoryId)}` : '';
    const res = await fetch(`${API_URL}/api/recipes${qs}`, { cache: 'no-store' });
    if (!res.ok) return [];
    const json = await res.json();
    return json.data || [];
  } catch {
    return [];
  }
}

async function getCategories(): Promise<RecipeCategory[]> {
  try {
    const res = await fetch(`${API_URL}/api/recipe-categories`, { cache: 'no-store' });
    if (!res.ok) return [];
    const json = await res.json();
    return json.data || [];
  } catch {
    return [];
  }
}

function pluralize(n: number) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'букет';
  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return 'букета';
  return 'букетов';
}

interface Props {
  searchParams: { category?: string };
}

export default async function CatalogPage({ searchParams }: Props) {
  const activeCategory = searchParams.category;
  const [recipes, rawCategories] = await Promise.all([
    getRecipes(activeCategory),
    getCategories(),
  ]);
  const categories = orderCategories(rawCategories);

  return (
    <div className="min-h-screen" style={{ background: 'var(--paper)' }}>
      <div style={{ background: 'var(--paper-2)', borderBottom: '1px solid var(--line)' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <h1 className="serif" style={{ fontSize: 'clamp(2.2rem, 5vw, 3.5rem)', color: 'var(--ink)', lineHeight: 1.1 }}>
            Букеты Floree
          </h1>
          <p className="mt-3" style={{ color: 'var(--ink-3)', fontSize: '1rem', maxWidth: '52ch' }}>
            Каждый букет доставляется в&nbsp;эстетичной транспортировочной коробке и&nbsp;на&nbsp;воде,
            чтобы сохранить красоту и&nbsp;свежесть композиции.
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {categories.length > 0 && (
          <div className="cat-chips" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 32 }}>
            <Link
              href="/catalog"
              className="btn"
              data-hover
              style={!activeCategory ? { background: 'var(--ink)', color: 'var(--paper)' } : {}}
            >
              Все
            </Link>
            {categories.map((c) => (
              <Link
                key={c.id}
                href={`/catalog?category=${encodeURIComponent(c.id)}`}
                className="btn"
                data-hover
                style={activeCategory === c.id ? { background: 'var(--ink)', color: 'var(--paper)' } : {}}
              >
                {c.attributes.title}
              </Link>
            ))}
          </div>
        )}

        {recipes.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-xl font-medium mb-2" style={{ color: 'var(--ink-2)' }}>
              {activeCategory ? 'В этой категории пока пусто' : 'Каталог обновляется — загляните позже'}
            </p>
            <p className="text-sm mb-8" style={{ color: 'var(--ink-3)' }}>
              {activeCategory ? 'Выберите другую категорию или вернитесь ко всем букетам' : 'Мы готовим для вас новые рецепты'}
            </p>
            <Link href={activeCategory ? '/catalog' : '/'} className="btn btn--filled">
              {activeCategory ? 'Все букеты' : 'На главную'}
            </Link>
          </div>
        ) : (
          <>
            <p className="eyebrow mb-8">
              {recipes.length} {pluralize(recipes.length)}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {recipes.map((recipe, i) => (
                <RecipeCard key={recipe.id} recipe={recipe} index={i} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
