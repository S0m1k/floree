import Link from 'next/link';
import RecipeCard from '@/components/RecipeCard';
import { Recipe, RecipeCategory } from '@/types';
import { pluralizeBouquets } from '@/lib/catalog';

interface Props {
  recipes: Recipe[];
  categories: RecipeCategory[];
  activeSlug?: string; // undefined => "Все"
}

export default function CatalogView({ recipes, categories, activeSlug }: Props) {
  return (
    <>
      {categories.length > 0 && (
        <div
          className="cat-chips"
          style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 32 }}
        >
          <Link
            href="/catalog"
            className="btn"
            data-hover
            style={!activeSlug ? { background: 'var(--ink)', color: 'var(--paper)' } : {}}
          >
            Все
          </Link>
          {categories.map((c) => {
            const slug = c.attributes.slug || c.id;
            const isActive = activeSlug === slug;
            return (
              <Link
                key={c.id}
                href={`/catalog/${slug}`}
                className="btn"
                data-hover
                style={isActive ? { background: 'var(--ink)', color: 'var(--paper)' } : {}}
              >
                {c.attributes.title}
              </Link>
            );
          })}
        </div>
      )}

      {recipes.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-xl font-medium mb-2" style={{ color: 'var(--ink-2)' }}>
            {activeSlug ? 'В этой категории пока пусто' : 'Каталог обновляется — загляните позже'}
          </p>
          <p className="text-sm mb-8" style={{ color: 'var(--ink-3)' }}>
            {activeSlug
              ? 'Выберите другую категорию или вернитесь ко всем букетам'
              : 'Мы готовим для вас новые рецепты'}
          </p>
          <Link href={activeSlug ? '/catalog' : '/'} className="btn btn--filled">
            {activeSlug ? 'Все букеты' : 'На главную'}
          </Link>
        </div>
      ) : (
        <>
          <p className="eyebrow mb-8">
            {recipes.length} {pluralizeBouquets(recipes.length)}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {recipes.map((recipe, i) => (
              <RecipeCard key={recipe.id} recipe={recipe} index={i} />
            ))}
          </div>
        </>
      )}
    </>
  );
}
