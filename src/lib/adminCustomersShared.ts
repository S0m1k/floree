// Client-safe customers-list constants/helpers. Kept free of any server-only
// imports (no next/headers) so client components — CustomersTable — can
// import them without pulling the server data layer (adminApi.ts) into the
// bundle. Mirrors the orderStatus.ts / adminOrders.ts split.

export const PAGE_SIZE = 25;

export interface CustomersSearchParams {
  source?: string;
  gender?: string;
  customerType?: string;
  preferences?: string;
  amountFrom?: string;
  amountTo?: string;
  registeredFrom?: string;
  registeredTo?: string;
  q?: string;
  page?: string;
}

export function buildCustomersHref(
  current: CustomersSearchParams,
  overrides: Partial<CustomersSearchParams>
): string {
  const merged: Record<string, string> = {};
  for (const [key, value] of Object.entries({ ...current, ...overrides })) {
    if (value) merged[key] = value;
  }
  const qs = new URLSearchParams(merged);
  const query = qs.toString();
  return query ? `/admin/customers?${query}` : '/admin/customers';
}
