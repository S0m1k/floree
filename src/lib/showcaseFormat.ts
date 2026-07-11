// Pure display helpers for the /admin/showcase bouquet grid — no server-only
// imports, safe for both server and client components.

// Russian pluralization: plural(3, ['день','дня','дней']) → 'дня'.
export function plural(n: number, forms: [string, string, string]): string {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return forms[2];
  if (last > 1 && last < 5) return forms[1];
  if (last === 1) return forms[0];
  return forms[2];
}

const SHELF_LIFE_DAYS = 3;

// Days left before a bouquet's ~3-day shelf life runs out (created_at + 3d,
// admin-map §2.3.1 "срок годности"). Clamped to 0 once past due — the live
// screen never shows a negative badge.
export function expiryDaysLeft(createdAt: string | null): number {
  if (!createdAt) return 0;
  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) return 0;
  const expires = new Date(created);
  expires.setDate(expires.getDate() + SHELF_LIFE_DAYS);
  const diffMs = expires.getTime() - Date.now();
  return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
}

// «№36993628» — Posiflora bouquet titles from the ETL already carry the
// number ("Букет 36993628"); fall back to the id's tail when a title doesn't
// (no separate docNo field is populated — see backend/app/serializers.py
// bouquet_resource).
export function bouquetNumber(bouquet: { id: string; attributes: { title: string } }): string {
  const match = bouquet.attributes.title.match(/(\d{4,})\s*$/);
  if (match) return match[1];
  return bouquet.id.replace(/-/g, '').slice(-8).toUpperCase();
}
