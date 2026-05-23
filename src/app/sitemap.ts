import type { MetadataRoute } from 'next';

const BASE_URL = 'https://floree.ru';

export default function sitemap(): MetadataRoute.Sitemap {
  const staticPages = [
    { url: BASE_URL, priority: 1.0, changeFrequency: 'weekly' as const },
    { url: `${BASE_URL}/catalog`, priority: 0.9, changeFrequency: 'daily' as const },
    { url: `${BASE_URL}/shipping`, priority: 0.7, changeFrequency: 'monthly' as const },
    { url: `${BASE_URL}/offer`, priority: 0.3, changeFrequency: 'yearly' as const },
    { url: `${BASE_URL}/privacy`, priority: 0.3, changeFrequency: 'yearly' as const },
    { url: `${BASE_URL}/cookies`, priority: 0.3, changeFrequency: 'yearly' as const },
  ];

  return staticPages.map((page) => ({
    url: page.url,
    lastModified: new Date(),
    changeFrequency: page.changeFrequency,
    priority: page.priority,
  }));
}
