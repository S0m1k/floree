import { adminFetch } from './adminApi';
import { AdminSpecification } from '@/types';

// Data layer for «Онлайн-витрина» (admin-map §2.3.2, /admin/shop-settings).
// In Posiflora this is a paid upsell landing page; in our clone it manages
// real settings for our own public storefront (floree.ru) plus a read-only
// summary of what's currently published there.

export interface ShopSettingsAttributes {
  shopTitle: string | null;
  phone: string | null;
  address: string | null;
  emailOrders: string | null;
  instagram: string | null;
  telegram: string | null;
  whatsapp: string | null;
  isEnabled: boolean;
  announcement: string | null;
  updatedAt: string | null;
}

export interface ShopSummary {
  publishedRecipes: number;
  totalRecipes: number;
  publishedItems: number;
  lastOrders: number;
  // false when no "Сайт"-titled order source exists in customer-deal-sources
  // yet — lastOrders is then always 0, not a real measurement.
  lastOrdersSourceFound: boolean;
}

export async function getShopSettings(): Promise<ShopSettingsAttributes | null> {
  const res = await adminFetch('/api/v1/shop-settings');
  if (!res.ok) return null;
  const json = await res.json();
  return json.data?.attributes ?? null;
}

export async function getShopSummary(): Promise<ShopSummary | null> {
  const res = await adminFetch('/api/v1/shop-summary');
  if (!res.ok) return null;
  const json = await res.json();
  return json.data?.attributes ?? null;
}

// The «Публикация на сайте» block is a compact table, not the full recipe
// grid — one page of active recipes is enough; searching narrows it further.
export const SHOP_PUBLICATION_PAGE_SIZE = 100;

export async function getShopPublicationSpecs(
  q?: string
): Promise<{ specifications: AdminSpecification[]; total: number }> {
  const qs = new URLSearchParams();
  qs.set('filter[status]', 'on');
  if (q) qs.set('q', q);
  qs.set('sort', 'title');
  qs.set('page[size]', String(SHOP_PUBLICATION_PAGE_SIZE));

  const res = await adminFetch(`/api/v1/specifications?${qs.toString()}`);
  if (!res.ok) return { specifications: [], total: 0 };
  const json = await res.json();
  return { specifications: json.data || [], total: json.meta?.total ?? 0 };
}
