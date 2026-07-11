'use client';

import { useRouter } from 'next/navigation';
import { AdminStore } from '@/types';
import { buildShowcaseHref, ShowcaseSearchParams } from '@/lib/showcaseHref';

// «Floree ▾» — the store picker in the /admin/showcase header (admin-map
// §2.3.1). Switching stores drops the current page (a different store's
// showcase has a different page count) but keeps sort/search.
export default function ShowcaseStoreSelect({
  stores, currentStoreId, searchParams,
}: {
  stores: AdminStore[];
  currentStoreId: string;
  searchParams: ShowcaseSearchParams;
}) {
  const router = useRouter();

  return (
    <div className="admin-showcase-store">
      <select
        className="admin-showcase-store__select"
        value={currentStoreId}
        onChange={(e) => {
          router.push(buildShowcaseHref(searchParams, { store: e.target.value, page: undefined }));
        }}
        aria-label="Точка продаж"
      >
        {stores.map((s) => (
          <option key={s.id} value={s.id}>{s.attributes.title}</option>
        ))}
      </select>
    </div>
  );
}
