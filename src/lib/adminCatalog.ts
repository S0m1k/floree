import {
  AdminCategory, AdminSpecification, AdminSpecificationComposition, AdminSpecificationDetail,
  AdminSpecificationVariant, AdminSpecificationVariantLabel, AdminSpecificationVariantPrice,
} from '@/types';
import { adminFetch } from './adminApi';

export const PAGE_SIZE = 24;

export interface SpecificationsSearchParams {
  category?: string;
  public?: string;
  archive?: string;
  q?: string;
  page?: string;
}

interface JsonApiImage {
  id: string;
  type: 'images';
  attributes: { fileShop: string | null; file: string | null };
}

export async function getCategories(): Promise<AdminCategory[]> {
  const res = await adminFetch(`/api/v1/categories?page[size]=200`);
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
  // «Рецепты» / «Архив рецептов» tabs (admin-map §2.3.2).
  qs.set('filter[status]', params.archive === 'true' ? 'off' : 'on');
  if (params.q) qs.set('q', params.q);
  const page = Math.max(1, parseInt(params.page || '1', 10) || 1);
  qs.set('page[number]', String(page));
  qs.set('page[size]', String(PAGE_SIZE));

  const res = await adminFetch(`/api/v1/specifications?${qs.toString()}`);
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

// ---------- recipe card (/admin/specifications/{id}) ----------

export interface SpecificationDetailResult {
  spec: AdminSpecificationDetail;
  variants: AdminSpecificationVariant[]; // ordered per spec.relationships.specVariants
  variantLabels: Record<string, AdminSpecificationVariantLabel>;
  prices: Record<string, AdminSpecificationVariantPrice>;
  compositions: Record<string, AdminSpecificationComposition>;
  images: Record<string, JsonApiImage>;
}

/** GET /v1/specifications/{id} — the full recipe card, `included` sorted into
 * typed lookup maps so components never have to filter the raw JSON:API array. */
export async function getSpecification(id: string): Promise<SpecificationDetailResult | null> {
  const res = await adminFetch(`/api/v1/specifications/${id}`);
  if (!res.ok) return null;
  const json = await res.json();
  const spec: AdminSpecificationDetail = json.data;
  if (!spec) return null;

  const variantLabels: Record<string, AdminSpecificationVariantLabel> = {};
  const prices: Record<string, AdminSpecificationVariantPrice> = {};
  const compositions: Record<string, AdminSpecificationComposition> = {};
  const images: Record<string, JsonApiImage> = {};
  const variantsById: Record<string, AdminSpecificationVariant> = {};

  for (const inc of json.included || []) {
    switch (inc.type) {
      case 'specification-variants': variantLabels[inc.id] = inc; break;
      case 'specification-variant-prices': prices[inc.id] = inc; break;
      case 'specification-compositions': compositions[inc.id] = inc; break;
      case 'images': images[inc.id] = inc; break;
      case 'specification-with-variants': variantsById[inc.id] = inc; break;
      default: break;
    }
  }

  const orderedIds = spec.relationships.specVariants?.data.map((d) => d.id) || [];
  const variants = orderedIds.map((vid) => variantsById[vid]).filter(Boolean);

  return { spec, variants, variantLabels, prices, compositions, images };
}
