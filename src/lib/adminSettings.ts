import { adminFetch } from './adminApi';

// Data layer for «Настройки» reference dictionaries (docs/posiflora/admin-map.md
// §2.7). All nine dictionaries share the same JSON:API list shape; two carry
// extra attributes (celebrations period, measure short name/code) and the
// personal-data template is a singleton form.

// Backend API paths for every dictionary the settings screens may touch.
// This exact list is also the proxy whitelist — /admin/api/dict/[type] refuses
// anything not present here, so the proxy can never be pointed at an
// arbitrary backend path.
export const DICT_TYPES = [
  'order-tags',
  'recipe-tags',
  'discount-reasons',
  'cash-reasons',
  'customer-preferences',
  'customer-sources',
  'order-sources',
  'customer-celebrations',
  'measures',
] as const;

export type DictType = (typeof DICT_TYPES)[number];

export function isDictType(value: string): value is DictType {
  return (DICT_TYPES as readonly string[]).includes(value);
}

export interface DictEntry {
  id: string;
  type: string;
  attributes: {
    title: string;
    // customer-celebrations
    dateFrom?: string | null;
    dateTo?: string | null;
    // measures
    shortName?: string | null;
    measureCode?: number | null;
  };
}

export interface PersonalDataAttributes {
  ipTitle: string | null;
  inn: string | null;
  legalAddress: string | null;
  website: string | null;
  email: string | null;
}

export async function getDictionary(type: DictType): Promise<DictEntry[]> {
  const res = await adminFetch(`/api/v1/${type}?page[size]=200`);
  if (!res.ok) return [];
  const json = await res.json();
  return json.data || [];
}

export async function getPersonalData(): Promise<PersonalDataAttributes | null> {
  const res = await adminFetch('/api/v1/personal-data');
  if (!res.ok) return null;
  const json = await res.json();
  return json.data?.attributes ?? null;
}
