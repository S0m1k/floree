import Link from 'next/link';
import { posifloraFetch } from '@/lib/posiflora';
import ProductCard from '@/components/ProductCard';
import { CatalogItem, CatalogCategory } from '@/types';

interface Props {
  params: { category: string };
}

async function getProducts(category: string): Promise<CatalogItem[]> {
  try {
    const data = await posifloraFetch(`/v1/catalog/${category}`);
    return data?.data ?? [];
  } catch {
    return [];
  }
}

async function getCategoryInfo(slug: string): Promise<CatalogCategory | null> {
  try {
    const data = await posifloraFetch('/v1/catalog/categories');
    const categories: CatalogCategory[] = data?.data ?? [];
    return categories.find((c) => c.attributes.slug === slug) ?? null;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: Props) {
  const category = await getCategoryInfo(params.category);
  return {
    title: `${category?.attributes.title ?? 'Категория'} — Floree`,
    description: `Купить ${category?.attributes.title ?? 'цветы'} в интернет-магазине Floree`,
  };
}

export default async function CategoryPage({ params }: Props) {
  const [products, category] = await Promise.all([
    getProducts(params.category),
    getCategoryInfo(params.category),
  ]);

  const title = category?.attributes.title ?? params.category;
  const publicProducts = products.filter((p) => p.attributes.public !== false);

  return (
    <div className="min-h-screen bg-gray-50/30">
      {/* Header */}
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          {/* Breadcrumb */}
          <nav className="flex items-center gap-2 text-sm text-gray-400 mb-6 flex-wrap">
            <Link href="/" className="hover:text-rose-500 transition-colors">Главная</Link>
            <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            <Link href="/catalog" className="hover:text-rose-500 transition-colors">Каталог</Link>
            <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            <span className="text-gray-600 font-medium">{title}</span>
          </nav>

          <h1 className="font-serif text-4xl sm:text-5xl font-bold text-gray-800 mb-3">
            {title}
          </h1>
          {publicProducts.length > 0 && (
            <p className="text-gray-500">
              {publicProducts.length} {publicProducts.length === 1 ? 'товар' : publicProducts.length < 5 ? 'товара' : 'товаров'}
            </p>
          )}
        </div>
      </div>

      {/* Products Grid */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {publicProducts.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-6xl mb-4">🌷</div>
            <p className="text-gray-500 text-xl font-medium mb-2">Товары не найдены</p>
            <p className="text-gray-400 text-sm mb-6">В этой категории пока нет товаров</p>
            <Link
              href="/catalog"
              className="inline-flex items-center gap-2 bg-rose-500 text-white px-6 py-3 rounded-xl font-medium hover:bg-rose-600 transition-colors"
            >
              Вернуться в каталог
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {publicProducts.map((item) => (
              <ProductCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
