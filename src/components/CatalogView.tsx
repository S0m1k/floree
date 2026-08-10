'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import RecipeCard from '@/components/RecipeCard';
import CatalogFilters, { PriceRange, SortKey } from '@/components/CatalogFilters';
import { Recipe, RecipeCategory } from '@/types';
import { pluralizeBouquets } from '@/lib/catalog';

interface Props {
  recipes: Recipe[];
  categories: RecipeCategory[];
  activeSlug?: string; // undefined => "Все"
}

export default function CatalogView({ recipes, categories, activeSlug }: Props) {
  const [sort, setSort] = useState<SortKey>('default');
  const [price, setPrice] = useState<PriceRange>({ min: null, max: null });

  // Cheapest/priciest bouquet in the current category — placeholders for the
  // price inputs, so the range hints at what actually exists here.
  const bounds = useMemo(() => {
    const prices = recipes.map((r) => r.attributes.minPrice).filter((p) => p > 0);
    if (prices.length === 0) return { min: 0, max: 0 };
    return { min: Math.min(...prices), max: Math.max(...prices) };
  }, [recipes]);

  const visible = useMemo(() => {
    const filtered = recipes.filter((r) => {
      const p = r.attributes.minPrice;
      if (price.min !== null && p < price.min) return false;
      if (price.max !== null && p > price.max) return false;
      return true;
    });
    if (sort === 'price-asc') {
      return [...filtered].sort((a, b) => a.attributes.minPrice - b.attributes.minPrice);
    }
    if (sort === 'price-desc') {
      return [...filtered].sort((a, b) => b.attributes.minPrice - a.attributes.minPrice);
    }
    return filtered;
  }, [recipes, sort, price]);

  const isPriceFiltered = price.min !== null || price.max !== null;

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

      {recipes.length > 0 && (
        <CatalogFilters
          sort={sort}
          onSortChange={setSort}
          price={price}
          onPriceChange={setPrice}
          bounds={bounds}
        />
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
      ) : visible.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-xl font-medium mb-2" style={{ color: 'var(--ink-2)' }}>
            В этом диапазоне цен ничего нет
          </p>
          <p className="text-sm" style={{ color: 'var(--ink-3)' }}>
            Попробуйте расширить диапазон или сбросить фильтры
          </p>
        </div>
      ) : (
        <>
          <p className="eyebrow mb-8">
            {visible.length} {pluralizeBouquets(visible.length)}
            {isPriceFiltered && ` из ${recipes.length}`}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {visible.map((recipe, i) => (
              <RecipeCard key={recipe.id} recipe={recipe} index={i} />
            ))}
          </div>
        </>
      )}
    </>
  );
}
