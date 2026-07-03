import type { MetadataRoute } from 'next';
import { getCategories } from '@/lib/catalog';

const BASE_URL = 'https://floree.ru';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticPages = [
    { url: BASE_URL, priority: 1.0, changeFrequency: 'weekly' as const },
    { url: `${BASE_URL}/catalog`, priority: 0.9, changeFrequency: 'daily' as const },
    { url: `${BASE_URL}/shipping`, priority: 0.7, changeFrequency: 'monthly' as const },
    { url: `${BASE_URL}/offer`, priority: 0.3, changeFrequency: 'yearly' as const },
    { url: `${BASE_URL}/privacy`, priority: 0.3, changeFrequency: 'yearly' as const },
    { url: `${BASE_URL}/cookies`, priority: 0.3, changeFrequency: 'yearly' as const },
  ];

  // Category landing pages (SEO). Best-effort — empty if the API is down.
  const categories = await getCategories();
  const categoryPages = categories.map((c) => ({
    url: `${BASE_URL}/catalog/${c.attributes.slug || c.id}`,
    priority: 0.8,
    changeFrequency: 'daily' as const,
  }));

  return [...staticPages, ...categoryPages].map((page) => ({
    url: page.url,
    lastModified: new Date(),
    changeFrequency: page.changeFrequency,
    priority: page.priority,
  }));
}
