import Link from 'next/link';
import { posifloraFetch } from '@/lib/posiflora';
import CategoryCard from '@/components/CategoryCard';
import { CatalogCategory } from '@/types';

export const metadata = {
  title: 'Каталог цветов — Floree',
  description: 'Весь ассортимент свежих цветов и букетов',
};

async function getCategories(): Promise<CatalogCategory[]> {
  try {
    const data = await posifloraFetch('/v1/catalog/categories');
    return data?.data ?? [];
  } catch {
    return [];
  }
}

export default async function CatalogPage() {
  const categories = await getCategories();

  return (
    <div className="min-h-screen bg-gray-50/30">
      {/* Hero */}
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          {/* Breadcrumb */}
          <nav className="flex items-center gap-2 text-sm text-gray-400 mb-6">
            <Link href="/" className="hover:text-rose-500 transition-colors">Главная</Link>
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            <span className="text-gray-600 font-medium">Каталог</span>
          </nav>

          <h1 className="font-serif text-4xl sm:text-5xl font-bold text-gray-800 mb-3">
            Каталог цветов
          </h1>
          <p className="text-gray-500 text-lg max-w-xl">
            Выберите категорию, чтобы найти идеальный букет
          </p>
        </div>
      </div>

      {/* Categories Grid */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {categories.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-6xl mb-4">🌸</div>
            <p className="text-gray-500 text-xl font-medium mb-2">Категории не найдены</p>
            <p className="text-gray-400 text-sm">Попробуйте обновить страницу</p>
          </div>
        ) : (
          <>
            <p className="text-sm text-gray-400 mb-6">
              {categories.length} {categories.length === 1 ? 'категория' : categories.length < 5 ? 'категории' : 'категорий'}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {categories.map((category) => (
                <CategoryCard
                  key={category.id}
                  category={category}
                  href={`/catalog/${category.attributes.slug}`}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
