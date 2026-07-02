import { Recipe, RecipeCategory } from '@/types';

const API_URL =
  process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export async function getRecipes(categoryId?: string): Promise<Recipe[]> {
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

export async function getCategories(): Promise<RecipeCategory[]> {
  try {
    const res = await fetch(`${API_URL}/api/recipe-categories`, { cache: 'no-store' });
    if (!res.ok) return [];
    const json = await res.json();
    return json.data || [];
  } catch {
    return [];
  }
}

export async function getCategoryBySlug(slug: string): Promise<RecipeCategory | null> {
  const categories = await getCategories();
  return categories.find((c) => c.attributes.slug === slug) || null;
}

export function pluralizeBouquets(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'букет';
  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return 'букета';
  return 'букетов';
}
