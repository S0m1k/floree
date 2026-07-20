// Client-safe showcase URL helpers. Kept free of any server-only imports (no
// next/headers) so client components — ShowcaseStoreSelect, ShowcaseSortBar —
// can import them without pulling the server data layer into the bundle
// (mirrors the split in src/lib/orderStatus.ts).

export const PAGE_SIZE = 50;

export interface ShowcaseSearchParams {
  store?: string;
  sort?: string; // amount | -amount | title | -title | -createdAt (default)
  q?: string;
  page?: string;
}

export function buildShowcaseHref(
  current: ShowcaseSearchParams,
  overrides: Partial<ShowcaseSearchParams>
): string {
  const merged: Record<string, string> = {};
  for (const [key, value] of Object.entries({ ...current, ...overrides })) {
    if (value) merged[key] = value;
  }
  const qs = new URLSearchParams(merged);
  const query = qs.toString();
  return query ? `/admin/showcase?${query}` : '/admin/showcase';
}
