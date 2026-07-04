import { AdminCategory, AdminSpecification } from '@/types';

const API_URL =
  process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export const PAGE_SIZE = 24;

export interface SpecificationsSearchParams {
  category?: string;
  public?: string;
  q?: string;
  page?: string;
}

interface JsonApiImage {
  id: string;
  type: 'images';
  attributes: { fileShop: string | null; file: string | null };
}

export async function getCategories(): Promise<AdminCategory[]> {
  const res = await fetch(`${API_URL}/api/v1/categories?page[size]=200`, { cache: 'no-store' });
  if (!res.ok) return [];
  const json = await res.json();
  return json.data || [];
}

export interface SpecificationsListResult {
  specifications: AdminSpecification[];
  imagesById: Record<string, JsonApiImage>;
  total: number;
}

export async function getSpecifications(params: SpecificationsSearchParams): Promise<SpecificationsListResult> {
  const qs = new URLSearchParams();
  if (params.category) qs.set('filter[category]', params.category);
  if (params.public) qs.set('filter[public]', params.public);
  if (params.q) qs.set('q', params.q);
  const page = Math.max(1, parseInt(params.page || '1', 10) || 1);
  qs.set('page[number]', String(page));
  qs.set('page[size]', String(PAGE_SIZE));

  const res = await fetch(`${API_URL}/api/v1/specifications?${qs.toString()}`, { cache: 'no-store' });
  if (!res.ok) return { specifications: [], imagesById: {}, total: 0 };
  const json = await res.json();
  const imagesById: Record<string, JsonApiImage> = {};
  for (const inc of json.included || []) {
    if (inc.type === 'images') imagesById[inc.id] = inc;
  }
  return { specifications: json.data || [], imagesById, total: json.meta?.total ?? 0 };
}

export function specImageUrl(spec: AdminSpecification, imagesById: Record<string, JsonApiImage>): string | null {
  const logoId = spec.relationships?.logo?.data?.id;
  if (!logoId) return null;
  const img = imagesById[logoId];
  if (!img) return null;
  return img.attributes.fileShop || img.attributes.file;
}

export function buildSpecificationsHref(
  current: SpecificationsSearchParams,
  overrides: Partial<SpecificationsSearchParams>
): string {
  const merged: Record<string, string> = {};
  for (const [key, value] of Object.entries({ ...current, ...overrides })) {
    if (value) merged[key] = value;
  }
  const qs = new URLSearchParams(merged);
  const query = qs.toString();
  return query ? `/admin/specifications?${query}` : '/admin/specifications';
}
